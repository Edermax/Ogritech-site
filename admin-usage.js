(() => {
 const $=id=>document.getElementById(id),model=globalThis.OgritechUsageModel,number=new Intl.NumberFormat('pt-BR'),percent=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
 const sources={direct:'Direto',internal:'Navegação interna',instagram:'Instagram',facebook:'Facebook / Meta',google:'Google',whatsapp:'WhatsApp',email:'E-mail',search:'Outros buscadores',other:'Outras origens'},devices={mobile:'Celular',tablet:'Tablet',desktop:'Computador'};
 const steps={signup_open:'Abriu o cadastro',signup_started:'Começou a preencher',signup_submitted:'Enviou o cadastro',signup_completed:'Cadastro concluído',panel_open:'Entrou no painel',products_open:'Abriu Produtos',product_saved:'Salvou um produto',catalog_published:'Publicou a vitrine'};
 let mounted=false,request=0,report=null,lastKey='',lastLoaded=0;
 const n=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
 const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const shifted=(day,delta)=>{const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+delta);return date.toISOString().slice(0,10);};
 const dateLabel=day=>/^\d{4}-\d{2}-\d{2}$/.test(day||'')?day.slice(8,10)+'/'+day.slice(5,7):'—';
 const stamp=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'Nenhum evento recebido';
 const pageLabel=code=>model.pages[code]||'Outra página',targetLabel=code=>model.targets[code]||'Outra ação';
 function table(host,headers,rows){host.replaceChildren();if(!rows.length){host.append(node('p','Ainda não há registros neste período.','usage-empty'));return;}const table=node('table',undefined,'usage-table'),head=node('thead'),tr=node('tr');headers.forEach(text=>{const th=node('th',text);th.scope='col';tr.append(th);});head.append(tr);const body=node('tbody');for(const cells of rows){const row=node('tr');cells.forEach((value,index)=>{const cell=node('td',value);cell.dataset.label=headers[index];row.append(cell);});body.append(row);}table.append(head,body);host.append(table);}
 function funnel(host,items){host.replaceChildren();let previous=0;for(const [index,item] of items.entries()){const count=n(item.count),first=n(items[0]?.count),ratio=first?count/first*100:0;const row=node('li',undefined,'usage-funnel-step'),heading=node('div',undefined,'usage-funnel-heading');heading.append(node('span',steps[item.step]||'Etapa'),node('strong',number.format(count)));const progress=node('progress');progress.max=100;progress.value=ratio;progress.setAttribute('aria-label',(steps[item.step]||'Etapa')+': '+number.format(count)+' visitantes');row.append(heading,progress);row.append(node('small',index===0?'Visitantes estimados que iniciaram este fluxo':previous?`${percent.format(count/previous*100)}% avançaram · ${number.format(Math.max(0,previous-count))} não chegaram a esta etapa`:'Sem base para calcular avanço'));host.append(row);previous=count;}}
 function render(data){
  report=data;const summary=data.summary||{},engaged=n(summary.sessions)?n(summary.engaged_sessions)/n(summary.sessions)*100:null;
  for(const [id,value] of [['usageVisitors',number.format(n(summary.visitors))],['usageSessions',number.format(n(summary.sessions))],['usageViews',number.format(n(summary.page_views))],['usageEngagement',engaged===null?'—':percent.format(engaged)+'%']])$(id).textContent=value;
  $('usagePeriodLabel').textContent=`${dateLabel(data.period.start)} a ${dateLabel(data.period.end)} · horário de Brasília`;
  $('usageActivation').textContent='Coleta disponível desde '+stamp(data.activated_at)+'. Não há reconstrução de visitas anteriores à ativação.';
  $('usageFreshness').textContent='Último evento: '+stamp(data.latest_event_at);
  $('usageZero').hidden=n(summary.page_views)>0;$('usageResults').hidden=false;$('usageExport').disabled=false;
  const chart=$('usageDailyChart');chart.replaceChildren();const maximum=Math.max(1,...(data.daily||[]).map(d=>n(d.visitors)));
  for(const day of data.daily||[]){const column=node('div',undefined,'usage-day'),track=node('div',undefined,'usage-day-track'),bar=node('span',undefined,'usage-day-bar');bar.style.height=(n(day.visitors)/maximum*100)+'%';track.append(bar);column.append(node('strong',number.format(n(day.visitors))),track,node('small',dateLabel(day.day)));column.setAttribute('aria-label',dateLabel(day.day)+': '+number.format(n(day.visitors))+' visitantes');chart.append(column);}
  table($('usageDailyTable'),['Dia','Visitantes estimados','Visualizações'],(data.daily||[]).map(d=>[dateLabel(d.day),number.format(n(d.visitors)),number.format(n(d.page_views))]));
  table($('usagePageTable'),['Página','Visualizações','Sessões','Rolagem observada','Tempo ativo médio'],(data.pages||[]).map(p=>[pageLabel(p.page),number.format(n(p.views)),number.format(n(p.sessions)),'~'+percent.format(n(p.average_scroll))+'%',p.average_active_seconds===null?'—':number.format(Math.round(n(p.average_active_seconds)))+' s']));
  table($('usageClickTable'),['Onde','Ação','Cliques','Sessões'],(data.clicks||[]).map(c=>[pageLabel(c.page),targetLabel(c.target),number.format(n(c.clicks)),number.format(n(c.sessions))]));
  table($('usageSourceTable'),['Origem','Sessões'],(data.sources||[]).map(s=>[sources[s.source]||'Outra origem',number.format(n(s.sessions))]));
  table($('usageDeviceTable'),['Dispositivo','Sessões'],(data.devices||[]).map(d=>[devices[d.device]||'Outro dispositivo',number.format(n(d.sessions))]));
  table($('usagePathTable'),['Saiu de','Seguiu para','Ocorrências'],(data.paths||[]).map(p=>[pageLabel(p.previous),pageLabel(p.page),number.format(n(p.transitions))]));
  funnel($('usageSignupFunnel'),data.signup_funnel||[]);funnel($('usageAppFunnel'),data.app_funnel||[]);
 }
 function range(days){const end=today();$('usageEnd').value=end;$('usageStart').value=shifted(end,1-days);}
 function setup(){if(mounted)return;mounted=true;range(7);const limit=today();$('usageEnd').max=limit;$('usageStart').max=limit;
  $('usagePreset').addEventListener('change',()=>{if($('usagePreset').value!=='custom'){range(Number($('usagePreset').value));load(true);}});
  for(const id of ['usageStart','usageEnd'])$(id).addEventListener('change',()=>{$('usagePreset').value='custom';});
  $('usageFilters').addEventListener('submit',event=>{event.preventDefault();load(true);});$('usageScope').addEventListener('change',()=>load(true));$('usageExport').addEventListener('click',exportCsv);
 }
 async function load(force=false){if(!$('traffic'))return;setup();const start=$('usageStart').value,end=$('usageEnd').value,scope=$('usageScope').value,key=[start,end,scope].join('|'),message=$('usageMessage');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end||end>today()||(new Date(end)-new Date(start))/86400000>89){message.textContent='Escolha um período válido de até 90 dias, sem datas futuras.';message.className='usage-error';return;}
  if(!force&&key===lastKey&&Date.now()-lastLoaded<30000)return;const ticket=++request;message.className='';message.textContent='Carregando estatísticas…';$('traffic').setAttribute('aria-busy','true');$('usageRefresh').disabled=true;$('usageExport').disabled=true;$('usageResults').hidden=true;
  try{const {data,error}=await supabaseClient.rpc('platform_usage_report',{start_date:start,end_date:end,scope});if(ticket!==request)return;if(error)throw error;if(!data?.summary||!data?.period)throw new Error('invalid_response');render(data);lastKey=key;lastLoaded=Date.now();message.textContent='Estatísticas atualizadas.';}
  catch(error){if(ticket===request){message.textContent=error?.code==='42501'?'Estas estatísticas são restritas à administração da Ogritech.':'Não foi possível carregar as estatísticas. Use Atualizar para tentar novamente.';message.className='usage-error';}}
  finally{if(ticket===request){$('usageRefresh').disabled=false;$('traffic').setAttribute('aria-busy','false');}}
 }
 function exportCsv(){if(!report)return;const rows=[['Seção','Página / origem','Ação / medida','Quantidade'],['Resumo','','Visitantes estimados',n(report.summary.visitors)],['Resumo','','Sessões',n(report.summary.sessions)],['Resumo','','Visualizações',n(report.summary.page_views)]];
  for(const d of report.daily||[])rows.push(['Por dia',d.day,'Visitantes estimados',n(d.visitors)],['Por dia',d.day,'Visualizações',n(d.page_views)]);
  for(const p of report.pages||[])rows.push(['Páginas',pageLabel(p.page),'Visualizações',n(p.views)],['Páginas',pageLabel(p.page),'Rolagem observada (%)',n(p.average_scroll)]);
  for(const c of report.clicks||[])rows.push(['Cliques',pageLabel(c.page),targetLabel(c.target),n(c.clicks)]);
  for(const s of report.sources||[])rows.push(['Origens',sources[s.source]||'Outra origem','Sessões',n(s.sessions)]);
  for(const d of report.devices||[])rows.push(['Dispositivos',devices[d.device]||'Outro dispositivo','Sessões',n(d.sessions)]);
  for(const f of ['signup_funnel','app_funnel'])for(const s of report[f]||[])rows.push([f==='signup_funnel'?'Funil de cadastro':'Funil de uso','',steps[s.step]||'Etapa',n(s.count)]);
  const quote=value=>{let text=String(value);if(/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};const csv='\ufeff'+rows.map(row=>row.map(quote).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=node('a');link.href=url;link.download=`ogritech-trafego-${report.period.start}-${report.period.end}.csv`;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 globalThis.OgritechUsageAdmin={load};
})();
