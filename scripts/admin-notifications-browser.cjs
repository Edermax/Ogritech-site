// Real admin UI with synthetic events. No remote services or customer messages.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fixture = require('../tests/fixtures/platform-admin.cjs');
const { darkIssues, settle } = require('./panel-theme-checks.cjs');
const root = process.cwd(), out = 'outputs/admin-notifications';
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
    if (!file.startsWith(root + path.sep) || /\/(?:\.|private|supabase|node_modules|outputs|tests)/.test(pathname)) return res.writeHead(403).end();
    const type = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }[path.extname(file)];
    res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});
const notifications = String.raw`
window.__notificationCalls=[];window.__inboxFail=false;window.__readFail=false;
window.__events=[
 {id:'3',event_type:'support.requested',title:'Atendimento humano solicitado',body:'Visitante solicitou retorno por E-mail. lead@example.invalid',destination:'support',created_at:'2026-11-16T15:00:00Z',read_at:null},
 {id:'2',event_type:'menu.published',title:'Cardápio publicado',body:'Confeitaria de exemplo publicou o cardápio.',destination:'businesses',created_at:'2026-11-16T14:00:00Z',read_at:null},
 {id:'1',event_type:'user.created',title:'Novo usuário cadastrado',body:'<img src=x onerror="window.__unsafe=true">',destination:'users',created_at:'2026-11-16T13:00:00Z',read_at:null}
];
const originalRpc=supabaseClient.rpc.bind(supabaseClient);
supabaseClient.rpc=async(name,args)=>{
 if(name==='is_platform_admin')return new Promise(resolve=>{window.__allowAdmin=()=>resolve({data:true});});
 if(!name.startsWith('platform_notification')&&name!=='platform_mark_notifications_read')return originalRpc(name,args);
 window.__notificationCalls.push({name,args});
 if(name==='platform_notification_inbox'){
  if(window.__inboxFail)return {error:{message:'offline'}};
  const items=window.__events.filter(item=>!args.before_id||BigInt(item.id)<BigInt(args.before_id)).slice(0,args.page_size);
  return {data:{items:structuredClone(items),unread_count:window.__events.filter(item=>!item.read_at).length,latest_id:window.__events[0]?.id||null,next_before_id:items.length===args.page_size?items.at(-1).id:null}};
 }
 if(window.__readFail)return {error:{message:'write failed'}};
 if(window.__race){window.__events.unshift({...window.__events[0],id:String(BigInt(window.__events[0].id)+1n),read_at:null});window.__race=false;}
 for(const item of window.__events)if(BigInt(item.id)<=BigInt(args.through_id)&&(!args.notification_id||args.notification_id===item.id))item.read_at='2026-11-16T16:00:00Z';
 return {data:null};
};`;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  try {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      await page.clock.install();
      page.on('pageerror', error => errors.push(error.message));
      await context.route('https://**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
      await context.route('**/pwa.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
      await context.route('**/supabase-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: fixture + notifications }));
      await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
      await page.waitForFunction(() => typeof window.__allowAdmin === 'function');
      assert.equal(await page.locator('#adminNotificationsOpen').isDisabled(), true);
      assert.equal(await page.evaluate(() => __notificationCalls.length), 0, 'no inbox call before authorization');
      await page.evaluate(() => __allowAdmin());
      await page.locator('#adminLoading').waitFor({ state: 'hidden' });
      await page.locator('#adminNotificationsBadge').filter({ hasText: '3' }).waitFor();
      await page.locator('#adminNotificationsOpen').click();
      await page.locator('#adminNotificationsDialog[open]').waitFor();
      assert.equal(await page.locator('#adminNotificationsList li').count(), 3);
      assert.equal(await page.locator('#adminNotificationsList img').count(), 0, 'customer strings rendered as text');
      assert.equal(await page.evaluate(() => window.__unsafe), undefined);
      await settle(page);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.ok(await page.locator('#adminNotificationsDialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: `${out}/light-${width}.png` });
      await page.evaluate(() => OgritechPanelTheme.set('dark')); await settle(page);
      assert.deepEqual(await darkIssues(page), [], 'dark theme remains readable');
      await page.screenshot({ path: `${out}/dark-${width}.png` });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#adminNotificationsDialog').isVisible(), false);
      assert.equal(await page.locator('#adminNotificationsOpen').evaluate(el => el === document.activeElement), true);
      await page.locator('#adminNotificationsOpen').click();
      await page.locator('button[data-notification-id="1"]').click();
      await page.locator('#adminNotificationsBadge').filter({ hasText: '2' }).waitFor();
      await page.evaluate(() => {
        const rpc = supabaseClient.rpc.bind(supabaseClient);
        let held = false;
        supabaseClient.rpc = async (name, args) => {
          if (name === 'platform_notification_inbox' && !held) {
            held = true;
            await new Promise(resolve => { window.__releaseInbox = resolve; });
          }
          return rpc(name, args);
        };
        void OgritechAdminNotifications.refresh();
      });
      await page.waitForFunction(() => typeof window.__releaseInbox === 'function');
      await page.locator('a[data-notification-id="3"]').click();
      await page.evaluate(() => __releaseInbox());
      await page.waitForFunction(() => location.hash === '#support');
      await page.locator('#humanSupportList article').waitFor();
      await page.locator('#adminNotificationsBadge').filter({ hasText: '1' }).waitFor();
      await page.locator('#adminNotificationsOpen').click();
      await page.evaluate(() => { window.__race = true; });
      await page.locator('#adminNotificationsReadAll').click();
      await page.waitForFunction(() => __events.length === 4 && __events.filter(item => !item.read_at).length === 1);
      await page.locator('button[data-notification-id="4"]').waitFor();
      assert.equal(await page.locator('#adminNotificationsBadge').innerText(), '1');
      await page.evaluate(() => { window.__readFail = true; });
      await page.locator('button[data-notification-id="4"]').click();
      await page.locator('#adminNotificationsMessage').filter({ hasText: 'Não foi possível marcar' }).waitFor();
      assert.equal(await page.locator('button[data-notification-id="4"]').count(), 1);
      await page.evaluate(() => { window.__readFail = false; window.__inboxFail = true; });
      await page.locator('#adminNotificationsRefresh').click();
      await page.locator('#adminNotificationsMessage').filter({ hasText: 'Não foi possível atualizar' }).waitFor();
      assert.equal(await page.locator('#adminNotificationsList li').count(), 4, 'transport failures keep existing history');
      await page.evaluate(() => { window.__inboxFail = false; });
      await page.locator('#adminNotificationsRefresh').click();
      await page.waitForFunction(() => document.getElementById('adminNotificationsMessage').textContent === '');
      // A burst larger than one page remains accessible through stable bigint cursors.
      await page.evaluate(() => { const sample = __events[0]; window.__events = Array.from({ length: 65 }, (_, index) => ({ ...sample, id: String(65 - index), read_at: null })); });
      await page.locator('#adminNotificationsRefresh').click();
      await page.locator('#adminNotificationsBadge').filter({ hasText: '65' }).waitFor();
      await page.locator('#adminNotificationsMore').click();
      await page.waitForFunction(() => document.querySelectorAll('#adminNotificationsList li').length === 64);
      await page.locator('#adminNotificationsRefresh').click();
      await page.locator('#adminNotificationsMore').click();
      await page.waitForFunction(() => document.querySelectorAll('#adminNotificationsList li').length === 65);
      assert.equal(await page.locator('#adminNotificationsMore').isVisible(), false);
      await page.locator('#adminNotificationsReadAll').click();
      await page.locator('#adminNotificationsBadge').waitFor({ state: 'hidden' });
      await page.reload(); await page.waitForFunction(() => typeof window.__allowAdmin === 'function'); await page.evaluate(() => __allowAdmin());
      await page.locator('#adminLoading').waitFor({ state: 'hidden' });
      const before = await page.evaluate(() => __notificationCalls.length);
      await page.clock.fastForward(15000);
      assert.ok(await page.evaluate(count => __notificationCalls.length > count, before), 'polling updates while panel is visible');
      await page.evaluate(() => OgritechAdminNotifications.stop());
      const stopped = await page.evaluate(() => __notificationCalls.length);
      await page.clock.fastForward(30000);
      assert.equal(await page.evaluate(() => __notificationCalls.length), stopped, 'stop removes polling and private content');
      assert.equal(await page.locator('#adminNotificationsList li').count(), 0);
      assert.deepEqual(errors, []);
      results.push({ width, authorization: true, events: 3, safeText: true, readAndNavigation: true, markAllRace: true, recovery: true, pagination: true, polling: true, darkTheme: true });
      await context.close();
    }
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
