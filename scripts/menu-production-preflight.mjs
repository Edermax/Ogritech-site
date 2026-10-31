import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = 'https://mvzcoaiiwytycdqcvydf.supabase.co/functions/v1/';
const publicKey = 'sb_publishable_Mv7A4NxC6zr1s7Ob1ROEUw_Au212ibY';

// This checks prerequisites only: it never starts a trial, checkout or lifecycle job.
export async function runMenuProductionPreflight(fetchImpl = fetch) {
  const checks = [];
  async function probe(name, endpoint, payload, validate) {
    try {
      const response = await fetchImpl(base + endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publicKey },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
      });
      const body = await response.text();
      let parsed = null; try { parsed = JSON.parse(body); } catch { /* Rejected webhook is plain text. */ }
      checks.push({ name, status: response.status, passed: validate(response.status, parsed) });
    } catch { checks.push({ name, status: null, passed: false }); }
  }
  await probe('monthly_quote', 'ogritech-billing', { action: 'quote', product: 'menu', cycle: 'monthly' },
    (status, body) => status === 200 && body?.data?.total_cents === 4990 && body?.data?.months === 1);
  await probe('annual_quote', 'ogritech-billing', { action: 'quote', product: 'menu', cycle: 'annual' },
    (status, body) => status === 200 && body?.data?.total_cents === 49900 && body?.data?.months === 12);
  await probe('trial_readiness', 'ogritech-billing', { action: 'trial_readiness', product: 'menu' },
    (status, body) => status === 200 && body?.data?.ready === true && body?.data?.product === 'menu');
  // Deliberately unsigned: the handler rejects before contacting Mercado Pago or writing events.
  await probe('unsigned_webhook_rejected', 'mercado-pago-webhook', { data: { id: 'readiness-probe' } },
    status => status === 400);
  return {
    checkedAt: new Date().toISOString(), environment: 'production', checks,
    technicalPrerequisitesReady: checks.every(check => check.passed),
    livePaymentValidated: false, financialReleaseApproved: false,
    accountCreated: false, checkoutCreated: false, paymentCreated: false,
    limitation: 'Confirma preços, cadastro e rejeição de notificação sem assinatura. Não valida credenciais do Mercado Pago, cobrança real nem entrega automática de um pagamento real.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await runMenuProductionPreflight();
  const output = new URL('../outputs/menu-production-preflight.json', import.meta.url);
  await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.technicalPrerequisitesReady) process.exitCode = 1;
}
