import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const read = path => readFile(new URL(`../${path}`,import.meta.url),"utf8");
const context = {Intl};runInNewContext(await read("product-offers.js"),context);runInNewContext(await read("whatsapp-selection.js"),context);
test("offer catalog exposes the exact four prices and legacy full-plan mapping",()=>{
 const catalog=context.OgritechOffers;assert.equal(catalog.offers.cardapio.monthlyCents,2990);assert.equal(catalog.offers.cardapio.annualCents,29900);assert.equal(catalog.offers.encomendas.monthlyCents,4990);assert.equal(catalog.offers.encomendas.annualCents,49900);assert.equal(catalog.trialDays,14);assert.equal(catalog.forPlan({code:"foundation"}).code,"encomendas");assert.equal(catalog.forPlan({code:"cardapio"}).orders,false);
});
test("WhatsApp message keeps quantity, weight, options and subtotal without confirming an order",()=>{
 const url=context.OgritechWhatsAppSelection.url("5511999999999",[{name:"Bolo & chocolate",label:"2 kg",quantity:2,selections:[{quantity:1,name:"Brigadeiro"}]}],()=>100);
 const target=new URL(url);assert.equal(target.origin,"https://wa.me");const text=target.searchParams.get("text");for(const marker of ["2 × Bolo & chocolate","2 kg","1 × Brigadeiro","200,00","pagamento e entrega","não confirma o pedido"])assert.ok(text.includes(marker));
});
test("WhatsApp links reject missing or unsafe numbers and empty selections",()=>{
 for(const phone of [null,"", "javascript:alert(1)","5511999999999?bad=1"]){assert.equal(context.OgritechWhatsAppSelection.url(phone,[{}],()=>0),null);}
 assert.equal(context.OgritechWhatsAppSelection.url("5511999999999",[],()=>0),null);
});
test("public price pages expose both products and preserve selection into signup",async()=>{
 for(const file of ["index.html","cardapio-digital/index.html"]){const html=await read(file);for(const text of ["R$ 29,90","R$ 299,00","R$ 49,90","R$ 499,00","?plano=cardapio","?plano=encomendas","não gera outro teste"])assert.ok(html.includes(text),`${file}: ${text}`);}
 const html=await read("criar-cardapio/index.html");assert.match(html,/name="offer"/);assert.match(html,/name="cycle"/);assert.match(html,/teste de 14 dias é único/);
});


test("billing conflict messages survive the Supabase HTTP error wrapper",async()=>{
 const result={error:{context:{clone(){return {json:async()=>({error:{message:"Cadastre um WhatsApp válido antes de mudar para Cardápio."}})};}}}};
 assert.match(await context.OgritechOffers.errorMessage(result,"Falha"),/WhatsApp válido/);
 assert.equal(await context.OgritechOffers.errorMessage({error:{}},"Falha"),"Falha");
});
