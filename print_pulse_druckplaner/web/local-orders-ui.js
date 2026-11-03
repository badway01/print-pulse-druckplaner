'use strict';
/* Local orders are stored separately from Etsy. All inventory-affecting
   operations are confirmed by the same transactional Home Assistant backend. */
let localDraft=[],localMode='create',localEditingId='',localRequestKey='',localSaving=false;
function localCatalog(){return (model?.products||[]).filter(p=>
 ['active','sold_out'].includes(p.state)&&Array.isArray(p.items)&&p.items.some(i=>i.enabled));}
function localProduct(id){return localCatalog().find(p=>String(p.id)===String(id));}
function localDate(days=3){
 const date=new Date(Date.now()+days*86400000);
 return date.toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
}
function localEmptyLine(){
 return {listing_id:'',item_id:'',search:'',quantity:1,color:'',personalization:'',note:''};
}
function localIdempotencyKey(){
 return 'LOK-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+
   '-'+Math.random().toString(36).slice(2);
}
function localLineHTML(line,index){
 const product=localProduct(line.listing_id);
 const options=product?(product.items||[]).filter(i=>i.enabled):[];
 return '<section class="local-position" data-local-row="'+index+'">'+
  '<div class="local-position-heading"><b>Position '+(index+1)+'</b>'+
   (localDraft.length>1?'<button type="button" class="text-button" data-local-remove="'+index+'">Entfernen</button>':'')+'</div>'+
  '<div class="local-search-wrap"><label for="local-search-'+index+'">Produkt suchen</label>'+
   '<input id="local-search-'+index+'" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" data-local-search="'+index+'" placeholder="z. B. Vase …" value="'+esc(product?.title||line.search)+'" role="combobox" aria-autocomplete="list" aria-controls="local-suggestions-'+index+'" aria-expanded="false">'+
   '<div id="local-suggestions-'+index+'" class="local-suggestions" data-local-suggestions="'+index+'" role="listbox" hidden></div></div>'+
  (product?'<label>Variante / Größe<select data-local-variant="'+index+'" required>'+
    options.map(i=>'<option value="'+esc(i.id)+'" '+(String(i.id)===String(line.item_id)?'selected':'')+'>'+esc(i.label||'Standard')+'</option>').join('')+
    '</select></label>':'<p class="hint">Produkt aus den Vorschlägen auswählen, dann erscheinen die Varianten.</p>')+
  '<div class="local-fields"><label>Stückzahl<input data-local-quantity="'+index+'" type="number" inputmode="numeric" min="1" max="1000" required value="'+esc(line.quantity)+'"></label>'+
   '<label>Wunschfarbe / Sonderfarbe (optional)<input data-local-color="'+index+'" maxlength="100" placeholder="z. B. Jadeweiß" value="'+esc(line.color)+'"></label></div>'+
  '<label>Gravur / Name / Personalisierung (optional)<textarea data-local-personalization="'+index+'" maxlength="600" rows="2" placeholder="z. B. Name, Gravurtext, Schriftart">'+esc(line.personalization)+'</textarea></label>'+
  '<label>Hinweis zu dieser Position (optional)<textarea data-local-note="'+index+'" maxlength="600" rows="2" placeholder="z. B. Holzständer, Wunschdetails">'+esc(line.note)+'</textarea></label>'+
  '</section>';
}
function localRenderLines(){
 $('local-order-lines').innerHTML=localDraft.map(localLineHTML).join('');
}
function localHideSuggestions(index){
 const root=$('local-order-lines');
 const host=root.querySelector('[data-local-suggestions="'+index+'"]');
 const field=root.querySelector('[data-local-search="'+index+'"]');
 if(host)host.hidden=true;
 if(field)field.setAttribute('aria-expanded','false');
}
function localSuggestions(index){
 const line=localDraft[index],host=$('local-order-lines').querySelector('[data-local-suggestions="'+index+'"]');
 if(!host||!line)return;
 const query=line.search.trim().toLocaleLowerCase('de');
 if(!query){localHideSuggestions(index);host.innerHTML='';return;}
 const list=localCatalog().filter(p=>p.title.toLocaleLowerCase('de').includes(query)).slice(0,8);
 host.innerHTML=list.map(p=>'<button type="button" role="option" class="local-suggestion" data-local-choose="'+index+'" data-local-choice="'+esc(p.id)+'">'+esc(p.title)+'</button>').join('')||
  '<span class="hint">Kein passendes Produkt gefunden.</span>';
 host.hidden=false;
 const field=$('local-order-lines').querySelector('[data-local-search="'+index+'"]');
 if(field)field.setAttribute('aria-expanded','true');
}
function localNew(){
 if(!model)return;
 localMode='create';localEditingId='';localRequestKey=localIdempotencyKey();
 localDraft=[localEmptyLine()];
 $('local-order-form').reset();
 $('local-order-title').textContent='Lokale Bestellung anlegen';
 $('local-order-save').textContent='Bestellung speichern';
 $('local-due').value=localDate(3);
 $('local-due').min=localDate(0);
 $('local-fulfillment').value='pickup';
 $('local-order-type').hidden=false;
 $('local-lines-section').hidden=false;
 $('local-form-error').hidden=true;
 localRenderLines();
 $('local-order-dialog').showModal();
 $('local-customer').focus();
}
function localEdit(id){
 const order=(model?.orders||[]).find(o=>String(o.id)===String(id)&&o.source==='local');
 if(!order)return;
 localMode='update';localEditingId=String(order.id);
 $('local-order-form').reset();
 $('local-order-title').textContent='Lokalen Auftrag bearbeiten';
 $('local-order-save').textContent='Bestelldaten speichern';
 $('local-customer').value=order.customer;
 $('local-due').value=new Date(order.ship_by*1000).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
 $('local-due').min=localDate(0);
 $('local-fulfillment').value=order.fulfillment||'pickup';
 $('local-notes').value=order.notes||'';
 $('local-order-type').hidden=true;
 $('local-lines-section').hidden=true;
 $('local-form-error').hidden=true;
 $('order-details').close();
 $('local-order-dialog').showModal();
}
$('local-order-new').addEventListener('click',localNew);
$('local-add-line').addEventListener('click',()=>{
 if(localDraft.length>=25){flash('Maximal 25 Positionen je Auftrag.',true);return;}
 localDraft.push(localEmptyLine());localRenderLines();
 const field=$('local-order-lines').querySelector('[data-local-search="'+(localDraft.length-1)+'"]');
 field?.focus();
});
$('local-order-lines').addEventListener('input',event=>{
 const field=event.target;
 const names={'localQuantity':'quantity','localColor':'color',
   'localPersonalization':'personalization','localNote':'note'};
 for(const [attribute,name] of Object.entries(names)){
  if(field.dataset[attribute]!==undefined){
   const i=Number(field.dataset[attribute]);if(!localDraft[i])return;
   localDraft[i][name]=name==='quantity'?Number(field.value):field.value;
   return;
  }
 }
 if(field.dataset.localSearch!==undefined){
  const i=Number(field.dataset.localSearch);if(!localDraft[i])return;
  localDraft[i].search=field.value;
  const product=localProduct(localDraft[i].listing_id);
  if(product?.title!==field.value){
   localDraft[i].listing_id='';localDraft[i].item_id='';
  }
  localSuggestions(i);
 }
});
$('local-order-lines').addEventListener('change',event=>{
 if(event.target.dataset.localVariant===undefined)return;
 const i=Number(event.target.dataset.localVariant);
 if(localDraft[i])localDraft[i].item_id=event.target.value;
});
function localPickSuggestion(choose){
 if(!choose)return;
 const i=Number(choose.dataset.localChoose),p=localProduct(choose.dataset.localChoice);
 if(!localDraft[i]||!p)return;
 localDraft[i].listing_id=String(p.id);
 localDraft[i].item_id=String(p.items.find(item=>item.enabled)?.id||'');
 localDraft[i].search=p.title;
 $('local-form-error').hidden=true;
 localRenderLines();
 $('local-order-lines').querySelector('[data-local-variant="'+i+'"]')?.focus();
}
// iPhone/Safari blurs the search before the click. Resolve taps on pointerup.
let localSuggestionPress=null;
$('local-order-lines').addEventListener('pointerdown',event=>{
 const choice=event.target.closest('[data-local-choose]');
 localSuggestionPress=choice?{
  pointerId:event.pointerId,index:choice.dataset.localChoose,
  choice:choice.dataset.localChoice,x:event.clientX,y:event.clientY
 }:null;
});
$('local-order-lines').addEventListener('pointerup',event=>{
 const press=localSuggestionPress;
 localSuggestionPress=null;
 if(!press||press.pointerId!==event.pointerId)return;
 if(Math.abs(event.clientX-press.x)>12||Math.abs(event.clientY-press.y)>12)return;
 const choice=event.target.closest('[data-local-choose]');
 if(choice&&choice.dataset.localChoose===press.index&&choice.dataset.localChoice===press.choice)
  localPickSuggestion(choice);
});
$('local-order-lines').addEventListener('pointercancel',()=>{localSuggestionPress=null;});
$('local-order-lines').addEventListener('click',event=>{
 const remove=event.target.closest('[data-local-remove]');
 if(remove){localDraft.splice(Number(remove.dataset.localRemove),1);localRenderLines();return;}
 localPickSuggestion(event.target.closest('[data-local-choose]'));
});
$('local-order-lines').addEventListener('keydown',event=>{
 if(event.key!=='Enter'||event.target.dataset.localSearch===undefined)return;
 event.preventDefault();
 const i=event.target.dataset.localSearch;
 localPickSuggestion($('local-order-lines').querySelector('[data-local-suggestions="'+i+'"] [data-local-choose]'));
});
$('local-order-lines').addEventListener('focusout',event=>{
 if(event.target.dataset.localSearch===undefined)return;
 const i=event.target.dataset.localSearch;
 if(event.relatedTarget?.closest('[data-local-suggestions="'+i+'"]'))return;
 setTimeout(()=>{
  if(localSuggestionPress?.index===i)return;
  const root=$('local-order-lines');
  const host=root.querySelector('[data-local-suggestions="'+i+'"]');
  if(host&&!host.contains(document.activeElement))localHideSuggestions(i);
 },120);
});
$('local-order-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(localSaving)return;
 const error=$('local-form-error');
 error.hidden=true;
 const meta={customer:$('local-customer').value,fulfillment:$('local-fulfillment').value,
  due_date:$('local-due').value,notes:$('local-notes').value};
 let body;
 if(localMode==='create'){
  const invalidIndex=localDraft.findIndex(line=>!localProduct(line.listing_id)||
     !localProduct(line.listing_id)?.items.some(i=>String(i.id)===String(line.item_id)&&i.enabled));
   if(invalidIndex!==-1){
    error.textContent='Bitte für Position '+(invalidIndex+1)+' ein Produkt aus den Vorschlägen und die passende Variante auswählen.';
    error.hidden=false;
    $('local-order-lines').querySelector('[data-local-search="'+invalidIndex+'"]')?.focus();
    return;
   }
   const direct=$('local-order-type').querySelector('input[name="local-kind"]:checked')?.value==='direct';
  body={...meta,action:'create',request_key:localRequestKey,direct_sale:direct,
   lines:localDraft.map(line=>({listing_id:line.listing_id,item_id:line.item_id,
    quantity:line.quantity,color:line.color,personalization:line.personalization,note:line.note}))};
 }else body={...meta,action:'update',id:localEditingId};
 localSaving=true;
 $('local-order-save').disabled=true;
 try{
  const result=await api('local-order',body);
  setModel(result.overview);
  $('local-order-dialog').close();
  flash(result.result.status==='completed'?'Direktverkauf gebucht.':'Lokale Bestellung gespeichert.');
 }catch(err){
  error.textContent=err.message;error.hidden=false;
 }finally{localSaving=false;$('local-order-save').disabled=false;}
});
async function localAction(data){
 if(localSaving||busy)return;
 localSaving=true;
 try{
  const result=await api('local-order',data);
  setModel(result.overview);
  if(data.action==='custom-job'&&$('order-details').open&&$('order-details').dataset.orderId)
    showOrder($('order-details').dataset.orderId);
  flash(data.action==='handover'||data.action==='complete'?'Übergabe dokumentiert.':
   data.action==='undo-handover'?'Übergabe rückgängig gemacht.':
   data.action==='cancel'&&data.transaction_id===undefined?
   'Lokale Bestellung storniert.':'Produktionsstand gespeichert.');
  if(data.action==='handover'||data.action==='complete'||data.action==='cancel'&&!data.transaction_id)
   $('order-details').close();
 }catch(err){flash(err.message,true);}
 finally{localSaving=false;}
}
async function localCustomProductionClick(action){
  const available=Number(action.dataset.localCustomQuantity);
  if(!Number.isSafeInteger(available)||available<1)return;
  const type=action.dataset.localType;
  // Mark only the units actually started/finished. On a 2-piece order,
  // printing one must never silently commit both pieces.
  let qty=available;
  if(available>1){
   const question=type==='start'?'Wie viele Stück nimmst du jetzt in Druck?':
    type==='finish'?'Wie viele Stück sind wirklich fertig?':
    'Wie viele laufende Stücke möchtest du abbrechen?';
   const answer=prompt(question+' (1–'+available+')','1');
   if(answer===null)return;
   qty=Number(answer);
   if(!Number.isSafeInteger(qty)||qty<1||qty>available){
    flash('Bitte eine ganze Stückzahl von 1 bis '+available+' eingeben.',true);return;
   }
  }
  await localAction({action:'custom-job',transaction_id:action.dataset.localCustomAction,
   action_type:type,quantity:qty});
  return;
}
$('order-details-content').addEventListener('click',async event=>{
 const handover=event.target.closest('[data-local-handover]');
 if(handover){localHandoverOpen(handover.dataset.localHandover);return;}
 const action=event.target.closest('[data-local-custom-action]');
 if(action){await localCustomProductionClick(action);return;}
 const meta=event.target.closest('[data-local-edit]');
 if(meta){localEdit(meta.dataset.localEdit);return;}
 const close=event.target.closest('[data-local-close]');
 if(close){
  const actionType=close.dataset.localClose;
  if(actionType==='complete'){localHandoverOpen(close.dataset.localId);return;}
  if(!confirm('Lokale Bestellung stornieren und unbenutzte Lagerreservierungen zurückgeben?'))return;
  await localAction({action:actionType,id:close.dataset.localId});
 }
});
let localHandoverId='';
function localCustomerKey(name){return String(name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('de');}
function localHandoverOpen(id){
 const o=(model?.orders||[]).find(x=>String(x.id)===String(id)&&x.source==='local');
 if(!o||o.status!=='ready'){flash('Der Auftrag ist noch nicht vollständig abholbereit.',true);return;}
 localHandoverId=String(o.id);
 $('local-handover-form').reset();
 $('local-handover-error').hidden=true;
 $('local-handover-customer').textContent=o.customer+' · Auftrag '+o.id;
 const others=(model.orders||[]).filter(x=>x.source==='local'&&x.status==='ready'&&
   x.id!==o.id&&localCustomerKey(x.customer)===localCustomerKey(o.customer));
 $('local-handover-related').innerHTML=others.length?
   '<fieldset class="local-handover-other"><legend>Weitere abholbereite Aufträge dieses Kunden</legend>'+
   others.map(x=>'<label><input type="checkbox" data-local-include="'+esc(x.id)+'" '+(o.fulfillment==='shipping'?'':'checked')+'> Auftrag '+esc(x.id)+' · '+Number(x.quantity||0)+' Stück</label>').join('')+
   '<small>'+ (o.fulfillment==='shipping'?'Nur auswählen, wenn diese Aufträge im selben Paket mit derselben Sendungsnummer verschickt werden.':'Nur die ausgewählten Aufträge werden gemeinsam übergeben.')+'</small></fieldset>':'';
 const shipping=o.fulfillment==='shipping';
 $('local-handover-form').querySelector('input[value="'+(shipping?'shipped':'customer')+'"]').checked=true;
 $('local-handover-recipient-row').hidden=true;
 $('local-handover-recipient').value='';
 localHandoverMethodChanged();
 $('order-details').close();
 $('local-handover-dialog').showModal();
}
function localHandoverMethodChanged(){
 const method=$('local-handover-form').querySelector('input[name="local-handover-method"]:checked')?.value;
 $('local-handover-recipient-row').hidden=method!=='third_party';
 const shipped=method==='shipped';
 $('local-handover-shipping').hidden=!shipped;
 const carrier=$('local-handover-carrier');
 const other=$('local-handover-carrier-other');
 const otherActive=shipped&&carrier.value==='Sonstiger';
 $('local-handover-carrier-other-row').hidden=!otherActive;
 carrier.disabled=!shipped;
 other.disabled=!otherActive;
 $('local-handover-tracking').disabled=!shipped;
 carrier.required=shipped;
 other.required=otherActive;
 $('local-handover-submit').textContent=shipped?'Versand bestätigen':'Übergabe abschließen';
}
$('local-handover-form').addEventListener('change',localHandoverMethodChanged);
$('orders').addEventListener('click',event=>{
 const b=event.target.closest('[data-local-handover]');
 if(b){event.preventDefault();localHandoverOpen(b.dataset.localHandover);}
});
$('local-handover-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(localSaving)return;
 const ids=[localHandoverId,...[...$('local-handover-related').querySelectorAll('[data-local-include]:checked')]
  .map(x=>x.dataset.localInclude)];
 const method=$('local-handover-form').querySelector('input[name="local-handover-method"]:checked')?.value;
 const recipient=$('local-handover-recipient').value.trim();
 const carrier=method==='shipped'?(
  $('local-handover-carrier').value==='Sonstiger'?
  $('local-handover-carrier-other').value.trim():$('local-handover-carrier').value):'';
 const tracking=method==='shipped'?$('local-handover-tracking').value.trim():'';
 const btn=$('local-handover-submit'),error=$('local-handover-error');
 if(method==='shipped'&&!carrier){
  error.textContent='Bitte einen Versanddienstleister auswählen oder eingeben.';
  error.hidden=false;return;
 }
 error.hidden=true;btn.disabled=true;
 try{
  const result=await api('local-order',{action:'handover',ids,method,recipient,carrier,tracking});
  setModel(result.overview);
  $('local-handover-dialog').close();
  flash(ids.length+' '+(ids.length===1?'Auftrag':'Aufträge')+
   (method==='shipped'?' als versendet archiviert.':' übergeben und archiviert.'));
 }catch(err){error.textContent=err.message;error.hidden=false;}
 finally{btn.disabled=false;}
});
$('local-history-list').addEventListener('click',async event=>{
 const b=event.target.closest('[data-local-undo-handover]');
 if(!b)return;
 if(!confirm('Übergabe für '+b.dataset.localUndoHandover+' rückgängig machen? Der Auftrag wird wieder aktiv. Die bei Übergabe ausgebuchten Druckstücke werden dem Lager wieder gutgeschrieben.'))return;
 await localAction({action:'undo-handover',id:b.dataset.localUndoHandover});
 await localHistory(true);
});
let localHistoryItems=[],localHistoryHasMore=false,localHistoryRequest=0,localHistoryLoading=false,localHistoryTimer=null;
const localHistoryPageSize=50;
function localHistoryCard(o){
 const statusName={open:'Offen',ready:'Fertig / bereit',completed:'Abgeschlossen',cancelled:'Storniert'};
 const deliveryName={customer:'Vom Kunden abgeholt',third_party:'An andere Person mitgegeben',
  delivered:'Persönlich ausgeliefert',shipped:'Versendet'};
 const mode=o.handover_method||'';
 const status=(o.status==='completed'&&mode==='shipped')?'Versendet':
  (o.status==='completed'?'Übergeben':statusName[o.status]||o.status);
 const details=o.status==='completed'?(mode?
    deliveryName[mode]+(o.handover_to?' · '+o.handover_to:'')+
    (o.handover_at?' · '+new Date(o.handover_at*1000).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}):''):
    'Älterer Abschluss · Übergabeart nicht erfasst'):'';
 const shipping=mode==='shipped'?
  '<div class="local-history-shipping"><b>Versand: '+esc(o.shipping_carrier||'Dienstleister nicht erfasst')+'</b>'+
  (o.tracking_number?'<span>Sendungsnummer: <strong>'+esc(o.tracking_number)+'</strong></span>'+
   '<button type="button" class="secondary small" data-local-copy-tracking="'+esc(o.tracking_number)+'">Nummer kopieren</button>':
   '<span>Ohne hinterlegte Sendungsnummer</span>')+'</div>':'';
 return '<article class="local-history-item"><div><b>'+esc(o.id)+'</b><span>'+esc(status)+'</span></div>'+
  '<strong>'+esc(o.customer)+'</strong><small>'+esc((o.items||[]).map(i=>i.quantity+' × '+i.variant).join(' · '))+'</small>'+
  '<small>Endtermin '+esc(shortDate(o.due))+(o.notes?' · '+esc(o.notes):'')+'</small>'+
  (details?'<small>'+esc(details)+'</small>':'')+shipping+
  (o.status==='completed'?'<div class="local-history-actions"><button type="button" class="secondary" data-local-pdf-id="'+esc(o.id)+'">A4 · PDF</button>'+
   (o.handover_method?'<button type="button" class="secondary" data-local-undo-handover="'+esc(o.id)+'">Abschluss rückgängig</button>':'')+
   '</div>':'')+'</article>';
}
function renderLocalHistory(){
 $('local-history-list').innerHTML=localHistoryItems.length?
   localHistoryItems.map(localHistoryCard).join(''):
   '<p class="hint">Keine passenden lokalen Aufträge gefunden.</p>';
 $('local-history-info').textContent=localHistoryItems.length+' lokale Aufträge geladen'+
   (localHistoryHasMore?' · weitere Einträge vorhanden':'');
 $('local-history-more').hidden=!localHistoryHasMore;
 $('local-history-more').disabled=localHistoryLoading;
}
async function localHistory(refresh=false,append=false){
 if(!refresh&&!append){
  $('local-history-search').value='';
  $('local-history-stage').value='all';
  $('local-history-dialog').showModal();
 }
 const request=++localHistoryRequest;
 const limit=localHistoryPageSize;
 const offset=append?localHistoryItems.length:0;
 if(!append){
  localHistoryItems=[];
  $('local-history-list').innerHTML='<p class="hint">Verlauf wird geladen …</p>';
 }
 localHistoryLoading=true;
 $('local-history-more').disabled=true;
 try{
  const params=new URLSearchParams({
   limit:String(limit),offset:String(offset),
   search:$('local-history-search').value.trim(),stage:$('local-history-stage').value
  });
  const data=await api('local-orders?'+params.toString());
  if(request!==localHistoryRequest)return;
  localHistoryItems=append?localHistoryItems.concat(data.orders||[]):data.orders||[];
  localHistoryHasMore=!!data.has_more;
  renderLocalHistory();
 }catch(err){
  if(request!==localHistoryRequest)return;
  $('local-history-list').textContent=err.message;
 }finally{
  if(request===localHistoryRequest){localHistoryLoading=false;$('local-history-more').disabled=false;}
 }
}
$('local-history-open').addEventListener('click',()=>localHistory());
$('full-orders-history').addEventListener('click',()=>localHistory());
$('local-history-more').addEventListener('click',()=>localHistory(true,true));
$('local-history-search').addEventListener('input',()=>{
 if(localHistoryTimer)clearTimeout(localHistoryTimer);
 localHistoryTimer=setTimeout(()=>localHistory(true),250);
});
$('local-history-stage').addEventListener('change',()=>localHistory(true));
$('local-history-list').addEventListener('click',async event=>{
 const b=event.target.closest('[data-local-copy-tracking]');
 if(!b)return;
 try{
  await navigator.clipboard.writeText(b.dataset.localCopyTracking);
  flash('Sendungsnummer kopiert.');
 }catch(err){flash('Sendungsnummer konnte nicht kopiert werden.',true);}
});
// Hook into the existing Etsy card and order detail rendering *after*
// components-ui.js and priority-ui.js have installed their overrides.
function localPdfLink(order,label){
 // Open the two-template picker. Fetch through Home Assistant ingress with the
 // current session and reject errors before creating any downloadable PDF.
 return '<button type="button" class="local-order-pdf" data-local-pdf-id="'+esc(order.id)+
  '" aria-label="'+esc(label+' für '+order.customer)+'">'+
  '<span aria-hidden="true">▤</span> '+esc(label)+'</button>';
}
const localPdfDialog=$('local-pdf-dialog');
let localPdfDownloading=false;
document.addEventListener('click',event=>{
 const trigger=event.target.closest('[data-local-pdf-id]');
 if(!trigger||!localPdfDialog||localPdfDownloading)return;
 const id=trigger.dataset.localPdfId||'';
 if(!/^LOK-[A-Z0-9-]{7,50}$/.test(id))return;
 localPdfDialog.dataset.orderId=id;
 $('local-pdf-error').hidden=true;
 $('local-pdf-error').textContent='';
 localPdfDialog.showModal();
});
async function localDownloadPdf(id,kind){
 if(localPdfDownloading||!['internal','customer'].includes(kind))return;
 const buttons=[...localPdfDialog.querySelectorAll('[data-local-pdf-kind]')];
 const errorBox=$('local-pdf-error');
 errorBox.hidden=true;
 errorBox.textContent='';
 buttons.forEach(button=>button.disabled=true);
 localPdfDownloading=true;
 try{
  const url='api/local-order-pdf?id='+encodeURIComponent(id)+'&kind='+encodeURIComponent(kind);
  const response=await fetch(url,{
   method:'GET',credentials:'same-origin',cache:'no-store',
   headers:{'Accept':'application/pdf'}
  });
  if(!response.ok){
   if(response.status===401||response.status===403){
    throw Error('Home Assistant hat den Download nicht autorisiert (HTTP '+response.status+
     '). Bitte Home Assistant neu anmelden und die Lageransicht erneut öffnen.');
   }
   let detail='';
   try{
    const body=await response.json();
    detail=typeof body.error==='string'?body.error:'';
   }catch{}
   throw Error(detail||'PDF konnte nicht geladen werden (HTTP '+response.status+').');
  }
  const contentType=(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('application/pdf')){
   throw Error('Der Server hat kein PDF geliefert. Bitte Home Assistant neu anmelden und erneut versuchen.');
  }
  const file=await response.arrayBuffer();
  const signature=new Uint8Array(file.slice(0,5));
  if(String.fromCharCode(...signature)!=='%PDF-'){
   throw Error('Der Download enthält kein gültiges PDF. Es wurde keine Datei gespeichert.');
  }
  const blob=new Blob([file],{type:'application/pdf'});
  const href=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=href;
  anchor.download='Print-Pulse-'+(kind==='internal'?'Werkstattauftrag':'Kundenbeileger')+'-'+id+'.pdf';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(href),60000);
  localPdfDialog.close();
  flash('A4-PDF erstellt: '+(kind==='internal'?'Werkstattauftrag':'Kundenbeileger')+'.');
 }catch(ex){
  errorBox.textContent=ex.message||'PDF-Download fehlgeschlagen.';
  errorBox.hidden=false;
 }finally{
  localPdfDownloading=false;
  buttons.forEach(button=>button.disabled=false);
 }
}
localPdfDialog.addEventListener('click',event=>{
 const selected=event.target.closest('[data-local-pdf-kind]');
 if(selected)localDownloadPdf(localPdfDialog.dataset.orderId||'',selected.dataset.localPdfKind);
});
const standardOrderCard=orderCard;
orderCard=function(o){
 const html=standardOrderCard(o);
 if(o.source!=='local')return html;
 return html.replace('<div class="order-card-top"><b>',
   '<div class="order-card-top"><b><span class="local-tag">LOKAL</span> ')
  .replace('</article>',
   '<div class="local-order-pdf-row">'+localPdfLink(o,'Auftrag A4 · PDF')+'</div></article>');
};
const standardOrderNextAction=orderNextAction;
orderNextAction=function(line){
 if(line.local_custom)return null;
 return standardOrderNextAction(line);
};
const standardOrderLineActions=orderLineActions;
orderLineActions=function(line){
 if(!line.local_custom)return standardOrderLineActions(line);
 const remaining=Math.max(0,Number(line.remaining)||0);
 const printing=Math.max(0,Number(line.printing)||0);
 return '<div class="local-custom-work"><b>Individuelle Fertigung · ohne automatische Lagerentnahme</b>'+
  '<small>'+Number(line.finished||0)+' fertig · '+printing+' im Druck · '+remaining+' noch offen</small>'+
  '<div class="component-order-buttons">'+
   (remaining?'<button class="primary" type="button" data-local-custom-action="'+esc(line.transaction_id)+'" data-local-type="start" data-local-custom-quantity="'+remaining+'">'+remaining+' × Drucken</button>':'')+
   (printing?'<button class="primary" type="button" data-local-custom-action="'+esc(line.transaction_id)+'" data-local-type="finish" data-local-custom-quantity="'+printing+'">'+printing+' × Fertig</button>'+
    '<button class="secondary" type="button" data-local-custom-action="'+esc(line.transaction_id)+'" data-local-type="cancel" data-local-custom-quantity="'+printing+'">Druck abbrechen</button>':'')+
  '</div></div>';
};
const standardOrderProgress=orderPrintProgress;
orderPrintProgress=function(o){
 if(o.source!=='local')return standardOrderProgress(o);
 const lines=o.items||[],total=lines.reduce((s,l)=>s+Number(l.quantity||0),0);
 const finished=lines.reduce((s,l)=>s+Math.min(Number(l.quantity||0),
  Number(l.finished||0)+Number(l.allocated||0)+Number(l.assembled||0)),0);
 const complete=total>0&&lines.every(l=>Number(l.printing||0)===0&&
  Number(l.remaining||0)===0&&
  Number(l.finished||0)+Number(l.allocated||0)+Number(l.assembled||0)>=Number(l.quantity||0));
 return {total,finished,complete};
};
const standardShowOrder=showOrder;
showOrder=function(id){
 standardShowOrder(id);
 const o=(model?.orders||[]).find(row=>String(row.id)===String(id));
 if(o?.source!=='local')return;
 $('order-details-title').textContent='Lokale Bestellung '+o.id;
 const host=$('order-details-content');
 const heading=host.querySelector('.order-worklist');
 if(heading)heading.insertAdjacentHTML('beforebegin',
  '<div class="local-order-info"><span class="local-tag">LOKAL</span>'+
  '<strong>'+(o.fulfillment==='shipping'?'Versand':'Abholung')+'</strong>'+
  (o.notes?'<p><b>Interne Notiz:</b> '+esc(o.notes)+'</p>':'')+'</div>');
 const items=host.querySelectorAll('.order-work-item');
 (o.items||[]).forEach((line,i)=>{
  const detail=items[i]?.querySelector('.order-work-product');
  if(!detail)return;
  const details=[
   line.color?'Wunschfarbe: '+line.color:'',
   line.personalization?'Gravur / Personalisierung: '+line.personalization:'',
   line.note?'Hinweis: '+line.note:''
  ].filter(Boolean);
  if(details.length)detail.insertAdjacentHTML('afterend',
   '<div class="local-line-notes">'+details.map(text=>'<strong>'+esc(text)+'</strong>').join('')+'</div>');
 });
 const hint=host.querySelector('.order-work-help p');
 if(hint)hint.textContent='Lokale Aufträge werden unabhängig vom Etsy-Abgleich gespeichert. Standardvarianten nutzen die normalen Buchungen; bei Gravuren und Sonderfarben werden eigene Druckpositionen ohne automatische Lagerumbuchung geführt.';
 host.insertAdjacentHTML('beforeend',
  '<div class="local-detail-actions">'+localPdfLink(o,'A4-Auftrag herunterladen')+
  '<button class="secondary" type="button" data-local-edit="'+esc(o.id)+'">Kunde / Endtermin bearbeiten</button>'+
  '<button class="secondary" type="button" data-local-close="cancel" data-local-id="'+esc(o.id)+'">Stornieren</button>'+
  '<button class="primary" type="button" data-local-close="complete" data-local-id="'+esc(o.id)+'" '+(orderPrintProgress(o).complete?'':'disabled title="Zuerst alle Positionen fertigstellen"')+'>'+(o.fulfillment==='shipping'?'Versand bestätigen':'Übergabe bestätigen')+'</button></div>');
};
