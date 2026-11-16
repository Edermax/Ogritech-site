// Local-only interactive preview; all data is synthetic and mutations stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const fixture = require('../tests/fixtures/platform-admin.cjs');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const allowed = new Set([
  ...[...html.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"#]*)?"/g)].map(match => match[1].replace(/^\//, '')),
  'assets/owner-icons.svg'
]);
const demo = String.raw`
window.__events = [
 {id:'3',event_type:'support.requested',title:'Atendimento humano solicitado',body:'Confeitaria de exemplo solicitou retorno por E-mail. contato@exemplo.com',destination:'support',created_at:new Date().toISOString(),read_at:null},
 {id:'2',event_type:'menu.published',title:'Cardápio publicado',body:'Confeitaria de exemplo publicou o cardápio.',destination:'businesses',created_at:new Date(Date.now()-300000).toISOString(),read_at:null},
 {id:'1',event_type:'user.created',title:'Novo usuário cadastrado',body:'Mariana Silva · mariana@exemplo.com',destination:'users',created_at:new Date(Date.now()-600000).toISOString(),read_at:null}
];
const previewRpc = supabaseClient.rpc.bind(supabaseClient);
supabaseClient.rpc = async (name,args) => {
 if(name==='platform_notification_inbox'){
  const items=__events.filter(item=>!args.before_id||BigInt(item.id)<BigInt(args.before_id)).slice(0,args.page_size);
  return {data:{items:structuredClone(items),unread_count:__events.filter(item=>!item.read_at).length,latest_id:__events[0]?.id||null,next_before_id:items.length===args.page_size?items.at(-1).id:null}};
 }
 if(name==='platform_mark_notifications_read'){
  for(const item of __events)if(BigInt(item.id)<=BigInt(args.through_id)&&(!args.notification_id||args.notification_id===item.id))item.read_at=new Date().toISOString();
  return {data:null};
 }
 return previewRpc(name,args);
};
document.addEventListener('DOMContentLoaded', () => {
 const notice=document.createElement('p');
 notice.textContent='PRÉVIA LOCAL · Dados fictícios para visualizar as notificações';
 notice.style.cssText='margin:0 0 20px;padding:12px 16px;border:1px solid #8adce8;border-radius:10px;background:#e9fafd;color:#12586a;font-size:13px';
 document.getElementById('adminMain').prepend(notice);
 const loading=document.getElementById('adminLoading');
 const open=()=>{if(loading.classList.contains('hidden')){observer.disconnect();document.getElementById('adminNotificationsOpen').click();}};
 const observer=new MutationObserver(open);
 observer.observe(loading,{attributes:true,attributeFilter:['class']});
 open();
});
`;
const previewHtml = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/[^\"]+"><\/script>/g, '');
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname.replace(/^\//, '');
  if (!['GET', 'HEAD'].includes(request.method)) return response.writeHead(405).end();
  if (pathname === '/' || pathname === '/admin.html') return response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(previewHtml);
  if (relative === 'supabase-config.js') return response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }).end(fixture + demo);
  if (relative === 'pwa.js') return response.writeHead(200, { 'Content-Type': 'application/javascript' }).end('/* PWA disabled in local preview. */');
  if (!allowed.has(relative)) return response.writeHead(404).end();
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
  try {
    const body = fs.readFileSync(file);
    const mime = { '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }[path.extname(file)];
    response.writeHead(200, { 'Content-Type': mime || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
});
server.listen(4317, '127.0.0.1', () => console.log('Prévia local: http://127.0.0.1:4317/admin.html'));
