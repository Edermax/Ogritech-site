import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = (await readFile(new URL("../.github/workflows/restore-drill.yml", import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("restore requires an explicit backup instead of a stale artifact from August", () => {
  const inputs=workflow.split('      expect_menu_schema:')[0];
  assert.doesNotMatch(inputs,/default:/);
  assert.match(inputs,/run_id:[\s\S]*required: true/);
  assert.match(inputs,/artifact_name:[\s\S]*required: true/);
});

test("restoring a current backup requires the Cardápio schema and complete customer lifecycle by default", () => {
  const input = workflow.match(/      expect_menu_schema:\n([\s\S]*?)(?=\n\S)/)?.[1];
  assert.ok(input, "The restore must expose an explicit schema expectation");
  assert.match(input, /required: true/);
  assert.match(input, /default: true/);
  assert.match(input, /type: boolean/);
  const menuChecks = workflow.split('if [[ "$EXPECT_MENU_SCHEMA" == "true" ]]; then')[1]?.split("\n          fi")[0];
  assert.ok(menuChecks, "The expected schema must actually enable restore verification");
  for (const table of ["online_menus", "menu_items", "menu_orders", "menu_order_items"]) {
    assert.ok(menuChecks.includes(`public.${table}`), `Missing restored table check: ${table}`);
  }
  for (const suite of ["menu-catalog-core", "menu-cart-orders", "menu-self-service-onboarding", "commercial-self-service-lifecycle"]) {
    assert.ok(menuChecks.includes(`${suite}.test.sql`), `Missing restored journey suite: ${suite}`);
  }
  assert.match(workflow, /supabase test db --workdir restore-drill --db-url "\$LOCAL_DB_URL" "\$\{tests\[@\]\}"/);
});

test("historical backups retain an explicit compatibility choice without touching production", () => {
  assert.match(workflow, /disable only for historical backups/);
  assert.ok(workflow.includes("EXPECT_MENU_SCHEMA: ${{ inputs.expect_menu_schema }}"));
  assert.match(workflow, /if \[\[ "\$EXPECT_MENU_SCHEMA" == "true" \]\]; then/);
  assert.match(workflow, /LOCAL_DB_URL: postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\/postgres/);
  assert.doesNotMatch(workflow, /SUPABASE_DB_URL|supabase db push|--linked/);
});
