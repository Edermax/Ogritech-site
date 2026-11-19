(() => {
 const $=id=>document.getElementById(id),model=globalThis.OgritechProductPhotos;
 const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let mounted=false,limit=1,locked=true,selecting=false,version=0,cover=null,extra=[],objectUrls=[];
 const base=()=>window.OGRITECH_SUPABASE_URL;
 function release(){for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls=[];}
 function card(entry,index,archived=false){return `<article class="product-photo-editor-card${archived?' is-archived':''}"><img src="${escape(entry.url)}" alt="Foto ${index+1} do produto"><div><strong>${index===0?'Foto principal':archived?'Foto preservada':`Foto ${index+1}`}</strong>${archived?'<small>Volta à vitrine com o Completo.</small>':''}<div class="product-photo-actions">${index>0&&!archived&&(!cover||cover.path||cover.file)?`<button type="button" class="table-button" data-photo-cover="${index}">Tornar principal</button>`:''}<button type="button" class="table-button" data-photo-remove="${index}">Remover</button></div></div></article>`;}
 function render(){
  if(!mounted)return;
  $('menuProductPhotos').innerHTML=(cover?card(cover,0):'<p class="product-photo-empty">Adicione a foto principal do produto.</p>')+extra.map((entry,i)=>card(entry,i+1,limit===1)).join('');
  const activeCount=(cover?1:0)+(limit===3?extra.length:0);
  $('menuPhotoLimit').textContent=`${activeCount} de ${limit} ${limit===1?'foto':'fotos'} na vitrine`;
  $('menuPhotoPlanNotice').textContent=limit===3?'Completo: até 3 fotos por produto. A principal aparece primeiro na vitrine.':`Essencial: 1 foto por produto.${extra.length?' As fotos adicionais foram preservadas e ficam fora da vitrine neste plano.':' No Completo, você pode adicionar até 3.'}`;
  $('menuItemImage').multiple=limit===3;
  const label=$('menuItemImage').closest('label'),caption=label&&[...label.childNodes].find(node=>node.nodeType===3);if(caption)caption.textContent=limit===3?'Adicionar fotos ':'Adicionar foto ';
  $('menuItemImage').disabled=locked||selecting||activeCount>=limit;
  $('menuPhotoReplace').disabled=locked||selecting;
  $('menuProductPhotos').querySelectorAll('button').forEach(button=>button.disabled=locked||selecting);
  $('menuItemImageUrl').value=cover?.file?'':cover?.url||'';
  $('menuItemImagePath').value=cover?.path||'';
 }
 function load(item){if(!mounted)return;version++;selecting=false;release();cover=item?.image_url?{url:item.image_url,path:model.pathFromUrl(item.image_url)}:null;extra=(item?.metadata?.gallery_images||[]).map(path=>({path,url:model.assetUrl(path,base())}));$('menuItemImage').value='';$('menuPhotoStatus').textContent='';render();}
 async function choose(files,replace=false){
  const ticket=++version,available=replace?1:limit-((cover?1:0)+(limit===3?extra.length:0));
  if(files.length>available){$('menuPhotoStatus').textContent=`Seu plano permite ${limit} ${limit===1?'foto':'fotos'} por produto. Selecione até ${Math.max(0,available)} agora.`;return;}
  if(!files.length)return;selecting=true;render();$('menuPhotoStatus').textContent='Preparando fotos…';
  try{
   const prepared=[];
   for(const file of files){const optimized=await globalThis.OgritechMenuBranding.prepareImage(file);if(ticket!==version)return;const url=URL.createObjectURL(optimized);objectUrls.push(url);prepared.push({url,file:optimized,path:''});}
   if(ticket!==version)return;
   if(replace)cover=prepared[0];else for(const photo of prepared){if(!cover)cover=photo;else extra.push(photo);}
   $('menuPhotoStatus').textContent='Prévia pronta. Salve o produto para aplicar as fotos.';
  }catch(error){if(ticket===version)$('menuPhotoStatus').textContent=error.message;}
  finally{if(ticket===version){selecting=false;render();}}
 }
 function setup(){
  if(mounted||!model||!$('menuItemImage')||typeof document.createElement!=='function')return;
  const fieldset=$('menuItemImage').closest('fieldset');fieldset.id='menuProductPhotosFieldset';fieldset.classList.add('product-photos-editor');
  fieldset.querySelector('legend').textContent='Fotos do produto';
  const body=document.createElement('div');body.innerHTML='<div class="product-photo-toolbar"><strong id="menuPhotoLimit"></strong><button id="menuPhotoReplace" type="button" class="table-button">Substituir principal</button></div><p id="menuPhotoPlanNotice" class="section-description"></p><div id="menuProductPhotos" class="product-photo-editor-grid"></div><input id="menuPhotoReplacement" type="file" accept="image/jpeg,image/png,image/webp" hidden><p id="menuPhotoStatus" role="status" aria-live="polite"></p>';fieldset.append(body);
  mounted=true;
  $('menuItemImage').addEventListener('change',()=>{const files=[...$('menuItemImage').files];$('menuItemImage').value='';choose(files);});
  $('menuPhotoReplace').addEventListener('click',()=>$('menuPhotoReplacement').click());
  $('menuPhotoReplacement').addEventListener('change',()=>{const files=[...$('menuPhotoReplacement').files];$('menuPhotoReplacement').value='';choose(files,true);});
  $('menuProductPhotos').addEventListener('click',event=>{
   const remove=event.target.closest('[data-photo-remove]'),principal=event.target.closest('[data-photo-cover]');
   if(remove){const index=Number(remove.dataset.photoRemove);if(index===0){cover=null;if(limit===3)cover=extra.shift()||null;}else extra.splice(index-1,1);}
   if(principal){const index=Number(principal.dataset.photoCover)-1,selected=extra[index];if(cover)extra[index]=cover;else extra.splice(index,1);cover=selected;}
   $('menuPhotoStatus').textContent='Salve o produto para aplicar as alterações.';render();
  });
  window.addEventListener('pagehide',release);load(null);
 }
 function context(value){limit=model.limitFor(value);locked=Boolean(value.disabled);render();}
 async function prepare(client){
  if(!mounted)return null;if(selecting)throw new Error('Aguarde a preparação das fotos antes de salvar.');
  const uploaded=[],resolved=[];
  try{
   for(const entry of [cover,...extra]){
    if(!entry){resolved.push(null);continue;}
    if(!entry.file){resolved.push({...entry});continue;}
    const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[entry.file.type];
    const path=`${typeof BARBERSHOP_ID!=="undefined"?BARBERSHOP_ID:window.BARBERSHOP_ID}/${crypto.randomUUID()}.${extension}`,result=await client.storage.from('menu-images').upload(path,entry.file,{contentType:entry.file.type,cacheControl:'31536000',upsert:false});
    if(result.error)throw new Error(result.error.message||'Não foi possível enviar a foto. Tente novamente.');
    uploaded.push(path);resolved.push({path,url:client.storage.from('menu-images').getPublicUrl(path).data.publicUrl});
   }
   return {imageUrl:resolved[0]?.url||'',metadata:{gallery_images:resolved.slice(1).filter(Boolean).map(entry=>entry.path)},resolved,uploaded};
  }catch(error){if(uploaded.length)await client.storage.from('menu-images').remove(uploaded).catch(()=>{});throw error;}
 }
 async function rollback(client,transaction){if(transaction?.uploaded.length)await client.storage.from('menu-images').remove(transaction.uploaded).catch(()=>{});}
 function persisted(transaction){if(!transaction)return;release();cover=transaction.resolved[0];extra=transaction.resolved.slice(1).filter(Boolean);render();}
 globalThis.OgritechProductPhotoEditor={setup,load,context,prepare,rollback,persisted,active:()=>mounted};
})();
