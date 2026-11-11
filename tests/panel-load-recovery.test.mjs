import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const readSource = source.slice(source.indexOf('async function readPanelData('), source.indexOf('async function applyProductAccess('));
const startSource = source.slice(source.indexOf('let panelLoading = false;'), source.indexOf('// Wait for the Cardapio scripts'));
function fixture() {
    const nodes = new Map();
    const node = id => {
        if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, textContent: '' });
        return nodes.get(id);
    };
    const waits = [], logs = [];
    let refreshes = 0;
    const context = vm.createContext({
        BARBERSHOP_ID: 'fixture', document: { getElementById: node },
        console: { error: (...args) => logs.push(args) },
        setTimeout: (callback, delay) => { waits.push(delay); callback(); },
        supabaseClient: { auth: { refreshSession: async () => { refreshes++; return { error: null }; } } },
        initializeOperationalDashboard: async () => {}
    });
    vm.runInContext(readSource + startSource, context);
    return { context, node, waits, logs, refreshes: () => refreshes };
}
const rejected = { data: null, error: { code: 'PGRST303', message: 'JWT issued at future' } };

test('a transient JWT rejection retries the read and recovers without refreshing a valid token', async () => {
    const f = fixture(); let calls = 0;
    const success = { data: [{ code: 'menu' }], error: null };
    const result = await f.context.readPanelData(async () => ++calls === 1 ? rejected : success);
    assert.equal(result, success); assert.equal(calls, 2);
    assert.equal(f.refreshes(), 0); assert.deepEqual(f.waits, [600]);
});

test('persistent JWT rejection stops after three reads', async () => {
    const f = fixture(); let calls = 0;
    assert.equal(await f.context.readPanelData(async () => { calls++; return rejected; }), rejected);
    assert.equal(calls, 3); assert.deepEqual(f.waits, [600, 1400]);
});

test('expired JWT renews the session before repeating the read', async () => {
    const f = fixture(); let calls = 0;
    const result = await f.context.readPanelData(async () => ++calls === 1
        ? { error: { code: 'PGRST303', message: 'JWT expired' } } : { data: 'ready' });
    assert.equal(result.data, 'ready'); assert.equal(f.refreshes(), 1);
});

test('failed session renewal ends recovery and permission errors never trigger retries', async () => {
    const f = fixture(); const refreshError = { code: 'refresh_token_not_found', message: 'No session' };
    f.context.supabaseClient.auth.refreshSession = async () => ({ error: refreshError });
    let calls = 0;
    const result = await f.context.readPanelData(async () => { calls++; return { error: { code: 'PGRST303', message: 'JWT expired' } }; });
    assert.equal(result.error, refreshError); assert.equal(calls, 1);
    assert.equal(f.waits.length, 0);
    const forbidden = { error: { code: '42501', message: 'Acesso negado' } };
    assert.equal(await f.context.readPanelData(async () => { calls++; return forbidden; }), forbidden);
    assert.equal(calls, 2); assert.equal(f.waits.length, 0);
});

test('failed startup offers manual retry and a successful retry restores the panel', async () => {
    const f = fixture(); let attempts = 0;
    f.context.initializeOperationalDashboard = async () => { if (++attempts === 1) throw rejected.error; };
    await f.context.startOperationalDashboard();
    assert.equal(f.node('content').hidden, true);
    assert.equal(f.node('panelLoadRetry').hidden, false);
    assert.equal(f.node('panelLoadRetry').disabled, false);
    assert.match(f.node('panelLoadMessage').textContent, /validar sua sessão/);
    await f.context.startOperationalDashboard();
    assert.equal(f.node('content').hidden, false);
    assert.equal(f.node('panelLoadState').hidden, true);
    assert.equal(attempts, 2);
});

test('repeated retry clicks cannot start concurrent panel initialization', async () => {
    const f = fixture(); let resolve, calls = 0;
    f.context.initializeOperationalDashboard = () => { calls++; return new Promise(done => { resolve = done; }); };
    const first = f.context.startOperationalDashboard();
    await f.context.startOperationalDashboard();
    assert.equal(calls, 1); assert.equal(f.node('panelLoadRetry').disabled, true);
    resolve(); await first;
    assert.equal(f.node('content').hidden, false);
});
