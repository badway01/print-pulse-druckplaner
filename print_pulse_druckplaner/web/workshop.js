"use strict";
// v0.10 interface: additional views do not replace the existing production cards.
const oldWorkshopRender = render;
let workshopPrinterData = null;
let workshopPrinterLoading = false;
let workshopOrderFilter = 'all';
const workshopExpanded = new Set();
const workshopMappings = new Set();
const workshopModes = ['dashboard','orders','printers'];

function workshopOrders(){
 const orders=new Map();
 for(const g of [...(model?.groups||[]),...(model?.done_groups||[])]){
  for(const l of g.lines){
   if(!orders.has(l.receipt_id)){
    orders.set(l.receipt_id,{
     id:l.receipt_id,name:l.buyer_name||'',due:null,shipping_paid:l.shipping_paid||'',
     shipping_provider:l.shipping_provider||'',shipping_method:l.order_shipping_method||l.line_shipping_method||'',
     lines:[],quantity:0,remaining:0,new_today:false,unseen:false
    });
   }
   const o=orders.get(l.receipt_id);
   o.lines.push({g,l});
   o.quantity+=l.qty;
   o.remaining+=l.remaining;
   o.new_today ||= l.new_today;
   o.unseen ||= l.unseen;
   if(l.due&&(!o.due||l.due<o.due))o.due=l.due;
  }
 }
 return [...orders.values()].map(o=>{
  o.stage=o.remaining===0?'ready':o.lines.some(({g,l})=>l.produced>0||g.stage==='printing')?'printing':'new';
  return o;
 }).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||a.id.localeCompare(b.id));
}
function workshopStatusLabel(stage){
 return stage==='ready'?'Druckfertig':stage==='printing'?'In Produktion':'Neu';
}
function workshopPrintRow({g,l},showControls){
 const image=safeEtsyThumbnail(g.image_url);
 return `<div class="etsy-line">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="etsy-image-placeholder">▧</span>'}
 <div class="etsy-line-text"><b>${esc(g.title)}</b><small>${g.variants.map(v=>esc(v.name)+': '+esc(v.value)).join(' · ')||'Standardvariante'}</small>
 <small>${l.qty} ${l.qty===1?'Stück':'Stück'} · ${l.produced} gedruckt${l.shipping_upgrade?` · Upgrade: ${esc(l.shipping_upgrade)}`:''}</small></div>
 ${showControls?`<div class="line-actions"><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced-1}" ${l.produced===0?'disabled':''} aria-label="Gedruckte Menge verringern">−</button><b>${l.produced}/${l.qty}</b><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced+1}" ${l.produced>=l.qty?'disabled':''} aria-label="Ein Stück als gedruckt buchen">+</button></div>`:''}
 </div>`;
}
function workshopOrderCard(o){
 const open=workshopExpanded.has(o.id),p=priority(o.due,false);
 return `<article class="etsy-order ${p.card}">
   <div class="etsy-order-bar"><span>${esc(o.name||'Kundenname nicht übermittelt')} · #${esc(o.id)}</span><span class="etsy-stage ${o.stage}">${workshopStatusLabel(o.stage)}</span></div>
   <div class="etsy-order-body"><div class="etsy-products">${o.lines.map(x=>workshopPrintRow(x,open)).join('')}</div>
   <div class="etsy-shipping"><b>Versand bis ${esc(fmtDate(o.due))}</b><small>${esc(p.label)}</small>
   <small>${esc(o.shipping_method||'Versandart nicht übermittelt')}${o.shipping_paid?' · '+esc(o.shipping_paid):''}</small>
   <small>${o.shipping_provider?'Dienstleister: '+esc(o.shipping_provider):'Dienstleister noch nicht hinterlegt'}</small>
   <button class="btn secondary" data-etsy-toggle="${esc(o.id)}" aria-expanded="${open}">${open?'Details schließen ▲':'Bestellung öffnen ▼'}</button></div></div>
   <div class="etsy-order-expanded" ${open?'':'hidden'}><p>Versandart: ${esc(o.shipping_method||'Nicht übermittelt')} · Kundenversandkosten: ${esc(o.shipping_paid||'Nicht übermittelt')}</p>
   <div class="carrier-edit"><label>Versanddienstleister <input data-etsy-carrier="${esc(o.id)}" maxlength="80" value="${esc(o.shipping_provider)}" placeholder="z. B. DHL"></label><button class="btn secondary" data-etsy-carrier-save="${esc(o.id)}">Speichern</button></div>
   <div class="deadline-editor"><label>Versanddatum <input type="date" value="${esc(o.due||'')}" data-etsy-date="${esc(o.id)}"></label><button data-etsy-date-save="${esc(o.id)}">Speichern</button></div></div>
 </article>`;
}
function renderWorkshopOrders(){
 const orders=workshopOrders().filter(o=>{
  if(workshopOrderFilter==='all')return true;
  if(workshopOrderFilter==='new')return o.stage==='new';
  if(workshopOrderFilter==='printing')return o.stage==='printing';
  if(workshopOrderFilter==='ready')return o.stage==='ready';
  return true;
 });
 const term=$('search').value.trim().toLocaleLowerCase('de');
 const filtered=orders.filter(o=>[o.id,o.name,...o.lines.flatMap(({g})=>[g.title,...g.variants.map(v=>v.value)])].join(' ').toLocaleLowerCase('de').includes(term));
 const tabs=[['all','Alle'],['new','Neu'],['printing','In Produktion'],['ready','Druckfertig']];
 let html=`<div class="workshop-heading"><h2>Bestellungen</h2><p>Wie bei Etsy nach Versandtermin sortiert. Aufträge bleiben bis zum tatsächlichen Etsy-Versand in der Planung.</p></div>
 <div class="etsy-filters" role="group" aria-label="Bestellstatus">${tabs.map(([id,label])=>`<button class="btn ${workshopOrderFilter===id?'active':''}" data-order-filter="${id}">${label} <span>${id==='all'?workshopOrders().length:workshopOrders().filter(o=>o.stage===id).length}</span></button>`).join('')}</div>`;
 if(!filtered.length)return html+'<div class="empty">Keine Bestellungen in dieser Auswahl.</div>';
 let previous='';
 for(const o of filtered){
  const due=o.due||'unknown';
  if(previous!==due){
   previous=due;
   html+=`<div class="etsy-date-divider">${due==='unknown'?'Versanddatum prüfen':'Bis '+esc(fmtDate(due))+' versenden'}</div>`;
  }
  html+=workshopOrderCard(o);
 }
 return html;
}
function printerStatusChip(p){
 const label=p.kind==='printing'?'Druckt':p.status;
 return `<span class="ha-status ${esc(p.kind)}">${esc(label)}</span>`;
}
function renderWorkshopPrinterCards(compact=false){
 if(!workshopPrinterData)return '<p class="muted">Druckerstatus wird geladen …</p>';
 const data=workshopPrinterData;
 let html='';
 if(!data.connected)html+=`<p class="ha-printer-error">${esc(data.error||'Home Assistant ist momentan nicht erreichbar.')}</p>`;
 const selected=compact?data.printers.slice(0,6):data.printers;
 html+=`<div class="ha-printer-list ${compact?'mini':''}">${selected.map(p=>{
  const active=workshopMappings.has(p.name);
  const candidates=p.choices||[];
  const fields=[['status','Druckstatus'],['progress','Fortschritt'],['remaining','Restzeit'],['job','Druckauftrag']];
  return `<article class="ha-printer-card">
  <div class="ha-printer-top"><div class="ha-printer-icon">${printerIcon}</div><div class="ha-printer-name"><b>${esc(p.name)}</b><small>${esc(p.job||'Kein Auftragsname verfügbar')}</small></div>${printerStatusChip(p)}</div>
  <div class="ha-progress-head"><small>Fortschritt</small><strong>${p.progress!==null?p.progress.toLocaleString('de-DE',{maximumFractionDigits:1})+' %':'–'}</strong></div>
  <progress max="100" value="${p.progress??0}" aria-label="Druckfortschritt ${esc(p.name)}"></progress>
  <small>${p.remaining!==null?'Restzeit: '+esc(p.remaining):'Keine Restzeit verfügbar'}</small>
  ${compact?'':`<button class="btn secondary" data-printer-map-toggle="${esc(p.name)}" aria-expanded="${active}">${active?'Sensorzuordnung schließen':'Sensoren zuordnen'} ▾</button>
  <form class="ha-sensor-form" data-printer-form="${esc(p.name)}" ${active?'':'hidden'}>
   ${fields.map(([field,label])=>`<label>${label}<input data-sensor-field="${field}" list="ha-sensors-${esc(p.name.replace(/\\s/g,'-'))}" value="${esc(p.mapping[field]||'')}" placeholder="sensor.…"></label>`).join('')}
   <datalist id="ha-sensors-${esc(p.name.replace(/\\s/g,'-'))}">${candidates.map(c=>`<option value="${esc(c.id)}" label="${esc(c.name)}"></option>`).join('')}</datalist>
   <small>Sensor-ID aus Home Assistant übernehmen. Leere Felder werden automatisch gesucht, wenn ein eindeutiger passender Sensor vorhanden ist.</small>
   <button class="btn primary" type="submit">Sensoren speichern</button>
  </form>`}
  </article>`;
 }).join('')}</div>`;
 return html;
}
function workshopDashboard(){
 const orders=workshopOrders();
 const printCount=workshopPrinterData?.printers.filter(p=>p.kind==='printing').length??null;
 const dueSoon=orders.filter(o=>o.due!==null&&daysUntil(o.due)<=2).length;
 const stats=[['Offene Bestellungen',orders.length],['Noch zu drucken',model?.open_units??0],['Drucker im Druck',printCount??'–'],['Versand ≤ 2 Tage',dueSoon]];
 let html=`<div class="workshop-heading"><h2>Dashboard</h2><p>Alles Wichtige auf einen Blick</p></div>
 <div class="workshop-metrics">${stats.map(([label,value])=>`<div class="workshop-metric"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>
 <div class="workshop-two-column"><section class="workshop-panel"><div class="panel-head"><h3>Nächster Druck</h3><button class="text-button" data-switch-view="pending">Produktion ansehen →</button></div>`;
 const next=[...(model?.suggestions||[])].slice(0,3);
 html+=next.length?next.map(s=>`<div class="dashboard-next"><b>${esc(s.amount)}× ${esc(s.title)}</b><small>${esc(fmtDate(s.due))} · ${esc(s.printer||'Drucker noch nicht zugeordnet')}</small></div>`).join(''):'<p class="muted">Aktuell kein Druckvorschlag.</p>';
 html+=`</section><section class="workshop-panel"><div class="panel-head"><h3>Drucker</h3><button class="text-button" data-switch-view="printers">Alle Drucker →</button></div>${renderWorkshopPrinterCards(true)}</section></div>`;
 return html;
}
function renderWorkshop(){
 if(!model)return;
 const activeWorkshop=workshopModes.includes(mode);
 $('workshop-view').hidden=!activeWorkshop;
 if(!activeWorkshop){
  $('print-plan').hidden=false;
  $('production-controls').hidden=false;
  document.querySelector('.stats').hidden=true;
  $('new-orders').hidden=false;
  $('search').parentElement.hidden=false;
  oldWorkshopRender();
  document.querySelector('.stats').hidden=true;
 }else{
  for(const name of ['pending','done','products']){const t=$('tab-'+name);t.classList.remove('active');t.setAttribute('aria-selected','false');}
  $('print-plan').hidden=true;
  $('production-controls').hidden=true;
  $('catalog-grid').hidden=true;
  $('catalog-controls').hidden=true;
  $('new-orders').hidden=true;
  document.querySelector('.stats').hidden=true;
  $('recommendation').hidden=true;
  $('page-title').textContent=mode==='dashboard'?'Werkstattübersicht':mode==='orders'?'Etsy-Bestellungen':'Druckerstatus';
  $('page-description').textContent=mode==='dashboard'?'Deine wichtigsten Kennzahlen und Drucker.':mode==='orders'?'Alle aktuell bei Etsy offenen Aufträge – geordnet nach Versandtermin.':'Live-Sensoren aus Home Assistant. Geräte werden hier nur überwacht, nicht ferngesteuert.';
  $('search').parentElement.hidden=mode!=='orders';
  $('search').placeholder='Kunde, Produkt oder Bestellnummer suchen';
  $('workshop-view').innerHTML=mode==='dashboard'?workshopDashboard():mode==='orders'?renderWorkshopOrders():`<div class="workshop-heading"><h2>Drucker</h2><p>Status, laufender Druck, Fortschritt und Restzeit aus Home Assistant</p><button class="btn secondary" id="ha-printer-refresh">Status aktualisieren</button></div>${renderWorkshopPrinterCards()}`;
  $('sync-now').disabled=!!model.sync?.running||!model.authorized;
  $('sync-time').textContent=model.last_sync?'Etsy zuletzt aktualisiert: '+new Date(model.last_sync*1000).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}):'Etsy noch nicht synchronisiert';
 }
 for(const name of workshopModes){const el=$('tab-'+name);el.classList.toggle('active',mode===name);el.setAttribute('aria-selected',String(mode===name));}
}
render = renderWorkshop;

async function loadWorkshopPrinters(){
 if(workshopPrinterLoading)return;
 workshopPrinterLoading=true;
 try{workshopPrinterData=await api('printers');if((mode==='printers'||mode==='dashboard')&&model)render();}
 catch(err){workshopPrinterData={connected:false,error:'Drucker konnten nicht geladen werden: '+err.message,printers:[]};if(mode==='printers'||mode==='dashboard')render();}
 finally{workshopPrinterLoading=false;}
}
for(const name of workshopModes){
 $('tab-'+name).addEventListener('click',()=>{
  mode=name;
  render();
  if(name==='printers'||name==='dashboard')loadWorkshopPrinters();
 });
}
$('workshop-view').addEventListener('click',async e=>{
 const filter=e.target.closest('[data-order-filter]');
 if(filter){workshopOrderFilter=filter.dataset.orderFilter;render();return;}
 const viewBtn=e.target.closest('[data-switch-view]');
 if(viewBtn){
  if(viewBtn.dataset.switchView==='pending')$('tab-pending').click();
  if(viewBtn.dataset.switchView==='printers')$('tab-printers').click();
  return;
 }
 const toggle=e.target.closest('[data-etsy-toggle]');
 if(toggle){const id=toggle.dataset.etsyToggle;workshopExpanded.has(id)?workshopExpanded.delete(id):workshopExpanded.add(id);render();return;}
 const map=e.target.closest('[data-printer-map-toggle]');
 if(map){const id=map.dataset.printerMapToggle;workshopMappings.has(id)?workshopMappings.delete(id):workshopMappings.add(id);render();return;}
 if(e.target.closest('#ha-printer-refresh')){await loadWorkshopPrinters();return;}
 const change=e.target.closest('[data-txn]');
 if(change){change.disabled=true;try{await api('progress',{transaction_id:change.dataset.txn,produced:Number(change.dataset.qty)});await reload();}catch(err){showAlert(err.message,true);}return;}
 const carrier=e.target.closest('[data-etsy-carrier-save]');
 if(carrier){const id=carrier.dataset.etsyCarrierSave,input=[...document.querySelectorAll('[data-etsy-carrier]')].find(x=>x.dataset.etsyCarrier===id);
  try{await api('shipping-provider',{receipt_id:id,provider:input?.value||''});await reload();}catch(err){showAlert(err.message,true);}return;}
 const date=e.target.closest('[data-etsy-date-save]');
 if(date){const id=date.dataset.etsyDateSave,input=[...document.querySelectorAll('[data-etsy-date]')].find(x=>x.dataset.etsyDate===id);
  try{await api('due',{receipt_id:id,due:input?.value||''});await reload();}catch(err){showAlert(err.message,true);}return;}
});
$('workshop-view').addEventListener('submit',async e=>{
 const form=e.target.closest('[data-printer-form]');if(!form)return;
 e.preventDefault();const printer=form.dataset.printerForm,data={printer};
 for(const field of ['status','progress','remaining','job'])data[field+'_entity']=form.querySelector('[data-sensor-field="'+field+'"]').value.trim();
 const button=form.querySelector('[type=submit]');button.disabled=true;
 try{await api('printers/map',data);await loadWorkshopPrinters();showAlert('Sensorzuordnung für '+printer+' gespeichert.');}
 catch(err){showAlert(err.message,true);}
 finally{button.disabled=false;}
});
setInterval(()=>{if(mode==='printers'||mode==='dashboard')loadWorkshopPrinters();},30000);
