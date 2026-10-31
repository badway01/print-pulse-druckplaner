
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
   '<div class="order-card-foot"><span class="order-deadline '+ship.level+'">'+shippingMarkup(ship)+'</span>'+
   (o.source==='local'&&o.status==='ready'?'<button type="button" class="primary local-card-handover" data-local-handover="'+esc(o.id)+'">Übergabe bestätigen</button>':'')+'</div>'+
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
   '<button type="button" class="primary" data-local-handover="'+esc(o.id)+'" '+
    (o.status==='ready'?'':'disabled title="Zuerst alle Positionen fertigstellen"')+'>Übergabe bestätigen</button></div>':'';
  const html='<div class="order-work-meta"><div><strong>'+esc(o.customer)+'</strong><small>Bestellt am '+esc(shortDate(o.created))+'</small></div>'+
   '<div class="order-deadline '+ship.level+'">'+shippingMarkup(ship)+'</div></div>'+
   (local&&o.notes?'<p class="simple-order-local-notes">'+esc(o.notes)+'</p>':'')+
   (local&&o.status==='ready'?'<p class="local-ready-info">✓ Produktion abgeschlossen · wartet auf Übergabe</p>':'')+
   '<p class="simple-order-summary">'+progress.finished+' von '+progress.total+' Stück fertig</p>'+
   (local&&o.status==='ready'?'<button type="button" class="primary local-detail-handover" data-local-handover="'+esc(o.id)+'">Übergabe bestätigen</button>':'')+
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
 // Match order parts to the latest saved 3MF for this product and printer.
 // A distinct filename match is allowed automatically. Ambiguity requires
 // explicit assignment, which is stored across all future orders.
 const masterBase=s=>String(s||'').replace(/\.3mf$/i,'').toLocaleLowerCase('de')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9äöüß]+/g,' ').trim();
 const words=s=>masterBase(s).split(/\s+/).filter(Boolean);
 const listingOf=line=>String(line.listing_id||findItem(line.item_id)?.p?.id||'');
 const variantOf=line=>String(line.item_id||'');
 function masterChoices(line){
  const lid=listingOf(line),vid=variantOf(line);
  const files=(printTools?.files||[]).filter(f=>String(f.listing_id)===lid&&(!f.variant_id||String(f.variant_id)===vid));
  // If a matching variant-specific master exists for the same printer, avoid
  // using a generic master for that printer as an automatic suggestion.
  const dedicated=new Set(files.filter(f=>String(f.variant_id)===vid&&vid).map(f=>f.printer));
  return files.filter(f=>!dedicated.has(f.printer)||String(f.variant_id)===vid)
    .sort((a,b)=>Number(b.created)-Number(a.created)||String(b.id).localeCompare(String(a.id)));
 }

 // Single-product orders use the live product masters, not a snapshot from
 // the moment the Etsy order was received.
 function productOrderMaster(line){
  const files=masterChoices(line),lid=listingOf(line),vid=variantOf(line);
  const saved=(printTools.order_master_defaults||[]).filter(d=>String(d.listing_id)===lid &&
   (!d.variant_id||String(d.variant_id)===vid))
   .sort((a,b)=>Number(String(b.variant_id)===vid)-Number(String(a.variant_id)===vid));
  for(const def of saved){
   const file=files.find(f=>f.id===def.file_id);
   if(file)return {file,files,pinned:true};
  }
  const kinds=new Set(files.map(f=>f.printer+'|'+masterBase(f.filename)));
  return {file:kinds.size===1?files[0]||null:null,files,pinned:false};
 }
 function productMasterHtml(line){
  if(!listingOf(line))return '';
  const {file,files,pinned}=productOrderMaster(line);
  const mac=typeof masterSlicerMac==='function'&&masterSlicerMac();
  if(!files.length)return '<div class="simple-pos-master-empty"><b>Druckprojekt</b><span>Noch keine Master-3MF hinterlegt.</span></div>';
  const open=file?(mac?'<a class="simple-part-master-open" href="'+
   esc(masterSlicerUrl(file,file.printer==='Snapmaker U1'?'snapmaker':'bambu'))+'">In '+
   (file.printer==='Snapmaker U1'?'Snapmaker Orca':'Bambu Studio')+' öffnen ↗</a>':
   '<a class="simple-part-master-open" href="api/master-download?id='+encodeURIComponent(file.id)+'" download>3MF herunterladen</a>'):'';
  const choices='<div class="simple-part-master-assign"><select data-order-master-select aria-label="3MF-Projekt auswählen">'+
   '<option value="">3MF-Projekt wählen…</option>'+files.map(f=>'<option value="'+esc(f.id)+'"'+
   (f.id===file?.id?' selected':'')+'>'+esc(f.filename+' · '+f.printer+(f.variant_id?' · Variante':''))+'</option>').join('')+
   '</select><button type="button" class="secondary" data-order-master-save>Als Standard speichern</button></div>';
  return '<section class="simple-pos-master-product"><strong>Druckprojekt direkt öffnen</strong>'+
   (file?'<div class="simple-part-master-current"><span class="simple-part-master-filename">'+
    esc(file.filename)+' · '+esc(file.printer)+(pinned?' · Standard':'')+'</span>'+open+'</div>':
    '<p class="simple-part-master-hint">Mehrere Druckprojekte vorhanden. Wähle einmal das passende Projekt.</p>')+
   (files.length>1?(file?'<details class="simple-part-master-change"><summary>Projekt wechseln</summary>'+choices+'</details>':choices):'')+
   '</section>';
 }
 async function saveProductOrderMaster(button){
  const found=locate();if(!found)return;
  const id=button.closest('.simple-pos-master-product')?.querySelector('[data-order-master-select]')?.value;
  const file=masterChoices(found.line).find(f=>f.id===id);
  if(!file){flash('Bitte passende 3MF auswählen.',true);return;}
  button.disabled=true;
  try{
   const result=await api('order-master-default',{listing_id:listingOf(found.line),
     variant_id:variantOf(found.line),file_id:file.id});
   const lid=listingOf(found.line);
   printTools.order_master_defaults=[...(printTools.order_master_defaults||[]).filter(d=>String(d.listing_id)!==lid),...(result.order_master_defaults||[])];
   printTools.files=[...(printTools.files||[]).filter(f=>String(f.listing_id)!==lid),...(result.files||[])];
   positionSnapshot='';draw();flash('3MF für bestehende und zukünftige Bestellungen gespeichert.');
  }catch(err){flash('3MF-Zuordnung fehlgeschlagen: '+err.message,true);}
  finally{button.disabled=false;}
 }
 function partMasterResolution(line,part){
  const files=masterChoices(line),vid=variantOf(line);
  const maps=(printTools.component_links||[]).filter(m=>String(m.component_id)===String(part.id)&&
    (!m.variant_id||String(m.variant_id)===vid));
  const chosen=maps.sort((a,b)=>Number(String(b.variant_id)===vid)-Number(String(a.variant_id)===vid))
    .map(m=>files.find(f=>f.id===m.file_id&&f.printer===m.printer)).find(Boolean);
  if(chosen)return {file:chosen,files,linked:true};
  const partWords=words(part.name);
  const matches=files.map(f=>{
   const base=masterBase(f.filename), fw=words(f.filename);
   const exact=base===masterBase(part.name);
   // "Halter.3mf" -> "Scrunchie-Halter", but never match an unrelated
   // "Halterung" just because it has a similar substring.
   const subset=fw.length>0&&fw.every(w=>partWords.includes(w));
   return {file:f,score:exact?2:subset?1:0,base};
  }).filter(x=>x.score>0);
  const best=Math.max(0,...matches.map(x=>x.score));
  const bestMatches=matches.filter(x=>x.score===best);
  const basenames=new Set(bestMatches.map(x=>x.base));
  if(best>0&&basenames.size===1){
   // Only the newest revision of the one unambiguous filename.
   const matched=bestMatches.sort((a,b)=>Number(b.file.created)-Number(a.file.created))[0].file;
   return {file:matched,files,linked:false};
  }
  return {file:null,files,linked:false};
 }
 function partMasterHtml(line,part){
  const result=partMasterResolution(line,part),file=result.file;
  if(!result.files.length)return '<div class="simple-part-master hint">Noch keine 3MF für dieses Produkt gespeichert.</div>';
  const mac=typeof masterSlicerMac==='function'&&masterSlicerMac();
  const target=file?file.printer==='Snapmaker U1'?'snapmaker':'bambu':null;
  const action=file?(mac?'<a class="simple-part-master-open" href="'+esc(masterSlicerUrl(file,target))+
    '" title="'+esc(file.filename)+'">In '+(target==='snapmaker'?'Snapmaker Orca':'Bambu Studio')+' öffnen ↗</a>':
    '<a class="simple-part-master-open" href="api/master-download?id='+encodeURIComponent(file.id)+'" download>3MF herunterladen</a>'):'';
  const select='<select data-part-master-select aria-label="Master-3MF für '+esc(part.name)+' wählen">'+
   '<option value="">3MF-Datei auswählen…</option>'+result.files.map(f=>
    '<option value="'+esc(f.id)+'" '+(file?.id===f.id?'selected':'')+'>'+esc(f.filename+' · '+f.printer+
     (f.variant_id?' · Variante':''))+'</option>').join('')+'</select>';
  const change='<div class="simple-part-master-assign">'+select+
   '<button type="button" class="secondary" data-part-master-save>Zuordnung speichern</button></div>';
  return '<div class="simple-part-master">'+
   (file?'<div class="simple-part-master-current"><span class="simple-part-master-filename">3MF: '+esc(file.filename)+
      ' · '+esc(file.printer)+'</span>'+action+'</div>':
    '<span class="simple-part-master-hint">Noch keine eindeutige 3MF-Zuordnung</span>')+
   (file?'<details class="simple-part-master-change"><summary>Andere 3MF zuordnen</summary>'+change+'</details>':change)+
   '</div>';
 }
 let masterOrderLoading='';
 async function ensureOrderMasterFiles(line){
  const lid=listingOf(line);if(!lid||masterOrderLoading===lid)return;
  masterOrderLoading=lid;
  try{
   const result=await api('print-tools?listing_id='+encodeURIComponent(lid));
   if(!Array.isArray(result.files)||!Array.isArray(result.component_links)||!Array.isArray(result.order_master_defaults))throw Error('Unvollständige 3MF-Daten');
   printTools.files=[...(printTools.files||[]).filter(f=>String(f.listing_id)!==lid),...result.files];
   printTools.component_links=[...(printTools.component_links||[]).filter(f=>String(f.listing_id)!==lid),...result.component_links];
   printTools.order_master_defaults=[...(printTools.order_master_defaults||[]).filter(f=>String(f.listing_id)!==lid),...result.order_master_defaults];
   if(focus.open&&locate()?.line&&listingOf(locate().line)===lid){positionSnapshot='';draw();}
  }catch(err){flash('3MF-Verknüpfungen konnten nicht geladen werden: '+err.message,true);}
  finally{if(masterOrderLoading===lid)masterOrderLoading='';}
 }
 async function savePartMaster(button){
  const row=button.closest('[data-focus-component-id]'),found=locate();
  if(!row||!found)return;
  const fileId=row.querySelector('[data-part-master-select]')?.value||'';
  const file=(printTools.files||[]).find(f=>f.id===fileId);
  if(!file){flash('Bitte zuerst die passende 3MF auswählen.',true);return;}
  button.disabled=true;
  try{
   const next=await api('master-component-link',{component_id:row.dataset.focusComponentId,
      variant_id:variantOf(found.line),printer:file.printer,file_id:file.id});
   const lid=listingOf(found.line);
   printTools.component_links=[...(printTools.component_links||[]).filter(m=>String(m.listing_id)!==lid),...(next.component_links||[])];
   printTools.files=[...(printTools.files||[]).filter(f=>String(f.listing_id)!==lid),...(next.files||[])];
   positionSnapshot='';draw();flash('3MF dauerhaft mit diesem Bauteil verknüpft.');
  }catch(err){flash('3MF-Zuordnung fehlgeschlagen: '+err.message,true);}
  finally{button.disabled=false;}
 }
 // Read the latest product component definitions for every open order.
 function componentPartRows(line){
  const remaining=num(line.remaining),units=Math.max(1,num(line.quantity));
  const rows=(line.components||[]).map(part=>{
   const perUnit=num(part.required)/units,need=Math.ceil(perUnit*remaining);
   const ready=num(part.available),running=num(part.printing);
   const missing=Math.max(0,need-ready),printable=Math.max(0,missing-running);
   const canBook=part.kind==='stock'?Math.min(printable,num(part.stock)):0;
   const undo=Math.max(0,num(part.finished)-Math.max(0,num(part.consumed)-num(part.booked)));
   const max=Math.max(1,printable,missing,canBook,running,undo);
   const status=part.error?'Angaben prüfen':!remaining?'Montiert':
    need>0&&ready>=need?'Bereit':running?'Im Druck':'Offen';
   const buttons=part.error||!remaining?'':[
    (canBook?'<button type="button" class="secondary" data-focus-part-action="book" data-max="'+canBook+'">Aus Lager</button>':''),
    (printable?'<button type="button" class="secondary" data-focus-part-action="start" data-max="'+printable+'">Drucken</button>':''),
    (missing?'<button type="button" class="primary" data-focus-part-action="finish-direct" data-max="'+missing+'">✓ Fertig</button>':''),
    (running?'<button type="button" class="secondary" data-focus-part-action="cancel" data-max="'+running+'">Abbruch</button>':''),
    (undo?'<button type="button" class="simple-part-reopen" data-focus-part-action="reopen-direct" data-max="'+undo+'">↶ Rückgängig</button>':'')
   ].join('');
   return '<div class="simple-pos-part" data-focus-component-id="'+esc(part.id)+'">'+
    '<div class="simple-pos-part-head"><div><strong>'+esc(part.name)+'</strong>'+
    (part.color||part.label?'<small>'+esc([part.color,part.label].filter(Boolean).join(' · '))+'</small>':'')+
    '</div><span class="simple-pos-part-status">'+esc(status)+'</span></div>'+
    partMasterHtml(line,part)+
    (part.error?'<p class="component-error">'+esc(part.error)+'</p>':
    '<div class="simple-pos-part-progress"><b>'+ready+' / '+need+' bereit</b>'+
     (running?'<span>'+running+' im Druck</span>':'')+
     (part.kind==='stock'?'<span>'+num(part.stock)+' frei im Lager</span>':'')+'</div>')+
    (buttons?'<div class="simple-pos-part-controls"><label>Menge<input class="simple-pos-part-qty" type="number" min="1" max="'+max+'" value="1" inputmode="numeric"></label>'+
     '<div class="simple-pos-part-buttons">'+buttons+'</div></div>':'')+'</div>';
  }).join('');
  return '<div class="simple-pos-parts"><strong>Bauteile einzeln bearbeiten</strong>'+rows+'</div>';
 }
 function draw(){
  const found=locate();if(!found){if(focus.open)focus.close();return;}
  const snapshot=JSON.stringify([selected,found.line,findItem(found.line.item_id)?.i?.on_hand,
   (printTools.files||[]).filter(f=>String(f.listing_id)===listingOf(found.line)),
   (printTools.component_links||[]).filter(m=>String(m.listing_id)===listingOf(found.line)),
   (printTools.order_master_defaults||[]).filter(m=>String(m.listing_id)===listingOf(found.line))]);
  if(focus.open&&snapshot===positionSnapshot)return;
  positionSnapshot=snapshot;
  const {o,line}=found,st=status(line),component=composed(line);
  const q=num(line.quantity),open=num(line.remaining),printing=num(line.printing);
  const eligible=!!(line.item_id||line.local_custom);
  const partMode=component&&eligible&&(line.components||[]).length>0;
  const readyUnits=partMode?componentReadyUnits(line):0;
  const start=eligible&&!partMode&&open>0&&(!component||(line.components||[]).some(p=>p.kind==='demand'&&!p.error&&num(p.required)>num(p.printing)+num(p.finished)));
  const finish=eligible&&!partMode&&!complete(line)&&(component?q-num(line.assembled)>0:open+printing>0);
  const undoable=component?num(line.assembled):num(line.finished);
  const quantityMax=Math.max(1,start?open:0,finish?(component?q-num(line.assembled):open+printing):0,readyUnits,undoable);
  const image=thumbnail(line.image||'');
  const labels=[line.color?'Wunschfarbe: '+line.color:'',line.personalization?'Personalisierung: '+line.personalization:'',line.note?'Hinweis: '+line.note:''].filter(Boolean);
  const unknown=eligible&&!component&&!line.local_custom&&findItem(line.item_id)?.i.on_hand===null;
  $('order-position-title').textContent=o.customer;
  $('order-position-body').innerHTML='<div class="simple-pos-item">'+
   (image?'<img src="'+esc(image)+'" alt="" loading="lazy">':'')+
   '<div><small>BESTELLUNG #'+esc(o.id)+' · '+q+' STÜCK</small><h3>'+esc(orderShortProductTitle(line.title))+'</h3></div></div>'+
   orderVariantLabels(line.variant)+
   (labels.length?'<div class="simple-pos-extras">'+labels.map(x=>'<strong>'+esc(x)+'</strong>').join('')+'</div>':'')+
   (partMode?componentPartRows(line):productMasterHtml(line))+
   '<div class="simple-pos-state '+st[1]+'"><strong>'+esc(st[0])+'</strong>'+
   '<small>'+done(line)+' von '+q+' fertig'+(!component&&printing?' · '+printing+' im Druck':'')+'</small></div>'+
   (start||finish||readyUnits>0||undoable>1?
    '<label class="simple-pos-quantity">Stückzahl <input type="number" id="simple-pos-qty" inputmode="numeric" min="1" max="'+quantityMax+'" value="1"></label>':'')+
   (start||finish||readyUnits>0?
    (unknown&&finish?'<label class="simple-pos-initial">Bisheriger fertiger Lagerbestand<input type="number" id="simple-pos-stock" min="0" inputmode="numeric" placeholder="Vorher zählen"></label>':'')+
    '<div class="simple-pos-actions">'+(start?'<button type="button" class="secondary" data-focus-action="start">Drucken</button>':'')+
    (finish?'<button type="button" class="primary" data-focus-action="complete">✓ Fertig</button>':'')+
    (readyUnits?'<button type="button" class="primary" data-focus-action="assemble">✓ Produkt fertig ('+readyUnits+' möglich)</button>':'')+'</div>'+
    (partMode?'<p class="hint">Bauteile einzeln bestätigen, danach das vollständige Produkt als fertig markieren. Freies Lager bleibt unverändert.</p>':'<p class="hint">„Drucken“ merkt den Druckstart vor. „Fertig“ bestätigt die wirklich fertige Menge, auch ohne vorherigen Druckstart.</p>'):
    '<p class="hint">'+(complete(line)?'Diese Position ist fertig.':partMode?'Du kannst jedes Bauteil oben separat drucken und fertigmelden.':'Bei dieser Position sind noch Angaben zu prüfen.')+'</p>')+
   (undoable?'<div class="simple-pos-undo"><button type="button" data-focus-action="reopen">↶ Fertig rückgängig</button><small>Setzt '+(undoable>1?'die gewählte Anzahl':'diese Position')+' wieder auf offen, ohne neue Lagerbuchung.</small></div>':'')+
   '<button type="button" class="simple-pos-advanced-link" data-focus-more>Weitere Funktionen / Lagerverwaltung</button>';
 }
 function open(tid){
  selected=String(tid);if(!locate())return;
  if(details.open)details.close();
  draw();if(!focus.open)focus.showModal();
  ensureOrderMasterFiles(locate().line);
 }
 async function action(kind){
  const found=locate();if(!found||busy)return;
  const {o,line}=found,comp=composed(line),n=Number($('simple-pos-qty')?.value??1);
  const limit=kind==='reopen'?(comp?num(line.assembled):num(line.finished)):
   kind==='assemble'?componentReadyUnits(line):
   kind==='start'?num(line.remaining):
   comp?num(line.quantity)-num(line.assembled):num(line.remaining)+num(line.printing);
  if(!Number.isSafeInteger(n)||n<1||n>limit){flash('Bitte eine Stückzahl zwischen 1 und '+limit+' wählen.',true);return;}
  if(kind==='assemble'&&!confirm(n+' vollständige(s) Produkt(e) zusammengesetzt und geprüft?'))return;
  if(kind==='complete'&&comp&&!confirm(n+' Stück wirklich fertig für diesen Auftrag? Es wird nichts zusätzlich ins Lager gebucht.'))return;
  focus.querySelectorAll('input,button').forEach(x=>x.disabled=true);
  let ok=false;
  try{
   if(comp){
    ok=await mutate('components',{action:kind==='reopen'?'quick-reopen':kind==='start'?'quick-start':kind==='assemble'?'assemble':'quick-complete',transaction_id:line.transaction_id,quantity:n});
   }else if(line.local_custom){
    const result=await api('local-order',{action:'custom-job',transaction_id:line.transaction_id,
     action_type:kind==='reopen'?'reopen':kind==='start'?'start':'finish-direct',quantity:n});
    setModel(result.overview);flash(kind==='reopen'?'Fertigmeldung rückgängig gemacht.':'Produktionsstand gespeichert.');ok=true;
   }else{
    const foundItem=findItem(line.item_id);
    const body={transaction_id:line.transaction_id,receipt_id:o.id,
     action:kind==='reopen'?'reopen':kind==='start'?'printing':'finish-direct',quantity:n,revision:foundItem?.i.revision};
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
 async function partAction(button){
  const found=locate();if(!found||busy)return;
  const part=found.line.components?.find(p=>p.id===button.closest('[data-focus-component-id]')?.dataset.focusComponentId);
  if(!part||part.error)return;
  const kind=button.dataset.focusPartAction;
  const count=Number(button.closest('.simple-pos-part')?.querySelector('.simple-pos-part-qty')?.value||1);
  const max=Number(button.dataset.max);
  if(!Number.isSafeInteger(count)||count<1||count>max){
   flash('Bitte eine Menge zwischen 1 und '+max+' wählen.',true);return;
  }
  focus.querySelectorAll('input,button').forEach(x=>x.disabled=true);
  try{
   const ok=await mutate('components',{action:kind,transaction_id:found.line.transaction_id,
    component_id:part.id,quantity:count});
   if(ok){positionSnapshot='';draw();}
  }catch(e){flash(e.message,true);}
  finally{focus.querySelectorAll('input,button').forEach(x=>x.disabled=false);}
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
  const mapping=event.target.closest('[data-part-master-save]');
  if(mapping){savePartMaster(mapping);return;}
  const productMaster=event.target.closest('[data-order-master-save]');
  if(productMaster){saveProductOrderMaster(productMaster);return;}
  const part=event.target.closest('[data-focus-part-action]');
  if(part){partAction(part);return;}
  const a=event.target.closest('[data-focus-action]');if(a){action(a.dataset.focusAction);return;}
  if(event.target.closest('[data-focus-more]')){
   const row=locate();focus.close();
   if(row){showOrder(row.o.id);content.querySelector('.simple-order-advanced')?.setAttribute('open','');}
  }
 });
 const previousRender=render;
 render=function(){previousRender();if(details.open&&details.dataset.orderId)showOrder(details.dataset.orderId);if(focus.open)draw();};
})();
