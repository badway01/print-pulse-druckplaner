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
 const emptyLine=()=>({brand:'',material:'PLA',color:'',manufacturer_code:'',
  internal_code:'',color_hex:'',filament_id:null,quantity:1,grams:1000,packaging:'unknown',
  gross_cents:null,description:'',accept_changes:[]});
 const today=()=>new Date().toISOString().slice(0,10);
 const emptyDraft=()=>({vendor:'',reference:'',ordered_on:today(),
  total_cents:null,discount_cents:0,credit_cents:0,shipping_cents:0,
  lines:[],fingerprint:'',source_type:'manual',warnings:[]});
 function error(message){notice.textContent=message;notice.hidden=!message;}
 function dialogOpen(title){node('pp-purchase-title').textContent=title;error('');if(!dialog.open)dialog.showModal();}
 function message(m){if(typeof flash==='function')flash(m);}
 function finish(){dialog.close();error('');draft=null;current=null;}
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
 function importView(){
  mode='import';
  dialogOpen('Bestellung importieren');
  orderBody.innerHTML='<p class="pp-muted">Bambu, Amazon oder andere Händler: Bild, PDF oder Text. Bei unsicheren Angaben kannst du jede Position ändern.</p>'+
   '<label class="pp-drop" id="pp-drop"><strong>Screenshot oder Rechnung hierher ziehen</strong>'+
   '<span class="pp-muted">PNG, JPG, WEBP, PDF oder TXT · maximal 12 MB</span>'+
   '<input type="file" id="pp-file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.png,.jpg,.jpeg,.webp,.pdf,.txt"></label>'+
   '<label>Oder Bestelltext einfügen<textarea id="pp-import-text" placeholder="Bestellbestätigung kopieren und hier einfügen …"></textarea></label>'+
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
   lines:(preview.items||[]).map(l=>({...emptyLine(),...l,accept_changes:[]}))
  });
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
 function reviewLine(line,i){
  const f=existingLine(line);
  const ids=catalog().slice();
  if(f&&!ids.some(row=>row.id===f.id))ids.unshift(f);
  const options='<option value="">Automatisch zuordnen / neue Farbe</option>'+
   ids.map(row=>'<option value="'+row.id+'" '+(f&&f.id===row.id?'selected':'')+'>'+
    html((row.internal_code?'Intern '+row.internal_code+' · ':'')+
    row.brand+' · '+row.material+' · '+row.color+
    (row.manufacturer_code?' ('+row.manufacturer_code+')':''))+'</option>').join('');
  const diffKeys=[['brand','Hersteller'],['material','Material'],['color','Farbe'],
                  ['manufacturer_code','Herstellercode'],['color_hex','HEX-Farbwert']];
  const differences=f?diffKeys.filter(([k])=>line[k]&&String(line[k]).toLowerCase()!==String(f[k]||'').toLowerCase()):[];
  const changes=f?(differences.length?
    '<div class="pp-changes"><b>Abweichung zum vorhandenen Lager</b>'+
    differences.map(([k,title])=>'<div class="pp-change-row">'+
     '<input type="checkbox" data-pp-line="'+i+'" data-pp-accept="'+k+'" '+
      ((line.accept_changes||[]).includes(k)?'checked':'')+'>'+
     '<label>'+html(title)+': <s>'+html(f[k]||'fehlt')+'</s> → <b>'+html(line[k])+'</b>'+
     '<small> · Nur mit Häkchen übernehmen</small></label></div>').join('')+'</div>':
    '<small class="pp-muted">Vorhandenes Filament erkannt, keine bestätigten Stammdatenänderungen.</small>'):
    '<small class="pp-muted">Neues Filament: wird beim Speichern automatisch mit 0 Lagerrollen angelegt. Internen Farbcode bei Bedarf selbst vergeben.</small>';
  return '<article class="pp-line"><div class="pp-line-top"><strong>Position '+(i+1)+'</strong>'+
   '<div class="pp-line-buttons"><button type="button" class="secondary small" data-pp-action="split" data-pp-index="'+i+'">Preis aufteilen</button>'+
   '<button type="button" class="secondary small" data-pp-action="remove" data-pp-index="'+i+'">Entfernen</button></div></div>'+
   '<div class="pp-line-fields">'+
   field('Hersteller','brand',line.brand,i)+field('Material','material',line.material,i)+
   field('Farbe','color',line.color,i)+field('Hersteller-Farbcode','manufacturer_code',line.manufacturer_code,i)+
   field('Interner Farbcode (manuell)','internal_code',line.internal_code,i)+
   field('HEX-Farbwert (nur aus sicherer Quelle)','color_hex',line.color_hex,i)+
   field('Rollen','quantity',line.quantity,i,'number','min="1" max="500" step="1"')+
   field('Gramm pro Rolle','grams',line.grams,i,'number','min="50" max="5000" step="1"')+
   field('Positionspreis gesamt (€)','gross_cents',inputMoney(line.gross_cents),i)+'</div>'+
   '<div class="pp-purchase-fields"><label>Verpackung<select data-pp-line="'+i+'" data-pp-field="packaging">'+
   [['unknown','Unbekannt'],['spool','Mit Spule'],['refill','Refill']].map(v=>
     '<option value="'+v[0]+'" '+(line.packaging===v[0]?'selected':'')+'>'+v[1]+'</option>').join('')+
   '</select></label><label>Vorhandenes Filament zuordnen<select data-pp-line="'+i+
   '" data-pp-field="filament_id">'+options+'</select></label>'+
   field('Zusatzinfo','description',line.description,i)+'</div>'+changes+'</article>';
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
   if(k==='gross_cents')line[k]=cents(el.value);
   else if(k==='quantity'||k==='grams')line[k]=Number(el.value);
   else if(k==='filament_id')line[k]=el.value?Number(el.value):null;
   else line[k]=el.value.trim();
  }
  for(const item of draft.lines)item.accept_changes=[];
  for(const el of orderBody.querySelectorAll('[data-pp-accept]:checked')){
   const line=draft.lines[Number(el.dataset.ppLine)];
   if(line)line.accept_changes.push(el.dataset.ppAccept);
  }
 }
 function showReview(){
  mode='review';
  dialogOpen('Bestellung prüfen und speichern');
  const d=draft;
  const known=d.lines.every(l=>l.gross_cents!=null);
  const sum=known?d.lines.reduce((s,l)=>s+l.gross_cents,0)-d.discount_cents-d.credit_cents+d.shipping_cents:null;
  const difference=d.total_cents!=null&&sum!=null&&sum!==d.total_cents;
  orderBody.innerHTML='<p class="pp-muted">Alle Felder sind änderbar. Hersteller-Codes aus Dokumenten werden geprüft; vorhandene Stammdaten ändern sich nur mit deinem Häkchen.</p>'+
   (d.warnings.length?'<p class="pp-warning">'+d.warnings.map(html).join(' · ')+'</p>':'')+
   '<div class="pp-purchase-fields">'+metadataInput('Händler','vendor',d.vendor)+
   metadataInput('Bestellnummer (optional)','reference',d.reference)+
   '<label>Bestelldatum<input type="date" data-pp-header="ordered_on" value="'+escapeAttr(d.ordered_on)+'"></label>'+
   metadataInput('Rechnungsbetrag brutto (€)','total_cents',inputMoney(d.total_cents))+
   metadataInput('Gesamtrabatt (€)','discount_cents',inputMoney(d.discount_cents))+
   metadataInput('Eingesetztes Guthaben (€)','credit_cents',inputMoney(d.credit_cents))+
   metadataInput('Versandkosten (€)','shipping_cents',inputMoney(d.shipping_cents))+'</div>'+
   '<h3>Einzelne Positionen</h3>'+
   d.lines.map(reviewLine).join('')+
   '<button type="button" class="secondary" data-pp-action="add">+ Fehlende Rolle/Position hinzufügen</button>'+
   '<div class="pp-purchase-actions"><button type="button" class="secondary" data-pp-action="recheck">Abweichungen neu prüfen</button></div>'+
   '<p class="pp-muted">Berechnete Summe: <strong>'+money(sum)+'</strong>'+
   (difference?' · Achtung: weicht vom eingetragenen Rechnungsbetrag ab.':'')+'</p>'+
   '<div class="pp-purchase-actions"><button type="button" class="secondary" data-pp-action="save">Als bestellt speichern</button>'+
   '<button type="button" class="primary" data-pp-action="save-receive">Speichern und jetzt erhalten</button></div>';
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
   takeReview();
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
 async function parseSource(file=null){
  if(busy)return;
  busy=true;error('');
  try{
   let result;
   if(file){
    if(file.size>12*1024*1024)throw Error('Datei größer als 12 MB.');
    const mime=file.type||({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
      webp:'image/webp',pdf:'application/pdf',txt:'text/plain'}[file.name.split('.').pop().toLowerCase()]);
    const response=await fetch('api/filament-import-file',{method:'POST',
      headers:{'Content-Type':mime},body:file,credentials:'same-origin'});
    const raw=await response.text();
    let body;try{body=JSON.parse(raw);}catch{throw Error('Keine gültige Serverantwort bei der Texterkennung.');}
    if(!response.ok)throw Error(body.error||'Dokument konnte nicht erkannt werden.');
    result=body;
   }else{
    const text=node('pp-import-text').value.trim();
    if(!text)throw Error('Bitte Bestelltext einfügen oder Datei wählen.');
    result=await api('filament-import-text',{text});
   }
   await loadFilaments();
   fromPreview(result);
  }catch(ex){error(ex.message);}
  finally{busy=false;}
 }
 function quickReceive(spool){
  draft=emptyDraft();
  draft.vendor=spool.brand||'Manuell';
  draft.lines=[{...emptyLine(),brand:spool.brand,color:spool.color,material:spool.material,
   manufacturer_code:spool.manufacturer_code||'',color_hex:spool.color_hex||'',
   internal_code:spool.internal_code||'',filament_id:spool.id,
   quantity:spool.cart_qty||1}];
  draft.warnings=['Bitte den tatsächlich gezahlten Positionspreis eintragen; der bisherige Lagerpreis ist nur ein Richtwert.'];
  showReview();
 }
 node('pp-purchase-add').addEventListener('click',importView);
 node('pp-purchase-close').addEventListener('click',finish);
 node('pp-purchase-list').addEventListener('click',e=>{
  const b=e.target.closest('[data-pp-open]');
  if(!b)return;
  const o=orders.find(x=>x.id===b.dataset.ppOpen);
  if(o)showReceipt(o);
 });
 orderBody.addEventListener('click',async e=>{
  const b=e.target.closest('[data-pp-action]');
  if(!b||busy)return;
  const action=b.dataset.ppAction;
  if(action==='parse')return parseSource();
  if(action==='manual'){draft=emptyDraft();draft.lines=[emptyLine()];showReview();return;}
  if(action==='save'||action==='save-receive')return save(action==='save-receive');
  if(action==='receive')return bookReceipt();
  if(action==='all-zero'){
   orderBody.querySelectorAll('[data-pp-receive]').forEach(input=>input.value=0);return;
  }
  if(mode==='review'){
   try{takeReview();}catch(ex){error(ex.message);return;}
   const index=Number(b.dataset.ppIndex);
   if(action==='add')draft.lines.push(emptyLine());
   if(action==='remove')draft.lines.splice(index,1);
   if(action==='split'){
    const line=draft.lines[index];
    if(!line||line.quantity<2){error('Zum Aufteilen sind mindestens zwei Rollen erforderlich.');return;}
    const extra={...line,quantity:1,gross_cents:null,accept_changes:[]};
    line.quantity-=1;line.gross_cents=null;
    draft.lines.splice(index+1,0,extra);
   }
   showReview();
  }
 });
 orderBody.addEventListener('change',e=>{
  if(e.target.id==='pp-file'&&e.target.files?.[0])parseSource(e.target.files[0]);
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
