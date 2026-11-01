import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../supabase/functions/ogritech-billing/index.ts',import.meta.url),'utf8');
const helpers=runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('function validCnpj'),source.indexOf('async function sha256')))+';({validCpf,validCnpj})');
test('CPF accepts formatted or normalized check digits and rejects invalid/repeated numbers',()=>{
 assert.equal(helpers.validCpf('529.982.247-25'),'52998224725');
 assert.equal(helpers.validCpf('52998224725'),'52998224725');
 for(const value of ['52998224724','11111111111','00000000000','529982247','11222333000181']) assert.equal(helpers.validCpf(value),'');
});
test('CNPJ retains its validation independently of CPF',()=>{
 assert.equal(helpers.validCnpj('11.222.333/0001-81'),'11222333000181');
 for(const value of ['11222333000182','11111111111111','52998224725']) assert.equal(helpers.validCnpj(value),'');
});
const frontend=await readFile(new URL('../criar-cardapio/criar-cardapio.js',import.meta.url),'utf8');
function formFixture(){
 const listeners={};
 const documentField={addEventListener:(name,fn)=>{listeners.documentInput=fn;}};
 const invoice={value:'',addEventListener:(name,fn)=>{listeners.invoiceChange=fn;}};
 const form={elements:{tax_document:documentField,service_invoice_preference:invoice,phone:{addEventListener(){}}},addEventListener(){}};
 runInNewContext(frontend,{document:{querySelector:selector=>selector==='#menuTrialForm'?form:{}}});
 return {invoice,input(value){const target={value};listeners.documentInput({target});return target.value;},choose(value){invoice.value=value;listeners.invoiceChange();}};
}
test('CPF selects the optional invoice default; switching to CNPJ requests a choice',()=>{
 const form=formFixture();assert.equal(form.input('52998224725'),'529.982.247-25');assert.equal(form.invoice.value,'not_requested');
 assert.equal(form.input('11222333000181'),'11.222.333/0001-81');assert.equal(form.invoice.value,'');
});
test('typing or changing documents never overrides an explicit invoice request',()=>{
 const form=formFixture();form.choose('requested');form.input('52998224725');assert.equal(form.invoice.value,'requested');
 form.input('11222333000181');assert.equal(form.invoice.value,'requested');
});
