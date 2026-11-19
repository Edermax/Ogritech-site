(() => {
  const pathPattern=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
  const clean=value=>String(value||"").replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const limitFor=context=>Number(context?.product_image_limit)===3?3:Number(context?.product_image_limit)===1?1:context?.offer_code==='encomendas'?3:1;
  function pathFromUrl(value) {try{const path=new URL(value).pathname.split('/storage/v1/object/public/menu-images/')[1];return pathPattern.test(path||'')?path:'';}catch{return '';}}
  function assetUrl(path,base) {try{const url=new URL(base);return pathPattern.test(path||'')&&(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))?`${url.origin}/storage/v1/object/public/menu-images/${path}`:'';}catch{return '';}}
  function urls(item,base,limit=3) {return [...new Set([item.image_url,...(Array.isArray(item.metadata?.gallery_images)?item.metadata.gallery_images.map(path=>assetUrl(path,base)):[])].filter(Boolean))].slice(0,limit);}
  function render(item,base,limit) {
    const photos=urls(item,base,limit);if(!photos.length)return '';
    return `<div class="menu-item-media product-photo-gallery" data-product-photo-gallery data-photo-urls="${clean(JSON.stringify(photos))}" data-product-name="${clean(item.name)}"><img class="menu-item-image" loading="lazy" decoding="async" src="${clean(photos[0])}" alt="${clean(item.name)} — foto 1 de ${photos.length}"><p class="product-photo-status" role="status" hidden></p>${photos.length>1?`<div class="product-photo-navigation" role="group" aria-label="Fotos de ${clean(item.name)}">${photos.map((_,i)=>`<button type="button" data-photo-index="${i}" aria-label="Ver foto ${i+1} de ${photos.length} de ${clean(item.name)}" aria-pressed="${i===0}">${i+1}</button>`).join('')}<span data-photo-count aria-live="polite">1 / ${photos.length}</span></div>`:''}</div>`;
  }
  function bind(root) {
    if(root.dataset.productPhotosBound)return;root.dataset.productPhotosBound='true';
    function select(gallery,index) {const photos=JSON.parse(gallery.dataset.photoUrls);index=(index+photos.length)%photos.length;gallery.dataset.photoCurrent=index;const image=gallery.querySelector('img');image.src=photos[index];image.alt=`${gallery.dataset.productName} — foto ${index+1} de ${photos.length}`;gallery.querySelectorAll('[data-photo-index]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.photoIndex)===index)));const count=gallery.querySelector('[data-photo-count]');if(count)count.textContent=`${index+1} / ${photos.length}`;}
    root.addEventListener('click',event=>{const button=event.target.closest('[data-photo-index]');if(button)select(button.closest('[data-product-photo-gallery]'),Number(button.dataset.photoIndex));});
    root.addEventListener('keydown',event=>{const gallery=event.target.closest('[data-product-photo-gallery]');if(!gallery||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();select(gallery,Number(gallery.dataset.photoCurrent||0)+(event.key==='ArrowRight'?1:-1));gallery.querySelector('[aria-pressed=true]')?.focus();});
    root.addEventListener('error',event=>{if(!event.target.matches('.product-photo-gallery img'))return;const status=event.target.parentElement.querySelector('.product-photo-status');status.hidden=false;status.textContent='Esta foto não carregou. Escolha outra foto ou tente novamente.';},true);
    root.addEventListener('load',event=>{if(event.target.matches('.product-photo-gallery img'))event.target.parentElement.querySelector('.product-photo-status').hidden=true;},true);
  }
  globalThis.OgritechProductPhotos={limitFor,pathFromUrl,assetUrl,urls,render,bind};
})();
