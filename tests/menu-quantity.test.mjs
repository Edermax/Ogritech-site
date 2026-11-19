import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../menu-quantity.js',import.meta.url),'utf8'),context={};
runInNewContext(source,context);const model=context.OgritechMenuQuantity;
const rule={step:25,distribution_step:25,options:['Chocolate','Chocolate branco','Morango','Banana']};
const item={minimum_quantity:100,maximum_quantity:500,metadata:{quantity_rules:rule}};
const split=rule.options.map(name=>({name,quantity:25}));
test('four flavors form a hundred with no per-flavor price adjustment',()=>{
 assert.equal(model.validateRules(rule,100,500),'');assert.equal(model.validate(item,100,split),'');
 assert.deepEqual(JSON.parse(JSON.stringify(model.distribute(item,100))),split);
 assert.match(model.describe(split).join(', '),/25 × Chocolate branco/);
});
test('total purchase and flavor portions respect independent multiples',()=>{
 assert.match(model.validate(item,101,split),/25 em 25/);
 assert.match(model.validate(item,75,split),/a partir de 100/);
 assert.match(model.validate(item,525,split),/até 500/);
 assert.match(model.validate(item,100,[{name:'Chocolate',quantity:30},{name:'Banana',quantity:70}]),/25 em 25/);
 assert.equal(model.validate({...item,metadata:{quantity_rules:{...rule,distribution_step:5}}},100,[{name:'Chocolate',quantity:30},{name:'Banana',quantity:70}]),'');
});
test('incomplete, excessive, unknown, repeated, fractional and negative portions are rejected',()=>{
 for(const parts of [split.slice(0,3),[...split,{name:'Banana',quantity:25}],[{name:'Unknown',quantity:100}],[{name:'Chocolate',quantity:50},{name:'Chocolate',quantity:50}],[{name:'Chocolate',quantity:99.5}],[{name:'Chocolate',quantity:-25}],[{name:'Chocolate',quantity:NaN}]])assert.notEqual(model.validate(item,100,parts),'');
 assert.match(model.validate(item,100,split.slice(0,3)),/Faltam distribuir 25/);
 assert.match(model.validate(item,100,[{name:'Chocolate',quantity:75},{name:'Banana',quantity:50}]),/excede o total em 25/);
});
test('equal distribution preserves every unit, step, option identity and zero omission',()=>{
 for(const qty of [100,125,150,175,200,500]){
  const result=model.distribute(item,qty);assert.equal(result.reduce((n,p)=>n+p.quantity,0),qty);assert(result.every(p=>p.quantity%25===0));assert.equal(model.validate(item,qty,result),'');
 }
 const many={...item,minimum_quantity:25,metadata:{quantity_rules:{...rule,options:Array.from({length:50},(_,i)=>`Opção ${i}`)}}};
 assert.equal(model.distribute(many,25).length,1);assert.equal(model.validate(many,25,model.distribute(many,25)),'');
});
test('existing products retain unit increments and existing minimum and maximum',()=>{
 const old={minimum_quantity:50,maximum_quantity:100,metadata:{requires_human_confirmation:true}};
 assert.equal(model.rules(old),null);assert.equal(model.limits(old).step,1);assert.equal(model.validate(old,51,[]),'');assert.notEqual(model.validate(old,101,[]),'');
 assert.notEqual(model.validate(old,50,[{name:'Chocolate',quantity:50}]),'');
});
test('new lots accept more than a hundred and have an explicit bounded ceiling',()=>{
 const lots={minimum_quantity:25,metadata:{quantity_rules:{step:25,distribution_step:25,options:[]}}};
 assert.equal(model.validate(lots,125,[]),'');assert.equal(model.validate(lots,10000,[]),'');assert.notEqual(model.validate(lots,10025,[]),'');
 assert.notEqual(model.validate({...lots,metadata:{}},125,[]),'');
});
test('configuration rejects impossible combinations, duplicates and unsafe numbers',()=>{
 for(const bad of [{...rule,step:0},{...rule,step:1.5},{...rule,distribution_step:10},{...rule,options:['Chocolate',' chocolate ']},{...rule,options:['']},{...rule,options:['x'.repeat(81)]},{...rule,options:['A\nB']},{...rule,options:Array.from({length:51},(_,i)=>`S${i}`)}])assert.notEqual(model.validateRules(bad,100,500),'');
 assert.notEqual(model.validateRules(rule,110,500),'');assert.notEqual(model.validateRules(rule,100,130),'');assert.equal(model.validateRules(null,50,null),'');
});
