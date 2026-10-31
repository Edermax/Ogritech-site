import test from 'node:test';
import assert from 'node:assert/strict';
import { runMenuProductionPreflight } from '../scripts/menu-production-preflight.mjs';

function fetchProbe(override = {}) {
  const calls = [];
  return { calls, fetch: async (url, request) => {
    const body = JSON.parse(request.body); calls.push({ url, body, headers: request.headers });
    if (body.action === 'quote') return Response.json({ data: { total_cents: body.cycle === 'monthly' ? 4990 : 49900, months: body.cycle === 'monthly' ? 1 : 12 } });
    if (body.action === 'trial_readiness') return Response.json({ data: { ready: true, product: 'menu' } });
    return new Response('invalid notification', { status: override.webhookStatus || 400 });
  } };
}

test('preflight uses only safe probes and never treats them as live payment approval', async () => {
  const probe = fetchProbe(); const report = await runMenuProductionPreflight(probe.fetch);
  assert.equal(report.technicalPrerequisitesReady, true);
  assert.equal(report.livePaymentValidated, false); assert.equal(report.financialReleaseApproved, false);
  assert.equal(report.paymentCreated, false); assert.equal(probe.calls.length, 4);
  assert.deepEqual(probe.calls.map(call => call.body.action || 'unsigned_webhook'), ['quote', 'quote', 'trial_readiness', 'unsigned_webhook']);
  for (const call of probe.calls) {
    assert.match(call.url, /^https:\/\/mvzcoaiiwytycdqcvydf\.supabase\.co\/functions\/v1\/(ogritech-billing|mercado-pago-webhook)$/);
    assert.equal(call.headers['x-signature'], undefined);
  }
});

test('preflight fails if webhook is unconfigured or unexpectedly accepts an unsigned notification', async () => {
  for (const webhookStatus of [200, 401, 503]) {
    const probe = fetchProbe({ webhookStatus }); const report = await runMenuProductionPreflight(probe.fetch);
    assert.equal(report.technicalPrerequisitesReady, false);
    assert.equal(report.livePaymentValidated, false);
  }
});

test('preflight records failed network probes without leaking exceptions or approving payments', async () => {
  const report = await runMenuProductionPreflight(async () => { throw Error('private diagnostic'); });
  assert.equal(report.technicalPrerequisitesReady, false);
  assert.equal(report.checks.filter(check => check.status === null).length, 4);
  assert.doesNotMatch(JSON.stringify(report), /private diagnostic/);
});
