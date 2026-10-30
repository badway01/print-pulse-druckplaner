'use strict';
/* Filament orders are separate from the Etsy/customer order workflow.
   No stock is moved until the user explicitly confirms a delivery. */
(() => {
 const node=id=>document.getElementById(id);
 const html=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const money=v=>v==null?'Preis offen':(v/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const inputMoney=v=>v==null?'':(v/100).toFixed(2).replace('.',',');
 const cents=v=>{
  const raw=String(v??'').trim();
  if(!raw)return null;
  const norm=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  if(!/^\d{1,8}(?:\.\d{1,2})?$/.test(norm))throw Error('Preis bitte in Euro eingeben (z. B. 9,00).');
  return Math.round(Number(norm)*100);
 };
 const escapeAttr=html;
 const orderBody=node('pp-purchase-body'),dialog=node('pp-purchase-dialog'),notice=node('pp-purchase-error');
 let orders=[],draft=null,mode='import',current=null,busy=false,loading=false;
 let receiptKey='';
 let expandedLines=new Set(),selectedLines=new Set(),activeLine=-1,importTimer=null;
 const emptyLine=()=>({brand:'',material:'PLA',color:'',manufacturer_code:'',
  internal_code:'',color_hex:'',filament_id:null,quantity:1,grams:1000,packaging:'unknown',
  gross_cents:null,description:'',accept_changes:[]});
 const today=()=>new Date().toISOString().slice(0,10);
 const emptyDraft=()=>({vendor:'',reference:'',ordered_on:today(),
  total_cents:null,discount_cents:0,credit_cents:0,shipping_cents:0,
  lines:[],fingerprint:'',source_type:'manual',warnings:[],expected_positions:0});
 function error(message){notice.textContent=message;notice.hidden=!message;if(message&&dialog.open)dialog.scrollTop=0;}
 function dialogOpen(title){node('pp-purchase-title').textContent=title;error('');if(!dialog.open)dialog.showModal();}
 function message(m){if(typeof flash==='function')flash(m);}
 function finish(){if(importTimer)clearTimeout(importTimer);dialog.close();error('');draft=null;current=null;activeLine=-1;}
 function orderStatus(o){
  return o.status+' · '+o.received_count+'/'+o.ordered_count+' Rollen';
 }
 function renderOrders(){
  const box=node('pp-purchase-list');
  if(!orders.length){box.innerHTML='<p class="hint">Noch keine Filamentbestellungen gespeichert. Importiere einen Screenshot oder lege eine Bestellung manuell an.</p>';return;}
  box.innerHTML=orders.map(o=>'<article class="pp-purchase-card"><div class="pp-purchase-card-top"><strong>'+
   html(o.vendor)+'</strong><span class="pp-purchase-status">'+html(o.status)+'</span></div>'+
   '<small>'+html(o.ordered_on||'Datum offen')+(o.reference?' · '+html(o.reference):'')+'</small>'+
   '<span>'+o.received_count+' von '+o.ordered_count+' Rollen erhalten</span>'+
   '<strong>'+money(o.total_cents)+'</strong>'+
   (o.status==='Erhalten'?'<small>Vollständig eingebucht · Einkaufsarchiv</small>':
    '<button type="button" class="secondary" data-pp-open="'+html(o.id)+'">Lieferung erfassen</button>')+
   '</article>').join('');
 }
 async function refresh(){
  if(loading)return;
  loading=true;
  try{
   const data=await api('filament-orders');
   orders=data.orders||[];
   renderOrders();
  }catch(ex){node('pp-purchase-list').textContent='Bestellungen nicht verfügbar: '+ex.message;}
  finally{loading=false;}
 }

 // Manual purchase entry is the default workflow. OCR remains optional.
 function newManualLine(){
  return {...emptyLine(),brand:'Bambu Lab',material:'PLA Basic',packaging:'unknown',
   _manualType:'search',_query:'',_priceInput:''};
 }
 const searchableCatalog=()=>catalog().slice().sort((a,b)=>
   String(a.color||'').localeCompare(String(b.color||''),'de'));
 const normalizeSearch=value=>String(value??'').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 function matchingFilaments(q){
  const parts=normalizeSearch(q).trim().split(/\s+/).filter(Boolean);
  if(!parts.length)return [];
  return searchableCatalog().filter(f=>{
   const terms=normalizeSearch([f.brand,f.material,f.color,f.manufacturer_code,f.internal_code].join(' '));
   return parts.every(p=>terms.includes(p));
  }).slice(0,7);
 }
 function spoolLabel(f){
  return [f.material,f.color,(f.manufacturer_code?'('+f.manufacturer_code+')':null),
   (f.internal_code?'· Intern '+f.internal_code:null)].filter(Boolean).join(' ');
 }
 function manualOptions(index,query){
  const found=matchingFilaments(query);
  if(!query.trim())return '<p class="pp-muted">Tippe einen Farbcode oder Farbnamen, z. B. 10100 oder Jade-Weiß.</p>';
  return found.map(f=>'<button type="button" class="pp-m-suggestion" data-pp-m-action="pick" data-pp-m-index="'+index+
   '" data-pp-m-id="'+f.id+'"><span class="pp-m-swatch" style="background:'+(
    /^#[0-9a-fA-F]{6}$/.test(f.color_hex||'')?f.color_hex:'#c1c9c1')+'"></span>'+
    '<span>'+html(spoolLabel(f))+'<small>'+html(f.brand)+'</small></span></button>').join('')+
   (found.length?'':'<small class="pp-muted">Keine passende Farbe in der Filamentbibliothek gefunden.</small>');
 }
 function manualSelect(index,filament){
  const l=draft.lines[index];
  if(!l||!filament)return;
  Object.assign(l,{brand:filament.brand,material:filament.material,color:filament.color,
   manufacturer_code:filament.manufacturer_code||'',internal_code:filament.internal_code||'',
   color_hex:filament.color_hex||'',filament_id:filament.id,_manualType:'selected',
   _query:'',ambiguous:false,accept_changes:[],reviewed:true});
 }
 function manualLine(l,i){
  const stored=l.filament_id?catalog().find(x=>Number(x.id)===Number(l.filament_id)):null;
  const state=l._manualType||'search';
  const base='<div class="pp-m-row-head"><strong>'+(i+1)+'. '+
   (state==='selected'&&stored?html(spoolLabel(stored)):state==='new'?(html(l.color)||'Neue Farbe'):'Filament auswählen')+
   '</strong><button class="secondary small pp-m-remove" type="button" aria-label="Position '+(i+1)+
   ' entfernen" data-pp-m-action="remove" data-pp-m-index="'+i+'">Entfernen</button></div>';
  let choice='';
  if(state==='selected'&&stored){
   choice='<div class="pp-m-chosen"><span>Aus deiner Bibliothek · '+html(stored.brand)+'</span>'+
    '<button type="button" class="secondary small" data-pp-m-action="change" data-pp-m-index="'+i+'">Andere Farbe</button></div>';
  }else if(state==='new'){
   const mats=['PLA Basic','PLA Matte','PETG Basic','PETG Matte','PLA Silk','ABS','ASA','TPU'];
   choice='<div class="pp-m-new"><div class="pp-m-new-head"><strong>Neue Farbe für die Bibliothek</strong>'+
    '<button type="button" class="secondary small" data-pp-m-action="change" data-pp-m-index="'+i+'">Vorhandene suchen</button></div>'+
    '<div class="pp-m-new-fields">'+
     '<label>Hersteller<input data-pp-m-index="'+i+'" data-pp-m-field="brand" value="'+escapeAttr(l.brand)+'"></label>'+
     '<label>Material<select data-pp-m-index="'+i+'" data-pp-m-field="material">'+
     mats.map(m=>'<option value="'+html(m)+'" '+(l.material===m?'selected':'')+'>'+html(m)+'</option>').join('')+
     (mats.includes(l.material)?'':'<option selected value="'+escapeAttr(l.material)+'">'+html(l.material)+'</option>')+
     '</select></label>'+
     '<label>Farbe <span class="pp-m-required">*</span><input data-pp-m-index="'+i+
      '" data-pp-m-field="color" value="'+escapeAttr(l.color)+'" placeholder="z. B. Jade-Weiß"></label>'+
     '<label>Bambu-Code (optional)<input data-pp-m-index="'+i+
      '" data-pp-m-field="manufacturer_code" value="'+escapeAttr(l.manufacturer_code)+'" inputmode="numeric" placeholder="z. B. 10100"></label></div>'+
     '<details class="pp-m-extras"><summary>Interner Code, HEX und weitere Angaben</summary><div class="pp-m-new-fields">'+
      '<label>Interner Farbcode<input data-pp-m-index="'+i+'" data-pp-m-field="internal_code" value="'+escapeAttr(l.internal_code)+'" inputmode="decimal"></label>'+
      '<label>HEX-Farbwert<input data-pp-m-index="'+i+'" data-pp-m-field="color_hex" value="'+escapeAttr(l.color_hex)+'" placeholder="#ffffff"></label>'+
      '<label>Gramm pro Rolle<input data-pp-m-index="'+i+'" data-pp-m-field="grams" type="number" min="50" max="5000" value="'+l.grams+'" inputmode="numeric"></label>'+
      '<label>Notiz<input data-pp-m-index="'+i+'" data-pp-m-field="description" value="'+escapeAttr(l.description)+'"></label></div></details>'+
    '</div>';
  }else{
   choice='<label class="pp-m-search-label">Filament aus deiner Bibliothek suchen'+
     '<input type="search" data-pp-m-search="'+i+'" autocomplete="off" value="'+escapeAttr(l._query||'')+
      '" placeholder="Farbname, Bambu-Code oder interne Nummer"></label>'+
     '<div class="pp-m-suggestions" data-pp-m-results="'+i+'">'+manualOptions(i,l._query||'')+'</div>'+
     '<button class="secondary pp-m-new-button" type="button" data-pp-m-action="new" data-pp-m-index="'+i+'">+ Neue Farbe anlegen</button>';
  }
  return '<article class="pp-m-row" data-pp-m-row="'+i+'">'+base+choice+
   '<div class="pp-m-quick"><label>Rollen<input type="number" min="1" max="500" step="1" inputmode="numeric" data-pp-m-field="quantity" data-pp-m-index="'+i+'" value="'+escapeAttr(l.quantity)+'"></label>'+
   '<label>Verpackung<select data-pp-m-field="packaging" data-pp-m-index="'+i+'">'+
    [['unknown','Bitte wählen'],['spool','Mit Spule'],['refill','Refill']].map(([v,txt])=>
     '<option value="'+v+'" '+(l.packaging===v?'selected':'')+'>'+txt+'</option>').join('')+'</select></label>'+
   '<label>Positionspreis gesamt (€)<input type="text" inputmode="decimal" placeholder="z. B. 31,78" data-pp-m-field="_priceInput" data-pp-m-index="'+i+
    '" value="'+escapeAttr(l._priceInput??inputMoney(l.gross_cents))+'"></label></div></article>';
 }
 function manualHeaderInput(title,k,value,type='text'){
  return '<label>'+html(title)+'<input data-pp-m-header="'+k+'" type="'+type+
   '" value="'+escapeAttr(value??'')+'"></label>';
 }
 function renderManual(){
  mode='manual-order';
  dialogOpen('Filamentbestellung erfassen');
  const d=draft;
  const entered=d.lines.reduce((sum,l)=>{try{return sum+(cents(l._priceInput??inputMoney(l.gross_cents))||0);}catch{return sum;}},0);
  const count=d.lines.reduce((sum,l)=>sum+(Number(l.quantity)||0),0);
  orderBody.innerHTML='<div class="pp-m-intro">Wähle deine bekannten Farben aus oder lege eine neue direkt hier an. Keine Screenshots nötig.</div>'+
   '<div class="pp-m-order-header">'+
    manualHeaderInput('Händler','vendor',d.vendor)+
    manualHeaderInput('Bestelldatum','ordered_on',d.ordered_on,'date')+
    manualHeaderInput('Bestellnummer (optional)','reference',d.reference)+
    manualHeaderInput('Gezahlt gesamt (€), optional','_totalInput',d._totalInput??inputMoney(d.total_cents))+
    '</div>'+
   '<div class="pp-m-head"><strong>Filamente</strong><span>'+d.lines.length+' Positionen · '+count+' Rollen</span></div>'+
   '<div class="pp-m-lines">'+d.lines.map(manualLine).join('')+'</div>'+
   '<button type="button" class="secondary pp-m-add" data-pp-m-action="add">+ Weiteres Filament hinzufügen</button>'+
   '<details class="pp-m-adjustments"><summary>Rabatt, Guthaben und Versand (optional)</summary>'+
     '<div class="pp-m-order-header">'+
     manualHeaderInput('Zusätzlicher Rabatt (€)','_discountInput',d._discountInput??inputMoney(d.discount_cents))+
     manualHeaderInput('Guthaben (€)','_creditInput',d._creditInput??inputMoney(d.credit_cents))+
     manualHeaderInput('Versand (€)','_shippingInput',d._shippingInput??inputMoney(d.shipping_cents))+
     '</div></details>'+
   '<div class="pp-m-total"><span>Erfasste Positionspreise</span><strong>'+money(entered)+'</strong>'+
     '<small>Preise sind optional. Bei mehreren Rollen gibst du den Preis der gesamten Position ein. Die Zahlungs- und Positionssumme kannst du später abgleichen.</small></div>'+
   '<div class="pp-review-footer pp-m-footer"><span>'+count+' Rollen</span>'+
    '<button type="button" class="primary" data-pp-m-action="save">Bestellung speichern</button>'+
    '<button type="button" class="secondary" data-pp-m-action="save-receive">Speichern + erhalten</button></div>';
 }
 async function startManual(){
  // Ensure the actual library is ready, even if a user opens the dialog fast.
  if(typeof filamentData!=='undefined'&&!filamentData&&typeof loadFilaments==='function'){
   try{await loadFilaments();}catch(ex){message('Bibliothek konnte noch nicht geladen werden.');}
  }
  draft=emptyDraft();
  draft.vendor='Bambu Lab';
  draft.source_type='manual';
  draft.lines=[newManualLine()];
  renderManual();
 }
 function takeManual(){
  if(!draft)return;
  for(const el of orderBody.querySelectorAll('[data-pp-m-header]')){
   draft[el.dataset.ppMHeader]=el.value.trim();
  }
  for(const el of orderBody.querySelectorAll('[data-pp-m-field]')){
   const line=draft.lines[Number(el.dataset.ppMIndex)];
   if(!line)continue;
   const key=el.dataset.ppMField;
   line[key]=(key==='quantity'||key==='grams')?Number(el.value):el.value.trim();
  }
  draft.total_cents=cents(draft._totalInput??'');
  draft.discount_cents=cents(draft._discountInput??'')??0;
  draft.credit_cents=cents(draft._creditInput??'')??0;
  draft.shipping_cents=cents(draft._shippingInput??'')??0;
  for(const l of draft.lines)l.gross_cents=cents(l._priceInput??'');
 }

 function importView(){
  mode='import';
  dialogOpen('Bestellung importieren');
  orderBody.innerHTML='<p class="pp-muted">Bambu, Amazon oder andere Händler: Bild, PDF oder Text. Bei unsicheren Angaben kannst du jede Position ändern.</p>'+
   '<label class="pp-drop" id="pp-drop"><strong>Foto, Screenshot oder PDF auswählen</strong>'+
   '<span class="pp-muted">Bilder über 12 MB werden automatisch verkleinert. PDF maximal 12 MB.</span>'+
   '<input type="file" id="pp-file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.png,.jpg,.jpeg,.webp,.pdf,.txt"></label>'+
   '<label>Bestelltext einfügen – startet von selbst<textarea id="pp-import-text" placeholder="Bambu-Bestellübersicht hier einfügen …"></textarea></label>'+
   '<p class="pp-muted">Bestelltext und kopierte Screenshots werden nach dem Einfügen automatisch erkannt.</p>'+ 
   '<p class="pp-import-progress" id="pp-import-progress" role="status" hidden>Bestellung wird erkannt …</p>'+ 
   '<div class="pp-purchase-actions"><button type="button" class="secondary" data-pp-action="manual">Ohne Dokument erfassen</button>'+
   '<button type="button" class="primary" data-pp-action="parse">Text prüfen</button></div>';
 }
 function fromPreview(preview){
  draft=emptyDraft();
  Object.assign(draft,{
   vendor:preview.vendor||'',ordered_on:preview.ordered_on||today(),
   reference:preview.reference||'',total_cents:preview.total_cents,
   discount_cents:preview.discount_cents||0,credit_cents:preview.credit_cents||0,
   shipping_cents:preview.shipping_cents||0,fingerprint:preview.fingerprint||'',
   source_type:preview.source_type||'text',warnings:preview.warnings||[],
   expected_positions:Number(preview.expected_positions)||0,
   lines:(preview.items||[]).map(l=>({...emptyLine(),...l,accept_changes:[]}))
  });
  expandedLines=new Set();selectedLines=new Set();
  activeLine=draft.lines.findIndex(isUnresolved);
  showReview();
 }
 function catalog(){
  return typeof filamentData!=='undefined'?(filamentData?.filaments||[]):[];
 }
 function existingLine(line){
  if(!line.filament_id)return null;
  return catalog().find(f=>f.id===Number(line.filament_id))||line.existing||null;
 }

 function field(labelText,name,value,index,type='text',other=''){
  const fieldId='pp-l-'+index+'-'+name;
  return '<label for="'+fieldId+'">'+html(labelText)+'<input id="'+fieldId+'" type="'+type+
   '" data-pp-line="'+index+'" data-pp-field="'+name+'" '+other+' value="'+escapeAttr(value??'')+'"></label>';
 }
 function metadataInput(labelText,name,value){
  return '<label>'+html(labelText)+'<input data-pp-header="'+name+'" value="'+escapeAttr(value??'')+'"></label>';
 }
 function catalogDifferences(line){
  const f=existingLine(line);
  if(!f)return [];
  return [['brand','Hersteller'],['material','Material'],['color','Farbe'],
   ['manufacturer_code','Herstellercode'],['color_hex','HEX-Farbwert']].filter(([k])=>
    line[k]&&String(line[k]).toLowerCase()!==String(f[k]||'').toLowerCase());
 }
 function requiredProblems(line){
  const problems=[];
  if(!line.brand||!line.material||!line.color)problems.push('Hersteller, Material oder Farbe fehlen');
  if(!Number.isInteger(Number(line.quantity))||Number(line.quantity)<1)problems.push('Rollenanzahl ungültig');
  if(!Number.isInteger(Number(line.grams))||Number(line.grams)<50)problems.push('Grammangabe ungültig');
  if(line.ambiguous&&!line.filament_id)problems.push('Filament-Zuordnung mehrdeutig');
  return problems;
 }
 function lineHints(line){
  const hints=requiredProblems(line);
  if(line.gross_cents==null)hints.push('Positionspreis nicht erkannt');
  if(!line.manufacturer_code&&!existingLine(line))hints.push('Herstellercode nicht erkannt');
  if(line.packaging==='unknown')hints.push('Spule oder Refill unklar');
  if(catalogDifferences(line).length)hints.push('Abweichung zu vorhandenen Stammdaten');
  return hints;
 }
 function isUnresolved(line){
  return requiredProblems(line).length>0||(lineHints(line).length>0&&!line.reviewed);
 }

 function summaryLine(line,i){
  const issue=isUnresolved(line),found=!!existingLine(line);
  const color=[line.material,line.color||'Farbe fehlt'].filter(Boolean).join(' · ');
  return '<article class="pp-review-row">'+
    '<label class="pp-review-select"><input type="checkbox" aria-label="Position '+(i+1)+' auswählen" data-pp-select="'+i+'" '+
    (selectedLines.has(i)?'checked':'')+'></label>'+
    '<button type="button" class="pp-review-row-btn" data-pp-action="focus" data-pp-index="'+i+'">'+
    '<span class="pp-review-main"><strong>'+(i+1)+'. '+html(color)+'</strong>'+
    '<small>'+html(line.manufacturer_code||'Code offen')+' · '+html(line.quantity)+' Rolle(n) · '+money(line.gross_cents)+'</small></span>'+
    '<span class="pp-line-state '+(issue?'pp-line-attention':'pp-line-ok')+'">'+
    (issue?'Prüfen':found?'Zugeordnet':'Neu')+'</span><span aria-hidden="true">›</span></button></article>';
 }

 function reviewLine(line,i){
  const f=existingLine(line);
  const ids=catalog().slice();
  if(f&&!ids.some(row=>row.id===f.id))ids.unshift(f);
  const options='<option value="">Automatisch zuordnen / neue Farbe</option>'+
   ids.map(row=>'<option value="'+row.id+'" '+(f&&f.id===row.id?'selected':'')+'>'+
    html((row.internal_code?'Intern '+row.internal_code+' · ':'')+
    row.brand+' · '+row.material+' · '+row.color+
    (row.manufacturer_code?' ('+row.manufacturer_code+')':''))+'</option>').join('');
  const differences=catalogDifferences(line);
  const changes=f?(differences.length?
    '<div class="pp-changes"><b>Abweichung zum vorhandenen Lager</b>'+
    differences.map(([k,title])=>'<div class="pp-change-row">'+
     '<input type="checkbox" data-pp-line="'+i+'" data-pp-accept="'+k+'" '+
      ((line.accept_changes||[]).includes(k)?'checked':'')+'>'+
     '<label>'+html(title)+': <s>'+html(f[k]||'fehlt')+'</s> → <b>'+html(line[k])+'</b>'+
     '<small> · Nur mit Häkchen übernehmen</small></label></div>').join('')+'</div>':
    '<small class="pp-muted">Vorhandenes Filament erkannt; Stammdaten bleiben unverändert.</small>'):
    '<small class="pp-muted">Neue Farbe: wird beim Speichern mit Lagerbestand 0 angelegt. Internen Farbcode bei Bedarf vergeben.</small>';
  const hints=lineHints(line),unresolved=isUnresolved(line),found=!!f;
  const name=html([line.brand,line.material,line.color||'Farbe fehlt'].filter(Boolean).join(' · '));
  const detail=html((line.manufacturer_code?'Code '+line.manufacturer_code+' · ':'')+
    (line.quantity||0)+' Rolle(n) · '+(line.grams||1000)+' g · '+
    ({spool:'mit Spule',refill:'Refill',unknown:'Verpackung offen'}[line.packaging]||'Verpackung offen')+
    ' · '+(line.gross_cents==null?'Preis offen':money(line.gross_cents)));
  const open=' open';
  return '<article class="pp-line pp-line-compact">'+
   '<label class="pp-line-select"><input type="checkbox" data-pp-select="'+i+'" '+
    (selectedLines.has(i)?'checked':'')+'> Auswahl</label>'+
   '<details class="pp-line-details" data-pp-details="'+i+'"'+open+'>'+
   '<summary class="pp-line-summary"><span class="pp-line-name"><strong>'+(i+1)+'. '+name+'</strong>'+
    '<small>'+detail+'</small></span>'+
    '<span class="pp-line-state '+(unresolved?'pp-line-attention':'pp-line-ok')+'">'+
      (unresolved?'Prüfen':found?'Zugeordnet':'Neu')+'</span><span class="pp-edit-hint">Bearbeiten ▾</span></summary>'+
   '<div class="pp-line-editor">'+
   (hints.length?'<p class="pp-line-hints">'+html(hints.join(' · '))+'</p>':'')+
   '<div class="pp-line-buttons"><button type="button" class="secondary small" data-pp-action="split" data-pp-index="'+i+'">Preis aufteilen</button>'+
   '<button type="button" class="secondary small" data-pp-action="remove" data-pp-index="'+i+'">Entfernen</button></div>'+
   '<div class="pp-line-fields pp-line-key-fields">'+
    field('Farbe','color',line.color,i)+
    field('Hersteller-Farbcode','manufacturer_code',line.manufacturer_code,i)+
    field('Rollen','quantity',line.quantity,i,'number','min="1" max="500" step="1" inputmode="numeric"')+
    field('Positionspreis gesamt (€)','gross_cents',inputMoney(line.gross_cents),i,'text','inputmode="decimal"')+'</div>'+
    '<div class="pp-line-basic"><label>Spule / Refill<select data-pp-line="'+i+'" data-pp-field="packaging">'+
    [['unknown','Unbekannt'],['spool','Mit Spule'],['refill','Refill']].map(v=>
     '<option value="'+v[0]+'" '+(line.packaging===v[0]?'selected':'')+'>'+v[1]+'</option>').join('')+
    '</select></label></div>'+
    changes+
    '<details class="pp-line-extra"><summary>Weitere Angaben bearbeiten (Hersteller, Material, interner Code …)</summary>'+
    '<div class="pp-line-fields">'+
    field('Hersteller','brand',line.brand,i)+field('Material','material',line.material,i)+
    field('Interner Farbcode (manuell)','internal_code',line.internal_code,i)+
    field('HEX-Farbwert (nur aus sicherer Quelle)','color_hex',line.color_hex,i)+
    field('Gramm pro Rolle','grams',line.grams,i,'number','min="50" max="5000" step="1" inputmode="numeric"')+
    '</div><div class="pp-purchase-fields"><label>Vorhandenes Filament zuordnen<select data-pp-line="'+i+
    '" data-pp-field="filament_id">'+options+'</select></label>'+
    field('Zusatzinfo','description',line.description,i)+'</div></details>'+
    '<div class="pp-review-editor-actions"><button type="button" class="secondary" data-pp-action="overview">Zur Übersicht</button>'+
    '<button type="button" class="primary" data-pp-action="reviewed" data-pp-index="'+i+'">'+
    (hints.length?'Geprüft · nächste Position':'Weiter')+'</button></div>'+
    '</div></details></article>';
 }
 function takeReview(){
  if(!draft)return;
  for(const el of orderBody.querySelectorAll('[data-pp-header]')){
   const k=el.dataset.ppHeader;
   draft[k]=k.endsWith('_cents')?(cents(el.value)??0):el.value.trim();
   if(k==='total_cents')draft[k]=cents(el.value);
  }
  for(const el of orderBody.querySelectorAll('[data-pp-field]')){
   const line=draft.lines[Number(el.dataset.ppLine)],k=el.dataset.ppField;
   if(!line)continue;
   let value;
   if(k==='gross_cents')value=cents(el.value);
   else if(k==='quantity'||k==='grams')value=Number(el.value);
   else if(k==='filament_id')value=el.value?Number(el.value):null;
   else value=el.value.trim();
   if(line[k]!==value){
    line[k]=value;line.reviewed=false;
    if(k==='filament_id'){line.ambiguous=false;line.existing=null;}
   }
  }
  // Preserve previously confirmed changes to other (currently hidden) positions.
  if(activeLine>=0&&draft.lines[activeLine])draft.lines[activeLine].accept_changes=[];
  for(const el of orderBody.querySelectorAll('[data-pp-accept]:checked')){
   const line=draft.lines[Number(el.dataset.ppLine)];
   if(line)line.accept_changes.push(el.dataset.ppAccept);
  }
 }

 function showReview(){
  mode='review';
  dialogOpen('Filamentbestellung prüfen');
  const d=draft;
  if(activeLine>=d.lines.length)activeLine=-1;
  const known=d.lines.every(l=>l.gross_cents!=null);
  const sum=known?d.lines.reduce((s,l)=>s+l.gross_cents,0)-d.discount_cents-d.credit_cents+d.shipping_cents:null;
  const difference=d.total_cents!=null&&sum!=null&&sum!==d.total_cents;
  const unresolved=d.lines.filter(isUnresolved).length;
  const missingFromSource=Math.max(0,(d.expected_positions||0)-d.lines.length);
  const matched=d.lines.filter(l=>!isUnresolved(l)&&!!existingLine(l)).length;
  const newCount=d.lines.length-unresolved-matched;
  const selected=activeLine>=0?d.lines[activeLine]:null;
  orderBody.innerHTML=
   '<div class="pp-review-top">'+
   (missingFromSource?'<p class="pp-warning"><b>Unvollständige Erkennung:</b> '+d.lines.length+' von mindestens '+d.expected_positions+' Positionen erkannt. Bitte fehlende Positionen ergänzen oder Screenshot erneut importieren.</p>':'')+
   '<div class="pp-import-summary"><span><b>'+d.lines.length+'</b> Positionen</span>'+
   '<span class="pp-sum-ok"><b>'+matched+'</b> zugeordnet</span>'+
   '<span><b>'+newCount+'</b> neu</span>'+
   '<span class="'+(unresolved?'pp-sum-alert':'pp-sum-ok')+'"><b>'+unresolved+'</b> zu prüfen</span></div>'+
   '<div class="pp-review-progress"><strong>'+unresolved+' von '+d.lines.length+' zu prüfen</strong>'+
   '<span>'+d.lines.filter(l=>!isUnresolved(l)).length+' erledigt</span></div></div>'+
   (selected?'<section class="pp-review-focus"><div class="pp-review-focus-heading"><strong>Position '+(activeLine+1)+' bearbeiten</strong>'+
    '<button type="button" class="secondary small" data-pp-action="overview">Zur Liste</button></div>'+
    reviewLine(selected,activeLine)+'</section>':
    '<p class="pp-review-ready">'+(unresolved?'Tippe eine orange Position oder „Nächste prüfen“.':'Alle Positionen sind bereit. Du kannst sie jederzeit bearbeiten oder gesammelt speichern.')+'</p>')+
   '<div class="pp-line-heading"><h3>Alle Positionen</h3><small>Tippe zum Bearbeiten</small></div>'+
   '<div class="pp-review-list">'+d.lines.map(summaryLine).join('')+'</div>'+
   (unresolved?'<button type="button" class="secondary" data-pp-action="next-issue">Nächste ungeprüfte Position öffnen</button>':'')+
   '<details class="pp-order-meta" '+(!d.vendor||difference?'open':'')+'><summary><strong>Bestelldaten</strong> · '+
   html(d.vendor||'Händler fehlt')+' · '+html(d.ordered_on)+' · '+money(d.total_cents)+' · Bearbeiten ▾</summary>'+
   '<div class="pp-purchase-fields">'+metadataInput('Händler','vendor',d.vendor)+
   metadataInput('Bestellnummer (optional)','reference',d.reference)+
   '<label>Bestelldatum<input type="date" data-pp-header="ordered_on" value="'+escapeAttr(d.ordered_on)+'"></label>'+
   metadataInput('Rechnungsbetrag brutto (€)','total_cents',inputMoney(d.total_cents))+
   metadataInput('Gesamtrabatt (€)','discount_cents',inputMoney(d.discount_cents))+
   metadataInput('Eingesetztes Guthaben (€)','credit_cents',inputMoney(d.credit_cents))+
   metadataInput('Versandkosten (€)','shipping_cents',inputMoney(d.shipping_cents))+'</div></details>'+
   (d.warnings.length?'<details class="pp-order-meta"><summary>Hinweise zur Texterkennung</summary><p class="pp-warning">'+
      d.warnings.map(html).join(' · ')+'</p></details>':'')+
   '<button type="button" class="secondary" data-pp-action="add">+ Position manuell hinzufügen</button>'+
   '<details class="pp-order-meta pp-bulk-details"><summary>Mehrfachbearbeitung · '+selectedLines.size+' ausgewählt</summary>'+
   '<div class="pp-bulk-tools"><div class="pp-bulk-head"><strong>Ausgewählte Positionen gemeinsam ändern</strong>'+
   '<button type="button" class="secondary small" data-pp-action="select-all">Alle auswählen</button>'+
   '<button type="button" class="secondary small" data-pp-action="select-none">Auswahl aufheben</button></div>'+
   '<div class="pp-bulk-fields"><select id="pp-bulk-field" aria-label="Feld für Mehrfachbearbeitung">'+
   '<option value="quantity">Rollenanzahl</option><option value="grams">Gramm pro Rolle</option>'+
   '<option value="gross_cents">Positionspreis gesamt (€)</option>'+
   '<option value="packaging">Verpackung</option></select>'+
   '<input id="pp-bulk-value" aria-label="Neuer Wert" placeholder="z. B. 2 oder 19,90">'+
   '<button type="button" class="secondary" data-pp-action="bulk">Auswahl ändern</button></div>'+
   '<small class="pp-muted">Der Preis gilt je Position, nicht je Rolle.</small></div></details>'+
   '<p class="pp-muted">Berechnete Summe: <strong>'+money(sum)+'</strong>'+
   (difference?' · Achtung: weicht vom Rechnungsbetrag ab.':'')+'</p>'+
   '<div class="pp-review-footer"><span><b>'+unresolved+'</b> zu prüfen</span>'+
   '<button type="button" class="secondary" data-pp-action="save">Alle '+d.lines.length+' speichern</button>'+
   '<button type="button" class="primary" data-pp-action="save-receive">Speichern + erhalten</button></div>';
  dialog.scrollTop=0;
 }
 function showReceipt(order){
  current=order;
  mode='receipt';
  dialogOpen('Lieferung erfassen · '+order.vendor);
  receiptKey=(window.crypto?.randomUUID?.()||'booking-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const pending=order.lines.filter(l=>l.remaining>0);
  orderBody.innerHTML='<p>Wie viele Rollen sind angekommen? <b>Alle offenen Mengen sind vorausgewählt.</b> Nur fehlende Rollen reduzieren oder auf 0 setzen.</p>'+
   pending.map(l=>'<div class="pp-receive-row"><div><strong>'+html(l.color)+' · '+html(l.material)+'</strong>'+
    '<br><small>'+html(l.brand)+' · Hersteller '+html(l.manufacturer_code||'ohne Code')+
    ' · Noch offen: '+l.remaining+' · Preis: '+money(l.effective_cents)+'</small></div>'+
    '<label>Erhalten<input type="number" data-pp-receive="'+l.id+'" data-pp-expected="'+l.received+
    '" min="0" max="'+l.remaining+'" step="1" value="'+l.remaining+'"></label></div>').join('')+
   '<div class="pp-purchase-actions"><button type="button" class="secondary" data-pp-action="all-zero">Alle auf 0</button>'+
   '<button type="button" class="primary" data-pp-action="receive">Wareneingang buchen</button></div>'+
   '<p class="pp-muted">Nur die eingetragenen Mengen werden ins Lager gebucht. Der Rest bleibt bei dieser Bestellung offen. Jede Buchung wird protokolliert und vor Doppelbuchung geschützt.</p>';
 }
 async function save(nowReceive){
  if(busy)return;
  try{
   const isManual=mode==='manual-order';
   if(isManual)takeManual();else takeReview();
   if(!isManual&&draft.expected_positions&&draft.lines.length<draft.expected_positions){
    activeLine=-1;showReview();
    throw Error('Unvollständiger Import: '+draft.lines.length+' von '+draft.expected_positions+' Positionen. Bitte noch nicht speichern.');
   }
   if(!isManual&&draft.lines.some(isUnresolved)){
    const missing=draft.lines.filter(isUnresolved).length;
    activeLine=draft.lines.findIndex(isUnresolved);
     showReview();
     throw Error(missing+' Position(en) noch ungeprüft. Die nächste ist oben geöffnet.');
   }
   if(!draft.lines.length)throw Error('Mindestens eine Position hinzufügen.');
   for(const l of draft.lines){
    if(!l.brand||!l.material||!l.color)throw Error('Bitte Hersteller, Material und Farbe jeder Position ausfüllen.');
    if(!Number.isInteger(l.quantity)||l.quantity<1||!Number.isInteger(l.grams)||l.grams<50)throw Error('Rollenanzahl und Grammzahl prüfen.');
   }
   const d=draft,known=d.lines.every(l=>l.gross_cents!=null);
   const calc=known?d.lines.reduce((n,l)=>n+l.gross_cents,0)-d.discount_cents-d.credit_cents+d.shipping_cents:null;
   const mismatch=d.total_cents!=null&&calc!==null&&calc!==d.total_cents;
   if(mismatch&&!confirm('Die Positionssumme stimmt nicht mit dem Rechnungsbetrag überein. Trotzdem ausdrücklich speichern?'))return;
   if(nowReceive&&!confirm('Alle eingetragenen Rollen als tatsächlich angekommen verbuchen?'))return;
   busy=true;error('');
   const result=await api('filament-orders',{action:'create',...d,confirm_total_difference:mismatch});
   orders=result.orders||[];
   renderOrders();
   await loadFilaments();
   if(nowReceive){
    const order=orders.find(o=>o.id===result.order_id);
    if(!order)throw Error('Bestellung gespeichert, bitte für den Wareneingang neu öffnen.');
    current=order;
    const request_key=window.crypto?.randomUUID?.()||'booking-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    const r=await api('filament-orders',{action:'receive',order_id:order.id,request_key,
     lines:order.lines.map(l=>({id:l.id,quantity:l.remaining,expected_received:l.received}))});
    orders=r.orders||[];renderOrders();
    await loadFilaments();
    message('Bestellung gespeichert und '+order.ordered_count+' Rollen eingebucht.');
   }else message('Filamentbestellung gespeichert. Bestand bleibt bis zur Lieferung unverändert.');
   finish();
  }catch(ex){error(ex.message);}
  finally{busy=false;}
 }
 async function bookReceipt(){
  if(busy||!current)return;
  const payload=[];
  for(const input of orderBody.querySelectorAll('[data-pp-receive]')){
   const line=current.lines.find(l=>l.id===Number(input.dataset.ppReceive));
   const qty=Number(input.value);
   if(!line||!Number.isInteger(qty)||qty<0||qty>line.remaining){error('Erhaltene Rollen dürfen die noch offene Menge nicht überschreiten.');return;}
   payload.push({id:line.id,quantity:qty,expected_received:line.received});
  }
  const total=payload.reduce((n,l)=>n+l.quantity,0);
  if(!total){error('Bitte mindestens eine Rolle auswählen.');return;}
  if(!confirm(total+' Rolle(n) wirklich ins Filamentlager einbuchen?'))return;
  busy=true;error('');
  try{
   const result=await api('filament-orders',{action:'receive',order_id:current.id,request_key:receiptKey,lines:payload});
   orders=result.orders||[];
   renderOrders();
   await loadFilaments();
   finish();
   message(total+' Rollen ins Filamentlager eingebucht. Restlieferungen bleiben offen.');
  }catch(ex){error(ex.message+' Bitte Bestellung aktualisieren, nicht blind erneut buchen.');}
  finally{busy=false;}
 }

 const MAX_IMPORT_BYTES=12*1024*1024;
 async function prepareImportImage(file){
  if(file.size<=MAX_IMPORT_BYTES)return file;
  const mime=file.type||({'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp'}[file.name.split('.').pop().toLowerCase()]);
  if(!['image/png','image/jpeg','image/webp'].includes(mime)){
   throw Error('Datei zu groß (maximal 12 MB). Bitte PDF verkleinern oder Bestelltext einfügen.');
  }
  const url=URL.createObjectURL(file);
  try{
   const img=await new Promise((resolve,reject)=>{
    const element=new Image();
    element.onload=()=>resolve(element);
    element.onerror=()=>reject(Error('Bild konnte nicht geöffnet werden.'));
    element.src=url;
   });
   const scale=Math.min(1,2800/img.naturalWidth,9500/img.naturalHeight);
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('Bildverkleinerung wird von diesem Browser nicht unterstützt.');
   ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   for(const quality of [0.87,0.74,0.60]){
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
    if(blob&&blob.size<=MAX_IMPORT_BYTES){
     return new File([blob],file.name.replace(/\.[^.]+$/,'')+'-komprimiert.jpg',{type:'image/jpeg'});
    }
   }
   throw Error('Foto ist selbst nach Verkleinerung noch zu groß. Bitte einen kleineren Ausschnitt wählen.');
  }finally{URL.revokeObjectURL(url);}
 }

 async function parseSource(file=null){
  if(busy)return;
  busy=true;error('');
  const progress=node('pp-import-progress');if(progress)progress.hidden=false;
  try{
   let result;
   if(file){
    file=await prepareImportImage(file);
    const mime=file.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
      webp:'image/webp',pdf:'application/pdf',txt:'text/plain'}[file.name.split('.').pop().toLowerCase()]);
    const response=await fetch('api/filament-import-file',{method:'POST',
      headers:{'Content-Type':mime},body:file,credentials:'same-origin'});
    const raw=await response.text();
    let body;try{body=JSON.parse(raw);}catch{throw Error('Keine gültige Serverantwort bei der Texterkennung.');}
    if(!response.ok)throw Error(body.error||'Dokument konnte nicht erkannt werden.');
    result=body;
   }else{
    const text=node('pp-import-text')?.value.trim()||'';
    if(!text)throw Error('Bitte Bestelltext einfügen oder Datei wählen.');
    result=await api('filament-import-text',{text});
   }
   await loadFilaments();
   fromPreview(result);
  }catch(ex){error(ex.message);}
  finally{busy=false;if(progress)progress.hidden=true;}
 }
 function quickReceive(spool){
  draft=emptyDraft();
  draft.vendor=spool.brand||'Manuell';
  draft.lines=[{...emptyLine(),brand:spool.brand,color:spool.color,material:spool.material,
   manufacturer_code:spool.manufacturer_code||'',color_hex:spool.color_hex||'',
   internal_code:spool.internal_code||'',filament_id:spool.id,
   quantity:spool.cart_qty||1}];
  draft.warnings=['Bitte den tatsächlich gezahlten Positionspreis eintragen; der bisherige Lagerpreis ist nur ein Richtwert.'];
  expandedLines=new Set([0]);selectedLines=new Set();activeLine=0;showReview();
 }
 node('pp-purchase-add').addEventListener('click',startManual);
 node('pp-purchase-import')?.addEventListener('click',importView);
 node('pp-purchase-close').addEventListener('click',finish);
 node('pp-purchase-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-pp-open]');
  if(!b)return;
  const o=orders.find(x=>x.id===b.dataset.ppOpen);
  if(o)showReceipt(o);
 });

 orderBody.addEventListener('input',e=>{
  if(mode!=='manual-order')return;
  if(e.target.matches('[data-pp-m-search]')){
   const i=Number(e.target.dataset.ppMSearch);
   if(!draft.lines[i])return;
   draft.lines[i]._query=e.target.value;
   const container=orderBody.querySelector('[data-pp-m-results="'+i+'"]');
   if(container)container.innerHTML=manualOptions(i,e.target.value);
  }else if(e.target.matches('[data-pp-m-field]')){
   const l=draft.lines[Number(e.target.dataset.ppMIndex)];
   if(!l)return;
   const field=e.target.dataset.ppMField;
   l[field]=['quantity','grams'].includes(field)?Number(e.target.value):e.target.value;
  }else if(e.target.matches('[data-pp-m-header]')){
   draft[e.target.dataset.ppMHeader]=e.target.value;
  }
 });
 orderBody.addEventListener('click',e=>{
  if(mode!=='manual-order'||busy)return;
  const b=e.target.closest('[data-pp-m-action]');
  if(!b)return;
  const a=b.dataset.ppMAction,i=Number(b.dataset.ppMIndex);
  if(a==='save'||a==='save-receive'){save(a==='save-receive');return;}
  try{takeManual();}catch(ex){error(ex.message);return;}
  if(a==='add'){
   if(draft.lines.length>=100){error('Maximal 100 Positionen pro Bestellung.');return;}
   draft.lines.push(newManualLine());
  }else if(a==='remove'){
   draft.lines.splice(i,1);
   if(!draft.lines.length)draft.lines.push(newManualLine());
  }else if(a==='pick'){
   const f=catalog().find(x=>Number(x.id)===Number(b.dataset.ppMId));
   if(!f){error('Diese Farbe ist nicht mehr in der Bibliothek vorhanden.');return;}
   manualSelect(i,f);
  }else if(a==='new'){
   const l=draft.lines[i];
   l._manualType='new';l.filament_id=null;
   // Typed manufacturer code may be the intended new code.
   if(/^\d{4,6}$/.test((l._query||'').trim()))l.manufacturer_code=l._query.trim();
   else if((l._query||'').trim()&&!l.color)l.color=l._query.trim();
  }else if(a==='change'){
   const l=draft.lines[i];
   draft.lines[i]={...newManualLine(),quantity:l.quantity,
    packaging:l.packaging,_priceInput:l._priceInput,gross_cents:l.gross_cents};
  }else{return;}
  renderManual();
  if(a==='add'){
   const newInput=orderBody.querySelector('[data-pp-m-search="'+(draft.lines.length-1)+'"]');
   newInput?.focus();
  }
 });

 orderBody.addEventListener('click',async e=>{
  const b=e.target.closest('[data-pp-action]');
  if(!b||busy)return;
  const action=b.dataset.ppAction;
  if(action==='parse')return parseSource();
  if(action==='manual'){draft=emptyDraft();draft.lines=[emptyLine()];expandedLines=new Set([0]);selectedLines=new Set();activeLine=0;showReview();return;}
  if(action==='save'||action==='save-receive')return save(action==='save-receive');
  if(action==='receive')return bookReceipt();
  if(action==='all-zero'){
   orderBody.querySelectorAll('[data-pp-receive]').forEach(input=>input.value=0);return;
  }
  if(mode==='review'){
   try{takeReview();}catch(ex){error(ex.message);return;}
   const index=Number(b.dataset.ppIndex);
   if(action==='focus'){activeLine=index;showReview();return;}
   if(action==='overview'){activeLine=-1;showReview();return;}
   if(action==='next-issue'){activeLine=draft.lines.findIndex(isUnresolved);showReview();return;}
   if(action==='reviewed'){
    if(requiredProblems(draft.lines[index]).length){
     showReview();error('Bitte zuerst fehlende Pflichtangaben korrigieren.');return;
    }
    draft.lines[index].reviewed=true;
    activeLine=draft.lines.findIndex(isUnresolved);
    showReview();return;
   }
   if(action==='select-all'){selectedLines=new Set(draft.lines.map((_,i)=>i));showReview();return;}
   if(action==='select-none'){selectedLines=new Set();showReview();return;}
   if(action==='bulk'){
    if(!selectedLines.size){error('Bitte zuerst mindestens eine Position auswählen.');return;}
    const field=node('pp-bulk-field').value,raw=node('pp-bulk-value').value.trim();
    let value;
    try{
     if(field==='gross_cents')value=cents(raw);
     else if(field==='quantity'||field==='grams'){
      value=Number(raw);
      if(!raw||!Number.isInteger(value)||value<(field==='quantity'?1:50)||value>(field==='quantity'?500:5000))throw Error('Ungültige Menge.');
     }else if(field==='packaging'){
      value={'spule':'spool','mit spule':'spool','refill':'refill','unbekannt':'unknown'}[raw.toLowerCase()];
      if(!value)throw Error('Verpackung: Spule, Refill oder Unbekannt eingeben.');
     }else throw Error('Ungültiges Feld.');
    }catch(ex){error(ex.message);return;}
    if(field==='gross_cents'&&value===null){error('Bitte einen Preis eingeben.');return;}
    for(const i of selectedLines){draft.lines[i][field]=value;draft.lines[i].reviewed=false;}
    selectedLines=new Set();showReview();message('Ausgewählte Filamente aktualisiert.');return;
   }
   if(action==='add'){draft.lines.push(emptyLine());activeLine=draft.lines.length-1;}
   if(action==='remove'){draft.lines.splice(index,1);activeLine=draft.lines.findIndex(isUnresolved);selectedLines=new Set();}
   if(action==='split'){
    const line=draft.lines[index];
    if(!line||line.quantity<2){error('Zum Aufteilen sind mindestens zwei Rollen erforderlich.');return;}
    const extra={...line,quantity:1,gross_cents:null,accept_changes:[]};
    line.quantity-=1;line.gross_cents=null;
    draft.lines.splice(index+1,0,extra);activeLine=index;selectedLines=new Set();
   }
   showReview();
  }
 });
 // Only explicit taps remember expansion. Auto-opened warnings close again when fixed.
 orderBody.addEventListener('click',e=>{
  if(mode!=='review')return;
  const summary=e.target.closest('.pp-line-summary');
  if(!summary)return;
  const details=summary.closest('details[data-pp-details]');
  if(!details)return;
  const i=Number(details.dataset.ppDetails);
  if(details.open)expandedLines.delete(i);else expandedLines.add(i);
 },true);
 orderBody.addEventListener('change',e=>{
  if(e.target.matches('[data-pp-select]')){
   const i=Number(e.target.dataset.ppSelect);
   if(e.target.checked)selectedLines.add(i);else selectedLines.delete(i);
  }
  if(e.target.id==='pp-file'&&e.target.files?.[0])parseSource(e.target.files[0]);
 });

 orderBody.addEventListener('input',e=>{
  // iOS paste menu sometimes omits clipboardData from the paste event.
  if(mode!=='import'||busy||e.target.id!=='pp-import-text')return;
  if(e.inputType!=='insertFromPaste'&&e.inputType!=='insertReplacementText')return;
  if(importTimer)clearTimeout(importTimer);
  importTimer=setTimeout(()=>{
   importTimer=null;
   if(mode==='import'&&!busy&&node('pp-import-text')?.value.trim())parseSource();
  },250);
 });

 dialog.addEventListener('paste',e=>{
  if(mode!=='import'||busy)return;
  const files=Array.from(e.clipboardData?.items||[]).filter(i=>i.kind==='file');
  const file=files.map(i=>i.getAsFile()).find(Boolean);
  if(file){e.preventDefault();parseSource(file);return;}
  const text=e.clipboardData?.getData('text/plain')?.trim();
  if(text){e.preventDefault();if(importTimer)clearTimeout(importTimer);node('pp-import-text').value=text;parseSource();}
 });
 orderBody.addEventListener('dragover',e=>{if(mode==='import'){e.preventDefault();node('pp-drop')?.classList.add('dragging');}});
 orderBody.addEventListener('dragleave',()=>node('pp-drop')?.classList.remove('dragging'));
 orderBody.addEventListener('drop',e=>{
  if(mode!=='import')return;
  e.preventDefault();node('pp-drop')?.classList.remove('dragging');
  const file=e.dataTransfer?.files?.[0];
  if(file)parseSource(file);
 });
 window.ppPurchases={quickReceive,refresh};
 refresh();
})();
