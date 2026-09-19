import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../agendar/agendar.js", import.meta.url), "utf8");
const booking = { reference: "TEST-RESERVA", token: "test-only-token", service: "Serviço teste", professional: "Profissional teste", date: "2026-09-07", time: "10:00", status: "requested" };

async function browser(href = "https://local.invalid/agendar/?empresa=teste&env=staging", rpc) {
  const elements = new Map();
  const local = new Map();
  const session = new Map();
  const makeStorage = (map) => ({ getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { value: "", textContent: "", innerHTML: "", href: "", disabled: false, dataset: {}, handlers: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), toggle: (name, force) => force ? classes.add(name) : classes.delete(name), contains: (name) => classes.has(name) },
        style: {}, addEventListener(name, callback) { this.handlers[name] = callback; }, focus() {}, scrollIntoView() {} });
    }
    return elements.get(id);
  }
  const location = new URL(href);
  const context = vm.createContext({ URL, URLSearchParams, Intl, Date, console, location,
    window: { OGRITECH_ENV: "staging" },
    document: { getElementById: element, createElement() { return { set textContent(value) { this.innerHTML = String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); } }; } },
    localStorage: makeStorage(local), sessionStorage: makeStorage(session),
    history: { replaceState(_state, _title, url) { location.href = url; } },
    confirm: () => true,
    supabaseClient: { rpc: rpc ?? (async () => ({ data: null, error: null })), auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} } }
  });
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { context, location, local, session, element, showSuccess() { context.testBooking = booking; vm.runInContext("showSuccess(testBooking)", context); } };
}

test("reserva pública preserva link privado na URL sem gravar token no storage", async () => {
  const page = await browser();
  page.showSuccess();
  const fragment = new URLSearchParams(page.location.hash.slice(1));
  assert.equal(fragment.get("reserva"), booking.reference);
  assert.equal(fragment.get("token"), booking.token);
  assert.equal(page.location.searchParams.get("env"), "staging");
  assert.equal(page.element("manageBookingLink").href, page.location.href);
  assert.equal(page.element("successReference").textContent, booking.reference);
  assert.equal(JSON.stringify([...page.local, ...page.session]).includes(booking.token), false);

  const calls = [];
  const reloaded = await browser(page.location.href, async (name, args) => {
    calls.push({ name, args });
    return { data: { ...booking, business: "Empresa teste", can_cancel: true }, error: null };
  });
  assert.equal(calls[0].name, "public_get_appointment");
  assert.equal(calls[0].args.target_token, booking.token);
  assert.equal(reloaded.element("manageTitle").textContent, "Empresa teste");
});

test("falha no cancelamento da tela de sucesso oferece recuperação e reativa botão", async () => {
  const page = await browser();
  page.showSuccess();
  page.context.supabaseClient.rpc = async () => ({ data: false, error: { message: "Falha simulada" } });
  await page.element("cancelSuccessBookingButton").handlers.click();
  assert.match(page.element("successMessage").textContent, /Não foi possível cancelar/);
  assert.equal(page.element("cancelSuccessBookingButton").disabled, false);
  assert.equal(page.element("cancelSuccessBookingButton").classList.contains("hidden"), false);
});

test("falha no cancelamento autenticado não fica silenciosa", async () => {
  const page = await browser();
  page.context.supabaseClient.rpc = async () => ({ data: false, error: { message: "Falha simulada" } });
  const button = { dataset: { cancelId: "test-id" }, disabled: false };
  await page.element("myAppointmentsList").handlers.click({ target: { closest: () => button } });
  assert.match(page.element("myAppointmentsMessage").textContent, /Não foi possível cancelar/);
  assert.equal(button.disabled, false);
});


test("OTP indisponível mantém identificação obrigatória e permite tentar novamente", async () => {
  const page = await browser("https://local.invalid/agendar/?empresa=teste&env=staging&auth=required");
  page.element("clientPhone").value = "11999999999";
  page.context.supabaseClient.auth.signInWithOtp = async () => ({ error: { message: "phone disabled" } });
  await page.element("sendPhoneOtpButton").handlers.click();
  assert.match(page.element("identityStatus").textContent, /indisponível/);
  assert.doesNotMatch(page.element("identityStatus").textContent, /continuar com seus dados/);
  assert.equal(page.element("sendPhoneOtpButton").disabled, false);
});

test("modo obrigatório recusa criar reserva sem sessão", async () => {
  const page = await browser("https://local.invalid/agendar/?empresa=teste&env=staging&auth=required");
  vm.runInContext('state.time = "10:00"', page.context);
  let called = false;
  page.context.supabaseClient.rpc = async () => { called = true; return {}; };
  await page.element("bookingForm").handlers.submit({ preventDefault() {} });
  assert.equal(called, false);
  assert.match(page.element("formMessage").textContent, /Confirme seu celular/);
});
