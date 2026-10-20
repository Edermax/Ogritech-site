import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../menu-branding.js',import.meta.url),'utf8');
const context={URL,Uint8Array,createImageBitmap:async()=>({width:200,height:100,close(){}})};
runInNewContext(source,context);const api=context.OgritechMenuBranding;
test('brand image URLs reject arbitrary hosts, traversal and unsupported image extensions',()=>{
 const path='11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';
 assert.equal(api.assetUrl(path,'https://example.supabase.co'),`https://example.supabase.co/storage/v1/object/public/menu-images/${path}`);
 for(const unsafe of ['https://evil.invalid/a.png','../../a.png',path.replace('.png','.svg')])assert.equal(api.assetUrl(unsafe,'https://example.supabase.co'),'');
 assert.equal(api.assetUrl(path,'javascript:alert(1)'),'');
});
test('primary and accent get readable foregrounds even at extreme colors',()=>{
 assert.equal(api.contrastColor('#ffffff'),'#000000');assert.equal(api.contrastColor('#000000'),'#ffffff');
 const properties={};api.applyColors({style:{setProperty:(key,value)=>properties[key]=value}},{primary_color:'#ffffff',accent_color:'#000000'});
 assert.equal(properties['--menu-on-primary'],'#000000');assert.equal(properties['--menu-on-accent'],'#ffffff');
 api.applyColors({style:{setProperty:(key,value)=>properties[key]=value}},{primary_color:'url(javascript:x)'});
 assert.equal(properties['--menu-primary'],'#111827');
});
test('upload validates size, MIME and file signature before decoding',async()=>{
 const png=new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:'image/png'});
 assert.equal(await api.validateImage(png),true);
 await assert.rejects(()=>api.validateImage(new Blob(['not-an-image'],{type:'image/png'})),/conteúdo/);
 await assert.rejects(()=>api.validateImage(new Blob(['<svg/>'],{type:'image/svg+xml'})),/JPEG/);
 await assert.rejects(()=>api.validateImage({type:'image/png',size:6*1024*1024}),/5 MB/);
 context.createImageBitmap=async()=>({width:10001,height:100,close(){}});
 await assert.rejects(()=>api.validateImage(png),/10.000 pixels/);
});
