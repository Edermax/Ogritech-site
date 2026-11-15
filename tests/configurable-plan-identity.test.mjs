import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const offersContext={};runInNewContext(await readFile(new URL('product-offers.js',root),'utf8'),offersContext);
test('custom plan identity and prices preserve the capability family without duplicating the brand',()=>{
 const plan=offersContext.OgritechOffers.forPlan({id:'custom',code:'equipe',menu_offer_code:'cardapio',name:'Ogritech Equipe',monthly_fee:49.9,annual_fee:449});
 assert.equal(plan.name,'Ogritech Equipe');assert.equal(plan.orders,false);assert.equal(plan.monthlyCents,4990);assert.equal(plan.annualCents,44900);
 assert.equal(offersContext.OgritechOffers.forPlan({offer_code:'encomendas',name:'Pro'}).orders,true);
});
const source=await readFile(new URL('supabase/functions/_shared/billing-email-template.ts',root),'utf8');
const render=runInNewContext(stripTypeScriptTypes(source).replace('export function','function')+';renderBillingEmail');
test('custom plan names are preserved and escaped in transactional email HTML',()=>{
 const email=render('trial_started',{}, {product_code:'menu',offer_code:'cardapio',plan_name_snapshot:'Equipe <img src=x onerror=alert(1)>',business_name:'Negócio',responsible_name:'Teste',cycle:'annual',total_cents:44900,trial_ends_at:'2026-11-30T00:00:00Z'});
 assert.match(email.subject,/Ogritech Equipe/);assert.match(email.html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(email.html,/<img src=x/);
 assert.match(render('trial_started',{}, {product_code:'menu',offer_code:'cardapio',business_name:'Negócio',responsible_name:'Teste',cycle:'monthly',total_cents:2990,trial_ends_at:'2026-11-30T00:00:00Z'}).subject,/Ogritech Cardápio/);
});
