import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const load = (path) => readFile(new URL(path, root), "utf8");

test("plano controla usuários, profissionais e serviços no banco", async () => {
  const sql = await load("supabase/migrations/20260903163213_enforce_plan_capacity.sql");
  for (const marker of ["max_users", "max_professionals", "max_services", "pg_advisory_xact_lock", "enforce_profiles_plan_capacity", "enforce_employees_plan_capacity", "enforce_services_plan_capacity", "assert_plan_fits_business"]) {
    assert.match(sql, new RegExp(marker, "i"), `${marker} ausente`);
  }
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /revoke all on function private\./i);
});

test("admin edita limites e painel do negócio mostra consumo", async () => {
  const [admin, panel, html] = await Promise.all([load("admin.js"), load("script.js"), load("painel/index.html")]);
  assert.match(admin, /max_users,max_professionals,max_services/);
  assert.match(admin, /data-edit-plan/);
  assert.match(panel, /business_plan_capacity/);
  assert.match(panel, /renderPlanCapacity/);
  assert.match(html, /professionalsCapacity/);
});
