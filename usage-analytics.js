(() => {
  const model=globalThis.OgritechUsageModel,page=model?.page(location.pathname);
  if(!page||globalThis.OgritechUsage||globalThis.OGRITECH_USAGE_DISABLED===true||typeof globalThis.crypto?.randomUUID!=='function'||!['ogritech.com.br','www.ogritech.com.br'].includes(location.hostname))return;
  if(navigator.webdriver&&globalThis.OGRITECH_USAGE_TEST!==true)return;
  if(new URLSearchParams(location.search).get('env')&&new URLSearchParams(location.search).get('env')!=='production')return;
  const consentKey='ogritechUsageConsent:v1',visitorKey='ogritechUsageVisitor:v1',sessionKey='ogritechUsageSession:v1';
  const storage=name=>{try{return globalThis[name];}catch{return null;}},local=storage('localStorage'),tab=storage('sessionStorage');
  const uuid=()=>crypto.randomUUID(),now=()=>Date.now(),read=(storage,key)=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}},write=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));}catch{}},remove=(storage,key)=>{try{storage.removeItem(key);}catch{}};
  const validId=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value||'');
  let choice=read(local,consentKey),visitor=null,session=null,visit=uuid(),queue=[],timer=null,inFlight=0,epoch=0,activeSince=document.hidden?null:now(),activeMs=0,lastEngagement=0,workspace='',formStarted=false;
  const milestones=new Set(),once=new Set();let banner,preferences;
  const validChoice=()=>typeof choice?.allowed==='boolean'&&Number.isFinite(choice?.at)&&now()>=choice.at&&now()-choice.at<180*86400000;
  const permitted=()=>validChoice()&&choice.allowed;
  function identity(){
    const saved=read(local,visitorKey);visitor=saved&&validId(saved.id)&&now()-saved.at<90*86400000?saved:{id:uuid(),at:now()};write(local,visitorKey,visitor);
    const previous=read(tab,sessionKey);session=previous&&validId(previous.id)&&previous.visitor===visitor.id&&now()-previous.last<1800000&&now()-previous.start<43200000?previous:{id:uuid(),visitor:visitor.id,start:now(),last:now(),source:model.source(document.referrer,location.search,location.origin),device:model.device(innerWidth)};
    session.last=now();write(tab,sessionKey,session);
  }
  function track(event,target='',value=0){
    if(!permitted()||!model.valid(event,target,value)||navigator.webdriver&&globalThis.OGRITECH_USAGE_TEST!==true)return;
    if(!session||now()-session.last>=1800000||now()-session.start>=43200000){identity();visit=uuid();if(event!=='page_view')track('page_view');}
    if(event==='signup_submitted'&&!formStarted){formStarted=true;track('signup_started');}
    session.last=now();session.order=Math.max(now()*1000,Number.isSafeInteger(session.order)?session.order+1:0);write(tab,sessionKey,session);
    queue.push({id:uuid(),visitor_id:visitor.id,session_id:session.id,visit_id:visit,occurred_at:session.order,event,page,target,value,source:session.source,device:session.device});
    if(queue.length>100)queue.splice(0,queue.length-100);
    clearTimeout(timer);timer=setTimeout(()=>flush(),1500);
  }
  const backend=()=>({url:window.OGRITECH_SUPABASE_URL||'https://mvzcoaiiwytycdqcvydf.supabase.co',key:window.OGRITECH_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_Mv7A4NxC6zr1s7Ob1ROEUw_Au212ibY'});
  async function flush(urgent=false){
    if(!permitted()||inFlight&&!urgent||!queue.length)return;
    const first=queue[0],boundary=queue.findIndex(entry=>entry.session_id!==first.session_id||entry.visitor_id!==first.visitor_id),size=boundary<0?Math.min(20,queue.length):Math.min(20,boundary);
    const batch=queue.splice(0,size),ticket=epoch,config=backend();inFlight++;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{const response=await fetch(config.url+'/rest/v1/rpc/public_record_platform_usage',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({events:batch}),keepalive:true,credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});if(!response.ok&&response.status>=500&&ticket===epoch&&permitted())queue.unshift(...batch);}
    catch{if(ticket===epoch&&permitted()&&!document.hidden)queue.unshift(...batch);}
    finally{clearTimeout(timeout);inFlight--;if(queue.length&&permitted()&&!document.hidden){clearTimeout(timer);timer=setTimeout(()=>flush(),10000);}}
  }
  function flushAtExit(){for(let batch=0;batch<5&&queue.length;batch++)void flush(true);}
  function start(){if(!permitted())return;identity();visit=uuid();activeMs=0;activeSince=document.hidden?null:now();lastEngagement=0;formStarted=false;milestones.clear();once.clear();track('page_view');context();}
  function setConsent(allowed){const continuing=permitted()&&Boolean(allowed);if(!continuing){epoch++;queue=[];clearTimeout(timer);}choice={allowed:Boolean(allowed),at:now()};write(local,consentKey,choice);banner.hidden=true;preferences.textContent='Preferências de estatísticas';if(allowed&&!continuing)start();else if(!allowed){visitor=null;session=null;remove(local,visitorKey);remove(tab,sessionKey);}preferences.focus({preventScroll:true});}
  function showPreferences(){banner.hidden=false;banner.querySelector('button').focus({preventScroll:true});}
  function mount(){
    const css=document.createElement('link');css.rel='stylesheet';css.href='/usage-analytics.css?v=20261119.1';document.head.append(css);
    banner=document.createElement('aside');banner.className='usage-consent';banner.setAttribute('aria-labelledby','usageConsentTitle');banner.innerHTML='<div class="usage-consent-heading"><strong id="usageConsentTitle">Ajude a melhorar a Ogritech</strong></div><p>Podemos medir páginas visitadas, cliques e etapas de uso? As estatísticas são opcionais. Não gravamos sua tela nem o que você digita. <a href="/privacidade.html#estatisticas">Saiba mais</a>.</p><div class="usage-consent-actions"><button type="button" data-usage-choice="false">Recusar estatísticas</button><button type="button" data-usage-choice="true">Permitir estatísticas</button></div>';
    banner.addEventListener('click',event=>{const button=event.target.closest('[data-usage-choice]');if(button)setConsent(button.dataset.usageChoice==='true');});
    preferences=document.createElement('button');preferences.type='button';preferences.className='usage-preferences';preferences.textContent='Preferências de estatísticas';preferences.addEventListener('click',showPreferences);
    const host=document.querySelector('footer')||document.querySelector('main')||document.body;host.append(preferences);document.body.append(banner);
    banner.hidden=validChoice();if(permitted())start();
  }
  function clickTarget(element){
    const declared=element.closest('[data-usage-target]')?.dataset.usageTarget;if(declared&&Object.hasOwn(model.targets,declared))return declared;
    const route=element.closest('[data-panel-route]')?.dataset.panelRoute;if(route&&Object.hasOwn(model.targets,'panel_'+route))return 'panel_'+route;
    if(element.closest('[data-photo-index]'))return 'photo';if(element.closest('[data-add-selected]'))return 'add_product';
    if(element.closest('#menuBagButton,#checkoutButton'))return 'open_cart';if(element.closest('#proceedCheckoutButton'))return 'checkout';
    if(element.closest('.ogri-assistant__toggle'))return 'assistant';
    const link=element.closest('a[href]');if(!link)return null;
    try{const url=new URL(link.href,location.href);if(url.origin!==location.origin)return /^(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)$/.test(url.hostname)?'whatsapp':/(^|\.)instagram\.com$/.test(url.hostname)?'instagram':null;
      if(/^#(?:planos|precos|plans|pricing)$/.test(url.hash))return 'plans';const destination=model.page(url.pathname);
      if(destination?.startsWith('signup'))return destination==='signup_essential'?'plan_essential':destination==='signup_complete'?'plan_complete':link.closest('.hero')?'hero_signup':link.closest('.final-cta,footer')?'footer_signup':'nav_signup';
      return destination==='storefront'&&model.surface(page)==='site'?'demo':['login','contact','legal','home'].includes(destination)?destination:null;
    }catch{return null;}
  }
  function context(){const state=globalThis.OgritechMenuWorkspace?.state();if(page!=='panel'||!state?.ready)return;if(!once.has('panel')){once.add('panel');track('panel_open');}const route=document.body.dataset.panelRoute||state.workspace;if(route!==workspace&&Object.hasOwn(model.targets,'panel_'+route)){workspace=route;track('workspace_view','panel_'+route);}}
  document.addEventListener('click',event=>{if(event.target.closest('.usage-consent,.usage-preferences'))return;const target=clickTarget(event.target);if(target)track('click',target);});
  document.addEventListener('focusin',event=>{if(permitted()&&page.startsWith('signup')&&event.target.closest('#menuTrialForm')&&!formStarted){formStarted=true;track('signup_started');}});
  window.addEventListener('scroll',()=>{if(model.surface(page)!=='site'||!permitted())return;const height=document.documentElement.scrollHeight-innerHeight;if(height<=0)return;const depth=Math.floor(scrollY/height*100);for(const value of [25,50,75,90])if(depth>=value&&!milestones.has(value)){milestones.add(value);track('scroll','',value);}},{passive:true});
  function engagement(){if(!permitted())return;const seconds=Math.min(1800,Math.floor((activeMs+(activeSince===null?0:now()-activeSince))/1000));if(seconds>=10&&seconds!==lastEngagement){lastEngagement=seconds;track('engagement','',seconds);}}
  setInterval(()=>{engagement();context();},15000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(activeSince!==null)activeMs+=now()-activeSince;activeSince=null;engagement();flushAtExit();}else{activeSince=now();context();}});
  window.addEventListener('pagehide',()=>{engagement();flushAtExit();});window.addEventListener('ogritech:menu-context-changed',context);window.addEventListener('popstate',context);window.addEventListener('hashchange',context);
  window.addEventListener('storage',event=>{if(event.key!==consentKey)return;const continuing=permitted();choice=read(local,consentKey);if(continuing&&permitted()){if(banner)banner.hidden=true;return;}epoch++;queue=[];if(!permitted()){visitor=null;session=null;formStarted=false;remove(tab,sessionKey);}else start();if(banner)banner.hidden=validChoice();});
  let reportedFailure=false;
  const safeTrack=(...args)=>{try{track(...args);}catch{if(!reportedFailure)console.warn('ogritech_usage_event_failed');reportedFailure=true;}};
  globalThis.OgritechUsage=Object.freeze({track:safeTrack,flush,preferences:showPreferences});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
