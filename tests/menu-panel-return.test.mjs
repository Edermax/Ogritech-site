import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../menu-panel-return.js", import.meta.url), "utf8");
function page(options = {}) {
  const location = new URL(options.url || "https://ogritech.com.br/cardapio/?empresa=diniz-doces&origem=painel");
  const navigation = { hidden: true };
  const link = { href: "", removeAttribute(name) { if (name === "href") this.href = ""; } };
  const history = { state: options.history || null, replaceState(state, _, target) { this.state = state; location.href = target; } };
  const calls = [], events = {};
  let authChange;
  const client = {
    auth: {
      getUser: async () => { calls.push("identity"); return options.identity ? options.identity() : { data: { user: options.anonymous ? null : { id: "owner" } }, error: options.identityError || null }; },
      onAuthStateChange(callback) { authChange = callback; }
    },
    from(table) {
      const query = {
        select(columns) { calls.push({ table, columns }); return query; },
        eq(column, value) { calls.push({ column, value }); return query; },
        maybeSingle: async () => ({ data: options.missingMenu ? null : { barbershop_id: "business-a" }, error: options.menuError || null })
      };
      return query;
    },
    rpc: async (name, args) => { calls.push({ name, args }); return options.access ? options.access() : { data: options.denied !== true, error: options.accessError || null }; }
  };
  const context = {
    location, history, URL, supabaseClient: client,
    document: { getElementById: id => ({ menuPanelReturn: navigation, menuPanelReturnLink: link })[id] },
    window: { OGRITECH_ENV: "production", ogritechEnvironmentUrl: path => `https://ogritech.com.br${path}&env=production`, addEventListener: (name, callback) => { events[name] = callback; } }
  };
  return { navigation, link, history, location, calls, events, authChange: (...args) => authChange?.(...args), ready: Promise.resolve(runInNewContext(source, context)) };
}

test("public links never show the panel shortcut or request private account data", async () => {
  const fixture = page({ url: "https://ogritech.com.br/cardapio/?empresa=diniz-doces" });
  await fixture.ready;
  assert.equal(fixture.navigation.hidden, true);
  assert.equal(fixture.link.href, "");
  assert.deepEqual(fixture.calls, []);
});

test("a copied panel hint cannot expose the shortcut to an anonymous visitor", async () => {
  const fixture = page({ anonymous: true });
  await fixture.ready;
  assert.equal(fixture.navigation.hidden, true);
  assert.deepEqual(fixture.calls, ["identity"]);
});

test("the verified team member returns to the menu tab and the public URL stays clean", async () => {
  const fixture = page();
  assert.equal(await fixture.ready, true);
  assert.equal(fixture.navigation.hidden, false);
  assert.equal(fixture.link.href, "https://ogritech.com.br/painel/?secao=loja&env=production");
  assert.equal(fixture.location.searchParams.has("origem"), false);
  assert.equal(fixture.history.state.ogritechMenuPanelPreview.slug, "diniz-doces");
  assert.deepEqual(fixture.calls.find(call => call.name === "is_business_team").args.target_id, "business-a");
  assert.ok(fixture.calls.some(call => call.column === "slug" && call.value === "diniz-doces"));
});

test("another business and consumer accounts do not get a panel shortcut", async () => {
  for (const options of [{ missingMenu: true }, { denied: true }]) {
    const fixture = page(options);
    await fixture.ready;
    assert.equal(fixture.navigation.hidden, true);
    assert.equal(fixture.link.href, "");
  }
});

test("expired sessions and unavailable authorization keep the public menu usable without a shortcut", async () => {
  for (const options of [{ identityError: { code: "expired" } }, { menuError: { code: "42501" } }, { accessError: { code: "network" } }, { identity: async () => { throw new Error("offline"); } }]) {
    const fixture = page(options);
    await fixture.ready;
    assert.equal(fixture.navigation.hidden, true);
    assert.equal(fixture.link.href, "");
  }
});

test("refresh preserves the preview only for the same menu and environment", async () => {
  const first = page(); await first.ready;
  const refresh = page({ url: first.location.href, history: first.history.state });
  assert.equal(await refresh.ready, true);
  const unrelated = page({ url: "https://ogritech.com.br/cardapio/?empresa=outra-loja", history: first.history.state });
  await unrelated.ready;
  assert.equal(unrelated.navigation.hidden, true);
  assert.deepEqual(unrelated.calls, []);
  const otherEnvironment = page({ url: first.location.href, history: { ogritechMenuPanelPreview: { slug: "diniz-doces", environment: "staging" } } });
  await otherEnvironment.ready;
  assert.deepEqual(otherEnvironment.calls, []);
});

test("sign-out and account changes remove an already visible shortcut", async () => {
  for (const [event, session] of [["SIGNED_OUT", null], ["SIGNED_IN", { user: { id: "another-owner" } }]]) {
    const fixture = page(); await fixture.ready;
    fixture.authChange(event, session);
    assert.equal(fixture.navigation.hidden, true);
    assert.equal(fixture.link.href, "");
  }
});

test("an authorization response arriving after sign-out cannot reveal the shortcut", async () => {
  let resolveAccess;
  const fixture = page({ access: () => new Promise(resolve => { resolveAccess = resolve; }) });
  await new Promise(resolve => setImmediate(resolve));
  fixture.authChange("SIGNED_OUT", null);
  resolveAccess({ data: true });
  await fixture.ready;
  assert.equal(fixture.navigation.hidden, true);
  assert.equal(fixture.link.href, "");
});

test("the return destination is fixed even if an incoming URL suggests another site", async () => {
  const fixture = page({ url: "https://ogritech.com.br/cardapio/diniz-doces?origem=painel&return_to=https://evil.invalid" });
  await fixture.ready;
  assert.equal(fixture.link.href, "https://ogritech.com.br/painel/?secao=loja&env=production");
});
