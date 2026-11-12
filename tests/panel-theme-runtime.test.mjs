import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../panel-theme.js',import.meta.url),'utf8');
function fixture(saved,{unavailable=false}={}){
 const root={dataset:{}},listeners={},attributes={},select={value:'',addEventListener:(name,fn)=>{listeners.change=fn;}},storage=new Map();
 if(saved)storage.set('ogritech:panel-theme',saved);
 const context={document:{documentElement:root,readyState:'complete',querySelector:()=>({setAttribute:(key,value)=>{attributes[key]=value;}}),querySelectorAll:()=>[select]},window:{addEventListener:(name,fn)=>{listeners[name]=fn;}},localStorage:{getItem:key=>{if(unavailable)throw Error('blocked');return storage.get(key);},setItem:(key,value)=>{if(unavailable)throw Error('blocked');storage.set(key,value);}}};
 runInNewContext(source,context);return{root,select,listeners,storage,attributes,api:context.window.OgritechPanelTheme};
}
test('light is always the initial default and unavailable storage never breaks the panel',()=>{
 for(const unavailable of[false,true])assert.equal(fixture(null,{unavailable}).root.dataset.panelTheme,'light');
});
test('dark is explicit, persists, synchronizes controls and can return exactly to light',()=>{
 const f=fixture('dark');assert.equal(f.root.dataset.panelTheme,'dark');assert.equal(f.select.value,'dark');
 f.select.value='light';f.listeners.change();assert.equal(f.root.dataset.panelTheme,'light');assert.equal(f.storage.get('ogritech:panel-theme'),'light');
 f.listeners.storage({key:'ogritech:panel-theme',newValue:'dark'});assert.equal(f.select.value,'dark');
 f.api.set('untrusted');assert.equal(f.root.dataset.panelTheme,'light');
});
