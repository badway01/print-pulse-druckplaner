'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model=null,filter='all',busy=false,polling=false,sortTimer=null,quantityContext=null;
let order=[];
let orderSort='ship';
let workspace='production',filamentView='colors',filamentData=null,filamentBusy=false,filamentLoading=false;
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
 <div class="print-row"><button class="secondary small" data-action="printing" data-id="${esc(i.id)}" ${unknown?'disabled':''}>+ Im Druck ${i.in_print?`(${i.in_print})`:''}</button>${i.in_print>(i.order_printing||0)?`<button class="primary small" data-action="finish" data-id="${esc(i.id)}">Fertig</button><button class="text-button small" data-action="cancel" data-id="${esc(i.id)}">Abbruch</button>`:''}<button class="text-button small minimum" data-action="minimum" data-id="${esc(i.id)}">Minimum ${i.minimum}</button></div>${i.order_printing?`<p class="hint">Davon ${i.order_printing} für Etsy-Aufträge · Fertigmelden in der Bestellung.</p>`:''}
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
 ${own?`<div><button class="secondary" data-product-print="${esc(p.id)}" data-print-action="finish">Fertig (frei)</button><button class="text-button" data-product-print="${esc(p.id)}" data-print-action="cancel">Abbruch (frei)</button></div>`:''}
 ${jobs.map(j=>`<div class="order-job"><small>Auftrag #${esc(j.receipt_id)} · ${j.printing} × ${esc(j.label)}${j.status==='shipped'?' · bereits versendet':''}</small><div><button class="secondary" data-order-job="${esc(j.transaction_id)}" data-job-action="finish">Fertig</button><button class="text-button" data-order-job="${esc(j.transaction_id)}" data-job-action="cancel">Abbruch</button></div></div>`).join('')}</div>`:''}</div>`;
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

function render(){if(!model)return;
 openNotices=new Set([...document.querySelectorAll('[data-notice-key][open]')].map(el=>el.dataset.noticeKey));
 const products=model.products.filter(p=>p.state==='active');
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
 document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));
 const search=$('search').value.trim().toLocaleLowerCase('de');
 const selected=order.map(id=>products.find(p=>p.id===id)).filter(Boolean).filter(p=>(filter!=='need'||p.need>0||p.unmatched>0)&&(filter!=='printing'||p.items.some(i=>i.in_print>0))&&(filter!=='uncounted'||p.uninitialized>0)).filter(p=>(p.title+' '+p.items.map(i=>i.label).join(' ')).toLocaleLowerCase('de').includes(search));
 const focus=document.activeElement,focusId=focus?.dataset.id,focusAction=focus?.dataset.action,delta=focus?.dataset.delta;
 updateHTML($('products'),selected.length?selected.map(card).join(''):`<div class="empty"><h2>${products.length?'Hier ist alles erledigt.':'Dein Lager startet hier.'}</h2><p>${products.length?'Kein Produkt passt zu dieser Auswahl.':'Etsy verbinden, Produkte laden und einmal deine echten Bestände zählen.'}</p></div>`);
 if(focusId){const next=[...document.querySelectorAll('[data-action]')].find(b=>b.dataset.id===focusId&&b.dataset.action===focusAction&&b.dataset.delta===delta);next?.focus({preventScroll:true});}
}

const filamentMoney=cents=>cents===null||cents===undefined?'Preis offen':(cents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const filamentSpoolCart='<svg class="spool-cart" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h3l3 16h18l3-11H8"/><circle cx="13" cy="27" r="2"/><circle cx="25" cy="27" r="2"/><circle cx="18" cy="13" r="5"/><circle cx="18" cy="13" r="2"/></svg>';
function filamentLine(f,inCart){
 const name=esc(f.brand)+' · '+esc(f.color);
 const swatch=`<span class="filament-swatch" style="background:${esc(f.color_hex)}" aria-hidden="true"></span>`;
 const intro=`<div class="filament-identity">${swatch}<div><strong>${esc(f.color)}</strong><small>${esc(f.brand)} · ${esc(f.material)}</small></div></div>`;
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
 const visible=filamentView==='cart'?cart:rows.filter(f=>(f.brand+' '+f.color+' '+f.material).toLocaleLowerCase('de').includes(query));
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
 $('filament-shell').hidden=production;
 if(!production)loadFilaments();
}
function openFilamentEditor(id){
 const f=(filamentData?.filaments||[]).find(x=>x.id===id);
 const form=$('filament-form');form.reset();
 form.elements.id.value=f?.id||'';
 for(const name of ['brand','color','material','color_hex','stock_qty','purchase_url']){
  form.elements[name].value=f?f[name]:(name==='color_hex'?'#ffffff':name==='material'?'PLA':name==='stock_qty'?0:'');
 }
 form.elements.price.value=f&&f.price_cents!==null?(f.price_cents/100).toFixed(2).replace('.',','):'';
 $('filament-title').textContent=f?'Filament bearbeiten':'Filament anlegen';
 $('filament-delete').hidden=!f;
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
$('settings-open').addEventListener('click',()=>{if(!model)return;$('days').value=model.days;$('settings').showModal();});
$('settings-form').addEventListener('submit',async event=>{event.preventDefault();try{setModel(await api('settings',{days:Number($('days').value)}),true);$('settings').close();flash('Vorratsziel gespeichert.');}catch(err){flash(err.message,true);}});
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
$('filament-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(filamentBusy)return;
 const values=Object.fromEntries(new FormData(event.target).entries());
 const payload={action:'save',id:values.id?Number(values.id):null,brand:values.brand,color:values.color,material:values.material,color_hex:values.color_hex,stock_qty:Number(values.stock_qty),price:values.price.trim(),purchase_url:values.purchase_url};
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

load(true);setInterval(()=>load(false),5000);
setInterval(refreshShippingDay,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshShippingDay();});
