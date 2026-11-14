import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../pwa.js',import.meta.url),'utf8');
function fixture({native,ios=false,login=false}={}) {
  const events={},domEvents={},timers=new Map();let nextTimer=0;
  function node() {
    const children={},attrs={},listeners={};
    return {children,attrs,listeners,hidden:false,open:false,textContent:'',dataset:{},parentNode:null,
      classList:{contains(name){return this.owner.className?.split(' ').includes(name)||false;}},
      setAttribute(key,value){attrs[key]=value;},getAttribute(key){return attrs[key]??null;},
      addEventListener(key,callback){listeners[key]=callback;},appendChild(child){child.parentNode=this;},
      insertAdjacentElement(_position,child){this.after=child;},
      querySelector(selector){if(!children[selector])children[selector]=makeNode();return children[selector];},
      showModal(){this.open=true;this.openCount=(this.openCount||0)+1;},close(){this.open=false;}
    };
  }
  function makeNode(){const n=node();n.classList.owner=n;return n;}
  const button=makeNode(),help=makeNode(),body=makeNode();body.className=login?'login-page':'';
  const document={readyState:'loading',body,head:makeNode(),
    getElementById(id){return login?null:id==='panelInstallApp'?button:id==='panelInstallHelp'?help:null;},
    createElement(){return makeNode();},addEventListener(key,callback){domEvents[key]=callback;}};
  const display={matches:false,addEventListener(key,callback){events.displayChange=callback;}};
  const window={addEventListener(key,callback){events[key]=callback;},matchMedia(){return display;}};
  if(!ios) window.onbeforeinstallprompt=null;
  const registrations=[];
  const navigator={userActivation:{isActive:false},userAgent:ios?'iPhone':'Chrome Windows',platform:'',serviceWorker:{register:async (url,options)=>{registrations.push({url,scope:options.scope,cache:options.updateViaCache});return {};}}};
  if(native)navigator.install=native;
  vm.runInNewContext(source,{window,document,navigator,setTimeout:callback=>{timers.set(++nextTimer,callback);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  return {button,help,events,domEvents,timers,registrations,display,navigator,initialize(){domEvents.DOMContentLoaded();},
    prompt(outcome='accepted') {const prompt={prevented:false,calls:0,preventDefault(){this.prevented=true;},prompt(){this.calls++;return Promise.resolve({outcome});},userChoice:Promise.resolve({outcome})};events.beforeinstallprompt(prompt);return prompt;}};
}
test('installation readiness is captured before DOM initialization and invokes the native prompt on click',async()=>{
  const page=fixture();const prompt=page.prompt();assert.equal(prompt.prevented,true);page.initialize();
  assert.equal(page.button.textContent,'Instalar o app');assert.equal(prompt.calls,0);
  const pending=page.button.listeners.click();assert.equal(prompt.calls,1,'native prompt keeps the original user gesture');
  await pending;assert.equal(page.button.hidden,false,'acceptance alone is not confirmation of installation');
  assert.equal(page.button.textContent,'Instalando o app...');
  page.events.appinstalled();assert.equal(page.button.hidden,true);assert.equal(page.timers.size,0);
  await page.events.load();assert.deepEqual(page.registrations,[{url:'/sw.js?v=20261114.1',scope:'/',cache:'none'}]);
});
test('canceling a browser prompt does not claim installation or open a tutorial',async()=>{
  const page=fixture();page.initialize();const prompt=page.prompt('dismissed');
  await page.button.listeners.click();assert.equal(prompt.calls,1);assert.equal(page.button.hidden,false);
  assert.equal(page.help.open,false);assert.match(page.button.after.textContent,/cancelada/);
  const second=page.prompt();assert.equal(page.button.textContent,'Instalar o app');await page.button.listeners.click();assert.equal(second.calls,1);
});
test('Web Install API works without a deferred event and cancellation allows a new explicit attempt',async()=>{
  let count=0;
  const page=fixture({native:()=>{count++;if(count===1)return Promise.reject(Object.assign(new Error(),{name:'AbortError'}));return Promise.resolve();}});
  page.initialize();const pending=page.button.listeners.click();assert.equal(count,1);await pending;
  assert.equal(page.help.open,false);assert.equal(page.button.textContent,'Instalar o app');
  await page.button.listeners.click();assert.equal(count,2);page.events.appinstalled();assert.equal(page.button.hidden,true);
});
test('unsupported devices offer clearly labeled instructions; a newly available installer is usable from the dialog',async()=>{
  const page=fixture({ios:true});page.initialize();assert.equal(page.button.textContent,'Instalar o app');
  await page.button.listeners.click();assert.equal(page.help.open,true);assert.match(page.help.innerHTML,/Compartilhar → Adicionar à Tela de Início/);
  const prompt=page.prompt();const direct=page.help.children['[data-install-now]'];assert.equal(direct.hidden,false);
  await direct.listeners.click();assert.equal(prompt.calls,1);assert.equal(page.help.open,false);
});
test('repeated clicks cannot open concurrent prompts and timeout does not claim success',async()=>{
  let resolve,count=0;const page=fixture({native:()=>{count++;return new Promise(done=>{resolve=done;});}});page.initialize();
  const first=page.button.listeners.click();await page.button.listeners.click();assert.equal(count,1);
  resolve();await first;for(const callback of page.timers.values())callback();
  assert.equal(page.button.hidden,false);assert.equal(page.button.getAttribute('aria-disabled'),'false');
});
test('an installed app does not offer another installation',async()=>{
  let calls=0;const page=fixture({native:async()=>{calls++;}});page.display.matches=true;page.initialize();
  assert.equal(page.button.hidden,true);await page.button.listeners.click();assert.equal(calls,0);
});
test('a click waits for the native installer and opens it while user activation remains valid',async()=>{
  const page=fixture();page.initialize();assert.equal(page.button.textContent,'Instalar o app');
  await page.button.listeners.click();assert.equal(page.button.textContent,'Instalar o app');assert.match(page.button.after.textContent,/não está disponível/);
  assert.equal(page.help.children['[data-install-now]'].hidden,true);
  page.navigator.userActivation.isActive=true;
  const prompt=page.prompt();assert.equal(prompt.calls,1);
  await Promise.resolve();await Promise.resolve();page.events.appinstalled();assert.equal(page.button.hidden,true);
});
test('a delayed installer requires confirmation again after user activation expires',async()=>{
  const page=fixture();page.initialize();await page.button.listeners.click();
  const prompt=page.prompt();assert.equal(prompt.calls,0);
  assert.equal(page.help.children['[data-install-now]'].hidden,false);
  assert.match(page.help.children['[data-install-explanation]'].textContent,/instalação está pronta/);
  await page.help.children['[data-install-now]'].listeners.click();assert.equal(prompt.calls,1);
});
test('closing installation preparation cancels the request instead of opening a prompt later',async()=>{
  const page=fixture();page.initialize();await page.button.listeners.click();
  page.help.close();page.help.listeners.close();page.navigator.userActivation.isActive=true;
  const prompt=page.prompt();assert.equal(prompt.calls,0);assert.equal(page.help.open,false);
  assert.equal(page.button.textContent,'Instalar o app');
});
test('unavailable installation ends preparation and replaces its stale status',async()=>{
  const page=fixture();page.initialize();await page.button.listeners.click();
  for(const callback of [...page.timers.values()]) callback();
  assert.equal(page.button.getAttribute('aria-disabled'),'false');
  assert.equal(page.button.textContent,'Instalar o app');
  assert.doesNotMatch(page.button.after.textContent,/Preparando|Aguarde/);
  assert.match(page.button.after.textContent,/não está disponível/);
});
test('closing preparation clears its pending message',async()=>{
  const page=fixture();page.initialize();await page.button.listeners.click();
  page.help.close();page.help.listeners.close();
  assert.doesNotMatch(page.button.after.textContent,/Preparando|Aguarde/);
});
test('readiness updates both the confirmation dialog and the external status',async()=>{
  const page=fixture();page.initialize();await page.button.listeners.click();page.prompt();
  assert.match(page.button.after.textContent,/disponível/);
  assert.doesNotMatch(page.button.after.textContent,/Preparando/);
});
test('a native installer that never responds releases the controls and ignores a late acceptance',async()=>{
  let resolve;const page=fixture({native:()=>new Promise(done=>{resolve=done;})});page.initialize();
  const pending=page.button.listeners.click();assert.equal(page.button.getAttribute('aria-disabled'),'true');
  for(const callback of [...page.timers.values()])callback();
  assert.equal(page.button.getAttribute('aria-disabled'),'false');
  assert.match(page.button.after.textContent,/confirmação do navegador não chegou/);
  resolve({outcome:'accepted'});await pending;
  assert.equal(page.button.hidden,false);assert.equal(page.button.textContent,'Instalar o app');
});
test('an actual installation signal remains authoritative after a request timed out',async()=>{
  const page=fixture({native:()=>new Promise(()=>{})});page.initialize();void page.button.listeners.click();
  for(const callback of [...page.timers.values()])callback();
  page.events.appinstalled();page.help.listeners.close();
  assert.equal(page.button.hidden,true);assert.match(page.button.after.textContent,/Ogritech instalado/);
});
