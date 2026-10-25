
'use strict';
(() => {
 const details=$('order-details'),content=$('order-details-content');
 const num=x=>Math.max(0,Number(x)||0);
 const composed=line=>!!(line.components_enabled&&!(typeof componentLegacyJob==='function'&&componentLegacyJob(line)));
 const done=line=>Math.min(num(line.quantity),num(line.finished)+num(line.allocated)+num(line.assembled));
 const complete=line=>num(line.quantity)>0&&done(line)===num(line.quantity)&&!num(line.printing)&&!num(line.remaining);
 const status=line=>{
  if(complete(line))return ['Fertig','ready'];
  const c=composed(line)?(line.components||[]).reduce((s,p)=>s+num(p.printing),0):0;
  if(c)return ['Bauteile im Druck','printing'];
  if(num(line.printing))return [num(line.printing)+' im Druck'+(done(line)?' · '+done(line)+'/'+num(line.quantity)+' fertig':''),'printing'];
  if(done(line))return [done(line)+'/'+num(line.quantity)+' fertig','partial'];
  return ['Offen','pending'];
 };
 const zoomIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg>';
 function tile(line,large=false){
  const st=status(line),image=thumbnail(line.image||'');
  const attrs=[line.variant,line.color?'Farbe: '+line.color:''].filter(Boolean).join(' · ');
  return '<button type="button" class="simple-order-tile'+(large?' is-large':'')+'" data-order-position="'+esc(line.transaction_id)+'" aria-label="'+esc(line.title)+' öffnen">'+
   (large&&image?'<img class="simple-tile-image" src="'+esc(image)+'" alt="" loading="lazy">':'')+
   '<span class="simple-tile-info"><strong>'+num(line.quantity)+' × '+esc(orderShortProductTitle(line.title))+'</strong>'+
   (attrs?'<small>'+esc(attrs)+'</small>':'')+
   '<span class="simple-tile-foot"><span class="simple-tile-state '+st[1]+'">'+esc(st[0])+'</span><b aria-hidden="true">›</b></span></span></button>';
 }
 orderCard=function(o){
  const ship=shipInfo(o),progress=orderPrintProgress(o),lines=o.items||[],photo=thumbnail(lines[0]?.image||'');
  return '<article class="order-card '+ship.level+(progress.complete?' print-complete':'')+'" data-order-card="'+esc(o.id)+'">'+
   '<div class="order-card-top"><b>#'+esc(o.id)+'</b><span class="order-card-top-tools"><small>'+esc(shortDate(o.created))+'</small>'+
   '<button type="button" class="order-card-zoom" data-order-expand="'+esc(o.id)+'" aria-label="Bestellung groß ansehen">'+zoomIcon+'</button></span></div>'+
   orderPrintMarker(progress,true)+
   '<div class="order-card-main">'+(photo?'<img src="'+esc(photo)+'" alt="" loading="lazy">':'')+
   '<div><strong>'+esc(o.customer)+'</strong><small>'+num(o.quantity)+' Stück · '+lines.length+' Position'+(lines.length===1?'':'en')+'</small></div></div>'+
   '<div class="simple-order-tiles">'+lines.map(line=>tile(line)).join('')+'</div>'+
   '<div class="order-card-foot"><span class="order-deadline '+ship.level+'">'+shippingMarkup(ship)+'</span></div>'+
   (o.source==='local'?'<div class="local-order-pdf-row">'+localPdfLink(o,'Auftrag A4 · PDF')+'</div>':'')+'</article>';
 };
 const oldHeader=details.querySelector('.dialog-heading');
 oldHeader.classList.add('order-zoom-header');
 const headerTitle=oldHeader.querySelector('h2');
 if(headerTitle&&!oldHeader.querySelector('.order-zoom-header-copy')){
  const wrap=document.createElement('div');wrap.className='order-zoom-header-copy';
  const label=document.createElement('span');label.className='order-zoom-kicker';label.textContent='BESTELLUNG · ÜBERSICHT';
  headerTitle.before(wrap);wrap.append(label,headerTitle);
 }
 oldHeader.querySelector('[data-close]')?.classList.add('order-zoom-close');
 showOrder=function(id){
  const o=(model?.orders||[]).find(x=>String(x.id)===String(id));if(!o)return;
  details.dataset.orderId=o.id;
  $('order-details-title').textContent=(o.source==='local'?'Lokale Bestellung ':'Etsy-Bestellung #')+o.id;
  const ship=shipInfo(o),progress=orderPrintProgress(o),local=o.source==='local';
  const extra=(o.items||[]).map(line=>
   '<div class="simple-order-extra"><strong>'+num(line.quantity)+' × '+esc(orderShortProductTitle(line.title))+'</strong>'+
   orderVariantLabels(line.variant)+
   (line.color?'<p>Wunschfarbe: '+esc(line.color)+'</p>':'')+
   (line.personalization?'<p>Personalisierung: '+esc(line.personalization)+'</p>':'')+
   (line.note?'<p>'+esc(line.note)+'</p>':'')+
   '<div class="order-work-booking">'+orderLineActions(line)+'</div></div>').join('');
  const localAdmin=local?'<div class="local-detail-actions">'+localPdfLink(o,'Auftrag A4 · PDF')+
   '<button type="button" class="secondary" data-local-edit="'+esc(o.id)+'">Kunde / Termin bearbeiten</button>'+
   '<button type="button" class="secondary" data-local-close="cancel" data-local-id="'+esc(o.id)+'">Stornieren</button>'+
   '<button type="button" class="primary" data-local-close="complete" data-local-id="'+esc(o.id)+'" '+
    (progress.complete?'':'disabled')+'>Bestellung übergeben</button></div>':'';
  const html='<div class="order-work-meta"><div><strong>'+esc(o.customer)+'</strong><small>Bestellt am '+esc(shortDate(o.created))+'</small></div>'+
   '<div class="order-deadline '+ship.level+'">'+shippingMarkup(ship)+'</div></div>'+
   (local&&o.notes?'<p class="simple-order-local-notes">'+esc(o.notes)+'</p>':'')+
   '<p class="simple-order-summary">'+progress.finished+' von '+progress.total+' Stück fertig</p>'+
   '<div class="simple-order-zoom-tiles">'+(o.items||[]).map(line=>tile(line,true)).join('')+'</div>'+
   '<details class="simple-order-advanced"><summary>Weitere Auftragsfunktionen (Lager und Bauteile)</summary>'+
   extra+localAdmin+'</details>';
  markupCache.delete(content);updateHTML(content,html);
  if(!details.open)details.showModal();
 };
 const focus=document.createElement('dialog');focus.id='order-position';
 focus.innerHTML='<div class="dialog-heading"><div><small>PRODUKTION · POSITION</small><h2 id="order-position-title"></h2></div>'+
  '<button type="button" class="icon-button" data-focus-close aria-label="Schließen">×</button></div>'+
  '<div id="order-position-body"></div>';
 document.body.append(focus);
 let selected='',positionSnapshot='';
 const locate=()=>{
  for(const o of model?.orders||[]){
   const line=(o.items||[]).find(x=>String(x.transaction_id)===selected);
   if(line)return {o,line};
  }return null;
 };
 function draw(){
  const found=locate();if(!found){if(focus.open)focus.close();return;}
  const snapshot=JSON.stringify([selected,found.line,findItem(found.line.item_id)?.i?.on_hand]);
  if(focus.open&&snapshot===positionSnapshot)return;
  positionSnapshot=snapshot;
  const {o,line}=found,st=status(line),component=composed(line);
  const q=num(line.quantity),open=num(line.remaining),printing=num(line.printing);
  const eligible=!!(line.item_id||line.local_custom);
  const start=eligible&&open>0&&(!component||(line.components||[]).some(p=>p.kind==='demand'&&!p.error&&num(p.required)>num(p.printing)+num(p.finished)));
  const finish=eligible&&!complete(line)&&(component?q-num(line.assembled)>0:open+printing>0);
  const image=thumbnail(line.image||'');
  const labels=[line.color?'Wunschfarbe: '+line.color:'',line.personalization?'Personalisierung: '+line.personalization:'',line.note?'Hinweis: '+line.note:''].filter(Boolean);
  const unknown=eligible&&!component&&!line.local_custom&&findItem(line.item_id)?.i.on_hand===null;
  $('order-position-title').textContent=o.customer;
  $('order-position-body').innerHTML='<div class="simple-pos-item">'+
   (image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'')+
   '<div><small>BESTELLUNG #'+esc(o.id)+' · '+q+' STÜCK</small><h3>'+esc(orderShortProductTitle(line.title))+'</h3></div></div>'+
   orderVariantLabels(line.variant)+
   (labels.length?'<div class="simple-pos-extras">'+labels.map(x=>'<strong>'+esc(x)+'</strong>').join('')+'</div>':'')+
   (component?'<div class="simple-pos-parts"><strong>Bauteile</strong>'+
    (line.components||[]).map(p=>'<small>'+esc(p.name+(p.color?' · '+p.color:'')+(p.label?' · '+p.label:''))+'</small>').join('')+'</div>':'')+
   '<div class="simple-pos-state '+st[1]+'"><strong>'+esc(st[0])+'</strong>'+
   '<small>'+done(line)+' von '+q+' fertig'+(!component&&printing?' · '+printing+' im Druck':'')+'</small></div>'+
   (start||finish?
    '<label class="simple-pos-quantity">Stückzahl <input type="number" id="simple-pos-qty" inputmode="numeric" min="1" max="'+Math.max(1,open+printing,q-num(line.assembled))+'" value="1"></label>'+
    (unknown?'<label class="simple-pos-initial">Bisheriger fertiger Lagerbestand<input type="number" id="simple-pos-stock" min="0" inputmode="numeric" placeholder="Vorher zählen"></label>':'')+
    '<div class="simple-pos-actions">'+(start?'<button type="button" class="secondary" data-focus-action="start">Drucken</button>':'')+
    (finish?'<button type="button" class="primary" data-focus-action="complete">✓ Fertig</button>':'')+'</div>'+
    '<p class="hint">„Drucken“ merkt den Druckstart vor. „Fertig“ bestätigt die wirklich fertige Menge, auch ohne vorherigen Druckstart.</p>':
    '<p class="hint">'+(complete(line)?'Diese Position ist fertig.':'Bei dieser Position sind noch Angaben zu prüfen.')+'</p>')+
   '<button type="button" class="simple-pos-advanced-link" data-focus-more>Weitere Funktionen / Lagerverwaltung</button>';
 }
 function open(tid){
  selected=String(tid);if(!locate())return;
  if(details.open)details.close();
  draw();if(!focus.open)focus.showModal();
 }
 async function action(kind){
  const found=locate();if(!found||busy)return;
  const {o,line}=found,comp=composed(line),n=Number($('simple-pos-qty')?.value);
  const limit=kind==='start'?num(line.remaining):comp?num(line.quantity)-num(line.assembled):num(line.remaining)+num(line.printing);
  if(!Number.isSafeInteger(n)||n<1||n>limit){flash('Bitte eine Stückzahl zwischen 1 und '+limit+' wählen.',true);return;}
  if(kind==='complete'&&comp&&!confirm(n+' Einheit(en) wirklich fertig und geprüft? Verfügbarer Bauteilvorrat wird dafür gebucht.'))return;
  focus.querySelectorAll('input,button').forEach(x=>x.disabled=true);
  let ok=false;
  try{
   if(comp){
    ok=await mutate('components',{action:kind==='start'?'quick-start':'quick-complete',transaction_id:line.transaction_id,quantity:n});
   }else if(line.local_custom){
    const result=await api('local-order',{action:'custom-job',transaction_id:line.transaction_id,
     action_type:kind==='start'?'start':'finish-direct',quantity:n});
    setModel(result.overview);flash('Produktionsstand gespeichert.');ok=true;
   }else{
    const foundItem=findItem(line.item_id);
    const body={transaction_id:line.transaction_id,receipt_id:o.id,
     action:kind==='start'?'printing':'finish-direct',quantity:n,revision:foundItem?.i.revision};
    if(kind==='complete'&&foundItem?.i.on_hand===null){
     const value=$('simple-pos-stock')?.value;
     if(value===''||value===undefined||!Number.isSafeInteger(Number(value))||Number(value)<0){
      flash('Bitte zuerst den bisherigen Lagerbestand eintragen.',true);return;
     }
     body.initial_stock=Number(value);
    }
    ok=await mutate('order-print',body);
   }
  }catch(e){flash(e.message,true);}
  finally{focus.querySelectorAll('input,button').forEach(x=>x.disabled=false);if(ok)draw();}
 }
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-order-position]');if(!b)return;
  event.preventDefault();event.stopImmediatePropagation();open(b.dataset.orderPosition);
 },true);
 $('orders').addEventListener('click',event=>{
  const b=event.target.closest('[data-order-expand]');if(b)showOrder(b.dataset.orderExpand);
 });
 focus.addEventListener('click',event=>{
  if(event.target.closest('[data-focus-close]')){focus.close();return;}
  const a=event.target.closest('[data-focus-action]');if(a){action(a.dataset.focusAction);return;}
  if(event.target.closest('[data-focus-more]')){
   const row=locate();focus.close();
   if(row){showOrder(row.o.id);content.querySelector('.simple-order-advanced')?.setAttribute('open','');}
  }
 });
 const previousRender=render;
 render=function(){previousRender();if(details.open&&details.dataset.orderId)showOrder(details.dataset.orderId);if(focus.open)draw();};
})();
