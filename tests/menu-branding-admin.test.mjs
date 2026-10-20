import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source = await readFile(new URL('../menu-branding-admin.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function editor() {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id,value:'',hidden:false,disabled:false,style:{setProperty(){}},classList:{toggle(){}},events:{},
      addEventListener(type,handler){this.events[type]=handler;},focus(){},removeAttribute(){},querySelectorAll(){return [...elements.values()];}});
    return elements.get(id);
  };
  for (const match of source.matchAll(/\$\("([^"]+)"\)/g)) element(match[1]);
  const identity = {primary_color:'#112233',accent_color:'#ffffff',logo_path:'',cover_path:''};
  const state = {identity,published_identity:identity,has_draft:true,menu_published:true};
  let fail = false, role = 'owner';
  const context = {document:{getElementById:element},BARBERSHOP_ID:'fixture',window:{OGRITECH_SUPABASE_URL:'https://example.supabase.co'},
    sessionStorage:{getItem(){return role;}},addEventListener(){},URL:{revokeObjectURL(){}},
    OgritechMenuBranding:{applyColors(){},assetUrl(){return '';}} ,
    supabaseClient:{rpc:async(name,{action})=>{calls.push(action);return fail?{error:{code:'42501',message:'Acesso negado'}}:{data:structuredClone(state)};}}};
  runInNewContext(source,context);
  return {element,calls,load:()=>context.loadMenuBranding({title:'Teste'}),setFailure:value=>{fail=value;},setRole:value=>{role=value;}};
}
test('publication requires explicit inline confirmation; cancel never calls the backend',async()=>{
  const ui=editor();await ui.load();
  ui.element('menuBrandingPublish').events.click();
  assert.equal(ui.element('menuBrandingConfirm').hidden,false);
  assert.deepEqual(ui.calls,['get']);
  ui.element('menuBrandingConfirmNo').events.click();
  assert.equal(ui.element('menuBrandingConfirm').hidden,true);
  ui.element('menuBrandingDiscard').events.click();
  ui.element('menuBrandingConfirmYes').events.click();await flush();
  assert.deepEqual(ui.calls,['get','discard']);
  ui.element('menuBrandingPublish').events.click();
  ui.element('menuBrandingConfirmYes').events.click();await flush();
  assert.deepEqual(ui.calls,['get','discard','publish']);
});
test('editor recovers after failed loading and stays hidden for employees',async()=>{
  const ui=editor();ui.setFailure(true);await ui.load();
  assert.equal(ui.element('menuBrandingSave').disabled,true);
  ui.setFailure(false);await ui.load();
  assert.equal(ui.element('menuBrandingSave').disabled,false);
  ui.setRole('employee');await ui.load();
  assert.equal(ui.element('menuBrandingPanel').hidden,true);
  assert.deepEqual(ui.calls,['get','get']);
});

test('unsaved preview cannot publish a different stored draft',async()=>{
  const ui=editor();await ui.load();
  ui.element('menuBrandingPrimary').events.input();
  ui.element('menuBrandingPublish').events.click();
  assert.equal(ui.element('menuBrandingConfirm').hidden,true);
  assert.deepEqual(ui.calls,['get']);
});
