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
  const registrations=[];
  const navigator={userAgent:ios?'iPhone':'Chrome Windows',platform:'',serviceWorker:{register:async url=>{registrations.push(url);return {};}}};
  if(native)navigator.install=native;
  vm.runInNewContext(source,{window,document,navigator,setTimeout:callback=>{timers.set(++nextTimer,callback);return nextTimer;},clearTimeout:id=>timers.delete(id)});
  return {button,help,events,domEvents,timers,registrations,display,initialize(){domEvents.DOMContentLoaded();},
    prompt(outcome='accepted') {const prompt={prevented:false,calls:0,preventDefault(){this.prevented=true;},prompt(){this.calls++;return Promise.resolve({outcome});},userChoice:Promise.resolve({outcome})};events.beforeinstallprompt(prompt);return prompt;}};
}
test('installation readiness is captured before DOM initialization and invokes the native prompt on click',async()=>{
  const page=fixture();const prompt=page.prompt();assert.equal(prompt.prevented,true);page.initialize();
  assert.equal(page.button.textContent,'Instalar app');assert.equal(prompt.calls,0);
  const pending=page.button.listeners.click();assert.equal(prompt.calls,1,'native prompt keeps the original user gesture');
  await pending;assert.equal(page.button.hidden,false,'acceptance alone is not confirmation of installation');
  assert.equal(page.button.textContent,'Instalando app...');
  page.events.appinstalled();assert.equal(page.button.hidden,true);assert.equal(page.timers.size,0);
  await page.events.load();assert.deepEqual(page.registrations,['/sw.js']);
});
test('canceling a browser prompt does not claim installation or open a tutorial',async()=>{
  const page=fixture();page.initialize();const prompt=page.prompt('dismissed');
  await page.button.listeners.click();assert.equal(prompt.calls,1);assert.equal(page.button.hidden,false);
  assert.equal(page.help.open,false);assert.match(page.button.after.textContent,/cancelada/);
  const second=page.prompt();assert.equal(page.button.textContent,'Instalar app');await page.button.listeners.click();assert.equal(second.calls,1);
});
test('Web Install API works without a deferred event and cancellation allows a new explicit attempt',async()=>{
  let count=0;
  const page=fixture({native:()=>{count++;if(count===1)return Promise.reject(Object.assign(new Error(),{name:'AbortError'}));return Promise.resolve();}});
  page.initialize();const pending=page.button.listeners.click();assert.equal(count,1);await pending;
  assert.equal(page.help.open,false);assert.equal(page.button.textContent,'Instalar app');
  await page.button.listeners.click();assert.equal(count,2);page.events.appinstalled();assert.equal(page.button.hidden,true);
});
test('unsupported devices offer clearly labeled instructions; a newly available installer is usable from the dialog',async()=>{
  const page=fixture({ios:true});page.initialize();assert.equal(page.button.textContent,'Como instalar o app');
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
