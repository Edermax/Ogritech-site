import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.OGRITECH_BETA_PORT || 8097);
const plan = JSON.parse(await readFile(join(root, "config/menu-beta-phase-7a.json"), "utf8"));
const fixtures = new Map(plan.fixtures.map((fixture) => [fixture.slug, fixture]));
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };

function menuFor(fixture) {
  const priceId = `${fixture.segment}-human-price`;
  return { menu: { slug: fixture.slug, title: fixture.businessName, description: `Teste local fictício de ${fixture.segment}.`, accepts_pickup: true, accepts_delivery: true, payment_methods: ["pix", "cash"], weekly_hours: { weekdays: [1, 2, 3, 4, 5, 6], opens_at: "10:00", closes_at: "22:00" } }, delivery_zones: [{ code: "centro", name: "Centro", fee: 5 }], categories: [{ id: `${fixture.segment}-cat`, name: "Destaques", description: fixture.catalogChecks.join(" · "), items: fixture.sampleItems.map((name, index) => ({ id: `${fixture.segment}-item-${index}`, name, description: "Produto demonstrativo, sem venda real.", item_type: index === 0 ? "configurable" : "simple", prices: [{ id: index === 0 ? priceId : `${priceId}-${index}`, label: "Padrão", price: 25 + index * 5, promotional_price: null }], option_groups: index === 0 ? [{ id: `${fixture.segment}-group`, name: "Escolha obrigatória", selection_type: "single", minimum_selections: 1, maximum_selections: 1, options: [{ id: `${fixture.segment}-option-a`, name: "Opção A", price_delta: 0 }, { id: `${fixture.segment}-option-b`, name: "Opção B", price_delta: 3 }] }] : [] })) }] };
}

function fixtureScript(fixture) {
  const menu = menuFor(fixture), first = fixture.sampleItems[0], priceId = `${fixture.segment}-human-price`;
  return `window.ogritechEnvironmentUrl=(path)=>new URL(path,location.origin).href;window.__betaOrders=[];window.__betaUuid=()=>globalThis.crypto?.randomUUID?.()||"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const v=Math.floor(Math.random()*16);return(c==="x"?v:(v&3)|8).toString(16)});window.supabaseClient={rpc:async(name,args)=>{if(name==="public_menu")return{data:${JSON.stringify(menu)},error:null};if(name==="public_menu_assistant_status")return{data:{available:true,mode:"deterministic",external_model:false},error:null};if(name==="public_menu_assistant_message")return{data:{reply:"Encontrei uma opção no cardápio.",intent:"catalog_search",suggestions:[{menu_item_price_id:${JSON.stringify(priceId)},name:${JSON.stringify(first)},label:"Padrão",price:25,requires_confirmation:true}],action:null,notice:"Confira antes de adicionar."},error:null};if(name==="public_create_menu_order_v2"){const order={reference:"BETA-"+window.__betaUuid().slice(0,8),token:window.__betaUuid(),status:"Recebido",customer_name:args.supplied_name,fulfillment_type:args.target_fulfillment_type==="delivery"?"Entrega":"Retirada",items:[{quantity:1,name:${JSON.stringify(first)},label:"Padrão",line_total:25}],total_amount:25};window.__betaOrders.push(order);sessionStorage.setItem("ogritechBetaOrder:"+order.reference+":"+order.token,JSON.stringify(order));return{data:{reference:order.reference,token:order.token},error:null}};return{data:null,error:{message:"Operação indisponível no beta local."}}}};`;
}

function orderFixtureScript() {
  return `const betaParams=new URLSearchParams(location.search);const betaReference=betaParams.get("referencia");const betaToken=betaParams.get("token");let betaOrder=null;try{betaOrder=JSON.parse(sessionStorage.getItem("ogritechBetaOrder:"+betaReference+":"+betaToken)||"null")}catch{}window.supabaseClient={rpc:async(name,args)=>name==="public_get_menu_order"&&betaOrder&&args.target_reference===betaReference&&args.target_token===betaToken?{data:betaOrder,error:null}:{data:null,error:{message:"Pedido fictício não encontrado."}}};`;
}

function landing(host) {
  const cards = plan.fixtures.map((fixture) => `<article><h2>${fixture.businessName}</h2><p>${fixture.catalogChecks.join(" · ")}</p><a href="/cardapio/?empresa=${fixture.slug}">Abrir cenário</a></article>`).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beta local — Ogritech Cardápio</title><style>body{font:16px system-ui;background:#090909;color:#fff;max-width:900px;margin:auto;padding:24px}article{background:#171717;border:1px solid #333;border-radius:16px;padding:20px;margin:16px 0}a{display:inline-block;background:#e0b82f;color:#111;font-weight:700;padding:12px 18px;border-radius:10px;text-decoration:none}.alert{border-left:4px solid #e0b82f;padding:12px;background:#201b09}</style></head><body><h1>Beta local — Ogritech Cardápio</h1><p class="alert">Somente dados fictícios. Não informe nome, telefone, endereço ou e-mail reais. Nenhuma compra será realizada.</p><p>Acesso local: ${host}</p>${cards}</body></html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (url.pathname === "/" || url.pathname === "/beta-cardapio/") { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return response.end(landing(request.headers.host)); }
    if (url.pathname === "/beta-fixture.js") {
      const fixture = fixtures.get(url.searchParams.get("empresa"));
      if (!fixture) { response.writeHead(404); return response.end(); }
      response.writeHead(200, { "Content-Type": types[".js"] }); return response.end(fixtureScript(fixture));
    }
    if (url.pathname === "/beta-order-fixture.js") { response.writeHead(200, { "Content-Type": types[".js"] }); return response.end(orderFixtureScript()); }
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (relative === "cardapio" || relative === "cardapio/") relative = "cardapio/index.html";
    if (relative === "pedido" || relative === "pedido/") relative = "pedido/index.html";
    const target = normalize(join(root, relative));
    if (!target.startsWith(root)) { response.writeHead(403); return response.end(); }
    let body = await readFile(target);
    if (relative === "cardapio/index.html") {
      const fixture = fixtures.get(url.searchParams.get("empresa"));
      if (!fixture) { response.writeHead(404); return response.end("Cenário inexistente"); }
      body = Buffer.from(body.toString("utf8")
        .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>', "")
        .replace('<script src="../supabase-config.js"></script>', "")
        .replace('<script src="cardapio.js"></script>', `<script src="../beta-fixture.js?empresa=${encodeURIComponent(fixture.slug)}"></script><script src="cardapio.js"></script>`));
    }
    if (relative === "pedido/index.html") {
      body = Buffer.from(body.toString("utf8")
        .replace('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3"></script>', "")
        .replace('<script src="../supabase-config.js"></script>', "")
        .replace('<script src="pedido.js"></script>', '<script src="../beta-order-fixture.js"></script><script src="pedido.js"></script>'));
    }
    response.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream" }); response.end(body);
  } catch (error) { response.writeHead(error?.code === "ENOENT" ? 404 : 500); response.end("Indisponível"); }
});

server.listen(port, "0.0.0.0", () => {
  const addresses = Object.values(networkInterfaces()).flat().filter((item) => item?.family === "IPv4" && !item.internal).map((item) => `http://${item.address}:${port}/beta-cardapio/`);
  console.log(JSON.stringify({ status: "ready", port, local: `http://127.0.0.1:${port}/beta-cardapio/`, network: addresses }, null, 2));
});
