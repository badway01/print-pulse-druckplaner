/* Stable HA panel bookmark; never exposes or stores ingress URLs or tokens. */
(function(){
 'use strict';
 const key='pp_view',value='strom';
 function panelURL(){
  try {
   if(window.top===window||window.top.location.origin!==window.location.origin)return null;
   const u=new URL(window.top.location.href);
   if(u.pathname.includes('/api/hassio_ingress/'))return null;
   return u;
  }catch(_){return null}
 }
 const panel=panelURL();
 const monitor=/\/(?:monitor\/?|tablet-monitor\.html)$/.test(location.pathname);
 if(!monitor&&panel?.searchParams.get(key)===value){
  location.replace(new URL('monitor',location.href).href);
  return;
 }
 if(!monitor)return;
 function init(){
  const button=document.getElementById('homescreen-link');
  if(!button)return;
  if(!panel){button.hidden=true;return}
  if(panel.searchParams.get(key)===value){button.hidden=true;return}
  button.addEventListener('click',()=>{
   const u=panelURL();
   if(!u)return;
   u.searchParams.set(key,value);
   window.top.location.assign(u.href);
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
 else init();
})();
