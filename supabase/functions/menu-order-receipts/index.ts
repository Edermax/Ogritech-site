import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.6.6";

const base = { barbershop_id: z.uuid(), order_id: z.uuid() };
const inputSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("upload_url"), file_name: z.string().trim().min(1).max(150),
    content_type: z.enum(["image/jpeg", "image/png", "application/pdf"]), file_size: z.number().int().min(1).max(5242880) }).strict(),
  z.object({ ...base, action: z.literal("confirm_payment"), expected_updated_at: z.iso.datetime({ offset: true }), receipt_id: z.uuid().optional() }).strict(),
  z.object({ ...base, action: z.literal("download") }).strict(),
  z.object({ ...base, action: z.literal("cancel_upload"), receipt_id: z.uuid() }).strict(),
]);
const origins = (Deno.env.get("ALLOWED_ORIGINS") || "https://ogritech.com.br").split(",").map(value => value.trim());
const bucket = "menu-payment-receipts";
function serviceKey() {
  if (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; }
}
function detectedType(bytes: Uint8Array) {
  if (bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte,index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0,5)) === "%PDF-") return "application/pdf";
  return "";
}
async function readBody(request: Request) {
  const reader = request.body?.getReader(); if (!reader) throw new Error("invalid_input");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new Error("payload_too_large"); } chunks.push(value); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(result));
}
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = { "Access-Control-Allow-Origin": origin && origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin" };
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
  const fail = (code: string, message: string, status: number) => reply({ error: { code, message } }, status);
  if (origin && !origins.includes(origin)) return fail("origin_not_allowed", "Origem não permitida.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail("method_not_allowed", "Método não permitido.", 405);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return fail("authentication_required", "Entre novamente na sua conta.", 401);
  const url = Deno.env.get("SUPABASE_URL") || "", anon = Deno.env.get("SUPABASE_ANON_KEY") || "", secret = serviceKey();
  if (!url || !anon || !secret) return fail("service_unavailable", "Comprovantes temporariamente indisponíveis.", 503);
  try {
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const auth = await client.auth.getUser(authorization.slice(7));
    if (auth.error || !auth.data.user) return fail("authentication_required", "Entre novamente na sua conta.", 401);
    let raw;
    try { raw = await readBody(request); } catch (error) {
      return error.message === "payload_too_large" ? fail("payload_too_large", "Solicitação muito grande.", 413) : fail("invalid_input", "Confira os dados informados.", 422);
    }
    const parsed = inputSchema.safeParse(raw);
    if (!parsed.success) return fail("invalid_input", "Envie JPG, PNG ou PDF de até 5 MB.", 422);
    const body = parsed.data;
    const checked = async (operation: string, receiptPayload: Record<string, unknown> = {}) => {
      const result = await client.rpc("menu_order_receipt_access", { target_barbershop_id: body.barbershop_id,
        target_order_id: body.order_id, operation, receipt_payload: receiptPayload });
      if (result.error) throw result.error; return result.data;
    };
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === "upload_url") {
      const name = body.file_name.replace(/[\\/\x00-\x1f\x7f]/g, "_");
      const receipt = await checked("reserve", { original_name: name, content_type: body.content_type, file_size: body.file_size });
      const signed = await admin.storage.from(bucket).createSignedUploadUrl(receipt.object_path, { upsert: false });
      if (signed.error || !signed.data?.token) throw new Error("storage_unavailable");
      return reply({ data: { receipt_id: receipt.id, path: receipt.object_path, token: signed.data.token } });
    }
    if (body.action === "download") {
      const receipt = await checked("read");
      const signed = await admin.storage.from(bucket).createSignedUrl(receipt.object_path, 300);
      if (signed.error || !signed.data?.signedUrl) throw new Error("storage_unavailable");
      return reply({ data: { url: signed.data.signedUrl, content_type: receipt.content_type, file_name: receipt.original_name, expires_in: 300 } });
    }
    if (body.action === "cancel_upload") {
      const receipt = await checked("cancel", { receipt_id: body.receipt_id });
      const removed = await admin.storage.from(bucket).remove([receipt.object_path]);
      if (removed.error) throw new Error("storage_unavailable");
      const state = await admin.rpc("backend_menu_receipt_state", { target_receipt_id: receipt.id, operation: "delete" });
      if (state.error) throw state.error; return reply({ data: { cancelled: true } });
    }
    if (body.receipt_id) {
      const receipt = await checked("pending", { receipt_id: body.receipt_id });
      const file = await admin.storage.from(bucket).download(receipt.object_path);
      if (file.error || !file.data) return fail("upload_incomplete", "O comprovante não terminou de ser enviado. Tente novamente.", 409);
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      if (bytes.length !== receipt.file_size || bytes.length > 5242880 || detectedType(bytes) !== receipt.content_type) {
        const removed = await admin.storage.from(bucket).remove([receipt.object_path]);
        if (removed.error) throw new Error("storage_unavailable");
        const deleted = await admin.rpc("backend_menu_receipt_state", { target_receipt_id: receipt.id, operation: "delete" });
        if (deleted.error) throw deleted.error;
        return fail("invalid_receipt", "O arquivo não corresponde a um JPG, PNG ou PDF válido. Escolha outro comprovante.", 422);
      }
      if (receipt.state !== "verified") {
        const verified = await admin.rpc("backend_menu_receipt_state", { target_receipt_id: receipt.id, operation: "verify", actual_size: bytes.length, actual_type: detectedType(bytes) });
        if (verified.error) throw verified.error;
      }
    }
    const payment = await client.rpc("record_menu_order_payment", { target_barbershop_id: body.barbershop_id,
      target_order_id: body.order_id, expected_updated_at: body.expected_updated_at, receipt_id: body.receipt_id || null });
    if (payment.error) throw payment.error;
    return reply({ data: payment.data });
  } catch (error) {
    if (error.code === "42501") return fail("access_denied", "Você não tem permissão para esta operação.", 403);
    if (error.code === "40001") return fail("order_changed", "O pedido foi alterado em outra tela. Atualize os pedidos e confira os dados antes de continuar.", 409);
    if (error.code === "23514") return fail("upload_limit", "Há envios pendentes para este pedido. Aguarde ou cancele o envio anterior.", 429);
    if (error.code === "22023") return fail("order_unavailable", "O pedido ou comprovante mudou. Atualize os pedidos e tente novamente.", 409);
    return fail("service_unavailable", "Não foi possível confirmar a operação. Atualize os pedidos antes de tentar novamente.", 503);
  }
});
