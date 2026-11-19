import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const login=await readFile(new URL('../login.js',import.meta.url),'utf8');
const auth=await readFile(new URL('../auth.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const previous={id:'previous-user',email:'previous@example.invalid'}, current={id:'new-user',email:'new@example.invalid'};
const profile={barbershop_id:'new-business',full_name:'Novo proprietário',role:'owner',active:true};
const pendingKey='ogritechSignupEmail:production';
function fixture(path,stored={}){
 const values=new Map(Object.entries(stored)),nodes=new Map(),calls=[],redirects=[],errors=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 function node(id){
  if(!nodes.has(id)){const classes=new Set();nodes.set(id,{value:'',textContent:'',disabled:false,listeners:{},style:{},className:'',dataset:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,force)=>force?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},addEventListener(event,fn){this.listeners[event]=fn;},querySelector:()=>node('submit'),querySelectorAll:()=>[],setAttribute(){},focus(){},reset(){}});}
  return nodes.get(id);
 }
 const url=new URL(path,'https://ogritech.com.br'),location={href:url.href,search:url.search,pathname:url.pathname,replace:path=>redirects.push(path),reload:()=>calls.push('reload')};
 const document={readyState:'complete',documentElement:{style:{}},getElementById:id=>id==='changePasswordButton'?null:node(id),querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>node('error'),body:{appendChild(){}}};
 const window={location,history:{replaceState(){}},ogritechEnvironmentUrl:path=>new URL(path,'https://ogritech.com.br').href};
 return{values,nodes,node,calls,redirects,errors,storage,document,window,location};
}
async function loginPage(path,stored={},logoutError=null){
 const state=fixture(path,stored);let session={user:previous};
 const client={auth:{getSession:async()=>{state.calls.push('getSession');return{data:{session}};},signOut:async options=>{state.calls.push({signOut:options});if(!logoutError)session=null;return{error:logoutError};},signInWithPassword:async payload=>{state.calls.push({loginEmail:payload.email});session={user:current};return{data:{user:current,session}};}},rpc:async()=>{state.calls.push('is_platform_admin');return{data:false};},from:()=>{const q={select:()=>q,eq:(column,id)=>{assert.equal(id,current.id);return q;},single:async()=>({data:profile})};return q;}};
 runInNewContext(login,{document:state.document,window:state.window,sessionStorage:state.storage,supabaseClient:client,URL,URLSearchParams,console:{error:error=>state.errors.push(error)}});
 await tick();return state;
}
const stale={japaAuth:'true',japaUserId:previous.id,japaBarbershopId:'previous-business',ogritechOperationalSession:'previous-context',ogritechMasterMode:'true',ogritechMasterBusinessId:'previous-business',ogritechMasterBusinessName:'Loja anterior',[pendingKey]:current.email};

test('first access never restores a previous account and clears only this device session',async()=>{
 const state=await loginPage('/login/?primeiro_acesso=1',stale);
 assert.equal(state.redirects.length,0);assert.equal(state.values.get('japaBarbershopId'),undefined);
 assert.equal(state.values.get('ogritechMasterMode'),undefined);assert.equal(state.values.get('ogritechOperationalSession'),undefined);
 assert.equal(state.nodes.get('email').value,current.email);assert.match(state.nodes.get('loginMessage').textContent,/convite/);
 assert.equal(state.calls.length,1);assert.equal(state.calls[0].signOut.scope,'local');assert.equal(state.document.documentElement.style.visibility,'visible');
});
test('a pending new signup prevents implicit restoration even on the generic login page',async()=>{
 const state=await loginPage('/login/',stale);
 assert.equal(state.redirects.length,0);assert.ok(state.calls.some(call=>call.signOut?.scope==='local'));
 assert.equal(state.calls.includes('is_platform_admin'),false);
});
test('explicit login after signup uses only the newly authenticated profile and tenant',async()=>{
 const state=await loginPage('/login/?primeiro_acesso=1',stale);
 state.node('email').value=current.email;state.node('password').value='fixture-password';
 await state.node('loginForm').listeners.submit({preventDefault(){}});
 assert.equal(state.values.get('japaUserId'),current.id);assert.equal(state.values.get('japaBarbershopId'),profile.barbershop_id);
 assert.equal(state.values.get('ogritechMasterBusinessId'),undefined);assert.equal(state.values.get(pendingKey),undefined);
 assert.deepEqual(state.redirects,['https://ogritech.com.br/painel/']);
});
test('switch-account link does not fall back to the prior tenant when local signout fails',async()=>{
 const state=await loginPage('/login/?trocar_conta=1',stale,{message:'fixture unavailable'});
 assert.equal(state.redirects.length,0);assert.equal(state.calls.includes('getSession'),false);
 assert.equal(state.document.documentElement.style.visibility,'visible');assert.match(state.node('loginMessage').textContent,/Não foi possível/);
});

async function panelPage({master=false,deferredProfile=false,platformAdmin=false}={}){
 const state=fixture('/painel/',{japaAuth:'true',japaUserId:current.id,japaRole:'owner',japaBarbershopId:profile.barbershop_id,ogritechOperationalSession:`${current.id}:owner:${profile.barbershop_id}`,...(master?{ogritechMasterMode:'true',ogritechMasterBusinessId:'previous-business',ogritechMasterBusinessName:'Loja anterior'}:{})});
 let onChange,resolveProfile;
 const client={auth:{getSession:async()=>({data:{session:{user:current}}}),onAuthStateChange:fn=>{onChange=fn;return{};},signOut:async()=>({})},rpc:async()=>({data:platformAdmin}),from:()=>{const q={select:()=>q,eq:(column,id)=>{assert.equal(id,current.id);return q;},single:()=>deferredProfile?new Promise(resolve=>{resolveProfile=resolve;}):Promise.resolve({data:profile})};return q;},functions:{invoke:async()=>{state.calls.push('billing');return{data:{data:{status:'trial_active'}}};}}};
 runInNewContext(auth,{document:state.document,window:state.window,location:state.location,sessionStorage:state.storage,supabaseClient:client,console:{error:error=>state.errors.push(error)}});
 await tick();return{...state,change:(event,session)=>onChange(event,session),resolveProfile:()=>resolveProfile({data:profile})};
}
test('stale master-business context cannot be rendered as the new owner tenant',async()=>{
 const state=await panelPage({master:true});
 assert.equal(state.values.get('ogritechMasterMode'),undefined);assert.equal(state.values.get('japaBarbershopId'),profile.barbershop_id);
 assert.ok(state.calls.includes('reload'));assert.equal(state.document.documentElement.style.visibility,'hidden');assert.equal(state.errors.length,0);
});

test('verified platform support gets an explicit return even before business loading',async()=>{
 const state=await panelPage({master:true,platformAdmin:true});
 assert.equal(state.node('platformAdminReturn').hidden,false);
 assert.equal(state.node('backToShowcase').href,'https://ogritech.com.br/admin.html#businesses');
 assert.equal(state.document.documentElement.style.visibility,'visible');
 assert.equal(state.calls.includes('billing'),false);
 state.change('SIGNED_OUT',null);
 assert.equal(state.document.documentElement.style.visibility,'hidden');
 assert.deepEqual(state.redirects,['https://ogritech.com.br/login/']);
});
test('switching account in another tab immediately hides and unloads the prior tenant panel',async()=>{
 const state=await panelPage();assert.equal(state.document.documentElement.style.visibility,'visible');
 state.values.set(pendingKey,previous.email);
 state.change('SIGNED_IN',{user:previous});assert.equal(state.document.documentElement.style.visibility,'hidden');
 assert.equal(state.values.get(pendingKey),undefined,'An old signup hint must not sign the newly authenticated user out again');
 assert.equal(state.values.get('japaBarbershopId'),undefined);assert.deepEqual(state.redirects,['https://ogritech.com.br/login/']);
});
test('token refresh for the same user preserves the panel; signout removes its tenant context',async()=>{
 const state=await panelPage();state.change('TOKEN_REFRESHED',{user:current});assert.equal(state.document.documentElement.style.visibility,'visible');
 assert.equal(state.redirects.length,0);state.change('SIGNED_OUT',null);assert.equal(state.document.documentElement.style.visibility,'hidden');assert.equal(state.values.get('japaUserId'),undefined);
});
test('an account change while loading the profile cannot reveal the earlier account afterwards',async()=>{
 const state=await panelPage({deferredProfile:true});state.change('SIGNED_IN',{user:previous});state.resolveProfile();await tick();
 assert.equal(state.document.documentElement.style.visibility,'hidden');assert.equal(state.calls.includes('billing'),false);assert.equal(state.values.get('japaBarbershopId'),undefined);
});
