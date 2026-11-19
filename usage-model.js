/* Fixed analytics vocabulary: never send URLs, query strings or DOM/form text. */
(() => {
  const pages=Object.freeze({home:'Página inicial',catalog_landing:'Apresentação do catálogo',signup:'Cadastro',signup_essential:'Cadastro Essencial',signup_complete:'Cadastro Completo',login:'Login',panel:'Painel do estabelecimento',storefront:'Vitrine pública',order_tracking:'Acompanhamento do pedido',subscription:'Assinatura',contact:'Contato',legal:'Termos e privacidade',client:'Área do cliente',booking:'Agendamento'});
  const targets=Object.freeze({hero_signup:'Criar vitrine · início da página',footer_signup:'Criar vitrine · final da página',nav_signup:'Criar vitrine · navegação',plan_essential:'Testar Essencial',plan_complete:'Testar Completo',plans:'Ver planos',demo:'Explorar vitrine de exemplo',login:'Entrar',contact:'Contato',legal:'Termos e privacidade',home:'Página inicial',whatsapp:'Abrir WhatsApp',instagram:'Abrir Instagram',assistant:'Abrir ajudante',panel_orders:'Painel · pedidos',panel_products:'Painel · produtos',panel_storefront:'Painel · vitrine',panel_sales:'Painel · vendas',panel_account:'Painel · conta',add_product:'Adicionar à sacola',open_cart:'Revisar sacola',checkout:'Finalizar pedido',photo:'Ver outra foto',signup_next:'Continuar cadastro'});
  const events=Object.freeze(['page_view','click','scroll','engagement','signup_started','signup_submitted','signup_completed','login_succeeded','panel_open','workspace_view','product_saved','catalog_published','checkout_open','order_completed']);
  function page(path) {
    path=String(path||'/').replace(/\/{2,}/g,'/').replace(/index\.html$/,'');
    if(path==='/')return 'home';
    if(path==='/cardapio-digital/')return 'catalog_landing';
    if(path.startsWith('/criar-cardapio/cardapio'))return 'signup_essential';
    if(path.startsWith('/criar-cardapio/encomendas'))return 'signup_complete';
    if(path.startsWith('/criar-cardapio/'))return 'signup';
    if(path==='/login/'||path==='/login.html')return 'login';
    if(path.startsWith('/painel/'))return 'panel';
    if(path.startsWith('/cardapio/'))return 'storefront';
    if(path.startsWith('/pedido/'))return 'order_tracking';
    if(path.startsWith('/assinatura/'))return 'subscription';
    if(path.startsWith('/contato/'))return 'contact';
    if(['/privacidade.html','/termos.html'].includes(path))return 'legal';
    if(path.startsWith('/cliente/')||path==='/cliente.html')return 'client';
    if(path.startsWith('/agendar/'))return 'booking';
    return null;
  }
  function source(referrer,search,origin) {
    const known=value=>/^(instagram|ig)$/.test(value)?'instagram':/^(facebook|fb|meta)$/.test(value)?'facebook':/^(google|adwords)$/.test(value)?'google':/^(whatsapp|wa)$/.test(value)?'whatsapp':/^(email|newsletter)$/.test(value)?'email':null;
    const campaign=known((new URLSearchParams(search).get('utm_source')||'').toLowerCase());if(campaign)return campaign;
    try{const ref=new URL(referrer);if(ref.origin===origin)return 'internal';const host=ref.hostname.toLowerCase();return /(^|\.)instagram\.com$/.test(host)||host==='l.instagram.com'?'instagram':/(^|\.)facebook\.com$/.test(host)||host==='l.facebook.com'?'facebook':/(^|\.)google\.[a-z.]+$/.test(host)?'google':/(^|\.)whatsapp\.com$/.test(host)||host==='wa.me'?'whatsapp':/bing\.com$|duckduckgo\.com$/.test(host)?'search':'other';}catch{return 'direct';}
  }
  const surface=code=>['panel','client','subscription'].includes(code)?'app':['storefront','order_tracking','booking'].includes(code)?'storefront':'site';
  const device=width=>width<600?'mobile':width<1000?'tablet':'desktop';
  const valid=(event,target='',value=0)=>events.includes(event)&&typeof target==='string'&&(target===''||Object.hasOwn(targets,target))&&Number.isInteger(value)&&value>=0&&value<=1800&&(event!=='scroll'||[25,50,75,90].includes(value));
  globalThis.OgritechUsageModel=Object.freeze({pages,targets,events,page,source,surface,device,valid});
})();
