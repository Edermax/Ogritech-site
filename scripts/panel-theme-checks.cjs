async function settle(page){await page.evaluate(async()=>{
 await new Promise(resolve=>requestAnimationFrame(resolve));
 await Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{})));
});}

async function styles(page){return page.evaluate(()=>[...document.querySelectorAll('body *')]
 .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!['SCRIPT','STYLE','OPTION'].includes(el.tagName))
 .map(el=>{const s=getComputedStyle(el);return{tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,
  color:s.color,background:s.backgroundColor,border:s.borderColor,font:s.fontFamily,fontSize:s.fontSize,padding:s.padding,radius:s.borderRadius};}));}

async function darkIssues(page){return page.evaluate(()=>{
 const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const issues=[];
 for(const el of document.querySelectorAll('body *')){
  if(!el.getClientRects().length||el.closest('.menu-branding-preview,#menuShareQr,.menu-qr-paper')||['SCRIPT','STYLE','SVG','IMG','CANVAS','OPTION'].includes(el.tagName))continue;
  const s=getComputedStyle(el);if(s.visibility==='hidden')continue;
  const own=rgb(s.backgroundColor),text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const selector=el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.');
  if(own.length>=3&&(own[3]??1)>.95&&own.slice(0,3).every(v=>v>210))issues.push({kind:'light-surface',selector,text:text.slice(0,65)});
  if(!text||el.closest('button:disabled,[aria-disabled="true"]'))continue;
  let bg=[255,255,255],layers=[];
  for(let parent=el;parent;parent=parent.parentElement)layers.unshift(rgb(getComputedStyle(parent).backgroundColor));
  for(const c of layers){const alpha=c[3]??1;if(c.length>=3)bg=c.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));}
  const fg=rgb(s.color),alpha=fg[3]??1,ink=fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));
  const ratio=(Math.max(luminance(ink),luminance(bg))+.05)/(Math.min(luminance(ink),luminance(bg))+.05);
  const large=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700;
  if(ratio<(large?3:4.5))issues.push({kind:'contrast',selector,ratio:Math.round(ratio*100)/100,text:text.slice(0,65)});
 }
 return issues;
});}

module.exports={settle,styles,darkIssues};
