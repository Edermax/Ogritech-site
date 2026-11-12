/* Light stays the default; dark is an explicit preference on this device. */
(() => {
  const key="ogritech:panel-theme",root=document.documentElement;
  function apply(value,persist=false) {
    const theme=value==="dark"?"dark":"light"; root.dataset.panelTheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",theme==="dark"?"#07121a":"#f5f8fb");
    document.querySelectorAll("[data-panel-theme-select]").forEach(select=>{select.value=theme;});
    if(persist)try{localStorage.setItem(key,theme);}catch{}
  }
  let saved="light";try{saved=localStorage.getItem(key)||"light";}catch{}
  apply(saved);
  const bind=()=>document.querySelectorAll("[data-panel-theme-select]").forEach(select=>{
    select.value=root.dataset.panelTheme; select.addEventListener("change",()=>apply(select.value,true));
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind,{once:true});else bind();
  window.addEventListener("storage",event=>{if(event.key===key)apply(event.newValue);});
  window.OgritechPanelTheme={set:theme=>apply(theme,true)};
})();
