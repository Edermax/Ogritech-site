(() => {
  const $=id=>document.getElementById(id);
  const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value));
  async function rpc(name,args){const {data,error}=await supabaseClient.rpc(name,args);if(error)throw new Error(['22023','23514','42501'].includes(error.code)?error.message:'Não foi possível concluir. Tente novamente.');return data;}
  async function history(tenant,host){
    if(!host)return;host.hidden=false;host.textContent='Carregando pedidos anteriores...';
    try{
      const rows=await rpc('catalog_order_history',{target_barbershop_id:tenant});
      host.innerHTML='<h3>Pedidos anteriores</h3><p>Você pode consultar o histórico e concluir pedidos já recebidos. Novos pedidos na plataforma exigem o Completo ativo.</p>'+(rows.length?rows.map(row=>`<article class="subscription-option"><strong>#${Number(row.order_number)||''} · ${safe(row.customer_name)}</strong><p>${safe(row.status)} · ${money(row.total_amount)}</p><ul>${(row.items||[]).map(item=>`<li>${Number(item.quantity)} × ${safe(item.name)} · ${safe(item.option)}</li>`).join('')}</ul>${['received','confirmed'].includes(row.status)?`<button class="table-button" type="button" data-finish="${safe(row.id)}" data-status="completed">Concluir</button> <button class="table-button" type="button" data-finish="${safe(row.id)}" data-status="cancelled">Cancelar pedido</button>`:''}</article>`).join(''):'<p>Nenhum pedido anterior.</p>');
      host.querySelectorAll('[data-finish]').forEach(button=>button.addEventListener('click',async()=>{
        if(!confirm('Confirmar a atualização deste pedido?'))return;button.disabled=true;
        try{await rpc('finish_catalog_order',{target_barbershop_id:tenant,target_order_id:button.dataset.finish,target_status:button.dataset.status});await history(tenant,host);}
        catch(error){button.disabled=false;const notice=document.createElement('p');notice.setAttribute('role','alert');notice.textContent=error.message;host.append(notice);}
      }));
    }catch(error){host.textContent=error.message;}
  }
  globalThis.loadCatalogHistory=history;
  globalThis.loadCatalogExtensions=async(menu,status,templates)=>{
    const root=$('menuSettingsForm');if(!root || !globalThis.OgritechCatalogProfiles)return;
    for(const form of [root,$('menuItemForm')].filter(Boolean)){
      if(!form.dataset.catalogDirtyBound){form.addEventListener('input',()=>{form.dataset.catalogDirty='true';});form.dataset.catalogDirtyBound='true';}
      form.dataset.catalogDirty='false';
    }
    const profile=OgritechCatalogProfiles.resolve({...menu,...status});
    OgritechCatalogProfiles.apply(document.body,profile);
    const options=$('menuTemplateCode');
    if(options && !menu?.template_code){const preferred=OgritechCatalogProfiles.segment(status?.segment || (typeof businessConfig!=='undefined'?businessConfig.segment:''))?.template || profile.template;const matching=(templates||[]).find(t=>t.code===preferred);if(matching)options.value=matching.code;}
    let host=$('catalogExtensions');
    if(!host){host=document.createElement('section');host.id='catalogExtensions';host.className='commercial-form';root.after(host);}
    if(typeof currentRole!=='undefined'&&!['owner','admin'].includes(currentRole)){host.hidden=true;return;}
    host.hidden=false;
    const selectedSegment=status?.segment || (typeof businessConfig!=='undefined'?businessConfig.segment:'') || '';
    const full=status?.offer_code==='encomendas';
    host.innerHTML=`<h3>Atividade e apresentação do negócio</h3><p>Escolha sua atividade principal. Alterar a atividade preserva produtos, categorias, link, pedidos e assinatura.</p><form id="catalogSegmentForm"><label>O que você vende?<select name="segment" required aria-describedby="catalogSegmentHelp"></select></label><small id="catalogSegmentHelp">A escolha ajusta a apresentação, sem mudar seu plano ou reiniciar o teste.</small><button class="table-button" type="submit">Salvar atividade</button></form>${menu?`<form id="catalogProfileForm"><label>Modelo de apresentação<select name="template">${(templates||[]).map(t=>`<option value="${safe(t.code)}"${t.code===menu.template_code?' selected':''}>${safe(t.name)}</option>`).join('')}</select></label><small>O modelo pode ser ajustado separadamente da atividade principal.</small><button class="table-button" type="submit">Salvar perfil</button></form>`:''}<p id="catalogExtensionMessage" role="status"></p>${full&&menu?`<h3>Cupom de desconto</h3><p>Um cupom de valor fixo sobre os produtos, limitado ao subtotal. Deixe o código vazio para desativar.</p><form id="catalogCouponForm"><label>Código<input name="code" pattern="[A-Za-z0-9_-]{3,24}" maxlength="24" value="${safe(menu.catalog_coupon_code||'')}"></label><label>Desconto em reais<input name="amount" type="number" min="0" max="1000000" step="0.01" value="${Number(menu.catalog_coupon_amount)||0}"></label><label>Validade opcional<input name="expiry" type="date" value="${safe(menu.catalog_coupon_expires_at?.slice(0,10)||'')}"></label><button class="table-button" type="submit">Salvar cupom</button></form><h3>Capa do catálogo</h3><p>Personalização ampliada do Completo. O logo e as cores continuam disponíveis nos dois planos.</p><form id="catalogCoverForm"><label>Imagem de capa<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" required></label><button class="table-button" type="submit">Salvar capa em rascunho</button></form>`:menu?'<p>Cupons, capa e novos pedidos pela plataforma estão disponíveis no plano Completo.</p><div id="catalogHistory"></div>':''}`;
    OgritechCatalogProfiles.fillSelect($('catalogSegmentForm').elements.segment,selectedSegment,{placeholder:true});
    const notice=text=>{$('catalogExtensionMessage').textContent=text;};
    const run=async(form,action)=>{form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){notice(error.message);}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    $('catalogSegmentForm').addEventListener('submit',event=>{event.preventDefault();run(event.target,async()=>{
      if([root,$('menuItemForm')].some(form=>form?.dataset.catalogDirty==='true')){notice('Salve ou cancele as alterações antes de mudar a atividade.');return;}
      const chosen=OgritechCatalogProfiles.segment(event.target.elements.segment.value);
      if(!chosen){notice('Escolha uma das atividades disponíveis para alterar o cadastro.');return;}
      if(!confirm('Salvar a atividade e ajustar a apresentação? Seus produtos, pedidos e link serão mantidos.'))return;
      await rpc('set_catalog_business_segment',{target_barbershop_id:BARBERSHOP_ID,target_segment_code:chosen.code});
      if(typeof businessConfig!=='undefined')businessConfig.segment=chosen.code;
      await window.loadMenuAdmin?.();window.OgritechMenuWorkspace?.select('settings');
      notice('Atividade salva. Produtos, pedidos, link e plano foram mantidos.');
    });});
    $('catalogProfileForm')?.addEventListener('submit',event=>{event.preventDefault();run(event.target,async()=>{
      if([root,$('menuItemForm')].some(form=>form?.dataset.catalogDirty==='true')){notice('Salve ou cancele as alterações do catálogo antes de mudar o perfil.');return;}
      if(!confirm('Salvar a apresentação? Seus produtos e link serão mantidos. Salve outras alterações antes de continuar.'))return;
      await rpc('change_catalog_profile',{target_barbershop_id:BARBERSHOP_ID,target_template_code:event.target.elements.template.value});
      await window.loadMenuAdmin?.();
      window.OgritechMenuWorkspace?.select('settings');
      notice('Apresentação salva. Produtos e link foram mantidos.');
    });});
    $('catalogCouponForm')?.addEventListener('submit',event=>{event.preventDefault();run(event.target,async()=>{
      const form=event.target;await rpc('save_catalog_coupon',{target_barbershop_id:BARBERSHOP_ID,payload:{code:form.elements.code.value.trim().toUpperCase(),amount:Number(form.elements.amount.value),expires_at:form.elements.expiry.value?new Date(form.elements.expiry.value+'T23:59:59-03:00').toISOString():null}});notice('Cupom salvo. O desconto é validado ao registrar o pedido.');
    });});
    $('catalogCoverForm')?.addEventListener('submit',event=>{event.preventDefault();run(event.target,async()=>{
      const file=await OgritechMenuBranding.prepareImage(event.target.elements.cover.files[0]);
      const extension={'image/webp':'webp','image/jpeg':'jpg','image/png':'png'}[file.type],path=`${BARBERSHOP_ID}/${crypto.randomUUID()}.${extension}`;
      const upload=await supabaseClient.storage.from('menu-images').upload(path,file,{contentType:file.type,cacheControl:'31536000',upsert:false});if(upload.error)throw new Error('Não foi possível enviar a capa.');
      try{const branding=await rpc('menu_branding',{target_barbershop_id:BARBERSHOP_ID,action:'get',payload:{}});
      await rpc('menu_branding',{target_barbershop_id:BARBERSHOP_ID,action:'save',payload:{primary_color:branding.identity.primary_color,accent_color:branding.identity.accent_color,logo_path:branding.identity.logo_path||'',cover_path:path}});
      notice('Capa salva. Revise e publique a aparência para atualizar o catálogo público.');await window.loadMenuBranding?.(menu);
      }catch(error){await supabaseClient.storage.from('menu-images').remove([path]);throw error;}
    });});
    if(!full)await history(BARBERSHOP_ID,$('catalogHistory'));
  };
})();
