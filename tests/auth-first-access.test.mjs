import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../update-password.js',import.meta.url),'utf8');
async function page(url,auth={}){
 const elements=new Map();
 function element(id){if(!elements.has(id)){const hidden=new Set(['hidden']);const listeners={};elements.set(id,{value:'',required:false,disabled:false,textContent:'',listeners,classList:{add:x=>hidden.add(x),remove:x=>hidden.delete(x),contains:x=>hidden.has(x)},addEventListener:(event,fn)=>listeners[event]=fn,querySelector:()=>element('submit'),querySelectorAll:()=>[],reset(){},focus(){}});}return elements.get(id);}
 const calls=[];
 const context={URL,URLSearchParams,document:{getElementById:element,title:'Senha'},sessionStorage:{removeItem(){}},supabaseClient:{auth:{verifyOtp:async data=>{calls.push(data);return {data:{session:{user:{id:'fixture'}}},error:null}},...auth}},window:{location:{href:url},history:{replaceState(){}},ogritechEnvironmentUrl:()=>'/login/?env=staging',setTimeout(){}},fetch(){throw Error('Unexpected network request')}};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 return {elements,calls};
}
test('invite hash is verified only on human confirmation and never asks for a recovery code',async()=>{
 const state=await page('https://ogritech.com.br/update-password.html?type=invite&env=staging#token_hash=fixture');
 assert.equal(state.calls.length,0);
 assert.equal(state.elements.get('confirmAccessButton').classList.contains('hidden'),false);
 await state.elements.get('confirmAccessButton').listeners.click();
 assert.equal(state.calls.length,1);assert.equal(state.calls[0].type,'invite');
 assert.equal(state.elements.get('updatePasswordForm').classList.contains('hidden'),false);
 assert.doesNotMatch(source,/recoveryCode|Código inválido/);
});
test('expired link shows actionable error and keeps password form hidden',async()=>{
 const state=await page('https://ogritech.com.br/update-password.html?type=invite#token_hash=fixture',{verifyOtp:async()=>({data:{session:null},error:{message:'expired'}})});
 await state.elements.get('confirmAccessButton').listeners.click();
 assert.match(state.elements.get('accessLinkMessage').textContent,/expirou/);
 assert.equal(state.elements.get('updatePasswordForm').classList.contains('hidden'),true);
});
test('opening password page without a callback cannot change an unrelated existing session',async()=>{
 const state=await page('https://ogritech.com.br/update-password.html');
 assert.match(state.elements.get('accessLinkMessage').textContent,/inválido/);
 assert.equal(state.elements.get('updatePasswordForm').classList.contains('hidden'),true);
});
test('a rejected password can be corrected without consuming another recovery link', async () => {
 let updates = 0;
 const state = await page('https://ogritech.com.br/update-password.html?type=recovery#token_hash=fixture', {
  updateUser: async () => ({ error: ++updates === 1 ? { code: 'same_password' } : null }),
  signOut: async () => ({ error: null })
 });
 await state.elements.get('confirmAccessButton').listeners.click();
 const submit = state.elements.get('updatePasswordForm').listeners.submit;
 async function enterPassword(password) {
  state.elements.get('newPassword').value = password;
  state.elements.get('confirmPassword').value = password;
  await submit({ preventDefault() {} });
 }
 for (const password of ['abc12345!', 'ABC12345!', 'Abcdefg!', 'Abcdefg1', 'Abcdefg1😊']) {
  await enterPassword(password);
  assert.equal(updates, 0);
 }
 await enterPassword('Abcdefg1!');
 assert.match(state.elements.get('updatePasswordMessage').textContent, /diferente da atual/);
 assert.equal(state.elements.get('submit').disabled, false);
 await enterPassword('Abcdefg2!');
 assert.match(state.elements.get('updatePasswordMessage').textContent, /Senha atualizada/);
 assert.equal(updates, 2);
 assert.equal(state.calls.length, 1);
});
test('legacy invitation restores its session before showing the password fields',async()=>{
 let restored=false;
 const state=await page('https://ogritech.com.br/update-password.html?env=staging#type=invite&access_token=fixture&refresh_token=refresh',{setSession:async()=>{restored=true;return {data:{session:{user:{id:'fixture'}}},error:null}}});
 assert.equal(restored,true);assert.equal(state.elements.get('updatePasswordForm').classList.contains('hidden'),false);
});
test('Portuguese templates use a first-party link and never an immediately consumed confirmation URL',async()=>{
 for(const type of ['invite','recovery']){
  const html=await readFile(new URL(`../supabase/templates/${type}.html`,import.meta.url),'utf8');
  assert.match(html,/lang="pt-BR"/);assert.match(html,/#token_hash={{ .TokenHash }}/);assert.doesNotMatch(html,/ConfirmationURL|You've been invited/);
 }
});
