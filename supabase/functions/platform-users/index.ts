import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "https://ogritech.com.br").split(",").map((v) => v.trim()).filter(Boolean);
const headers = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff",
});
const reply = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), { status, headers: headers(origin) });
const clean = (value: unknown, max = 150) => typeof value === "string" ? value.trim().slice(0, max) : "";
const validUuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : "";
const validEmail = (value: string) => value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validTemporaryPassword = (value: unknown) => typeof value === "string" && value.length >= 12 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
const roles = new Set(["owner", "admin", "employee", "client"]);

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: "Origem não autorizada" }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "POST") return reply({ error: "Método não permitido" }, 405, origin);
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) return reply({ error: "Conteúdo inválido" }, 415, origin);
  if (Number(request.headers.get("content-length") || 0) > 16_384) return reply({ error: "Requisição muito grande" }, 413, origin);

  const url = Deno.env.get("SUPABASE_URL"), anonKey = Deno.env.get("SUPABASE_ANON_KEY"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply({ error: "Serviço não configurado" }, 503, origin);
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return reply({ error: "Sessão inválida" }, 401, origin);
  const { data: allowed, error: permissionError } = await caller.rpc("is_platform_admin");
  if (permissionError || !allowed) return reply({ error: "Acesso negado" }, 403, origin);
  let body: Record<string, unknown>;
  try {
    const payload = await request.arrayBuffer();
    if (payload.byteLength > 16_384) return reply({ error: "Requisição muito grande" }, 413, origin);
    body = JSON.parse(new TextDecoder().decode(payload));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("JSON inválido");
  } catch { return reply({ error: "JSON inválido" }, 400, origin); }
  const action = clean(body.action, 40);
  const { data: withinLimit } = await caller.rpc("platform_check_rate_limit", { action_name: action, max_actions: 30 });
  if (!withinLimit) return reply({ error: "Muitas solicitações; tente novamente em um minuto" }, 429, origin);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const assertCapacity = async (shopId: string, role: string) => {
    if (role === "client") return;
    const { data: client, error: clientError } = await admin.from("saas_clients").select("plan").eq("barbershop_id", shopId).is("deleted_at", null).single();
    if (clientError) throw clientError;
    const { data: plan, error: planError } = await admin.from("saas_plans").select("name,max_users,max_professionals").eq("name", client.plan).eq("active", true).single();
    if (planError) throw planError;
    const { count: userCount, error: userCountError } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("barbershop_id", shopId).eq("active", true).in("role", ["owner", "admin", "employee"]);
    if (userCountError) throw userCountError;
    if (plan.max_users != null && (userCount || 0) >= plan.max_users) throw new Error(`Limite de usuários do plano ${plan.name} atingido (${plan.max_users}).`);
    if (role === "employee") {
      const { count: professionalCount, error: professionalCountError } = await admin.from("employees").select("id", { count: "exact", head: true }).eq("barbershop_id", shopId).eq("active", true);
      if (professionalCountError) throw professionalCountError;
      if (plan.max_professionals != null && (professionalCount || 0) >= plan.max_professionals) throw new Error(`Limite de profissionais do plano ${plan.name} atingido (${plan.max_professionals}).`);
    }
  };
  const audit = async (success: boolean, targetId = "", details: Record<string, unknown> = {}) => {
    await admin.from("platform_admin_events").insert({ actor_id: authData.user.id, action, target_id: targetId || null, success, details });
  };

  try {
    if (action === "list") {
      const profiles: Array<Record<string, unknown>> = [];
      const authUsers: Array<{ id: string; email?: string }> = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin.from("profiles").select("id,barbershop_id,full_name,role,active").order("id").range(from, from + 999);
        if (error) throw error;
        profiles.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const emails = new Map<string, string>();
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        data.users.forEach((user) => {
          emails.set(user.id, user.email || "");
          authUsers.push({ id: user.id, email: user.email });
        });
        if (data.users.length < 1000) break;
      }
      const { data: masters, error: mastersError } = await admin.from("platform_admins").select("user_id");
      if (mastersError) throw mastersError;
      const masterIds = new Set((masters || []).map((item) => item.user_id));
      const profileIds = new Set(profiles.map((profile) => String(profile.id)));
      const authUsersWithoutProfile = authUsers
        .filter((user) => !profileIds.has(user.id))
        .map((user) => ({ id: user.id, email: user.email || "" }));
      await audit(true);
      return reply({
        users: profiles.filter((p) => !masterIds.has(String(p.id))).map((p) => ({ ...p, email: emails.get(String(p.id)) || "" })),
        auth_users_without_profile: authUsersWithoutProfile,
      }, 200, origin);
    }

    if (action === "invite") {
      const userEmail = clean(body.email, 320).toLowerCase(), fullName = clean(body.full_name), shopId = validUuid(body.barbershop_id), role = clean(body.role, 20);
      if (!validEmail(userEmail) || !fullName || !shopId || !roles.has(role)) return reply({ error: "Dados inválidos" }, 400, origin);
      const { data: shop } = await admin.from("barbershops").select("id,active,deleted_at").eq("id", shopId).single();
      if (!shop?.active || shop.deleted_at) return reply({ error: "Negócio indisponível" }, 400, origin);
      await assertCapacity(shopId, role);
      const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(userEmail, { data: { full_name: fullName } });
      if (inviteError) throw inviteError;
      const rollback = async () => { await admin.auth.admin.deleteUser(data.user.id); };
      const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, barbershop_id: shopId, full_name: fullName, role, active: true });
      if (profileError) { await rollback(); throw profileError; }
      const related = role === "employee"
        ? await admin.from("employees").insert({ barbershop_id: shopId, name: fullName, specialty: clean(body.specialty) || "Atendimento geral", commission_percentage: Math.min(100, Math.max(0, Number(body.commission) || 0)), active: true }).select("id").single()
        : role === "client" ? await admin.from("business_clients").insert({ barbershop_id: shopId, name: fullName, email: userEmail, phone: "" }).select("id").single()
        : role === "owner" ? await admin.from("saas_clients").update({ contact_name: fullName, owner_email: userEmail, invite_status: "Enviado" }).eq("barbershop_id", shopId) : { error: null };
      if (related.error) { await admin.from("profiles").delete().eq("id", data.user.id); await rollback(); throw related.error; }
      if (role === "employee" || role === "client") {
        const link = role === "employee" ? { employee_id: related.data?.id } : { client_record_id: related.data?.id };
        const { error: linkError } = await admin.from("profiles").update(link).eq("id", data.user.id);
        if (linkError) { await admin.from(role === "employee" ? "employees" : "business_clients").delete().eq("id", related.data?.id); await admin.from("profiles").delete().eq("id", data.user.id); await rollback(); throw linkError; }
      }
      await audit(true, data.user.id, { role, barbershop_id: shopId });
      return reply({ user: { id: data.user.id, email: data.user.email } }, 200, origin);
    }

    if (action === "update") {
      const userId = validUuid(body.user_id), userEmail = clean(body.email, 320).toLowerCase(), fullName = clean(body.full_name), shopId = validUuid(body.barbershop_id), role = clean(body.role, 20);
      if (!userId || !validEmail(userEmail) || !fullName || !shopId || !roles.has(role)) return reply({ error: "Dados inválidos" }, 400, origin);
      const { data: protectedUser } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (protectedUser) return reply({ error: "O acesso master não pode ser alterado" }, 400, origin);
      const { data: previous, error: previousError } = await admin.from("profiles").select("barbershop_id,full_name,employee_id,client_record_id,role").eq("id", userId).single();
      if (previousError) throw previousError;
      const { data: previousAuth, error: previousAuthError } = await admin.auth.admin.getUserById(userId);
      if (previousAuthError || !previousAuth.user) throw previousAuthError || new Error("Usuário não encontrado");
      let employeeId: string | null = role === "employee" ? previous.employee_id : null;
      let clientRecordId: string | null = role === "client" ? previous.client_record_id : null;
      let createdRelated: { table: "employees" | "business_clients"; id: string } | null = null;
      if (role === "employee") {
        if (employeeId) {
          const { error } = await admin.from("employees").update({ barbershop_id: shopId, name: fullName }).eq("id", employeeId);
          if (error) throw error;
        } else {
          const { data, error } = await admin.from("employees").insert({ barbershop_id: shopId, name: fullName, specialty: clean(body.specialty) || "Atendimento geral", commission_percentage: Math.min(100, Math.max(0, Number(body.commission) || 0)), active: true }).select("id").single();
          if (error) throw error;
          employeeId = data.id; createdRelated = { table: "employees", id: data.id };
        }
      }
      if (role === "client") {
        if (clientRecordId) {
          const { error } = await admin.from("business_clients").update({ barbershop_id: shopId, name: fullName, email: userEmail }).eq("id", clientRecordId);
          if (error) throw error;
        } else {
          const { data, error } = await admin.from("business_clients").insert({ barbershop_id: shopId, name: fullName, email: userEmail, phone: "" }).select("id").single();
          if (error) throw error;
          clientRecordId = data.id; createdRelated = { table: "business_clients", id: data.id };
        }
      }
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, { email: userEmail, user_metadata: { full_name: fullName } });
      if (authUpdateError) { if (createdRelated) await admin.from(createdRelated.table).delete().eq("id", createdRelated.id); throw authUpdateError; }
      const { error } = await admin.from("profiles").update({ barbershop_id: shopId, full_name: fullName, role, employee_id: employeeId, client_record_id: clientRecordId }).eq("id", userId);
      if (error) {
        await admin.auth.admin.updateUserById(userId, { email: previousAuth.user.email, user_metadata: previousAuth.user.user_metadata });
        if (createdRelated) await admin.from(createdRelated.table).delete().eq("id", createdRelated.id);
        throw error;
      }
      await audit(true, userId, { role, barbershop_id: shopId });
      return reply({ ok: true }, 200, origin);
    }

    if (action === "reset_password") {
      const userId = validUuid(body.user_id), temporaryPassword = typeof body.temporary_password === "string" ? body.temporary_password : "";
      if (!userId || !validTemporaryPassword(temporaryPassword)) return reply({ error: "Usuário ou senha temporária inválidos" }, 400, origin);
      const { data: protectedUser } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (protectedUser) return reply({ error: "A senha do acesso master não pode ser redefinida por esta ação" }, 400, origin);
      const { data: profile, error: profileError } = await admin.from("profiles").select("id,active").eq("id", userId).single();
      if (profileError || !profile?.active) return reply({ error: "Usuário indisponível" }, 400, origin);
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { password: temporaryPassword });
      if (authError) throw authError;
      await audit(true, userId, { credential_reset: true });
      return reply({ ok: true }, 200, origin);
    }

    if (action === "delete") {
      const userId = validUuid(body.user_id);
      if (!userId) return reply({ error: "Usuário inválido" }, 400, origin);
      const { data: protectedUser } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (protectedUser) return reply({ error: "O acesso master não pode ser excluído" }, 400, origin);
      const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
      if (banError) throw banError;
      const { error } = await admin.from("profiles").update({ active: false }).eq("id", userId);
      if (error) { await admin.auth.admin.updateUserById(userId, { ban_duration: "none" }); throw error; }
      await audit(true, userId);
      return reply({ ok: true, archived: true }, 200, origin);
    }

    if (action === "set_active") {
      const userId = validUuid(body.user_id), active = body.active === true;
      if (!userId) return reply({ error: "Usuário inválido" }, 400, origin);
      const { data: protectedUser } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (protectedUser) return reply({ error: "O acesso master não pode ser alterado" }, 400, origin);
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
      if (authError) throw authError;
      const { error } = await admin.from("profiles").update({ active }).eq("id", userId);
      if (error) { await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "876000h" : "none" }); throw error; }
      await audit(true, userId, { active });
      return reply({ ok: true }, 200, origin);
    }

    if (action === "delete_business") {
      const shopId = validUuid(body.barbershop_id);
      if (!shopId) return reply({ error: "Negócio inválido" }, 400, origin);
      const { data: profiles, error: profilesError } = await admin.from("profiles").select("id").eq("barbershop_id", shopId);
      if (profilesError) throw profilesError;
      const bannedIds: string[] = [];
      for (const profile of profiles || []) {
        const { error } = await admin.auth.admin.updateUserById(profile.id, { ban_duration: "876000h" });
        if (error) {
          for (const id of bannedIds) await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
          throw error;
        }
        bannedIds.push(profile.id);
      }
      const { error: archiveError } = await caller.rpc("platform_archive_business", { target_shop_id: shopId });
      if (archiveError) {
        for (const id of bannedIds) await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
        throw archiveError;
      }
      await audit(true, shopId, { archived: true });
      return reply({ ok: true, archived: true }, 200, origin);
    }
    return reply({ error: "Ação inválida" }, 400, origin);
  } catch (error) {
    await audit(false, validUuid(body.user_id) || validUuid(body.barbershop_id), { message: error instanceof Error ? error.message : "Erro desconhecido" });
    const message = error instanceof Error && /limite|plano/i.test(error.message) ? error.message : "Não foi possível concluir a operação";
    return reply({ error: message }, 400, origin);
  }
});
