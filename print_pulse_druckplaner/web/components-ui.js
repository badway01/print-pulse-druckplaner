'use strict';
/* Optional component workflows. Loaded after app.js; existing stock paths stay intact. */
let componentEditorProduct=null;
const originalCatalog=renderCatalog;
const originalOrderCard=orderCard;
const originalOrderLineActions=orderLineActions;
const originalOrderNextAction=orderNextAction;
const originalOrderProgress=orderPrintProgress;
const originalProductCard=card;
// A product using parts must no longer look like 84 separate finished goods.
// The original variant stock remains stored and can be opened only on demand.
function componentPartOrders(productId){
 return (model?.orders||[]).flatMap(order=>(order.items||[]).filter(
  line=>String(line.listing_id)===String(productId)&&line.components_enabled));
}
function componentProductCard(p){
 const image=thumbnail(p.image);
 const parts=Array.isArray(p.components)?p.components:[];
 const lines=componentPartOrders(p.id);
 const legacy=p.items.filter(i=>i.on_hand!==null||Number(i.in_print)>0||Number(i.order_printing)>0);
 const oldInPrint=p.items.some(i=>Number(i.in_print)>0);
 const legacyOpen=expanded.has(p.id);
 const pendingOrders=lines.filter(i=>Number(i.remaining)>0).length;
 const legacyVariantPanel=legacy.length?`
  <div class="component-legacy">
   <button type="button" class="variant-toggle" data-expand="${esc(p.id)}" aria-expanded="${legacyOpen}">
    <span>Fertige Varianten (optional) · ${legacy.length} erfasst</span>
    <b>${legacyOpen?'−':'+'}</b>
   </button>
   ${legacyOpen?(p.items.length>1?variantPicker(p):variant(p,p.items[0])):''}
  </div>`:'';
 const partRows=parts.map(part=>{
  const stock=part.kind==='stock';
  const jobs=lines.flatMap(line=>line.components||[]).filter(job=>job.id===part.id);
  const missing=jobs.filter(job=>job.error).length;
  const running=jobs.reduce((n,job)=>n+(Number(job.printing)||0),0);
  const needed=jobs.reduce((n,job)=>n+Math.max(0,(Number(job.required)||0)-
   (stock?Number(job.booked)||0:(Number(job.printing)||0)+(Number(job.finished)||0))),0);
  const missingStock=stock?Math.max(0,needed-(Number(part.stock)||0)-(Number(part.printing_stock)||0)):0;
  return `<div class="component-card-part">
   <div class="component-card-part-text">
    <strong>${esc(part.name)}</strong>
    <small>${stock?'Gemeinsamer Vorrat für alle Varianten':
     'Erst nach Bestellung'+(part.property_name?' · '+esc(part.property_name):'')}
    </small>
    ${stock&&part.printing_stock?`<small class="component-card-printing">${part.printing_stock} im Druck</small>`:''}
    ${running?`<small class="component-card-printing">${running} im Auftragsdruck</small>`:''}
    ${needed?`<small>${needed} für offene Aufträge noch nicht ${stock?'zugeordnet':'zum Druck eingeplant'}</small>`:''}
    ${missingStock?`<small class="component-card-warning">${missingStock} Stück fehlen im Bauteilvorrat</small>`:''}
    ${missing?`<small class="component-card-warning">${missing} Auftrag/Aufträge mit unklarer Etsy-Variante</small>`:''}
   </div>
   <div class="component-card-qty ${stock?'is-stock':'is-demand'}">
    ${stock?`<strong>${Number(part.stock)||0} ×</strong><small>im Vorrat</small>`:
      '<span>Nach Auftrag</span>'}
   </div>
  </div>`;
 }).join('');
 return `<article class="product component-product" data-product="${esc(p.id)}">
  <div class="product-photo">
    ${image?`<img src="${esc(image)}" alt="${esc(p.title)}" loading="lazy" referrerpolicy="no-referrer">`:
      '<div class="placeholder">P<span>+</span>P<small>Produktbild folgt</small></div>'}
    <span class="etsy-total">Etsy-Menge <b>${p.etsy_qty??'–'}</b></span>
  </div>
  <div class="product-body">
   <span class="component-card-kicker">BAUTEILFERTIGUNG</span>
   <h2 title="${esc(p.title)}">${esc(p.title)}</h2>
   <div class="sales"><span><b>${p.sold7}</b> verkauft / 7 Tage</span>
    <span><b>${p.sold30}</b> / 30 Tage</span>
    ${p.state!=='active'?`<span>${esc(stateNames[p.state]||p.state)}</span>`:''}
   </div>
   ${notices([p.inventory_error,p.unmatched?`${p.unmatched} Stück ohne eindeutige Etsy-Variante. Bitte prüfen.`:'' ,p.review?`${p.review} Stück mit unklarem Zahlungsstatus. Bitte Etsy prüfen.`:'' ],'product-'+p.id)}
   <section class="component-card-panel" aria-label="Bauteilvorrat ${esc(p.title)}">
     <div class="component-card-panel-heading">
       <b>Bauteilvorrat</b>
       ${pendingOrders?`<small>${pendingOrders} offene Auftragsposition${pendingOrders===1?'':'en'}</small>`:
        '<small>Gemeinsam statt einzelner Etsy-Farbvarianten</small>'}
     </div>
     ${partRows||'<p class="component-card-empty">Noch keine Bauteile eingerichtet. Lege zuerst gemeinsame Vorratsteile und Teile nach Bestellung an.</p>'}
   </section>
   ${toolSummary(p)}
   <button type="button" class="primary component-card-manage" data-product-components-open="${esc(p.id)}">
    ${parts.length?'Bauteile / Vorrat bearbeiten':'Bauteile einrichten'}
   </button>
   ${legacyVariantPanel}
   ${oldInPrint?'<p class="hint">Bereits begonnene klassische Druckaufträge bleiben über die bisherige Druckverwaltung verfügbar.</p>':''}
   <div class="card-bottom">
    <span class="component-card-footer"><span class="dot"></span> Vorproduktion aktiv</span>
    <div class="badges">${p.bestseller?'<span class="badge best">Bestseller</span>':''}</div>
   </div>
  </div>
 </article>`;
}
card=function(p){
 return p.components_enabled?componentProductCard(p):originalProductCard(p);
};
$('products').addEventListener('click',event=>{
 const button=event.target.closest('[data-product-components-open]');
 if(button&&!busy)componentOpen(button.dataset.productComponentsOpen);
});


function componentReadyUnits(line){
 if(!line?.components_enabled||!Array.isArray(line.components)||!line.components.length||!line.remaining)return 0;
 if(line.components.some(x=>x.error||x.required<1))return 0;
 const units=Number(line.quantity)||0;
 if(units<1)return 0;
 return Math.max(0,Math.min(Number(line.remaining),
  ...line.components.map(part=>Math.floor(part.available/(part.required/units)))));
}
function componentButton(line,part,action,quantity,label){
 return '<button type="button" class="'+(action==='release'||action==='cancel'?'secondary':'primary')+
  '" data-component-tid="'+esc(line.transaction_id)+'" data-component-id="'+esc(part?.id||'')+
  '" data-component-action="'+esc(action)+'" data-component-qty="'+quantity+'">'+esc(label)+'</button>';
}
orderPrintProgress=function(o){
 return originalOrderProgress({...o,items:(o.items||[]).map(line=>({
  ...line,finished:(Number(line.finished)||0)+(Number(line.assembled)||0)
 }))});
};
function componentLegacyJob(line){
 // Existing prints/allocations created before switching the product to
 // component manufacturing must stay finishable in the classic workflow.
 return !line?.assembled&&(Number(line?.printing)||Number(line?.finished)||Number(line?.allocated));
}
orderNextAction=function(line){
 if(line?.components_enabled&&line.components?.length&&!componentLegacyJob(line))return null;
 return originalOrderNextAction(line);
};
orderCard=function(o){
 const html=originalOrderCard(o);
 if(o.items?.length!==1)return html;
 const line=o.items[0];
 if(!line.components_enabled||!line.item_id||componentLegacyJob(line))return html;
 const qty=componentReadyUnits(line);
 const action=qty?componentButton(line,null,'assemble',qty,'✓ '+qty+' × Montiert'):
  '<button type="button" class="primary order-print" data-order-open="'+esc(o.id)+'">Bauteile ›</button>';
 return html.replace('<div class="order-card-actions">',
  '<div class="order-card-actions">'+action);
};
function componentLineHTML(line){
 if(!line.components?.length){
  return '<p class="hint">Vorproduktion ist eingeschaltet. Bitte zuerst im Produktkatalog Bauteile anlegen.</p>';
 }
 const rows=line.components.map(part=>{
  const notReady=part.kind==='stock'
   ?Math.max(0,part.required-part.booked)
   :Math.max(0,part.required-part.printing-part.finished);
  const available=part.kind==='stock'?Math.min(notReady,part.stock):notReady;
  const readyText=part.kind==='stock'
   ?part.available+' reserviert · '+part.stock+' frei im Bauteillager'
   :part.available+' fertig · '+part.printing+' im Druck';
  let buttons='';
  if(!part.error){
   if(part.kind==='stock'){
    if(available>0)buttons+=componentButton(line,part,'book',available,available+' × Aus Bauteillager');
    if(part.booked>part.consumed)buttons+=componentButton(line,part,'release',part.booked-part.consumed,'Zurück ins Lager');
   }else{
    if(notReady>0)buttons+=componentButton(line,part,'start',notReady,notReady+' × Drucken');
    if(part.printing>0){
     buttons+=componentButton(line,part,'finish',part.printing,'✓ '+part.printing+' × Fertig');
     buttons+=componentButton(line,part,'cancel',part.printing,'Fehldruck / Abbruch');
    }
   }
  }
  return '<div class="component-order-piece"><strong>'+esc(part.name+(part.label?' · '+part.label:''))+'</strong>'+
   '<small>'+part.required+' benötigt · '+esc(readyText)+'</small>'+
   (part.error?'<small class="component-error">'+esc(part.error)+'</small>':'')+
   '<div class="component-order-buttons">'+buttons+'</div></div>';
 }).join('');
 const ready=componentReadyUnits(line);
 return '<div class="component-order-list"><small>Bauteile für diese Bestellung · '+(line.assembled||0)+' montiert</small>'+
  rows+(ready?componentButton(line,null,'assemble',ready,'✓ '+ready+' × Produkt montiert – fertig'):
   '<small>Montage nach Bereitstellung aller Bauteile abschließen.</small>')+'</div>';
}
orderLineActions=function(line){
 if(line.components_enabled&&line.item_id&&!componentLegacyJob(line))return componentLineHTML(line);
 return originalOrderLineActions(line);
};
renderCatalog=function(){
 if(!model)return;
 const shell=$('catalog-rows');if(!shell)return;
 const search=$('catalog-search').value.trim().toLocaleLowerCase('de');
 const rows=model.products.filter(p=>p.state==='active'&&p.title.toLocaleLowerCase('de').includes(search));
 updateHTML(shell,rows.length?rows.map(p=>{
  const files=printTools.files.filter(f=>f.listing_id===p.id).length;
  const profiles=printTools.profiles.filter(f=>f.listing_id===p.id).length;
  const enabled=Boolean(p.components_enabled);
  const img=thumbnail(p.image);
  return '<article class="catalog-item" data-catalog-item="'+esc(p.id)+'">'+
   (img?'<img src="'+esc(img)+'" alt="" loading="lazy">':'<div class="catalog-placeholder">P+</div>')+
   '<div class="catalog-identity"><b>'+esc(p.title)+'</b><small>'+files+' Masterdatei(en) · '+profiles+
   ' Druckprofil(e)'+(enabled?' · '+(p.components||[]).length+' Bauteil(e)':'')+'</small></div>'+
   '<div class="catalog-component-controls"><label class="catalog-part-switch">'+
   '<input type="checkbox" role="switch" aria-label="Vorproduktion für '+esc(p.title)+'" data-components-toggle="'+esc(p.id)+'" '+(enabled?'checked':'')+'>'+
   '<span>Vorproduktion verwenden</span></label>'+
   (enabled?'<button type="button" class="secondary small" data-components-open="'+esc(p.id)+'">Bauteile verwalten</button>':'')+
   '</div><button type="button" class="secondary small" data-master-open="'+esc(p.id)+'">3MF &amp; Belegung</button></article>';
 }).join(''):'<p class="hint">Kein aktives Produkt passt zur Suche.</p>');
};
function componentKindChange(){
 const stock=$('components-kind').value==='stock';
 $('components-property-wrap').hidden=stock;
 $('components-target-wrap').hidden=!stock;
 if(stock)$('components-property').value='';
}
function componentReset(){
 $('components-form').reset();
 $('components-id').value='';
 $('components-units').value='1';
 $('components-target').value='0';
 $('components-form-title').textContent='+ Bauteil hinzufügen';
 componentKindChange();
}
function componentRenderEditor(){
 const p=model?.products.find(x=>x.id===componentEditorProduct);
 if(!p)return;
 $('components-title').textContent='Bauteile · '+p.title;
 const parts=p.components||[];
 updateHTML($('components-list'),parts.length?parts.map(part=>
  '<div class="component-management-row" data-component-row="'+esc(part.id)+'">'+
  '<div class="component-management-name"><strong>'+esc(part.name)+'</strong>'+
  '<small>'+(part.kind==='stock'?'Vorratsbauteil':'Nach Bestellung')+
  (part.property_name?' · '+esc(part.property_name):'')+
  (part.quantity_property?' · Set: '+esc(part.quantity_property):'')+
  ' · '+part.units+' je Einheit'+(part.kind==='stock'&&part.target_stock?' · Auffüllziel '+part.target_stock:'')+'</small></div>'+
  (part.kind==='stock'?'<label>Im Lager<input type="number" min="0" max="100000" step="1" inputmode="numeric"'+
   ' value="'+part.stock+'" data-component-count="'+esc(part.id)+'" aria-label="Bauteilbestand"></label>'+
   '<button type="button" class="secondary small" data-component-stock-save="'+esc(part.id)+'">Bestand speichern</button>'+
   '<div class="component-batch-actions"><small>'+part.printing_stock+' im Druck</small>'+
   '<button type="button" class="secondary small" data-component-batch="stock-print" data-batch-id="'+esc(part.id)+'">+ Im Druck</button>'+
   (part.printing_stock?'<button type="button" class="primary small" data-component-batch="stock-finish" data-batch-id="'+esc(part.id)+'">✓ Fertig</button>'+
    '<button type="button" class="text-button small" data-component-batch="stock-cancel" data-batch-id="'+esc(part.id)+'">Abbruch</button>':'')+
   '</div>':
   '<span class="component-demand-note">Nach Auftrag</span>')+
  '<button type="button" class="secondary small" data-component-edit="'+esc(part.id)+'">Bearbeiten</button>'+
  '<button type="button" class="text-button" data-component-delete="'+esc(part.id)+'">Entfernen</button></div>'
 ).join(''):'<p class="hint">Noch keine Bauteile. Beispiel: Geist Weiß als Vorrat und Buch als Bauteil nach Bestellung.</p>');
}
function componentOpen(id){
 if(!model?.products.some(x=>x.id===id))return;
 componentEditorProduct=id;
 componentReset();
 componentRenderEditor();
 $('components-editor').showModal();
}
$('catalog-rows').addEventListener('change',async event=>{
 const t=event.target.closest('[data-components-toggle]');
 if(!t||busy)return;
 const enabled=t.checked;
 const saved=await mutate('components',{action:'toggle',listing_id:t.dataset.componentsToggle,enabled});
 if(!saved)t.checked=!enabled;
});
$('catalog-rows').addEventListener('click',event=>{
 const t=event.target.closest('[data-components-open]');
 if(t&&!busy)componentOpen(t.dataset.componentsOpen);
});
$('components-kind').addEventListener('change',componentKindChange);
$('components-reset').addEventListener('click',componentReset);
$('components-list').addEventListener('click',async event=>{
 if(busy||!componentEditorProduct)return;
 const p=model.products.find(x=>x.id===componentEditorProduct);
 const edit=event.target.closest('[data-component-edit]');
 const del=event.target.closest('[data-component-delete]');
 const save=event.target.closest('[data-component-stock-save]');
 const batch=event.target.closest('[data-component-batch]');
 if(batch){
  const part=p?.components.find(x=>x.id===batch.dataset.batchId);
  if(!part||part.kind!=='stock')return;
  const action=batch.dataset.componentBatch;
  const defaultCount=action==='stock-print'?Math.max(1,Math.min(100,Math.max(0,(part.target_stock||0)-(part.stock||0)-(part.printing_stock||0)))):part.printing_stock;
  const response=prompt(action==='stock-print'?'Wie viele „'+part.name+'“ nimmst du jetzt in Druck?':
    action==='stock-finish'?'Wie viele „'+part.name+'“ wurden erfolgreich gedruckt?':
    'Wie viele laufende Bauteildrucke wurden abgebrochen?',String(defaultCount));
  if(response===null)return;
  const qty=Number(response);
  if(!Number.isSafeInteger(qty)||qty<1||qty>100000||(action!=='stock-print'&&qty>part.printing_stock)){
   flash('Bitte eine gültige Druckmenge eingeben.',true);return;
  }
  if(await mutate('components',{action,listing_id:componentEditorProduct,id:part.id,quantity:qty})){
   componentRenderEditor();flash('Bauteildruck aktualisiert.');
  }
  return;
 }
 if(edit){
  const part=p?.components.find(x=>x.id===edit.dataset.componentEdit);
  if(!part)return;
  $('components-id').value=part.id;
  $('components-name').value=part.name;
  $('components-kind').value=part.kind;
  componentKindChange();
  $('components-property').value=part.property_name||'';
  $('components-quantity-property').value=part.quantity_property||'';
  $('components-units').value=part.units;
  $('components-target').value=part.target_stock||0;
  $('components-form-title').textContent='Bauteil bearbeiten';
  $('components-name').focus();
 }else if(del){
  const part=p?.components.find(x=>x.id===del.dataset.componentDelete);
  if(!part||!confirm('Bauteil „'+part.name+'“ wirklich löschen?'))return;
  if(await mutate('components',{action:'delete',listing_id:componentEditorProduct,id:part.id})){
   componentReset();componentRenderEditor();
  }
 }else if(save){
  const id=save.dataset.componentStockSave;
  const input=[...$('components-list').querySelectorAll('[data-component-count]')].find(x=>x.dataset.componentCount===id);
  const stock=Number(input?.value);
  if(!Number.isSafeInteger(stock)||stock<0||stock>100000){flash('Ungültiger Bauteilbestand.',true);return;}
  const previous=p?.components.find(part=>part.id===id);
  if(!previous)return;
  if(await mutate('components',{action:'stock',listing_id:componentEditorProduct,id,stock,
    expected_stock:previous.stock})){
   componentRenderEditor();flash('Bauteilbestand gespeichert.');
  }
 }
});
$('components-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(busy||!componentEditorProduct)return;
 const data={action:'save',listing_id:componentEditorProduct,id:$('components-id').value,
  name:$('components-name').value,kind:$('components-kind').value,
  property_name:$('components-property').value,
  quantity_property:$('components-quantity-property').value,
  units:Number($('components-units').value),target_stock:Number($('components-target').value||0)};
 if(await mutate('components',data)){componentReset();componentRenderEditor();}
});
async function componentOrderAction(button){
 if(busy)return;
 const job=findOrderJob(button.dataset.componentTid);
 const action=button.dataset.componentAction;
 let count=Number(button.dataset.componentQty);
 if(!job||!Number.isSafeInteger(count)||count<1)return;
 // A partial successful print must never be counted as a fully finished batch.
 if(count>1&&['finish','cancel','assemble'].includes(action)){
  const label=action==='finish'?'Wie viele Bauteile sind erfolgreich gedruckt?':
    action==='cancel'?'Wie viele Bauteile sind fehlgeschlagen oder abgebrochen?':
    'Wie viele vollständige Produkte sind montiert und geprüft?';
  const chosen=prompt(label,String(count));
  if(chosen===null)return;
  const value=Number(chosen);
  if(!Number.isSafeInteger(value)||value<1||value>count){
   flash('Bitte eine ganze Menge zwischen 1 und '+count+' eingeben.',true);return;
  }
  count=value;
 }
 if(action==='assemble'&&!confirm(count+' Produkt(e) zusammengesetzt und geprüft?'))return;
 if(action==='finish'&&!confirm(count+' Bauteil(e) erfolgreich gedruckt?'))return;
 const saved=await mutate('components',{action,transaction_id:button.dataset.componentTid,
  component_id:button.dataset.componentId,quantity:count});
 if(saved&&$('order-details').open&&$('order-details').dataset.orderId===job.receiptId){
  showOrder(job.receiptId);
 }
}
$('orders').addEventListener('click',async event=>{
 const b=event.target.closest('[data-component-tid]');
 if(b){event.stopImmediatePropagation();await componentOrderAction(b);}
},true);
$('order-details-content').addEventListener('click',async event=>{
 const b=event.target.closest('[data-component-tid]');
 if(b){event.stopImmediatePropagation();await componentOrderAction(b);}
},true);


/* v0.11.42: low-noise transaction history, in Settings only. */
let auditLoading=false;
const auditFields={
 stock:'Bestand',printing:'Im Druck',minimum:'Minimum',booked:'Reserviert',
 finished:'Fertig',allocated:'Aus Lager',assembled:'Montiert',
 consumed:'Verbraucht',target:'Auffüllziel',status:'Etsy-Status'
};
function auditText(value){
 return value===null||value===undefined?'nicht erfasst':String(value);
}
async function loadAudit(){
 if(auditLoading)return;
 auditLoading=true;
 const area=$('audit-rows');
 updateHTML(area,'<p class="hint">Buchungen werden geladen …</p>');
 try{
  const data=await api('audit?limit=80');
  const events=Array.isArray(data.events)?data.events:[];
  updateHTML(area,events.length?events.map(entry=>{
   const date=new Date((Number(entry.created)||0)*1000).toLocaleString('de-DE',
    {dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'});
   const changes=(entry.changes||[]).map(change=>
    '<span class="audit-difference">'+esc(auditFields[change.field]||change.field)+': '+
    esc(auditText(change.before))+' → '+esc(auditText(change.after))+
    (change.delta?' ('+esc(change.delta)+')':'')+'</span>').join('');
   return '<div class="audit-row"><div class="audit-title"><strong>'+esc(entry.title)+
    '</strong><small>'+esc(date)+' · '+esc(entry.category)+'</small></div>'+
    '<div class="audit-changes">'+(changes||esc(entry.action))+'</div></div>';
  }).join(''):'<p class="hint">Noch keine Buchungen erfasst. Neue Bestandsbewegungen werden ab diesem Update protokolliert.</p>');
 }catch(err){
  updateHTML(area,'<p class="hint">Buchungen konnten nicht geladen werden: '+esc(err.message)+'</p>');
 }finally{auditLoading=false;}
}
$('audit-panel').addEventListener('toggle',event=>{
 if(event.target.open)loadAudit();
});
$('audit-refresh').addEventListener('click',loadAudit);
