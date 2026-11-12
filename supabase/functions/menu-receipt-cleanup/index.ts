import { createClient } from "npm:@supabase/supabase-js@2.112.3";

async function authorized(candidate: string) {
  const secret = Deno.env.get("MENU_ORDER_PUSH_DISPATCH_SECRET") || "";
  if (secret.length < 32 || candidate.length > 256) return false;
  const encode = new TextEncoder();
  const [left,right] = await Promise.all([secret,candidate].map(value => crypto.subtle.digest("SHA-256",encode.encode(value))));
  const a = new Uint8Array(left), b = new Uint8Array(right); let difference = 0;
  for (let i=0;i<a.length;i++) difference |= a[i]^b[i];
  return difference === 0;
}
Deno.serve(async (request: Request) => {
  const reply = (body: unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
  if (request.method !== "POST") return reply({error:{code:"method_not_allowed"}},405);
  if (!await authorized(request.headers.get("x-menu-receipts-secret") || "")) return reply({error:{code:"access_denied"}},403);
  const url = Deno.env.get("SUPABASE_URL") || "", secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !secret) return reply({error:{code:"service_unavailable"}},503);
  const admin = createClient(url,secret,{auth:{persistSession:false}});
  try {
    const claimed = await admin.rpc("backend_menu_receipt_cleanup");
    if (claimed.error) return reply({error:{code:"queue_unavailable"}},503);
    let cleaned = 0,failed = 0;
    for (const receipt of claimed.data || []) {
      const removed = await admin.storage.from("menu-payment-receipts").remove([receipt.object_path]);
      if (removed.error) { failed++; continue; }
      const marked = await admin.rpc("backend_menu_receipt_state",{target_receipt_id:receipt.id,operation:"delete"});
      if (marked.error) failed++; else cleaned++;
    }
    return reply({data:{claimed:claimed.data?.length || 0,cleaned,failed}});
  } catch { return reply({error:{code:"cleanup_unavailable"}},503); }
});
