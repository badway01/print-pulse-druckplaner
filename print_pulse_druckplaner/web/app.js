'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model=null,filter='all',busy=false,polling=false,sortTimer=null,quantityContext=null;
let order=[];
let orderSort='ship';
let workspace='production',filamentView='colors',filamentData=null,filamentBusy=false,filamentLoading=false;
let printTools={profiles:[],files:[]}, masterContext=null,masterSources=[],masterBusy=false;
let printerLive=null,printerLoading=false,printerEntities=[],printerConfigId=null,printerConfigBusy=false;
let etsyAlertExpanded=false,etsyAlertFocused=null;
try{if(localStorage.getItem('pp-order-sort')==='new')orderSort='new';}catch{}
const expanded=new Set();
const selectedVariants=new Map();
// Patch existing nodes so polling never recreates unchanged cards or images.
function nodeKey(node){
 if(node.nodeType!==1)return null;
 for(const name of ['data-product','data-order-card','data-variant','data-notice-key','data-expand','data-mode','data-filament-line']){
  if(node.hasAttribute(name))return node.tagName+':'+name+':'+node.getAttribute(name);
 }
 if(node.hasAttribute('data-action'))return 'action:'+node.dataset.action+':'+node.dataset.id+':'+(node.dataset.delta||'');
 if(node.hasAttribute('data-picker'))return 'picker:'+node.dataset.picker+':'+(node.dataset.dimension||'item');
 return node.tagName+':'+(node.getAttribute('class')||'');
}
function patchNode(current,next){
 if(current.nodeType===3||current.nodeType===8){
  if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;
  return;
 }
 for(const attr of [...current.attributes])if(!next.hasAttribute(attr.name))current.removeAttribute(attr.name);
 for(const attr of next.attributes)if(current.getAttribute(attr.name)!==attr.value)current.setAttribute(attr.name,attr.value);
 if(current.tagName==='INPUT'&&current.type==='checkbox')current.checked=next.checked;
 patchChildren(current,next);
 if(current.tagName==='SELECT'&&current.value!==next.value)current.value=next.value;
}
function patchChildren(current,next){
 const available=[...current.childNodes];
 let cursor=current.firstChild;
 for(const wanted of [...next.childNodes]){
  const key=nodeKey(wanted);
  const found=available.find(node=>node.nodeType===wanted.nodeType&&node.nodeName===wanted.nodeName&&nodeKey(node)===key);
  if(found){
   available.splice(available.indexOf(found),1);
   if(found!==cursor)current.insertBefore(found,cursor);
   patchNode(found,wanted);
   cursor=found.nextSibling;
  }else{
   const added=wanted.cloneNode(true);current.insertBefore(added,cursor);
  }
 }
 for(const node of available)node.remove();
}
function updateHTML(element,html){
 const template=document.createElement('template');template.innerHTML=html;
 patchChildren(element,template.content);
}

function variantPicker(p,controlsOnly=false){
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
 return `<div class="variant-picker">${controls}<small>${controlsOnly?'Wähle die Variante für diesen Druck.':'Bestand gilt für die ausgewählte Kombination.'}</small></div>${controlsOnly?'':variant(p,item)}`;
}

let openNotices=new Set();
function notices(messages,key){
 const unique=[...new Set(messages.filter(Boolean))];
 return unique.length?`<details class="notices" data-notice-key="${esc(key)}" ${openNotices.has(key)?'open':''}><summary>Hinweise (${unique.length})</summary>${unique.map(message=>`<p class="warning">${esc(message)}</p>`).join('')}</details>`:'';
}
function showAlert(messages){const html=notices(messages,'global');updateHTML($('alert'),html);$('alert').hidden=!html;}
const stateNames={active:'Aktiv',sold_out:'Bei Etsy ausverkauft',inactive:'Inaktiv',draft:'Entwurf',expired:'Abgelaufen'};
function flash(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>$('toast').hidden=true,error?9000:3500);}
async function api(path,body){
 // Safari reports misleading "string did not match expected pattern" when an
 // ingress or upstream error returns HTML instead of the expected JSON.
 const response=await fetch('api/'+path,{
  method:body===undefined?'GET':'POST',
  headers:body===undefined?{}:{'Content-Type':'application/json'},
  body:body===undefined?undefined:JSON.stringify(body),
  credentials:'same-origin'
 });
 const raw=await response.text();
 let data;
 try{data=JSON.parse(raw);}
 catch{
  const html=/^\s*(?:<!doctype html|<html|<head|<body)/i.test(raw);
  if(html)throw Error('Home Assistant hat statt JSON eine Webseite zurückgegeben (HTTP '+response.status+'). Bitte die Druckplanung neu öffnen und den App-Status prüfen.');
  throw Error('Ungültige Serverantwort (HTTP '+response.status+'). Bitte den Druckplaner neu starten und die App-Protokolle prüfen.');
 }
 if(!response.ok)throw Error((data&&typeof data.error==='string'?data.error:'Serverfehler')+' (HTTP '+response.status+')');
 if(!data||typeof data!=='object')throw Error('Unvollständige Serverantwort von '+path+'.');
 return data;
}
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
 <div class="print-row"><button class="secondary small" data-action="printing" data-id="${esc(i.id)}" ${unknown?'disabled':''}>+ Im Druck ${i.in_print?`(${i.in_print})`:''}</button>${i.in_print>(i.order_printing||0)?`<button class="primary print-finish-large" data-action="finish" data-id="${esc(i.id)}">✓ Fertig</button><button class="text-button small" data-action="cancel" data-id="${esc(i.id)}">Abbruch</button>`:''}<button class="text-button small minimum" data-action="minimum" data-id="${esc(i.id)}">Minimum ${i.minimum}</button></div>${i.order_printing?`<p class="hint">Davon ${i.order_printing} für Etsy-Aufträge · Fertigmelden in der Bestellung.</p>`:''}
 ${notices([i.notice],'variant-'+i.id)}</div>`;
}
function printOverview(p){
 const needed=p.items.filter(i=>i.on_hand!==null&&i.need>0).sort((a,b)=>b.need-a.need);
 const unknown=p.items.filter(i=>i.on_hand===null).length;
 const shortLabel=label=>label.includes(' · ')?label:(label.includes(': ')?label.slice(label.indexOf(': ')+2):label);
 return `<section class="print-overview" aria-label="Nachdruckübersicht"><b class="print-overview-title">${needed.length?'Nachdrucken':'Nachdruckbedarf'}</b>
 ${needed.length?`<div class="print-needs">${needed.map(i=>`<button class="print-need" data-show-variant="${esc(i.id)}" data-listing="${esc(p.id)}" title="${esc(i.label)}"><strong>${i.need} ×</strong><span>${esc(shortLabel(i.label))}</span></button>`).join('')}</div>`:`<p>${unknown?'Bestände noch erfassen.':'Bedarf gedeckt.'}</p>`}
 ${unknown&&needed.length?`<small>Zusätzlich ${unknown} Variante${unknown===1?'':'n'} noch nicht gezählt.</small>`:''}</section>`;
}
function shortVariant(label){return label.includes(' · ')?label:label.includes(': ')?label.slice(label.indexOf(': ')+2):label;}
function stockOverview(p){
 const visible=p.items.length<=8?p.items:p.items.filter(i=>i.on_hand>0);
 const empty=p.items.filter(i=>i.on_hand===0).length;
 const unknown=p.items.filter(i=>i.on_hand===null).length;
 return `<section class="stock-overview" aria-label="Lagerbestand nach Variante"><b>Im Lager</b><div class="stock-variants">${visible.map(i=>`<button class="stock-variant" data-show-variant="${esc(i.id)}" data-listing="${esc(p.id)}"><strong>${i.on_hand===null?'?':i.on_hand+' ×'}</strong><span>${esc(shortVariant(i.label))}${i.on_hand===null?' · noch nicht gezählt':''}</span></button>`).join('')}</div>${p.items.length>8?`<small>${[empty?empty+' Varianten ohne Bestand':'',unknown?unknown+' Varianten noch nicht gezählt':''].filter(Boolean).join(' · ')}</small>`:''}</section>`;
}
function card(p){
 const image=thumbnail(p.image),open=expanded.has(p.id)||p.items.length===1;
 return `<article class="product ${p.level}" data-product="${esc(p.id)}"><div class="product-photo">${image?`<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">`:'<div class="placeholder">P<span>+</span>P<small>Produktbild folgt</small></div>'}<span class="etsy-total">Etsy-Menge <b>${p.etsy_qty??'–'}</b></span></div><div class="product-body"><h2 title="${esc(p.title)}">${esc(p.title)}</h2><div class="sales"><span><b>${p.sold7}</b> verkauft / 7 Tage</span><span><b>${p.sold30}</b> / 30 Tage</span>${p.state!=='active'?`<span>${esc(stateNames[p.state]||p.state)}</span>`:''}</div>
 ${notices([p.inventory_error,p.unmatched?`${p.unmatched} bestellte Stück noch keiner Variante zugeordnet. Bedarf zusätzlich in Etsy prüfen.`:'',p.review?`${p.review} Stück mit Erstattung oder unklarem Zahlungsstatus: in Etsy prüfen.`:''],'product-'+p.id)}
 ${p.items.length>1?printOverview(p):''}
 ${toolSummary(p)}
 ${productPrintActions(p)}
 ${p.items.length>1?stockOverview(p):''}
 ${p.items.length>1?`<button class="variant-toggle" data-expand="${esc(p.id)}" aria-expanded="${open}"><span>${open?'Varianten schließen':'Bestände bearbeiten'} · ${p.items.length} Varianten</span><b>${open?'−':'+'}</b></button>`:''}
 ${open?(p.items.length>1?variantPicker(p):variant(p,p.items[0])):''}
 <div class="card-bottom"><label class="order-mode"><input type="checkbox" data-mode="${esc(p.id)}" ${p.made_to_order?'checked':''}><span>Auf Bestellung</span></label><div class="badges">${p.made_to_order?'<span class="badge made">Nur auf Bestellung</span>':''}${p.bestseller?'<span class="badge best">Bestseller</span>':''}</div></div></div></article>`;
}


function productPrintActions(p){
 const running=p.items.filter(i=>i.in_print>0);
 const own=running.some(i=>i.in_print>(i.order_printing||0));
 const jobs=running.flatMap(i=>(i.order_jobs||[]).map(j=>({...j,label:i.label})));
 return `<div class="product-print-actions"><button class="primary print-start" data-product-print="${esc(p.id)}" data-print-action="printing" ${p.items.length?'':'disabled'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z"/><path d="M17 11h1"/></svg>In Druck</button>
 ${running.length?`<div class="running-print"><b>Im Druck</b><ul>${running.map(i=>`<li><strong>${i.in_print} ×</strong> ${esc(shortVariant(i.label))}${i.order_printing?` · ${i.order_printing} auftragsbezogen`:''}</li>`).join('')}</ul>
 ${own?`<div><button class="primary print-finish-large" data-product-print="${esc(p.id)}" data-print-action="finish">✓ Fertig (frei)</button><button class="text-button" data-product-print="${esc(p.id)}" data-print-action="cancel">Abbruch (frei)</button></div>`:''}
 ${jobs.map(j=>`<div class="order-job"><small>Auftrag #${esc(j.receipt_id)} · ${j.printing} × ${esc(j.label)}${j.status==='shipped'?' · bereits versendet':''}</small><div><button class="primary print-finish-large" data-order-job="${esc(j.transaction_id)}" data-job-action="finish">✓ Fertig</button><button class="text-button" data-order-job="${esc(j.transaction_id)}" data-job-action="cancel">Abbruch</button></div></div>`).join('')}</div>`:''}</div>`;
}
function printCandidates(p,action){return p.items.filter(i=>action==='printing'?i.enabled:i.in_print>(i.order_printing||0));}
function productPrintDialog(id,action){
 const original=model.products.find(p=>p.id===id);if(!original)return;
 const items=printCandidates(original,action);
 if(!items.length){flash('Keine passende Variante vorhanden.',true);return;}
 const p={...original,items};
 const i=items.find(i=>i.id===selectedVariants.get(id))||items.find(i=>i.on_hand!==null&&i.need>0)||items[0];
 selectedVariants.set(id,i.id);
 quantityDialog(i.id,action);
 quantityContext.productId=id;
 renderPrintPicker(p);
}
function renderPrintPicker(p){
 $('quantity-variants').hidden=p.items.length<2;
 updateHTML($('quantity-variants'),p.items.length>1?variantPicker(p,true):'');
}
function chooseVariant(p,picker){
 if(picker.hasAttribute('data-item-picker'))selectedVariants.set(p.id,picker.value);
 else{
  const n=Number(picker.dataset.dimension);
  const old=p.items.find(i=>i.id===selectedVariants.get(p.id))||p.items[0];
  const parts=old.label.split(' · ');
  const matches=p.items.filter(i=>{const row=i.label.split(' · ');return row[n]===picker.value&&row.slice(0,n).every((part,k)=>part===parts[k]);});
  const next=matches.find(i=>i.label.split(' · ').slice(n+1).every((part,k)=>part===parts[n+1+k]))||matches[0];
  if(next)selectedVariants.set(p.id,next.id);
 }
}

const berlinParts=new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
function berlinDay(value){
 const fields=Object.fromEntries(berlinParts.formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
 return Date.UTC(fields.year,fields.month-1,fields.day)/86400000;
}
function calendarDaysUntil(timestamp){return timestamp?berlinDay(timestamp*1000)-berlinDay(Date.now()):null;}
function shortDate(timestamp){return timestamp?new Date(timestamp*1000).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',year:'numeric'}):'Nicht angegeben';}
function shipInfo(o){
 const days=calendarDaysUntil(o.ship_by);
 if(days===null)return {date:'Versandfrist unbekannt',countdown:'',level:'unknown'};
 const date='Versand bis '+shortDate(o.ship_by);
 const countdown=days<0?`${Math.abs(days)} ${Math.abs(days)===1?'Tag':'Tage'} überfällig`:days===0?'Heute versenden':`Noch ${days} ${days===1?'Tag':'Tage'}`;
 return {date,countdown,level:days<=2?'red':days===3?'yellow':'green'};
}
function shippingMarkup(shipping){
 return `<span class="order-ship-date">${esc(shipping.date)}</span>${shipping.countdown?`<strong class="order-countdown ${shipping.level}">${esc(shipping.countdown)}</strong>`:''}`;
}
function orderCard(o){
 const shipping=shipInfo(o);
 const lines=o.items||[];
 const image=thumbnail(lines[0]?.image||'');
 const summary=lines.slice(0,2).map(i=>`<span><b>${i.quantity} ×</b> ${esc(i.title)}${i.variant?' · '+esc(i.variant):''}</span>`).join('');
 return `<article class="order-card ${shipping.level}" data-order-card="${esc(o.id)}">
  <div class="order-card-top"><b>#${esc(o.id)}</b><small>${esc(shortDate(o.created))}</small></div>
  <div class="order-card-main">${image?`<img src="${esc(image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}
   <div><strong>${esc(o.customer)}</strong><small>${o.quantity} Stück · ${lines.length} Position${lines.length===1?'':'en'}</small></div></div>
  <div class="order-lines">${summary}${lines.length>2?`<small>+ ${lines.length-2} weitere Position${lines.length===3?'':'en'}</small>`:''}</div>
  <div class="order-card-foot"><span class="order-deadline ${shipping.level}">${shippingMarkup(shipping)}</span><div class="order-card-actions"><button class="primary order-print" data-order-print="${esc(o.id)}" ${lines.some(i=>i.item_id&&i.remaining>0)?'':'disabled'} aria-label="Auftrag ${esc(o.id)} in Druck nehmen">Drucken</button><button class="order-open" data-order-open="${esc(o.id)}" aria-label="Bestellung ${esc(o.id)} öffnen">Details ›</button></div>${lines.some(i=>i.printing>0)?`<small class="order-print-state">${lines.reduce((n,i)=>n+i.printing,0)} Stück für diesen Auftrag im Druck</small>`:''}</div>
 </article>`;
}
function renderOrders(){
 const orders=model.orders||[];
 const sorted=[...orders].sort((a,b)=>orderSort==='new'?(b.created-a.created||b.id.localeCompare(a.id)):( (a.ship_by||Infinity)-(b.ship_by||Infinity)||b.created-a.created));
 $('order-count').textContent=orders.length+' offen';
 document.querySelectorAll('[data-order-sort]').forEach(b=>{b.classList.toggle('selected',b.dataset.orderSort===orderSort);b.setAttribute('aria-pressed',String(b.dataset.orderSort===orderSort));});
 updateHTML($('orders'),sorted.length?sorted.map(orderCard).join(''):'<p class="orders-empty">Keine offenen, bezahlten Bestellungen vorhanden.</p>');
 $('orders-prev').disabled=!orders.length;
 $('orders-next').disabled=!orders.length;
}
function showOrder(id){
 const o=(model.orders||[]).find(order=>order.id===id);
 if(!o)return;
 const shipping=shipInfo(o);
 $('order-details').dataset.orderId=o.id;
 $('order-details-title').textContent='Etsy-Bestellung #'+o.id;
 updateHTML($('order-details-content'),`<p><b>${esc(o.customer)}</b> · ${esc(shortDate(o.created))}</p><div class="order-deadline ${shipping.level}">${shippingMarkup(shipping)}</div>
 <div class="order-modal-lines">${o.items.map(i=>`<div class="order-line"><b>${i.quantity} × ${esc(i.title)}</b>${i.variant?`<small>${esc(i.variant)}</small>`:''}
 ${i.item_id?`<small>${i.printing} im Druck · ${i.finished} fertig gemeldet · ${i.remaining} noch nicht zum Druck eingeplant</small>
 <div class="order-line-actions">${i.remaining?`<button class="primary" data-order-line="${esc(i.transaction_id)}" data-job-action="printing">Drucken</button>`:''}
 ${i.printing?`<button class="secondary" data-order-line="${esc(i.transaction_id)}" data-job-action="finish">Fertig</button><button class="text-button" data-order-line="${esc(i.transaction_id)}" data-job-action="cancel">Abbruch</button>`:''}
 </div>`:'<small>Variante nicht eindeutig zugeordnet. Etsy-Abgleich und Varianten prüfen.</small>'}</div>`).join('')}</div>
 <p class="hint">„Drucken“ erfasst nur den Produktionsstart, startet keinen 3D-Drucker. „Fertig“ bucht Stücke ins Lager. Versand und Stornierung weiterhin in Etsy.</p>`);
 if(!$('order-details').open)$('order-details').showModal();
}
let lastShippingDay=berlinDay(Date.now());
function refreshShippingDay(){
 const current=berlinDay(Date.now());
 if(current===lastShippingDay)return;
 lastShippingDay=current;
 if(!model)return;
 renderOrders();
 if($('order-details').open&&$('order-details').dataset.orderId)showOrder($('order-details').dataset.orderId);
}
function findOrderJob(tid){
 for(const o of model.orders||[]){
  const line=o.items.find(i=>i.transaction_id===tid);
  if(line&&line.item_id)return {line,receiptId:o.id,itemId:line.item_id,status:'open'};
 }
 for(const p of model.products)for(const item of p.items){
  const job=(item.order_jobs||[]).find(j=>j.transaction_id===tid);
  if(job)return {line:{printing:job.printing,remaining:0,quantity:job.printing},receiptId:job.receipt_id,itemId:item.id,status:job.status};
 }
 return null;
}
function orderPrintDialog(tid,action){
 if(busy)return;
 const job=findOrderJob(tid);
 if(!job){flash('Bestellposition nicht zugeordnet. Bitte Etsy-Abgleich prüfen.',true);return;}
 const found=findItem(job.itemId);
 if(!found){flash('Variante nicht verfügbar.',true);return;}
 const count=action==='printing'?job.line.remaining:job.line.printing;
 if(!count){flash('Für diese Aktion sind keine Stücke verfügbar.',true);return;}
 if($('order-details').open)$('order-details').close();
 quantityDialog(found.i.id,action);
 const ctx=quantityContext;
 ctx.orderPrint=true;
 ctx.transactionId=tid;
 ctx.receiptId=job.receiptId;
 $('quantity-variants').hidden=true;
 $('quantity-title').textContent=action==='printing'?'Auftrag in Druck nehmen':action==='finish'?'Auftragsdruck fertigmelden':'Auftragsdruck abbrechen';
 $('quantity-label').textContent='#'+job.receiptId+' · '+found.p.title+' · '+found.i.label;
 const field=$('quantity-value');
 field.min=1;field.max=count;
 field.value=action==='printing'?Math.min(count,Math.max(1,found.i.need||count)):count;
 $('quantity-confirm').disabled=action==='finish'&&found.i.on_hand===null&&job.status!=='shipped';
 $('quantity-help').textContent=action==='printing'?
  'Der Druck wird genau diesem Etsy-Auftrag zugeordnet und reduziert die offene Nachdruckempfehlung. Dein Lagerbestand bleibt bis „Fertig“ unverändert.':
  action==='finish'?(job.status==='shipped'?'Bereits versendet: Fertigmelden erhöht den Lagerbestand nicht erneut.':'Erfolgreich gedruckte Stücke werden ins Lager gebucht. Etsy zieht sie beim Versand einmalig ab.'):'Fehldruck oder Abbruch: Die Menge wird aus „Im Druck“ entfernt.';
 field.focus();field.select();
}



function renderEtsyStockBanner(){
 const alerts=Array.isArray(model?.etsy_stock_alerts)?model.etsy_stock_alerts:[];
 const wrapper=$('etsy-stock-banner');
 if(!alerts.length||workspace!=='production'){
  wrapper.hidden=true;
  return;
 }
 wrapper.hidden=false;
 const empty=alerts.filter(item=>item.severity==='empty').length;
 const low=alerts.length-empty;
 wrapper.classList.toggle('etsy-alert-critical',empty>0);
 $('etsy-alert-title').textContent=empty?
  empty+' Artikel ausverkauft oder mit 0 Stück in einer Variante':
  low+' Artikel mit niedrigem Etsy-Bestand';
 $('etsy-alert-subtitle').textContent=empty?
  (low?low+' weitere Artikel knapp · ':'')+'Etsy-Verfügbarkeit jetzt prüfen':
  'Bei diesen Artikeln liegt die verfügbare Etsy-Menge unter '+model.etsy_alert_threshold+' Stück';
 $('etsy-alert-updated').textContent=model.last_catalog_sync?
  'Stand: '+new Date(model.last_catalog_sync*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'})+' · Katalogabgleich täglich':
  'Etsy-Katalogdaten noch nicht geladen';
 $('etsy-alert-toggle').textContent=etsyAlertExpanded?'Schließen':'Alle '+alerts.length+' ansehen';
 $('etsy-alert-toggle').setAttribute('aria-expanded',String(etsyAlertExpanded));
 $('etsy-alert-list').hidden=!etsyAlertExpanded;
 if(!etsyAlertExpanded)return;
 updateHTML($('etsy-alert-list'),alerts.map(item=>{
  const empty=item.severity==='empty',amount=item.etsy_qty;
  const qty=Number.isInteger(amount)?amount+' Stk. bei Etsy':item.state==='sold_out'?'Bei Etsy ausverkauft':'Etsy-Gesamtmenge unbekannt';
  const variants=item.variants||[];
  return '<article class="etsy-alert-item '+(empty?'empty':'low')+'">'+
   '<div class="etsy-alert-item-text"><b title="'+esc(item.title)+'">'+esc(item.title)+'</b>'+
   '<span class="etsy-alert-qty">'+esc(qty)+'</span>'+
   (item.state==='sold_out'?'<small>Dieses Listing ist bei Etsy als ausverkauft markiert.</small>':'')+
   (variants.length?'<div class="etsy-alert-variants">'+variants.map(v=>
    '<span><strong>'+esc(v.etsy_qty)+' ×</strong> '+esc(v.label)+'</span>').join('')+
    (item.more_variants?'<small>+ '+item.more_variants+' weitere betroffene Variante'+(item.more_variants===1?'':'n')+'</small>':'')+
    '</div>':'')+
   '</div><button type="button" class="secondary small" data-etsy-alert-to="'+esc(item.listing_id)+'" data-etsy-alert-variant="'+esc(variants[0]?.id||'')+'">Zur Produktkarte ↗</button>'+
   '</article>';
 }).join(''));
}
function goToEtsyAlertListing(listingId,variantId){
 const product=model?.products.find(p=>p.id===listingId);
 if(!product)return;
 etsyAlertFocused=listingId;
 filter='all';
 $('search').value='';
 if(variantId)selectedVariants.set(listingId,variantId);
 if(product.items.length>1)expanded.add(listingId);
 render();
 const card=[...document.querySelectorAll('[data-product]')].find(el=>el.dataset.product===listingId);
 if(!card)return;
 card.scrollIntoView({behavior:'smooth',block:'center'});
 card.classList.add('etsy-alert-highlight');
 setTimeout(()=>card.classList.remove('etsy-alert-highlight'),3500);
}
$('etsy-alert-toggle').addEventListener('click',()=>{
 etsyAlertExpanded=!etsyAlertExpanded;renderEtsyStockBanner();
});
$('etsy-alert-list').addEventListener('click',event=>{
 const b=event.target.closest('[data-etsy-alert-to]');
 if(b)goToEtsyAlertListing(b.dataset.etsyAlertTo,b.dataset.etsyAlertVariant);
});

function render(){if(!model)return;
 openNotices=new Set([...document.querySelectorAll('[data-notice-key][open]')].map(el=>el.dataset.noticeKey));
 const products=model.products.filter(p=>p.state==='active');
 const visibleProducts=model.products.filter(p=>p.state==='active'||(p.id===etsyAlertFocused&&p.state==='sold_out'));
 renderEtsyStockBanner();
 const cooldownActive=Number(model.cooldown_until||0)*1000>Date.now();
 $('sync').disabled=!!model.sync.running||!model.authorized||cooldownActive;
 $('undo').disabled=!model.undo||busy;
 const when=seconds=>seconds?new Date(seconds*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'}):'noch kein Abgleich';
 const date=when(model.last_sync),catalogDate=when(model.last_catalog_sync);
 const cooldownDate=when(model.cooldown_until);
 $('sync-state').textContent=model.sync.running?model.sync.message:cooldownActive?`Etsy-Anfragelimit erreicht · Pause bis ${cooldownDate} · gespeicherte Bestände bleiben sichtbar`:`Bestellungen: ${date} (alle 15 Minuten) · Produktkatalog: ${catalogDate} (täglich)`;
 const stale=model.last_sync&&Date.now()/1000-model.last_sync>3600;
 showAlert([model.sync.error,model.warning,!model.authorized?'Bitte Etsy unter Einstellungen verbinden.':cooldownActive?`Etsy hat zu viele Anfragen gemeldet. Bis ${cooldownDate} pausiert unser Druckplaner automatisch.`:stale?'Bestelldaten sind älter als eine Stunde. Etsy-Abgleich prüfen.':'']);
 const critical=(model.orders||[]).filter(o=>{const days=calendarDaysUntil(o.ship_by);return days!==null&&days<=2;}).length;
 updateHTML($('summary'),[['Produkte',products.length],['Nachdrucken',products.reduce((n,p)=>n+p.need,0)+' Stk.'],['Im Druck',products.flatMap(p=>p.items).reduce((n,i)=>n+i.in_print,0)+' Stk.'],['Versandkritisch',critical+' Aufträge']].map(([label,value],index)=>`<div ${index===3&&critical?'class="summary-urgent"':''}><span>${label}</span><b>${value}</b></div>`).join(''));
 renderOrders();
 renderCatalog();
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));
 const search=$('search').value.trim().toLocaleLowerCase('de');
 const selected=order.map(id=>visibleProducts.find(p=>p.id===id)).filter(Boolean).filter(p=>(filter!=='need'||p.need>0||p.unmatched>0)&&(filter!=='printing'||p.items.some(i=>i.in_print>0))&&(filter!=='uncounted'||p.uninitialized>0)).filter(p=>(p.title+' '+p.items.map(i=>i.label).join(' ')).toLocaleLowerCase('de').includes(search));
 const focus=document.activeElement,focusId=focus?.dataset.id,focusAction=focus?.dataset.action,delta=focus?.dataset.delta;
 updateHTML($('products'),selected.length?selected.map(card).join(''):`<div class="empty"><h2>${products.length?'Hier ist alles erledigt.':'Dein Lager startet hier.'}</h2><p>${products.length?'Kein Produkt passt zu dieser Auswahl.':'Etsy verbinden, Produkte laden und einmal deine echten Bestände zählen.'}</p></div>`);
 if(focusId){const next=[...document.querySelectorAll('[data-action]')].find(b=>b.dataset.id===focusId&&b.dataset.action===focusAction&&b.dataset.delta===delta);next?.focus({preventScroll:true});}
}


// Offline swatches from manufacturer publications, not live price or stock data.
// Bambu Lab PLA Basic: https://store.bblcdn.eu/s8/default/903b60b06ac142e9b1b49ad53cfa4c82/Bambu_PLA_Basic_Hex_Code.pdf
// Bambu Lab PLA Matte: https://store.bblcdn.com/s1/default/699cd85d9a194edea3423dc34e164579/Bambu_PLA_Matte_10_rolls_Hex_Code.pdf
// SUNLU PLA / PLA+: https://www.sunlu.com/de/products/pla-3d-printing-filament
// SUNLU Silk: https://www.sunlu.com/products/Silk%20PLA%2B2.0
const filamentCatalog={
 'Bambu Lab':{
  'PLA Basic':[
   ['Jade-Weiß','#FFFFFF',['Jadeweiß','Jade White','Weiß','White']],
   ['Beige','#F7E6DE'],['Hellgrau','#D1D3D5',['Light Gray']],['Silber','#A6A9AA'],
   ['Grau','#8E9089',['Gray']],['Dunkelgrau','#545454',['Dark Gray']],
   ['Schwarz','#000000',['Black']],['Magenta','#EC008C'],['Pink','#F55A74'],
   ['Hot Pink','#F5547C'],['Orange','#FF6A13'],['Kürbisorange','#FF9016',['Pumpkin Orange']],
   ['Gold','#E4BD68'],['Sonnenblumengelb','#FEC600',['Sunflower Yellow']],
   ['Gelb','#F4EE2A',['Yellow']],['Bambu-Grün','#00AE42',['Bambu Green']],
   ['Mistelgrün','#3F8E43',['Mistletoe Green']],['Türkis','#00B1B7',['Turquoise']],
   ['Cyan','#0086D6'],['Blau','#0A2989',['Blue']],['Kobaltblau','#0056B8',['Cobalt Blue']],
   ['Lila','#5E43B7',['Purple']],['Indigoviolett','#482960',['Indigo Purple']],
   ['Bronze','#847D48'],['Kakaobraun','#6F5034',['Cocoa Brown']],
   ['Braun','#9D432C',['Brown']],['Rot','#C12E1F',['Red']]
  ],
  'PLA Matte':[
   ['Elfenbeinweiß','#FFFFFF',['Ivory White']],['Wüstenbeige','#E8DBB7',['Desert Tan']],
   ['Flieder','#AE96D4',['Lilac Purple']],['Mandarinenorange','#F99963',['Mandarin Orange']],
   ['Scharlachrot','#DE4343',['Scarlet Red']],['Grasgrün','#61C680',['Grass Green']],
   ['Marineblau','#0078BF',['Marine Blue']],['Zitronengelb','#F7D959',['Lemon Yellow']],
   ['Kohleschwarz','#000000',['Charcoal']],['Aschgrau','#9B9EA0',['Ash Gray']]
  ]
 },
 'SUNLU':{
  'PLA':[
   ['Weiß','#FFFFFF',['White']],['Schwarz','#000000',['Black']],['Grau','#75787B',['Grey']],
   ['Rot','#BC2726',['Red']],['Gelb','#FFF13F',['Yellow']],['Grün','#1DAA27',['Green']],
   ['Cyan','#00A3E0'],['Beige','#F0E0D6'],['Keramik','#F4F9FF',['Ceramic']],
   ['Knochenweiß','#EEE7D4',['Bone White']],['Olivgrün','#5A6D3D',['Olive Green']],
   ['Sonniges Orange','#ED7334',['Sunny Orange']],['Klein-Blau','#1729AB',['Klein Blue']],
   ['Lavendelviolett','#685BC7',['Lavender Purple']]
  ],
  'PLA+':[
   ['Weiß','#FFFFFF',['White']],['Schwarz','#000000',['Black']],['Grau','#75787B',['Grey']],
   ['Rot','#BC2726',['Red']],['Gelb','#FFF13F',['Yellow']],['Grün','#1DAA27',['Green']],
   ['Cyan','#00A3E0'],['Beige','#F0E0D6'],['Keramik','#F4F9FF',['Ceramic']],
   ['Knochenweiß','#EEE7D4',['Bone White']],['Olivgrün','#5A6D3D',['Olive Green']],
   ['Sonniges Orange','#ED7334',['Sunny Orange']],['Klein-Blau','#1729AB',['Klein Blue']]
  ],
  'PLA Silk':[
   ['Gold','#F1BE48'],['Silber','#919CAC'],['Kupferrot','#A55F49',['Copper Red']],
   ['Schwarz','#000000'],['Weiß','#FFFFFF'],['Titanstahl','#8C8B89',['Titanium Steel']]
  ]
 }
};
const filamentBrands=['Bambu Lab','SUNLU','eSUN','Polymaker','Prusament','ERYONE','ELEGOO','Creality','OVERTURE','extrudr'];
const filamentMaterials=['PLA','PLA Basic','PLA Matte','PLA Silk','PLA+','PLA Silk+','PETG','TPU','ABS','ASA','PA-CF'];
const normFilament=s=>String(s||'').trim().toLocaleLowerCase('de')
 .replace(/ß/g,'ss').replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
 .normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\+/g,'plus').replace(/[^a-z0-9]/g,'');
function canonicalFilamentBrand(s){
 const key=normFilament(s);
 if(key==='bambu'||key==='bambulab')return 'Bambu Lab';
 return filamentBrands.find(name=>normFilament(name)===key)||String(s||'').trim();
}
function normFilamentMaterial(s){
 const k=normFilament(s);
 return ({basicpla:'plabasic',mattepla:'plamatte',silkpla:'plasilk'}[k]||k);
}
function filamentUniqueIdentity(brand,material,color){
 const b=normFilament(canonicalFilamentBrand(brand)),m=normFilamentMaterial(material);
 let c=normFilament(color);
 if(b==='bambulab'){
  c=({jadewhite:'jadeweiss',ivorywhite:'elfenbeinweiss',bonewhite:'knochenweiss',
    cocoabrown:'kakaobraun',sunfloweryellow:'sonnenblumengelb'}[c]||c);
  if(m==='plabasic'&&(c==='white'||c==='weiss'))c='jadeweiss';
 }
 return [b,m,c].join('|');
}
function filamentSuggestions(field){
 const form=$('filament-form');
 const brand=canonicalFilamentBrand(form.elements.brand.value);
 const material=form.elements.material.value;
 const records=filamentData?.filaments||[];
 const result=[],seen=new Set();
 function add(name,hex='',source='',family='',aliases=[]){
  const key=normFilament(name)+'|'+normFilamentMaterial(family);
  if(!name||seen.has(key))return;
  seen.add(key);result.push({name,hex,source,family,aliases});
 }
 if(field==='brand'){
  filamentBrands.forEach(name=>add(name));
  records.forEach(f=>add(f.brand));
 }else if(field==='material'){
  const bkey=normFilament(brand);
  Object.keys(filamentCatalog[brand]||{}).forEach(name=>add(name));
  records.filter(f=>normFilament(canonicalFilamentBrand(f.brand))===bkey).forEach(f=>add(f.material));
  filamentMaterials.forEach(name=>add(name));
 }else{
  const catalog=filamentCatalog[brand]||{};
  const materialId=normFilamentMaterial(material);
  const families=Object.entries(catalog);
  for(const [family,values] of families){
   if(!families.some(([name])=>normFilamentMaterial(name)===materialId)||normFilamentMaterial(family)===materialId)
    values.forEach(([name,hex,aliases])=>add(name,hex,'Herstellerfarbcode',family,aliases||[]));
  }
  records.filter(f=>normFilament(canonicalFilamentBrand(f.brand))===normFilament(brand)&&
    (!families.some(([name])=>normFilamentMaterial(name)===materialId)||
      normFilamentMaterial(f.material)===materialId))
    .forEach(f=>add(f.color,f.color_hex,'Bereits angelegt',f.material));
 }
 return result;
}
function matchingFilamentSuggestion(field,query){
 const key=normFilament(query);
 return filamentSuggestions(field).filter(o=>!key||[o.name,...o.aliases].some(x=>normFilament(x).includes(key))).slice(0,12);
}
let filamentSuggestOptions={brand:[],material:[],color:[]},filamentAutoHex=false;
function showFilamentSuggestions(field){
 const fieldEl=$('filament-'+field),menu=$('filament-'+field+'-options');
 const options=matchingFilamentSuggestion(field,fieldEl.value);
 filamentSuggestOptions[field]=options;
 menu.innerHTML=options.map((o,i)=>`<button type="button" class="filament-suggest-item" role="option" data-suggest-field="${field}" data-suggest-index="${i}">
 ${o.hex?`<span class="filament-swatch" style="background:${esc(o.hex)}" aria-hidden="true"></span>`:''}
 <span><strong>${esc(o.name)}</strong>${o.family?`<small>${esc(o.family)} · ${esc(o.source)}</small>`:''}</span>
 ${o.hex?`<code>${esc(o.hex.toUpperCase())}</code>`:''}</button>`).join('');
 menu.hidden=!options.length;
 fieldEl.setAttribute('aria-expanded',String(!!options.length));
}
function closeFilamentSuggestions(except=''){
 for(const field of ['brand','material','color']){
  if(field===except)continue;
  $('filament-'+field+'-options').hidden=true;
  $('filament-'+field).setAttribute('aria-expanded','false');
 }
}
function filamentHexPreview(source=''){
 const value=$('filament-color-hex').value.toUpperCase();
 $('filament-hex-code').textContent=value;
 $('filament-hex-status').textContent=source||(filamentAutoHex?'Herstellerfarbcode übernommen':'Farbcode selbst gewählt oder später anpassbar');
}
function applyFilamentSuggestion(field,item){
 const form=$('filament-form');
 form.elements[field].value=item.name;
 if(field==='brand'){
  form.elements.brand.value=canonicalFilamentBrand(item.name);
 }else if(field==='color'&&item.hex){
  form.elements.material.value=item.family;
  form.elements.color_hex.value=item.hex;
  filamentAutoHex=item.source==='Herstellerfarbcode';
  filamentHexPreview(item.source==='Bereits angelegt'?'Farbcode aus deinem Lager übernommen':'Herstellerfarbcode automatisch übernommen');
 }
 closeFilamentSuggestions();
 if(field!=='color')matchExactFilamentColor();
 updateFilamentDuplicate();
}
function matchExactFilamentColor(){
 const query=$('filament-color').value.trim();
 if(!query)return;
 const key=normFilament(query);
 const matches=filamentSuggestions('color').filter(o=>[o.name,...o.aliases].some(name=>normFilament(name)===key));
 if(matches.length!==1)return;
 applyFilamentSuggestion('color',matches[0]);
}
function updateFilamentDuplicate(){
 const form=$('filament-form'),brand=form.elements.brand.value,color=form.elements.color.value,material=form.elements.material.value;
 const currentId=Number(form.elements.id.value||0);
 const item=brand&&color&&material?(filamentData?.filaments||[]).find(f=>f.id!==currentId&&
  filamentUniqueIdentity(f.brand,f.material,f.color)===filamentUniqueIdentity(brand,material,color)):null;
 $('filament-duplicate').hidden=!item;
 $('filament-existing').hidden=!item;
 $('filament-save').disabled=!!item;
 if(item)$('filament-duplicate').textContent='Bereits vorhanden: '+item.brand+' · '+item.material+' · '+item.color+'. Diesen Eintrag bearbeiten statt doppelt anlegen.';
 $('filament-existing').dataset.existingId=item?.id||'';
}

const filamentMoney=cents=>cents===null||cents===undefined?'Preis offen':(cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const filamentSpoolCart='<svg class="spool-cart" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h3l3 16h18l3-11H8"/><circle cx="13" cy="27" r="2"/><circle cx="25" cy="27" r="2"/><circle cx="18" cy="13" r="5"/><circle cx="18" cy="13" r="2"/></svg>';
function filamentLine(f,inCart){
 const name=esc(f.brand)+' · '+esc(f.color);
 const swatch=`<span class="filament-swatch" style="background:${esc(f.color_hex)}" aria-hidden="true"></span>`;
 const intro=`<div class="filament-identity">${swatch}<div><strong>${esc(f.color)}${f.internal_code?` <em class="filament-internal-code">#${esc(f.internal_code)}</em>`:""}</strong><small>${esc(f.brand)} · ${esc(f.material)}</small>${f.notes?`<small title="${esc(f.notes)}">Notiz: ${esc(f.notes)}</small>`:""}</div></div>`;
 const shop=f.purchase_url?`<a class="filament-shop" href="${esc(f.purchase_url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Shop ↗</a>`:'';
 return `<article class="filament-line" data-filament-line="${f.id}">
   ${intro}<div class="filament-meta"><span>${inCart?`<b>${f.cart_qty} Sp.</b> auf Liste`:`<b>${f.stock_qty}</b> ${f.stock_qty===1?'Spule':'Spulen'} vorrätig`}</span><span>${filamentMoney(f.price_cents)}</span></div>
   <div class="filament-line-actions">${inCart?
     `<button type="button" class="filament-step" data-filament-delta="-1" data-filament-id="${f.id}" aria-label="Eine Spule von der Einkaufsliste nehmen">−</button><b class="filament-cart-qty">${f.cart_qty}</b><button type="button" class="filament-step" data-filament-delta="1" data-filament-id="${f.id}" aria-label="Eine weitere Spule vormerken">+</button>${shop}<button type="button" class="secondary filament-receive" data-filament-receive="${f.id}">Erhalten</button>`:
     `<button type="button" class="filament-cart-button" data-filament-cart="${f.id}" aria-label="${name} zur Einkaufsliste hinzufügen">${filamentSpoolCart}<span>Auf Liste ${f.cart_qty? `(${f.cart_qty})`:''}</span></button>${shop}<button type="button" class="filament-edit" data-filament-edit="${f.id}">Bearbeiten</button>`}
   </div></article>`;
}
function renderFilaments(){
 if(!filamentData)return;
 const rows=filamentData.filaments||[];
 const cart=rows.filter(f=>f.cart_qty>0);
 $('filament-color-count').textContent=rows.length;
 $('filament-cart-count').textContent=filamentData.cart_count;
 $('filament-tab-count').textContent=filamentData.cart_count;
 $('filament-tab-count').hidden=!filamentData.cart_count;
 document.querySelectorAll('[data-filament-view]').forEach(b=>{const selected=b.dataset.filamentView===filamentView;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('filament-search-wrap').hidden=filamentView==='cart';
 const query=$('filament-search').value.trim().toLocaleLowerCase('de');
 const visible=filamentView==='cart'?cart:rows.filter(f=>(f.brand+' '+f.color+' '+f.material+' '+(f.internal_code||'')+' '+(f.notes||'')).toLocaleLowerCase('de').includes(query));
 $('filament-message').textContent=filamentView==='cart'?
  'Spulen für deinen nächsten Einkauf. „Erhalten“ bucht gelieferte Spulen ins Regal.':
  'Jede Zeile ist ein Filament. Einkaufswagen antippen, wenn du eine Spule nachbestellen möchtest.';
 updateHTML($('filament-rows'),visible.length?visible.map(f=>filamentLine(f,filamentView==='cart')).join(''):
  `<div class="filament-empty">${filamentView==='cart'?'Deine Einkaufsliste ist leer. Füge bei „Meine Farben“ eine Spule hinzu.':query?'Kein Filament passt zur Suche.':'Noch keine Farben angelegt. Starte mit „+ Filament anlegen“.'}</div>`);
 const summary=$('filament-cart-summary');
 summary.hidden=filamentView!=='cart'||!cart.length;
 if(!summary.hidden)updateHTML(summary,`<span><b>${filamentData.cart_count} ${filamentData.cart_count===1?'Spule':'Spulen'}</b> auf der Einkaufsliste</span><strong>${filamentMoney(filamentData.cart_known_total_cents)}${filamentData.cart_missing_prices?' + Preise offen':''}</strong>`);
}
async function loadFilaments(){
 if(filamentLoading||filamentBusy||$('filament-editor').open)return;
 filamentLoading=true;
 try{filamentData=await api('filaments');renderFilaments();}
 catch(err){$('filament-message').textContent='Filamente konnten nicht geladen werden: '+err.message;}
 finally{filamentLoading=false;}
}
async function filamentAction(data){
 if(filamentBusy)return;
 filamentBusy=true;
 document.querySelectorAll('#filament-shell button,#filament-form button').forEach(b=>b.disabled=true);
 try{filamentData=await api('filament',data);renderFilaments();flash('Filamentliste gespeichert.');}
 catch(err){flash(err.message,true);}
 finally{filamentBusy=false;document.querySelectorAll('#filament-shell button,#filament-form button').forEach(b=>b.disabled=false);}
}
function showWorkspace(value){
 workspace=value;
 for(const b of document.querySelectorAll('[data-workspace]')){const chosen=b.dataset.workspace===value;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));}
 const production=value==='production';
 for(const id of ['orders-shell','product-toolbar','product-sort-note','products'])$(id).hidden=!production;
 renderEtsyStockBanner();
 $('printer-strip').hidden=!production;
 $('filament-shell').hidden=value!=='filament';
 $('catalog-shell').hidden=value!=='catalog';
 $('printers-shell').hidden=value!=='printers';
 if(value==='catalog'){renderCatalog();loadPrintTools();}
 if(value==='filament')loadFilaments();
 if(value==='printers'){renderPrinterMonitor();loadPrinters();}
}
function openFilamentEditor(id){
 const f=(filamentData?.filaments||[]).find(x=>x.id===id);
 const form=$('filament-form');form.reset();
 form.elements.id.value=f?.id||'';
 for(const name of ['brand','color','material','color_hex','stock_qty','purchase_url','internal_code','notes']){
  form.elements[name].value=f?f[name]:(name==='color_hex'?'#ffffff':name==='material'?'PLA':name==='stock_qty'?0:'');
 }
 form.elements.price.value=f&&f.price_cents!==null?(f.price_cents/100).toFixed(2).replace('.',','):'';
 $('filament-title').textContent=f?'Filament bearbeiten':'Filament anlegen';
 $('filament-delete').hidden=!f;
 filamentAutoHex=false;
 filamentHexPreview();
 closeFilamentSuggestions();
 updateFilamentDuplicate();
 $('filament-editor').showModal();
 $('filament-brand').focus();
}

async function load(resort=false){if(polling||busy)return;polling=true;try{const data=await api('status');if(!busy&&!$('quantity').open&&!$('settings').open&&!$('order-details').open)setModel(data,resort);}catch(err){showAlert(['Verbindung zum Lager unterbrochen: '+err.message]);}finally{polling=false;}}
async function mutate(path,data){if(busy)return;busy=true;document.querySelectorAll('#products button,#products input,#products select,#orders button,#order-details button,#undo').forEach(b=>b.disabled=true);try{setModel(await api(path,data));scheduleSort();flash('Gespeichert.');}catch(err){flash(err.message,true);try{setModel(await api('status'));}catch{}}finally{busy=false;render();}}
function findItem(id){for(const p of model.products){const i=p.items.find(i=>i.id===id);if(i)return {p,i};}return null;}
function quantityDialog(id,action){const found=findItem(id);if(!found)return;const {p,i}=found;quantityContext={id,action,revision:i.revision};$('quantity-variants').hidden=true;$('quantity-confirm').disabled=action==='finish'&&i.on_hand===null;$('quantity-confirm').textContent=['printing','finish','cancel'].includes(action)?'Bestätigen':'Speichern';const labels={set:'Bestand erfassen',printing:'In Druck nehmen',finish:'Fertige Stücke einlagern',cancel:'Druckmenge zurücknehmen',minimum:'Mindestbestand'};$('quantity-title').textContent=labels[action];$('quantity-label').textContent=p.title+' · '+i.label;const input=$('quantity-value');input.min=['set','minimum'].includes(action)?0:1;input.max=['finish','cancel'].includes(action)?i.in_print-(i.order_printing||0):100000;input.value=action==='set'?(i.on_hand??0):action==='minimum'?i.minimum:action==='printing'?Math.max(1,i.need||1):i.in_print-(i.order_printing||0);$('quantity-help').textContent=action==='set'?'Alle fertigen Stücke zählen, einschließlich reservierter und gepackter Ware.':action==='finish'&&i.on_hand===null?'Bitte zuerst den Lagerbestand dieser Variante erfassen.':action==='finish'?'Nur erfolgreich gedruckte Stücke buchen. Fehlgeschlagene Stücke über „Abbruch“ zurücknehmen.':action==='printing'?'Merkt die Menge vor. Startet keinen Drucker.':action==='minimum'?'Wird bei Lagerartikeln mindestens als freier Vorrat empfohlen.':'Entfernt die Menge aus „Im Druck“, ohne den Lagerbestand zu erhöhen.';if(!$('quantity').open){$('quantity').showModal();input.focus();input.select();}}
$('orders').addEventListener('click',event=>{
 const print=event.target.closest('[data-order-print]');
 if(print&&!busy){
  const o=(model.orders||[]).find(x=>x.id===print.dataset.orderPrint);
  const candidates=o?.items.filter(i=>i.item_id&&i.remaining>0)||[];
  if(candidates.length===1)orderPrintDialog(candidates[0].transaction_id,'printing');
  else if(o)showOrder(o.id);
  return;
 }
 const button=event.target.closest('[data-order-open]');
 if(button)showOrder(button.dataset.orderOpen);
});
$('order-details-content').addEventListener('click',event=>{
 const button=event.target.closest('[data-order-line]');
 if(button&&!busy)orderPrintDialog(button.dataset.orderLine,button.dataset.jobAction);
});
for(const button of document.querySelectorAll('[data-order-sort]'))button.addEventListener('click',()=>{
 if(orderSort===button.dataset.orderSort)return;
 orderSort=button.dataset.orderSort;
 try{localStorage.setItem('pp-order-sort',orderSort);}catch{}
 renderOrders();
 $('orders').scrollLeft=0;
});
for(const dir of ['prev','next'])$('orders-'+dir).addEventListener('click',()=>$('orders').scrollBy({left:(dir==='prev'?-1:1)*Math.max(260,$('orders').clientWidth*.75),behavior:'smooth'}));
$('products').addEventListener('click',async event=>{
 const linked=event.target.closest('[data-order-job]');
 if(linked&&!busy){orderPrintDialog(linked.dataset.orderJob,linked.dataset.jobAction);return;}
 const printButton=event.target.closest('[data-product-print]');
 if(printButton&&!busy){productPrintDialog(printButton.dataset.productPrint,printButton.dataset.printAction);return;}
 const shortcut=event.target.closest('[data-show-variant]');
 if(shortcut&&!busy){
  selectedVariants.set(shortcut.dataset.listing,shortcut.dataset.showVariant);
  expanded.add(shortcut.dataset.listing);render();scheduleSort();return;
 }
 const expand=event.target.closest('[data-expand]');if(expand){const id=expand.dataset.expand;expanded.has(id)?expanded.delete(id):expanded.add(id);render();scheduleSort();return;}const b=event.target.closest('[data-action]');if(!b||busy)return;const {id,action}=b.dataset;if(action==='adjust'){await mutate('stock',{id,action,delta:Number(b.dataset.delta)});}else quantityDialog(id,action);});
$('products').addEventListener('change',event=>{
 const picker=event.target.closest('[data-picker]');
 if(picker){
  const p=model.products.find(p=>p.id===picker.dataset.picker);
  chooseVariant(p,picker);
  render();
  const next=[...document.querySelectorAll('[data-picker]')].find(el=>el.dataset.picker===picker.dataset.picker&&el.dataset.dimension===picker.dataset.dimension);
  next?.focus({preventScroll:true});return;
 }
 const b=event.target.closest('[data-mode]');if(b)mutate('mode',{id:b.dataset.mode,enabled:b.checked});});
$('quantity-variants').addEventListener('change',event=>{
 const picker=event.target.closest('[data-picker]');if(!picker)return;
 const {productId,action}=quantityContext;
 const original=model.products.find(p=>p.id===productId);
 const p={...original,items:printCandidates(original,action)};
 chooseVariant(p,picker);
 quantityDialog(selectedVariants.get(productId),action);
 quantityContext.productId=productId;renderPrintPicker(p);
});
$('quantity-form').addEventListener('submit',async event=>{event.preventDefault();const data={...quantityContext,quantity:Number($('quantity-value').value)};$('quantity').close();if(data.orderPrint)await mutate('order-print',{transaction_id:data.transactionId,receipt_id:data.receiptId,action:data.action,quantity:data.quantity,revision:data.revision});else await mutate('stock',data);});
$('search').addEventListener('input',()=>{render();scheduleSort();});
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{filter=b.dataset.filter;order=model.products.map(p=>p.id);render();});
for(const b of document.querySelectorAll('[data-close]'))b.addEventListener('click',() => $(b.dataset.close).close());
$('undo').addEventListener('click',()=>mutate('undo',{id:model.undo}));
$('sync').addEventListener('click',async()=>{try{await api('sync',{});await load();}catch(err){flash(err.message,true);await load();}});
$('settings-open').addEventListener('click',()=>{if(!model)return;$('days').value=model.days;$('etsy-alert-threshold').value=model.etsy_alert_threshold??3;$('settings').showModal();});
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();try{setModel(await api('settings',{days:Number($('days').value),etsy_alert_threshold:Number($('etsy-alert-threshold').value)}),true);$('settings').close();flash('Vorratsziel gespeichert.');}catch(err){flash(err.message,true);}});
$('config-form').addEventListener('submit',async event=>{event.preventDefault();try{await api('config',Object.fromEntries(new FormData(event.target)));event.target.reset();flash('Zugangsdaten gespeichert. Jetzt Etsy-Freigabe öffnen.');}catch(err){flash(err.message,true);}});
$('authorize').addEventListener('click',async()=>{try{const {url}=await api('oauth/start',{});const link=$('oauth-link');link.href=url;link.hidden=false;link.focus();}catch(err){flash(err.message,true);}});
$('finish-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await api('oauth/finish',Object.fromEntries(new FormData(event.target)));event.target.reset();$('settings').close();await load();flash('Etsy verbunden. Produkte werden geladen.');}catch(err){flash(err.message,true);}finally{button.disabled=false;}});

for(const b of document.querySelectorAll('[data-workspace]'))b.addEventListener('click',()=>showWorkspace(b.dataset.workspace));
for(const b of document.querySelectorAll('[data-filament-view]'))b.addEventListener('click',()=>{filamentView=b.dataset.filamentView;renderFilaments();});
$('filament-add').addEventListener('click',()=>openFilamentEditor(null));
$('filament-search').addEventListener('input',renderFilaments);
$('filament-rows').addEventListener('click',event=>{
 if(filamentBusy)return;
 const edit=event.target.closest('[data-filament-edit]');
 if(edit){openFilamentEditor(Number(edit.dataset.filamentEdit));return;}
 const add=event.target.closest('[data-filament-cart]');
 if(add){filamentAction({action:'cart',id:Number(add.dataset.filamentCart),delta:1});return;}
 const delta=event.target.closest('[data-filament-delta]');
 if(delta){filamentAction({action:'cart',id:Number(delta.dataset.filamentId),delta:Number(delta.dataset.filamentDelta)});return;}
 const receive=event.target.closest('[data-filament-receive]');
 if(receive){
  const spool=filamentData.filaments.find(f=>f.id===Number(receive.dataset.filamentReceive));
  if(spool&&confirm(`Sind ${spool.cart_qty} Spulen von ${spool.brand} · ${spool.color} tatsächlich angekommen? Dann werden sie ins Filamentlager gebucht.`))filamentAction({action:'receive',id:spool.id});
 }
});
for(const field of ['brand','material','color']){
 const input=$('filament-'+field);
 input.addEventListener('focus',()=>{closeFilamentSuggestions(field);showFilamentSuggestions(field);});
 input.addEventListener('input',()=>{
  closeFilamentSuggestions(field);showFilamentSuggestions(field);
  if(field==='brand'||field==='material')matchExactFilamentColor();
  updateFilamentDuplicate();
 });
 input.addEventListener('change',()=>{
  if(field==='brand'){
   const found=filamentSuggestions('brand').find(o=>normFilament(o.name)===normFilament(input.value));
   if(found)input.value=found.name;
  }
  if(field==='color')matchExactFilamentColor();
  updateFilamentDuplicate();
 });
 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeFilamentSuggestions();return;}
  if(event.key==='ArrowDown'&&!$('filament-'+field+'-options').hidden){
   event.preventDefault();$('filament-'+field+'-options').querySelector('button')?.focus();
  }
 });
}
$('filament-form').addEventListener('click',event=>{
 const option=event.target.closest('[data-suggest-field]');
 if(!option)return;
 const field=option.dataset.suggestField;
 const item=filamentSuggestOptions[field]?.[Number(option.dataset.suggestIndex)];
 if(item){applyFilamentSuggestion(field,item);$('filament-'+field).focus();closeFilamentSuggestions();}
});
$('filament-existing').addEventListener('click',()=>{
 const id=Number($('filament-existing').dataset.existingId);
 if(id){$('filament-editor').close();openFilamentEditor(id);}
});
$('filament-color-hex').addEventListener('input',()=>{filamentAutoHex=false;filamentHexPreview('Manuell gewählter Farbcode');});
document.addEventListener('click',event=>{
 if(!event.target.closest('.filament-autocomplete'))closeFilamentSuggestions();
});
$('filament-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(filamentBusy)return;
 if($('filament-save').disabled)return;
 matchExactFilamentColor();
 updateFilamentDuplicate();
 if($('filament-save').disabled)return;
 const values=Object.fromEntries(new FormData(event.target).entries());
 const payload={action:'save',id:values.id?Number(values.id):null,brand:values.brand,color:values.color,material:values.material,color_hex:values.color_hex,stock_qty:Number(values.stock_qty),price:values.price.trim(),purchase_url:values.purchase_url,internal_code:values.internal_code,notes:values.notes};
 $('filament-editor').close();
 await filamentAction(payload);
});
$('filament-delete').addEventListener('click',async()=>{
 const id=Number($('filament-id').value);
 const f=filamentData?.filaments.find(x=>x.id===id);
 if(!f||!confirm(`Filament „${f.brand} · ${f.color}“ und alle vorgemerkten Einkaufsmengen wirklich löschen?`))return;
 $('filament-editor').close();
 await filamentAction({action:'delete',id});
});
setInterval(()=>{if(workspace==='filament'&&!document.hidden)loadFilaments();},30000);


const masterPrinters=['H2D','P1S Old','P1S New','Snapmaker U1','A1 mini','Prusa MK4'];
function toolSummary(p){
 const profiles=printTools.profiles.filter(r=>r.listing_id===p.id);
 const files=printTools.files.filter(r=>r.listing_id===p.id);
 const preferred=profiles.find(r=>r.variant_id===(selectedVariants.get(p.id)||'')&&r.printer==='H2D')||profiles.find(r=>r.variant_id===''&&r.printer==='H2D')||profiles[0];
 const colors=preferred?.colors||[];
 return '<div class="master-card-row"><button type="button" class="secondary small" data-master-open="'+esc(p.id)+'">▣ 3MF &amp; Farben'+(files.length?' · '+files.length:'')+'</button>'
  +(colors.length?'<div class="master-card-colors" title="'+esc(preferred.printer)+'">'+colors.map(f=>'<span class="master-chip" title="'+esc(f.slot+' · '+f.brand+' '+f.color)+'"><span class="filament-swatch" style="background:'+esc(f.hex)+'"></span><b>'+esc(f.code||f.color)+'</b></span>').join('')+'</div>':'')+'</div>';
}
function renderCatalog(){
 if(!model)return;
 const shell=$('catalog-rows');if(!shell)return;
 const search=$('catalog-search').value.trim().toLocaleLowerCase('de');
 const rows=model.products.filter(p=>p.state==='active'&&p.title.toLocaleLowerCase('de').includes(search));
 updateHTML(shell,rows.length?rows.map(p=>{
  const files=printTools.files.filter(f=>f.listing_id===p.id).length;
  const profiles=printTools.profiles.filter(f=>f.listing_id===p.id).length;
  const img=thumbnail(p.image);
  return '<article class="catalog-item" data-catalog-item="'+esc(p.id)+'">'+(img?'<img src="'+esc(img)+'" alt="" loading="lazy">':'<div class="catalog-placeholder">P+</div>')+
   '<div><b>'+esc(p.title)+'</b><small>'+files+' Masterdatei(en) · '+profiles+' Druckprofil(e)</small></div><button type="button" class="secondary small" data-master-open="'+esc(p.id)+'">3MF &amp; Belegung</button></article>';
 }).join(''):'<p class="hint">Kein aktives Produkt passt zur Suche.</p>');
}
let masterToolsLoading=false;
async function loadPrintTools(){
 if(masterToolsLoading)return;
 masterToolsLoading=true;
 let next;
 try{
  next=await api('print-tools');
  if(!Array.isArray(next.profiles)||!Array.isArray(next.files)){
   throw Error('Druckprofile-Antwort ist unvollständig.');
  }
 }catch(err){
  console.error('Druckprofile API:',err);
  flash('Druckprofile nicht abrufbar: '+err.message,true);
  masterToolsLoading=false;
  return;
 }
 // Keep the last valid snapshot intact if a redraw ever fails in a browser.
 printTools=next;
 masterToolsLoading=false;
 if(model){
  try{renderCatalog();render();}
  catch(err){
   console.error('Druckprofile Darstellung:',err);
   flash('Druckprofile geladen, aber Darstellung fehlgeschlagen: '+err.message,true);
  }
 }
}
function selectedMasterTarget(){
 return {listing_id:masterContext?.id||'',variant_id:$('master-variant').value,printer:$('master-printer').value};
}
function findMasterProfile(){
 const x=selectedMasterTarget();
 return printTools.profiles.find(p=>p.listing_id===x.listing_id&&p.variant_id===x.variant_id&&p.printer===x.printer);
}
function masterSelectionChanged(){
 const existing=findMasterProfile();
 masterSources=existing?JSON.parse(JSON.stringify(existing.sources)):[];
 renderMasterSources();renderMasterFiles();
}
async function openMasterEditor(id){
 const p=model?.products.find(p=>p.id===id);
 if(!p)return;
 masterContext=p;
 $('master-title').textContent=p.title;
 $('master-variant').innerHTML='<option value="">Alle Varianten (Standard)</option>'+p.items.map(i=>'<option value="'+esc(i.id)+'">'+esc(i.label)+'</option>').join('');
 $('master-printer').innerHTML=masterPrinters.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
 $('master-variant').value='';
 $('master-printer').value='H2D';
 $('master-editor').showModal();
 try{const [tool,spool]=await Promise.all([api('print-tools?listing_id='+encodeURIComponent(id)),api('filaments')]);
  printTools.profiles=[...printTools.profiles.filter(r=>r.listing_id!==id),...tool.profiles];
  printTools.files=[...printTools.files.filter(r=>r.listing_id!==id),...tool.files];
  filamentData=spool;
  masterSelectionChanged();
 }catch(err){flash(err.message,true);}
}
function renderMasterSources(){
 const filaments=filamentData?.filaments||[];
 updateHTML($('master-sources'),masterSources.length?masterSources.map((s,n)=>
  '<div class="master-source" data-master-source="'+n+'"><div class="master-source-title"><b>'+esc(s.label)+'</b><button type="button" class="text-button" data-master-remove="'+n+'">Entfernen</button></div><div class="master-slots">'+s.slots.map((fid,j)=>
   '<label><span>Platz '+(j+1)+'</span><select data-master-source="'+n+'" data-master-slot="'+j+'"><option value="">Nicht belegt</option>'+filaments.map(f=>'<option value="'+f.id+'" '+(f.id===fid?'selected':'')+'>'+esc((f.internal_code?'#'+f.internal_code+' · ':'')+f.brand+' · '+f.color+' · '+f.material)+'</option>').join('')+'</select>'
   +(fid?'<span class="master-slot-swatch" style="background:'+esc(filaments.find(f=>f.id===fid)?.color_hex||'#ffffff')+'"></span>':'')+'</label>').join('')+'</div></div>'
 ).join(''):'<p class="hint">Noch keine Filamentquelle zugeordnet. Füge ein AMS, AMS HT oder eine externe Spule hinzu.</p>');
}
function renderMasterFiles(){
 const x=selectedMasterTarget();
 const files=printTools.files.filter(f=>f.listing_id===x.listing_id&&f.variant_id===x.variant_id&&f.printer===x.printer);
 updateHTML($('master-files'),files.length?files.map(f=>
  '<div class="master-file"><div><b>'+esc(f.filename)+'</b><small>'+new Date(f.created*1000).toLocaleString('de-DE')+' · '+(f.bytes/1048576).toFixed(1)+' MB</small></div><a class="secondary small" href="api/master-download?id='+encodeURIComponent(f.id)+'" download>Herunterladen</a></div>'
 ).join(''):'<p class="hint">Noch keine Masterdatei für diese Kombination vorhanden.</p>');
}
async function saveMaster(){
 if(masterBusy||!masterContext)return;
 masterBusy=true;$('master-save').disabled=true;
 try{const next=await api('print-profile',{...selectedMasterTarget(),sources:masterSources});
  printTools.profiles=[...printTools.profiles.filter(r=>r.listing_id!==masterContext.id),...next.profiles];
  render();renderCatalog();flash('Filamentbelegung gespeichert.');
 }catch(err){flash(err.message,true);}
 finally{masterBusy=false;$('master-save').disabled=false;}
}
async function uploadMaster(){
 if(masterBusy||!masterContext)return;
 const file=$('master-upload-input').files[0];
 if(!file||!file.name.toLowerCase().endsWith('.3mf')){flash('Bitte eine .3mf-Datei auswählen.',true);return;}
 if(file.size>100*1024*1024){flash('Maximal 100 MB pro Datei.',true);return;}
 masterBusy=true;$('master-upload').disabled=true;
 try{const q=new URLSearchParams({...selectedMasterTarget(),filename:file.name});
  const res=await fetch('api/master-upload?'+q,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-PP-Upload':'1'},body:file});
  const data=await res.json();if(!res.ok)throw Error(data.error||'Upload fehlgeschlagen.');
  const tool=await api('print-tools?listing_id='+encodeURIComponent(masterContext.id));
  printTools.files=[...printTools.files.filter(r=>r.listing_id!==masterContext.id),...tool.files];
  $('master-upload-input').value='';renderMasterFiles();render();renderCatalog();
  flash('Masterdatei abgelegt. Frühere Versionen bleiben erhalten.');
 }catch(err){flash(err.message,true);}
 finally{masterBusy=false;$('master-upload').disabled=false;}
}
async function copyMasterPath(){
 if(!masterContext)return;
 const path='\\\\homeassistant\\share\\print-pulse\\masterdateien\\'+masterContext.id+'\\'+$('master-printer').value.replace(/[^a-zA-Z0-9_-]/g,'-');
 try{await navigator.clipboard.writeText(path);flash('Netzwerkordner-Pfad kopiert. In Windows-Explorer einfügen.');}
 catch{window.prompt('Diesen Pfad im Windows-Explorer öffnen:',path);}
}
$('catalog-search').addEventListener('input',renderCatalog);
for(const box of ['products','catalog-rows'])$(box).addEventListener('click',event=>{
 const b=event.target.closest('[data-master-open]');if(b)openMasterEditor(b.dataset.masterOpen);
});
$('master-printer').addEventListener('change',masterSelectionChanged);
$('master-variant').addEventListener('change',masterSelectionChanged);
$('master-add').addEventListener('click',()=>{
 const type=$('master-source-type').value;
 if(masterSources.length>=12){flash('Maximal 12 Filamentquellen.',true);return;}
 const label=type==='ams'?'AMS ':type==='ams_ht'?'AMS HT ':'Externe Spule ';
 masterSources.push({type,label:label+(masterSources.filter(s=>s.type===type).length+1),slots:Array(type==='ams'?4:1).fill(null)});
 renderMasterSources();
});
$('master-sources').addEventListener('click',event=>{
 const b=event.target.closest('[data-master-remove]');if(!b)return;
 masterSources.splice(Number(b.dataset.masterRemove),1);
 for(const type of ['ams','ams_ht','external']){
  masterSources.filter(s=>s.type===type).forEach((s,i)=>s.label=(type==='ams'?'AMS ':type==='ams_ht'?'AMS HT ':'Externe Spule ')+(i+1));
 }
 renderMasterSources();
});
$('master-sources').addEventListener('change',event=>{
 const b=event.target.closest('select[data-master-slot]');if(!b)return;
 masterSources[Number(b.dataset.masterSource)].slots[Number(b.dataset.masterSlot)]=b.value?Number(b.value):null;
 renderMasterSources();
});
$('master-save').addEventListener('click',saveMaster);
$('master-upload').addEventListener('click',uploadMaster);
$('master-copy-path').addEventListener('click',copyMasterPath);



// Separate read-only printer monitor: four compact gauges in production,
// full status details and persistent HA entity selection in the Drucker tab.
const monitorPrinters=['H2D','P1S Old','P1S New','Snapmaker U1'];
const monitorFields=[
 ['status','Druckstatus (erforderlich)'],['progress','Fortschritt (%)'],['remaining','Restzeit'],
 ['filename','Aktuelle Druckdatei'],['bed','Heizbett (°C)'],['nozzle','Düse (°C)'],
 ['nozzle_left','Düse links (H2D)'],['nozzle_right','Düse rechts (H2D)'],
 ['chamber','Bauraum (°C)'],['layer','Aktuelle Schicht'],['total_layers','Gesamtschichten'],
 ['stage','Druckphase'],['active_tray','Aktives AMS-Fach'],
 ['head0','Snapmaker Kopf T0'],['head1','Snapmaker Kopf T1'],
 ['head2','Snapmaker Kopf T2'],['head3','Snapmaker Kopf T3'],
 ['ams1','AMS Platz 1'],['ams2','AMS Platz 2'],['ams3','AMS Platz 3'],['ams4','AMS Platz 4']
];
const printerStateLabels={
 setup:'Nicht verbunden',offline:'Offline',printing:'Druckt',paused:'Pausiert',
 finished:'Fertig',idle:'Bereit',error:'Störung',preparing:'Vorbereitung',unknown:'Status unklar'
};
const printerFallback=()=>monitorPrinters.map(id=>({
 id,name:id==='Snapmaker U1'?id:'Bambu '+id,configured:false,state:'setup',
 progress:null,remaining_seconds:null,temps:{},layers:{},ams:[],filename:null
}));
function printerRows(){return printerLive?.printers?.length===monitorPrinters.length?printerLive.printers:printerFallback();}
function printerRemaining(seconds){
 if(seconds===null||seconds===undefined||!Number.isFinite(Number(seconds)))return 'Restzeit offen';
 const mins=Math.round(Number(seconds)/60);
 if(mins<60)return mins+' min';
 return Math.floor(mins/60)+' h '+String(mins%60).padStart(2,'0')+' min';
}
function printerGauge(p,compact=false){
 const progress=Number.isFinite(p.progress)?Math.max(0,Math.min(100,p.progress)):null;
 const tone=p.state==='error'?'var(--red)':p.state==='finished'?'var(--gold)':p.state==='printing'?'var(--green)':p.state==='paused'?'#bb914f':'#b6bcb6';
 const display=progress===null?'–':progress+'%';
 const fill=progress===null?0:progress;
 const klass=compact?'printer-gauge compact':'printer-gauge';
 return '<div class="'+klass+'" role="img" aria-label="'+esc(p.name+': '+(printerStateLabels[p.state]||'Unbekannt')+', '+(progress===null?'kein Fortschritt verfügbar':display))+'" style="--printer-progress:'+fill+'%;--printer-tone:'+tone+'"><span>'+esc(display)+'</span></div>';
}
function printerLine(label,value){
 return '<div class="printer-metric"><span>'+esc(label)+'</span><strong>'+esc(value===null||value===undefined||value===''?'–':String(value))+'</strong></div>';
}
function printerTemp(t){return Number.isFinite(t)?t.toLocaleString('de-DE',{maximumFractionDigits:1})+' °C':'–';}
function renderPrinterMonitor(){
 const rows=printerRows();
 updateHTML($('printer-strip-row'),rows.map(p=>{
  const status=printerStateLabels[p.state]||'Unbekannt';
  const subtitle=p.state==='printing'||p.state==='paused'?printerRemaining(p.remaining_seconds):status;
  return '<button type="button" class="printer-mini '+esc(p.state)+'" data-printer-focus="'+esc(p.id)+'" aria-label="'+esc(p.name+', '+status)+
   '"><b class="printer-mini-name">'+esc(p.id)+'</b>'+printerGauge(p,true)+'<span class="printer-mini-state">'+esc(status)+'</span><small>'+esc(subtitle)+'</small></button>';
 }).join(''));
 const issue=printerLive?.error;
 $('printer-connection').textContent=printerLive?
  (printerLive.connected?'Verbindung zu Home Assistant aktiv · Statusabfrage alle 20 Sekunden':
   'Home Assistant nicht erreichbar: '+(issue||'Status unbekannt')+' · Es werden keine alten Werte angezeigt.') :
  'Druckerstatus wird geladen …';
 updateHTML($('printer-detail-grid'),rows.map(p=>{
  const state=printerStateLabels[p.state]||'Unbekannt';
  const active=p.state==='printing'||p.state==='paused'||p.state==='preparing';
  const temps=p.temps||{},layers=p.layers||{};
  const t=p.id==='Snapmaker U1'?
     [['Kopf T0',temps.head0],['Kopf T1',temps.head1],['Kopf T2',temps.head2],['Kopf T3',temps.head3],['Heizbett',temps.bed]]:
     [['Düse',temps.nozzle],['Düse links',temps.nozzle_left],['Düse rechts',temps.nozzle_right],['Heizbett',temps.bed],['Bauraum',temps.chamber]];
  const visible=t.filter(([key,v])=>v!==null&&v!==undefined||(p.id==='Snapmaker U1'&&key.includes('Kopf')));
  const slots=(p.ams||[]).filter(Boolean);
  return '<article class="printer-panel '+esc(p.state)+'" data-printer-panel="'+esc(p.id)+'">'+
   '<div class="printer-panel-head"><div><span class="eyebrow">'+(p.id==='Snapmaker U1'?'SNAPMAKER':'BAMBU LAB')+'</span><h3>'+esc(p.id)+'</h3></div>'+
   '<span class="printer-status-pill '+esc(p.state)+'">'+esc(state)+'</span></div>'+
   '<div class="printer-panel-top">'+printerGauge(p)+'<div class="printer-panel-main">'+
   '<b>'+esc(active?printerRemaining(p.remaining_seconds):p.state==='finished'?'Druck abgeschlossen':state)+'</b>'+
   '<span>'+esc(p.filename&&p.state!=='offline'?p.filename:p.configured?'Keine aktuelle Druckdatei':'Bitte Sensoren zuordnen')+'</span>'+
   (p.stage?'<small>Phase: '+esc(p.stage)+'</small>':'')+
   (p.active_tray?'<small>Aktives AMS: '+esc(p.active_tray)+'</small>':'')+'</div></div>'+
   '<div class="printer-metrics">'+
   printerLine('Schichten',layers.layer!=null&&layers.total_layers!=null?layers.layer+' / '+layers.total_layers:layers.layer!=null?layers.layer:'–')+
   visible.map(([label,value])=>printerLine(label,printerTemp(value))).join('')+
   '</div>'+
   (slots.length?'<div class="printer-trays"><b>AMS-Belegung</b><div class="printer-tray-grid">'+slots.map((slot,i)=>
    '<span class="printer-tray">'+(slot.color?'<i class="printer-tray-swatch" style="background:'+esc(slot.color)+'"></i>':'')+
    '<small>'+(i+1)+' · '+esc(slot.name)+(slot.material?' · '+esc(slot.material):'')+'</small></span>').join('')+'</div></div>':'')+
   '<div class="printer-panel-footer"><button type="button" class="secondary small" data-printer-config="'+esc(p.id)+'">'+
   (p.configured?'Sensorzuordnung bearbeiten':'Sensoren zuordnen')+'</button>'+
   (p.state==='setup'?'<small>'+(p.id.startsWith('P1S')&&(printerLive?.candidates||[]).some(c=>c.model==='P1S')?'P1S einmal zuordnen':'Kein Druckstatus erkannt · HA-Integration prüfen')+'</small>':'')+'</div></article>';
 }).join(''));
}
async function loadPrinters(force=false){
 if(printerLoading||document.hidden)return;
 printerLoading=true;
 try{printerLive=await api('printers'+(force?'?refresh=1':''));renderPrinterMonitor();}
 catch(err){printerLive={connected:false,error:err.message,printers:printerRows().map(p=>({...p,state:p.configured?'offline':'setup',progress:null,remaining_seconds:null}))};renderPrinterMonitor();}
 finally{printerLoading=false;}
}
function printerAutofill(){
 if(!printerConfigId)return;
 let count=0;
 const fields=[...document.querySelectorAll('#printer-config-fields input[data-printer-field]')];
 const prefix=printerConfigId==='H2D'?/(?:h2d)/i:printerConfigId==='A1 mini'?/(?:a1_mini|a1mini|a1 mini)/i:
  printerConfigId==='Snapmaker U1'?/(?:snapmaker|(?:^|_)u1(?:_|$))/i:
  printerConfigId==='P1S Old'?/(?:p1s.*old|p1s old)/i:/(?:p1s.*new|p1s new)/i;
 const aliases={
  status:['print_status','print_state'],progress:['print_progress','progress'],
  remaining:['remaining_time','time_remaining'],filename:['gcode_file','gcode_filename','filename','task_name'],
  nozzle:['nozzle_temperature','nozzle_temp'],nozzle_left:['left_nozzle_temperature','left_nozzle_temp'],
  nozzle_right:['right_nozzle_temperature','right_nozzle_temp'],bed:['bed_temperature','bed_temp'],
  chamber:['chamber_temperature','chamber_temp'],layer:['current_layer'],total_layers:['total_layer'],
  stage:['current_stage'],active_tray:['active_tray'],
  head0:['tool0_temperature','extruder_temperature','toolhead_0_temp'],
  head1:['tool1_temperature','extruder1_temperature','toolhead_1_temp'],
  head2:['tool2_temperature','extruder2_temperature','toolhead_2_temp'],
  head3:['tool3_temperature','extruder3_temperature','toolhead_3_temp'],
  ams1:['tray_1'],ams2:['tray_2'],ams3:['tray_3'],ams4:['tray_4']
 };
 for(const input of fields){
  if(input.value)continue;
  const endings=aliases[input.dataset.printerField]||[];
  const matches=printerEntities.filter(e=>prefix.test(e.id+' '+e.name) &&
    endings.some(term=>e.id.includes(term)||e.name.toLowerCase().replace(/\s+/g,'_').includes(term)));
  if(matches.length===1){input.value=matches[0].id;count++;}
 }
 $('printer-config-info').textContent=count?count+' passende Sensoren vorgeschlagen. Bitte Zuordnung prüfen.':
  'Keine eindeutigen Vorschläge. Bei zwei P1S bitte jeden Sensor manuell dem richtigen Gerät zuweisen.';
}

function availablePrinterCandidates(id){
 const model=id.startsWith('P1S')?'P1S':id;
 const used=new Set(Object.entries(printerLive?.bindings||{}).filter(([name,b])=>name!==id&&b?.status).map(([name,b])=>b.status));
 const configured=printerLive?.bindings?.[id]?.status;
 return (printerLive?.candidates||[]).filter(c=>c.model===model&&(!used.has(c.id)||c.id===configured));
}
function fillPrinterCandidate(candidate){
 if(!candidate)return;
 document.querySelectorAll('#printer-config-fields [data-printer-field]').forEach(input=>{
  input.value=candidate.entities?.[input.dataset.printerField]||'';
 });
 $('printer-config-info').textContent='Sensoren dieses Druckers übernommen. Jetzt auf „Zuordnung speichern“ klicken.';
}
function showPrinterCandidates(id,saved){
 const candidates=availablePrinterCandidates(id);
 const found=candidates.find(c=>c.id===saved.status);
 if(found){
  updateHTML($('printer-match'),'<div class="printer-match-ok"><strong>✓ Drucker erkannt</strong><span>'+esc(found.label)+'</span><small>Die Zuordnung ist gespeichert. Keine Sensoreingabe nötig.</small></div>');
  return;
 }
 if(!candidates.length){
  updateHTML($('printer-match'),'<div class="printer-match-warning"><strong>Kein Druckstatus-Sensor gefunden</strong><span>Home Assistant hat für '+esc(id)+' derzeit keinen erkennbaren Druckstatus. AMS-, Strom- oder Temperatur-Sensoren allein reichen nicht. Bitte die eigentliche Bambu-Lab- bzw. Snapmaker-U1-Integration in Home Assistant prüfen.</span></div>');
  return;
 }
 const isP1s=id.startsWith('P1S');
 const single=candidates.length===1&&!isP1s;
 updateHTML($('printer-match'),'<label class="printer-match-choice"><strong>'+(single?'Drucker gefunden':'Welches Gerät ist '+esc(id)+'?')+'</strong><select id="printer-device-choice"><option value="">Bitte auswählen …</option>'+
 candidates.map(c=>'<option value="'+esc(c.id)+'" '+(single?'selected':'')+'>'+esc(c.label+' · '+c.id)+'</option>').join('')+'</select><small>'+
 (isP1s?'Beide P1S müssen einmal anhand ihrer Gerätekennung Old/New zugeordnet werden.':'Die Sensoren dieses Druckers werden automatisch übernommen.')+
 '</small></label>');
 if(single)fillPrinterCandidate(candidates[0]);
}
$('printer-match').addEventListener('change',event=>{
 if(event.target.id!=='printer-device-choice')return;
 const c=availablePrinterCandidates(printerConfigId).find(c=>c.id===event.target.value);
 if(c)fillPrinterCandidate(c);
});

async function openPrinterConfig(id){
 if(!monitorPrinters.includes(id))return;
 printerConfigId=id;
 $('printer-config-title').textContent=id+' · HA-Sensoren';
 $('printer-config-dialog').showModal();
 const saved=printerLive?.bindings?.[id]||{};
 const relevant=monitorFields.filter(([field])=>id==='Snapmaker U1'?
  !['nozzle_left','nozzle_right','chamber'].includes(field):
  !['head0','head1','head2','head3'].includes(field));
 const quickFields=['status','progress','remaining','filename'];
 const fieldInput=([field,label])=>
  '<label>'+esc(label)+'<input type="text" spellcheck="false" autocomplete="off" maxlength="170" data-printer-field="'+esc(field)+'" list="printer-entity-options" placeholder="sensor.…" value="'+esc(saved[field]||'')+'"></label>';
 updateHTML($('printer-config-fields'),
  '<details class="printer-manual-fields"><summary>Manuelle Sensorzuordnung (nur bei Bedarf)</summary><div class="printer-config-quick">'+
  relevant.filter(([field])=>quickFields.includes(field)).map(fieldInput).join('')+
  '</div><details><summary>Weitere Sensoren (Temperaturen, AMS und Druckköpfe) – optional</summary>'+
  '<div class="printer-advanced-fields">'+relevant.filter(([field])=>!quickFields.includes(field)).map(fieldInput).join('')+'</div></details></details>');
 document.querySelectorAll('#printer-config-fields [data-printer-field]').forEach(input=>{input.value=saved[input.dataset.printerField]||'';});
 showPrinterCandidates(id,saved);
 $('printer-config-info').textContent='Die einzelnen Sensoren lassen sich bei Bedarf unter „Manuelle Sensorzuordnung“ anzeigen.';
 try{
  const response=await api('printer-entities');
  printerEntities=response.entities||[];
  updateHTML($('printer-entity-options'),printerEntities.map(e=>
   '<option value="'+esc(e.id)+'" label="'+esc(e.name)+'"></option>').join(''));
  if(!response.connected)$('printer-config-info').textContent=response.error||'Home Assistant ist nicht erreichbar.';
  else if(!saved.status&&!availablePrinterCandidates(id).length)$('printer-config-info').textContent='Kein passender Druckstatus gefunden. Prüfe die HA-Druckerintegration.';
 }catch(err){$('printer-config-info').textContent='Sensorliste nicht erreichbar: '+err.message;}
}
$('printer-strip-more').addEventListener('click',()=>showWorkspace('printers'));
$('printer-strip-row').addEventListener('click',event=>{
 const b=event.target.closest('[data-printer-focus]');
 if(b){showWorkspace('printers');const panel=[...document.querySelectorAll('[data-printer-panel]')].find(x=>x.dataset.printerPanel===b.dataset.printerFocus);panel?.scrollIntoView({behavior:'smooth',block:'nearest'});}
});
$('printer-detail-grid').addEventListener('click',event=>{
 const b=event.target.closest('[data-printer-config]');if(b)openPrinterConfig(b.dataset.printerConfig);
});
$('printer-refresh').addEventListener('click',()=>loadPrinters(true));
$('printer-suggest').addEventListener('click',printerAutofill);
$('printer-config-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(printerConfigBusy||!printerConfigId)return;
 printerConfigBusy=true;$('printer-config-save').disabled=true;
 const entities={};
 document.querySelectorAll('#printer-config-fields [data-printer-field]').forEach(input=>{entities[input.dataset.printerField]=input.value.trim();});
 if(!entities.status){flash('Kein Druckstatus-Sensor erkannt. Bitte zuerst die Druckerintegration in Home Assistant prüfen.',true);printerConfigBusy=false;$('printer-config-save').disabled=false;return;}
 try{
  await api('printer-config',{printer:printerConfigId,entities});
  $('printer-config-dialog').close();
  await loadPrinters(true);
  flash('Sensorzuordnung für '+printerConfigId+' gespeichert.');
 }catch(err){flash(err.message,true);}
 finally{printerConfigBusy=false;$('printer-config-save').disabled=false;}
});

load(true);loadPrintTools();loadPrinters();setInterval(()=>load(false),5000);
setInterval(()=>loadPrinters(),20000);
setInterval(refreshShippingDay,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShippingDay();});
