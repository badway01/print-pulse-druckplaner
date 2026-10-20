'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model=null,filter='all',busy=false,polling=false,sortTimer=null,quantityContext=null;
let order=[];
const expanded=new Set();
const selectedVariants=new Map();
function variantPicker(p){
 let item=p.items.find(i=>i.id===selectedVariants.get(p.id))||p.items[0];
 selectedVariants.set(p.id,item.id);
 const parts=p.items.map(i=>i.label.split(' · '));
 const dimensions=parts[0].map(part=>part.includes(': ')?part.slice(0,part.indexOf(': ')):null);
 const structured=dimensions.every(Boolean)&&parts.every(row=>row.length===dimensions.length&&row.every((part,n)=>part.startsWith(dimensions[n]+': ')));
 let controls='';
 if(structured){
  const current=item.label.split(' · ');
  controls=dimensions.map((name,n)=>{
   const candidates=parts.filter(row=>row.slice(0,n).every((part,k)=>part===current[k]));
   const values=[...new Set(candidates.map(row=>row[n]))];
   return `<label>${esc(name)}<select data-dimension="${n}" data-picker="${esc(p.id)}" aria-label="${esc(name)}">${values.map(value=>`<option value="${esc(value)}" ${value===current[n]?'selected':''}>${esc(value.slice(name.length+2))}</option>`).join('')}</select></label>`;
  }).join('');
 }else{
  controls=`<label>Variante auswählen<select data-picker="${esc(p.id)}" data-item-picker aria-label="Variante auswählen">${p.items.map(i=>`<option value="${esc(i.id)}" ${i.id===item.id?'selected':''}>${esc(i.label)}</option>`).join('')}</select></label>`;
 }
 return `<div class="variant-picker">${controls}<small>Bestand gilt für die ausgewählte Kombination.</small></div>${variant(p,item)}`;
}

let openNotices=new Set();
function notices(messages,key){
 const unique=[...new Set(messages.filter(Boolean))];
 return unique.length?`<details class="notices" data-notice-key="${esc(key)}" ${openNotices.has(key)?'open':''}><summary>Hinweise (${unique.length})</summary>${unique.map(message=>`<p class="warning">${esc(message)}</p>`).join('')}</details>`:'';
}
function showAlert(messages){const html=notices(messages,'global');$('alert').innerHTML=html;$('alert').hidden=!html;}
const stateNames={active:'Aktiv',sold_out:'Bei Etsy ausverkauft',inactive:'Inaktiv',draft:'Entwurf',expired:'Abgelaufen'};
function flash(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>$('toast').hidden=true,error?9000:3500);}
async function api(path,body){const response=await fetch('api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'Aktion fehlgeschlagen.');return data;}
function thumbnail(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname.endsWith('.etsystatic.com')&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function setModel(data,resort=false){model=data;if(resort||!order.length)order=data.products.map(p=>p.id);else order=[...order.filter(id=>data.products.some(p=>p.id===id)),...data.products.filter(p=>!order.includes(p.id)).map(p=>p.id)];render();}
function scheduleSort(){clearTimeout(sortTimer);sortTimer=setTimeout(()=>{if(busy||$('quantity').open||$('settings').open){scheduleSort();return;}order=model.products.map(p=>p.id);render();},5000);}
function variant(p,i){
 const unknown=i.on_hand===null;
 let recommendation=unknown?'Einmal zählen – danach übernimmt deine Lagerübersicht.':i.need?`${i.need} Stück nachdrucken${i.reserved?' · '+i.reserved+' für Bestellungen benötigt':''}`:i.in_print?'Laufende Drucke decken den Bedarf.':p.made_to_order?'Fertigung nach Bestellung.':'Vorrat ausreichend.';
 const coverage=i.coverage===null?'':` · frei für ca. ${i.coverage.toLocaleString('de-DE')} Tage`;
 return `<div class="variant" data-variant="${esc(i.id)}"><div class="variant-heading"><b>${esc(i.label)}</b>${!i.enabled?'<small>Variante inaktiv</small>':''}<span>Etsy: ${i.etsy_qty??'–'}</span></div>
 <div class="stock-label">Tatsächlicher Bestand</div><div class="stock-row"><button data-action="adjust" data-id="${esc(i.id)}" data-delta="-1" class="step" ${unknown||i.on_hand===0?'disabled':''} aria-label="Ein Stück weniger, ${esc(i.label)}">−</button><button data-action="set" data-id="${esc(i.id)}" class="stock-number" aria-label="Bestand direkt eingeben, ${esc(i.label)}">${unknown?'Zählen':i.on_hand}</button><button data-action="adjust" data-id="${esc(i.id)}" data-delta="1" class="step" ${unknown?'disabled':''} aria-label="Ein Stück mehr, ${esc(i.label)}">+</button></div>
 <p class="availability">${unknown?'Noch nicht erfasst':`${i.reserved} bestellt · ${i.free} frei${coverage}`}</p>
 <div class="recommend ${i.level}"><span class="dot"></span>${esc(recommendation)}</div>
 <div class="print-row"><button class="secondary small" data-action="printing" data-id="${esc(i.id)}" ${unknown?'disabled':''}>+ Im Druck ${i.in_print?`(${i.in_print})`:''}</button>${i.in_print?`<button class="primary small" data-action="finish" data-id="${esc(i.id)}">Fertig</button><button class="text-button small" data-action="cancel" data-id="${esc(i.id)}">Abbruch</button>`:''}<button class="text-button small minimum" data-action="minimum" data-id="${esc(i.id)}">Minimum ${i.minimum}</button></div>
 ${notices([i.notice],'variant-'+i.id)}</div>`;
}
function card(p){
 const image=thumbnail(p.image),open=expanded.has(p.id)||p.items.length===1;
 const total=p.items.every(i=>i.on_hand!==null)?p.items.reduce((s,i)=>s+i.on_hand,0):null;
 return `<article class="product ${p.level}" data-product="${esc(p.id)}"><div class="product-photo">${image?`<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">`:'<div class="placeholder">P<span>+</span>P<small>Produktbild folgt</small></div>'}<span class="etsy-total">Etsy-Menge <b>${p.etsy_qty??'–'}</b></span></div><div class="product-body"><h2 title="${esc(p.title)}">${esc(p.title)}</h2><div class="sales"><span><b>${p.sold7}</b> verkauft / 7 Tage</span><span><b>${p.sold30}</b> / 30 Tage</span>${p.state!=='active'?`<span>${esc(stateNames[p.state]||p.state)}</span>`:''}</div>
 ${notices([p.inventory_error,p.unmatched?`${p.unmatched} bestellte Stück noch keiner Variante zugeordnet. Bedarf zusätzlich in Etsy prüfen.`:'',p.review?`${p.review} Stück mit Erstattung oder unklarem Zahlungsstatus: in Etsy prüfen.`:''],'product-'+p.id)}
 ${p.items.length>1?`<button class="variant-toggle" data-expand="${esc(p.id)}" aria-expanded="${open}"><span>${p.items.length} Varianten · ${total===null?'Bestände erfassen':total+' im Lager'}</span><b>${open?'−':'+'}</b></button>${!open?`<p class="collapsed-need">${p.need?p.need+' Stück nachdrucken':p.uninitialized?'Noch '+p.uninitialized+' Varianten zählen':'Bedarf gedeckt'}</p>`:''}`:''}
 ${open?(p.items.length>1?variantPicker(p):variant(p,p.items[0])):''}
 <div class="card-bottom"><label class="order-mode"><input type="checkbox" data-mode="${esc(p.id)}" ${p.made_to_order?'checked':''}><span>Auf Bestellung</span></label><div class="badges">${p.made_to_order?'<span class="badge made">Nur auf Bestellung</span>':''}${p.bestseller?'<span class="badge best">Bestseller</span>':''}</div></div></div></article>`;
}
function render(){if(!model)return;
 openNotices=new Set([...document.querySelectorAll('[data-notice-key][open]')].map(el=>el.dataset.noticeKey));
 const products=model.products.filter(p=>p.state==='active');
 $('sync').disabled=!!model.sync.running||!model.authorized;
 $('undo').disabled=!model.undo||busy;
 const date=model.last_sync?new Date(model.last_sync*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}):'noch kein Abgleich';
 $('sync-state').textContent=model.sync.running?model.sync.message:`Letzter erfolgreicher Etsy-Abgleich: ${date} · automatisch alle 15 Minuten`;
 const stale=model.last_sync&&Date.now()/1000-model.last_sync>3600;
 showAlert([model.sync.error,model.warning,!model.authorized?'Bitte Etsy unter Einstellungen verbinden.':stale?'Etsy-Daten sind älter als eine Stunde. Verbindung prüfen.':'']);
 $('summary').innerHTML=[['Produkte',products.length],['Nachdrucken',products.reduce((n,p)=>n+p.need,0)+' Stk.'],['Im Druck',products.flatMap(p=>p.items).reduce((n,i)=>n+i.in_print,0)+' Stk.'],['Noch zählen',products.reduce((n,p)=>n+p.uninitialized,0)+' Varianten']].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('');
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));
 const search=$('search').value.trim().toLocaleLowerCase('de');
 const selected=order.map(id=>products.find(p=>p.id===id)).filter(Boolean).filter(p=>(filter!=='need'||p.need>0||p.unmatched>0)&&(filter!=='printing'||p.items.some(i=>i.in_print>0))&&(filter!=='uncounted'||p.uninitialized>0)).filter(p=>(p.title+' '+p.items.map(i=>i.label).join(' ')).toLocaleLowerCase('de').includes(search));
 const focus=document.activeElement,focusId=focus?.dataset.id,focusAction=focus?.dataset.action,delta=focus?.dataset.delta;
 $('products').innerHTML=selected.length?selected.map(card).join(''):`<div class="empty"><h2>${products.length?'Hier ist alles erledigt.':'Dein Lager startet hier.'}</h2><p>${products.length?'Kein Produkt passt zu dieser Auswahl.':'Etsy verbinden, Produkte laden und einmal deine echten Bestände zählen.'}</p></div>`;
 if(focusId){const next=[...document.querySelectorAll('[data-action]')].find(b=>b.dataset.id===focusId&&b.dataset.action===focusAction&&b.dataset.delta===delta);next?.focus({preventScroll:true});}
}
async function load(resort=false){if(polling||busy)return;polling=true;try{const data=await api('status');if(!busy&&!$('quantity').open&&!$('settings').open)setModel(data,resort);}catch(err){showAlert(['Verbindung zum Lager unterbrochen: '+err.message]);}finally{polling=false;}}
async function mutate(path,data){if(busy)return;busy=true;document.querySelectorAll('#products button,#products input,#products select,#undo').forEach(b=>b.disabled=true);try{setModel(await api(path,data));scheduleSort();flash('Gespeichert.');}catch(err){flash(err.message,true);try{setModel(await api('status'));}catch{}}finally{busy=false;render();}}
function findItem(id){for(const p of model.products){const i=p.items.find(i=>i.id===id);if(i)return {p,i};}return null;}
function quantityDialog(id,action){const found=findItem(id);if(!found)return;const {p,i}=found;quantityContext={id,action,revision:i.revision};const labels={set:'Bestand erfassen',printing:'Druck gestartet',finish:'Fertige Stücke einlagern',cancel:'Druckmenge zurücknehmen',minimum:'Mindestbestand'};$('quantity-title').textContent=labels[action];$('quantity-label').textContent=p.title+' · '+i.label;const input=$('quantity-value');input.min=['set','minimum'].includes(action)?0:1;input.max=['finish','cancel'].includes(action)?i.in_print:100000;input.value=action==='set'?(i.on_hand??0):action==='minimum'?i.minimum:action==='printing'?Math.max(1,i.need||1):i.in_print;$('quantity-help').textContent=action==='set'?'Alle fertigen Stücke zählen, einschließlich reservierter und gepackter Ware.':action==='finish'?'Nur erfolgreich gedruckte Stücke buchen. Fehlgeschlagene Stücke über „Abbruch“ zurücknehmen.':action==='printing'?'Merkt die Menge vor. Startet keinen Drucker.':action==='minimum'?'Wird bei Lagerartikeln mindestens als freier Vorrat empfohlen.':'Entfernt die Menge aus „Im Druck“, ohne den Lagerbestand zu erhöhen.';$('quantity').showModal();input.focus();input.select();}
$('products').addEventListener('click',async event=>{const expand=event.target.closest('[data-expand]');if(expand){const id=expand.dataset.expand;expanded.has(id)?expanded.delete(id):expanded.add(id);render();scheduleSort();return;}const b=event.target.closest('[data-action]');if(!b||busy)return;const {id,action}=b.dataset;if(action==='adjust'){await mutate('stock',{id,action,delta:Number(b.dataset.delta)});}else quantityDialog(id,action);});
$('products').addEventListener('change',event=>{
 const picker=event.target.closest('[data-picker]');
 if(picker){
  const p=model.products.find(p=>p.id===picker.dataset.picker);
  if(picker.hasAttribute('data-item-picker'))selectedVariants.set(p.id,picker.value);
  else{
   const n=Number(picker.dataset.dimension);
   const old=p.items.find(i=>i.id===selectedVariants.get(p.id))||p.items[0];
   const parts=old.label.split(' · ');
   const matches=p.items.filter(i=>{const row=i.label.split(' · ');return row[n]===picker.value&&row.slice(0,n).every((part,k)=>part===parts[k]);});
   const next=matches.find(i=>i.label.split(' · ').slice(n+1).every((part,k)=>part===parts[n+1+k]))||matches[0];
   if(next)selectedVariants.set(p.id,next.id);
  }
  render();
  const next=[...document.querySelectorAll('[data-picker]')].find(el=>el.dataset.picker===picker.dataset.picker&&el.dataset.dimension===picker.dataset.dimension);
  next?.focus({preventScroll:true});return;
 }
 const b=event.target.closest('[data-mode]');if(b)mutate('mode',{id:b.dataset.mode,enabled:b.checked});});
$('quantity-form').addEventListener('submit',async event=>{event.preventDefault();const data={...quantityContext,quantity:Number($('quantity-value').value)};$('quantity').close();await mutate('stock',data);});
$('search').addEventListener('input',()=>{render();scheduleSort();});
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;order=model.products.map(p=>p.id);render();});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',() => $(b.dataset.close).close());
$('undo').addEventListener('click',()=>mutate('undo',{id:model.undo}));
$('sync').addEventListener('click',async()=>{try{await api('sync',{});await load();}catch(err){flash(err.message,true);}});
$('settings-open').addEventListener('click',()=>{if(!model)return;$('days').value=model.days;$('settings').showModal();});
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();try{setModel(await api('settings',{days:Number($('days').value)}),true);$('settings').close();flash('Vorratsziel gespeichert.');}catch(err){flash(err.message,true);}});
$('config-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('config',Object.fromEntries(new FormData(event.target)));event.target.reset();flash('Zugangsdaten gespeichert. Jetzt Etsy-Freigabe öffnen.');}catch(err){flash(err.message,true);}});
$('authorize').addEventListener('click',async()=>{try{const {url}=await api('oauth/start',{});const link=$('oauth-link');link.href=url;link.hidden=false;link.focus();}catch(err){flash(err.message,true);}});
$('finish-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('oauth/finish',Object.fromEntries(new FormData(event.target)));event.target.reset();$('settings').close();await load();flash('Etsy verbunden. Produkte werden geladen.');}catch(err){flash(err.message,true);}finally{button.disabled=false;}});
load(true);setInterval(()=>load(false),5000);
