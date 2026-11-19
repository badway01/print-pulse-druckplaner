'use strict';
// Reuse the locally installed HA card and the current user's HA frontend.
// No access token is copied and no new server-side control endpoint is exposed.
const farmResource='/local/print-pulse-farm/print-pulse-farm.js?v=0.2.2';
const farmMount=document.getElementById('farm');
function findHA(){
 let current=window;
 for(let depth=0;depth<8;depth++){
  if(current.parent===current)return null;
  current=current.parent;
  try{
   const root=current.document.querySelector('home-assistant');
   if(root?.hass?.states&&typeof root.hass.callWS==='function')return root;
  }catch{return null;}
 }
 return null;
}
function findFarmCard(config){
 const matches=[];
 function visit(value){
  if(!value||typeof value!=='object')return;
  if(value.type==='custom:print-pulse-farm'||value.type==='print-pulse-farm')matches.push(value);
  for(const child of Object.values(value))visit(child);
 }
 visit(config);
 if(matches.length!==1||matches[0].demo)return null;
 return matches[0];
}
async function farmConfig(hass){
 const panels=Object.entries(hass.panels||{}).filter(([,panel])=>String(panel.title||'').trim().toLowerCase()==='druckerfarm');
 if(panels.length!==1)throw Error('Druckerfarm-Dashboard nicht eindeutig');
 const [path,panel]=panels[0];
 if(panel.component_name&&panel.component_name!=='lovelace')throw Error('Kein Lovelace-Dashboard');
 const config=await hass.callWS({type:'lovelace/config',url_path:panel.url_path||path});
 const card=findFarmCard(config);
 if(!card)throw Error('Keine eindeutige Live-Druckerfarm-Karte');
 return card;
}
// The HA card normally gets ha-icon from the HA frontend. The isolated
// frame supplies the small set used by this card with local SVG outlines.
const iconPaths={
 'mdi:power':'M12 2v10M6 5a9 9 0 1 0 12 0',
 'mdi:lightbulb-outline':'M9 18h6m-5 3h4M9 15c0-2-4-3-4-7a7 7 0 0 1 14 0c0 4-4 5-4 7',
 'mdi:lightbulb-on':'M9 18h6m-5 3h4M9 15c0-2-4-3-4-7a7 7 0 0 1 14 0c0 4-4 5-4 7M12 5v5',
 'mdi:flash':'M13 2 4 14h7l-1 8 10-13h-7z',
 'mdi:currency-eur':'M19 5a8 8 0 1 0 0 14M4 10h12M4 14h10',
 'mdi:clock-outline':'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 6v6l4 2',
 'mdi:calendar-today':'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-11 4h5v4H9z',
 'mdi:calendar-month':'M4 5h16v16H4zM8 2v6m8-6v6M4 10h16m-11 4h1m4 0h1m-6 3h1m4 0h1'
};
if(!customElements.get('ha-icon'))customElements.define('ha-icon',class extends HTMLElement{
 static get observedAttributes(){return ['icon'];}
 connectedCallback(){this.draw();}
 attributeChangedCallback(){this.draw();}
 draw(){
  const root=this.shadowRoot||this.attachShadow({mode:'open'});
  const path=iconPaths[this.getAttribute('icon')]||'M5 12h14';
  root.innerHTML='<style>:host{display:inline-flex;align-items:center;justify-content:center}svg{width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)}</style><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="'+path+'"/></svg>';
 }
});
function report(status){window.parent.postMessage({kind:'pp-printer-farm',status,height:Math.ceil(farmMount.getBoundingClientRect().height)},location.origin);}
function syncTheme(){
 try{document.documentElement.dataset.theme=window.parent.document.documentElement.dataset.theme||'light';}catch{}
}
async function startFarm(loadResource=url=>import(url)){
 let root=findHA();
 for(let i=0;!root&&i<15;i++){await new Promise(resolve=>setTimeout(resolve,250));root=findHA();}
 if(!root)throw Error('HA-Frontend nicht erreichbar');
 const config=await farmConfig(root.hass);
 await loadResource(farmResource);
 if(!customElements.get('print-pulse-farm'))throw Error('HA-Karte nicht installiert');
 const card=document.createElement('print-pulse-farm');
 card.setConfig(config);
 card.hass=root.hass;
 let last=root.hass;
 card.addEventListener('hass-more-info',event=>{
  const entityId=event.detail?.entityId;
  if(typeof entityId!=='string'||!root.hass?.states?.[entityId])return;
  const view=root.ownerDocument.defaultView;
  root.dispatchEvent(new view.CustomEvent('hass-more-info',{detail:{entityId},bubbles:true,composed:true}));
 });
 syncTheme();
 farmMount.append(card);
 const observer=new ResizeObserver(()=>report('height'));
 observer.observe(farmMount);
 report('ready');
 const timer=setInterval(()=>{
  syncTheme();
  if(!root.hass?.states||root.hass.connected===false){clearInterval(timer);report('unavailable');return;}
  if(root.hass!==last){last=root.hass;card.hass=last;}
 },500);
 window.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();},{once:true});
}
startFarm().catch(()=>report('unavailable'));
