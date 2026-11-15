import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const scope={TextEncoder};runInNewContext(await readFile(new URL('../pix-copy-code.js',import.meta.url),'utf8'),scope);
const pix=scope.OgritechPixCode;
const fields=value=>{const result={};for(let at=0;at<value.length;){const id=value.slice(at,at+2),size=Number(value.slice(at+2,at+4));assert.ok(Number.isInteger(size));result[id]=value.slice(at+4,at+4+size);at+=4+size;}return result;};
test('Pix copia e cola carries the exact outgoing amount, customer key and reconciliation reference',()=>{
 const code=pix.build({key:'cliente@example.invalid',receiver_name:'João da Silva',receiver_city:'São Paulo',amount_cents:4990,reference:'DEVOLUCAO123'}),data=fields(code);
 assert.equal(data['54'],'49.90');assert.equal(fields(data['26'])['01'],'cliente@example.invalid');assert.equal(fields(data['62'])['05'],'DEVOLUCAO123');
 assert.equal(data['59'],'JOAO DA SILVA');assert.equal(data['60'],'SAO PAULO');assert.equal(data['63'],pix.crc16(code.slice(0,-4)));
});
test('CRC uses the independent CCITT-FALSE check vector and rejects invalid financial input',()=>{
 assert.equal(pix.crc16('123456789'),'29B1');
 const valid={key:'+5516999999999',receiver_name:'Cliente',receiver_city:'Franca',amount_cents:1,reference:'ABC123'};
 assert.equal(fields(pix.build(valid))['54'],'0.01');
 for(const bad of [{amount_cents:0},{amount_cents:-1},{amount_cents:49.9},{key:''},{receiver_name:'💰'},{receiver_city:''},{reference:'<script>'}])assert.throws(()=>pix.build({...valid,...bad}));
});
