// Local-only review. API responses and accounts are synthetic; no remote database is used.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';
import {installStockFixture} from '../tests/fixtures/catalog-stock.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const port=Number(process.env.OGRITECH_PREVIEW_PORT || 8107),origin=`http://127.0.0.1:${port}`;
const plans=[{id:'11111111-1111-4111-8111-111111111111',code:'catalogo-essencial',name:'Catálogo Essencial',menu_offer_code:'cardapio',offer_code:'cardapio',monthly_fee:9.90,annual_fee:99,active:true},{id:'22222222-2222-4222-8222-222222222222',code:'catalogo-completo',name:'Catálogo Completo',menu_offer_code:'encomendas',offer_code:'encomendas',monthly_fee:29.90,annual_fee:299,active:true}];
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
  const send=(body,type='text/html; charset=utf-8')=>{res.writeHead(200,{'Content-Type':type});res.end(body);};
  if(url.pathname==='/__preview/')return send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Revisão local da Ogritech</title><link rel="stylesheet" href="/site-theme.css"><body class="ogri-light"><main style="max-width:800px;margin:40px auto;padding:24px;font:18px system-ui"><h1>Revisão local da Ogritech</h1><p>Contas e produtos fictícios. Nenhum cadastro, pedido ou pagamento real é realizado.</p><ul><li><a href="/">Página principal</a></li><li><a href="/criar-cardapio/?segmento=collectibles">Cadastro de colecionáveis</a></li><li><a href="/cardapio/?empresa=fixture&perfil=food">Cardápio de alimentação</a></li><li><a href="/cardapio/?empresa=fixture&perfil=crafts">Catálogo de artesanato</a></li><li><a href="/cardapio/?empresa=fixture&perfil=products">Vitrine de produtos</a></li><li><a href="/painel/?perfil=crafts">Painel do cliente</a></li><li><a href="/admin.html">Painel administrador</a></li></ul></main></body></html>`);
  if(url.pathname==='/__preview/fixture.js'){
   if(url.searchParams.get('admin')==='true')return send(await readFile(resolve(root,'tests/fixtures/platform-admin.cjs'),'utf8').then(s=>s.slice(s.indexOf('String.raw`')+11,s.lastIndexOf('`;'))),'application/javascript');
   const profile=['food','crafts','products'].includes(url.searchParams.get('perfil'))?url.searchParams.get('perfil'):'products';
   return send(`(${installCatalogFixture.toString()})(${JSON.stringify({profile,offer:'encomendas',trial:true,quote:false,plans,origin})});(${installStockFixture.toString()})();`,'application/javascript');
  }
  if(url.pathname==='/__preview/panel.js')return send(`document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');window.loadMenuAdmin().then(()=>{window.OgritechMenuWorkspace.select(new URLSearchParams(location.search).get('area')==='estoque'?'catalog':'settings');});`,'application/javascript');
  if(url.pathname==='/functions/v1/ogritech-billing'&&req.method==='POST'){
   let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);return res.end();}body+=chunk;}
   const input=JSON.parse(body);
   return send(JSON.stringify({data:input.action==='trial_configuration'?{available:true,phone_verification:false,turnstile_site_key:''}:{trial_ends_at:'2099-01-01T00:00:00Z',login_url:'/__preview/'}}),'application/json');
  }
  if(req.method!=='GET'){res.writeHead(405);return res.end();}
  const path=decodeURIComponent(url.pathname);
  if(/^\/(?:\.|supabase(?:\/|$)|node_modules(?:\/|$)|outputs(?:\/|$)|tests(?:\/|$)|scripts(?:\/|$)|config(?:\/|$))/.test(path)){res.writeHead(403);return res.end();}
  const file=resolve(root,path.slice(1)+(path.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  let body=await readFile(file);const type=types[extname(file)]||'application/octet-stream';
  if(extname(file)==='.html'){
   let html=body.toString(),panel=url.pathname==='/painel/',admin=url.pathname==='/admin.html';
   html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>{
    if(!/\bsrc=/.test(tag))return tag;
    if(panel)return /src="(?:\/)?(?:catalog-profiles|catalog-admin|catalog-inventory|commercial-admin|product-offers|menu-branding|menu-branding-admin|panel-navigation)\.js/.test(tag)?tag:'';
    return /src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget)/.test(tag)?'':tag;
   });
   const profile=['food','crafts','products'].includes(url.searchParams.get('perfil'))?url.searchParams.get('perfil'):'products';
   html=html.replace('</head>',`<script src="/__preview/fixture.js?perfil=${profile}${admin?'&amp;admin=true':''}"></script></head>`);
   html=html.replace('</body>',`${panel?'<script src="/__preview/panel.js"></script>':''}</body>`);
   body=Buffer.from(html);
  }
  send(body,type);
 }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Prévia local indisponível.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Revisão local: ${origin}/__preview/`));
