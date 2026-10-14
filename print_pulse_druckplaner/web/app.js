"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model = null, mode = 'pending', timer = null;
let view = 'board', catalog = {products:[],printers:[],sync:{}};
try { view = localStorage.getItem('pp-view') || 'board'; } catch {}
if(!['board','tiles','list'].includes(view))view='board';
const stages = {planned:'Geplant',printing:'Im Druck',done:'Gedruckt'};
const expandedGroups = new Set();
const pendingPrints = new Set();
const printerIcon = `<svg class="printer-icon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/><path d="M18 12h.01"/></svg>`;
function fmtDate(iso){ if(!iso)return 'Versanddatum fehlt'; const [y,m,d]=iso.split('-');return `${d}.${m}.${y}`; }
function localDay(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(n)=>parts.find(p=>p.type===n)?.value;return `${get('year')}-${get('month')}-${get('day')}`;}
function daysUntil(iso){if(!iso)return null; const a=Date.parse(iso+'T12:00:00Z'),b=Date.parse(localDay()+'T12:00:00Z');return Math.round((a-b)/86400000);}
function priority(iso,missing){if(!iso)return {label:'Termin prüfen',cls:'amber',card:'warning'};let d=daysUntil(iso);if(d<0)return {label:'Überfällig · '+fmtDate(iso),cls:'red',card:'urgent'};if(d===0)return {label:'Heute versenden',cls:'red',card:'urgent'};if(d===1)return {label:'Morgen versenden',cls:'red',card:'urgent'};return {label:fmtDate(iso)+(missing?' · weitere Termine prüfen':''),cls:d<=3?'amber':'',card:d<=3?'warning':'normal'};}
async function api(path,data){const opt={credentials:'same-origin',cache:'no-store'};if(data!==undefined){opt.method='POST';opt.headers={'Content-Type':'application/json'};opt.body=JSON.stringify(data);}const response=await fetch('api/'+path,opt);let j=await response.json().catch(()=>({error:'Ungültige Serverantwort'}));if(!response.ok)throw new Error(j.error||'Serverfehler');return j;}
function safeEtsyThumbnail(raw){try{const u=new URL(String(raw||''));return u.protocol==='https:' && u.hostname.toLowerCase().endsWith('.etsystatic.com') && u.hostname.toLowerCase()!=='.etsystatic.com' && !u.port && !u.username && !u.password ? u.href : '';}catch{return '';}}
function showAlert(text,error=false){const el=$('alert');el.textContent=text;el.className='alert'+(error?' error':'');el.hidden=!text;}
async function reload(){try{model=await api('status');render();if(mode==='products')await loadCatalog();}catch(e){showAlert('Verbindungsfehler: '+e.message,true);}}
function render(){if(!model)return;
 for(const name of ['pending','done','products']){const active=mode===name;$('tab-'+name).classList.toggle('active',active);$('tab-'+name).setAttribute('aria-selected',String(active));}
 $('print-plan').hidden=mode==='products';$('production-controls').hidden=mode==='products';$('catalog-grid').hidden=mode!=='products';$('catalog-controls').hidden=mode!=='products';
 $('page-title').textContent=mode==='products'?'Alles für deinen nächsten Druck':'Deine Produktion im Überblick';
 $('search').placeholder=mode==='products'?'Produkt oder Etsy-ID suchen':'Produkt, Farbe oder Bestellung suchen';
 $('new-orders').hidden=!model.new_today&&!model.unseen_orders;
 $('new-orders').innerHTML=`<button class="order-link" data-orders="today">${model.new_today||0} Bestellung(en) heute eingegangen →</button><button class="order-link" data-orders="unseen">${model.unseen_orders||0} neue Bestellungen ansehen →</button>${model.unseen_orders?'<button class="btn secondary" id="mark-seen">Als gesehen markieren</button>':''}`;
 $('mark-seen')?.addEventListener('click',async()=>{try{await api('seen',{});await reload();}catch(e){showAlert(e.message,true);}});
 $('stat-orders').textContent=model.orders; $('stat-units').textContent=model.open_units;$('stat-groups').textContent=model.groups.length;$('stat-unknown').textContent=model.missing_dates;
 const last=model.last_sync?new Date(model.last_sync*1000).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}):'–';$('sync-time').textContent='Aktualisiert: '+last+' · deutsche Ortszeit';
 $('sync-indicator').textContent=model.sync.running?'Synchronisiert …':model.authorized?'Etsy verbunden':'Etsy noch nicht verbunden';
 $('sync-now').disabled=model.sync.running||!model.authorized;
 if(model.sync.error)showAlert('Etsy-Synchronisierung fehlgeschlagen: '+model.sync.error,true);
 else if(!model.configured)showAlert('Bitte unter ⚙ deine Etsy-App einrichten. Es werden noch keine echten Etsy-Daten angezeigt.');
 else if(!model.authorized)showAlert('Etsy-Einstellungen gespeichert. Bitte die einmalige Autorisierung unter ⚙ abschließen.');
 else if((model.sync.review_receipts||[]).length)showAlert(`Achtung: ${model.sync.review_receipts.length} Bestellung(en) mit unklarem Zahlungs-/Erstattungsstatus wurden vorsorglich nicht eingeplant. Bitte in Etsy prüfen: ${model.sync.review_receipts.join(', ')}.`, true);
 else if(model.missing_dates)showAlert(`Bei ${model.missing_dates} Bestellung(en) fehlt ein zuverlässiger Versandtermin. Bitte die Daten mit Etsy vergleichen und gegebenenfalls eintragen.`);
 else showAlert('');
 if(mode==='products'){renderCatalog();return;}
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('selected',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
 const all=[...model.groups,...model.done_groups];
 const term=$('search').value.toLocaleLowerCase('de');
 const groups=all.filter(g=>{
  if(mode==='done'&&g.stage!=='done')return false;
  if(mode==='pending'&&view!=='board'&&!$('filter-stage').value&&g.stage==='done')return false;
  if(!`${g.title} ${g.listing_id} ${g.variants.map(v=>v.value).join(' ')} ${g.lines.map(l=>l.receipt_id).join(' ')}`.toLocaleLowerCase('de').includes(term))return false;
  const due=$('filter-due').value, days=daysUntil(g.due), qty=$('filter-qty').value, printer=$('filter-printer').value;
  if(due==='late'&&(days===null||days>=0)||due==='today'&&(days===null||days>0)||due==='week'&&(days===null||days<0||days>7)||due==='missing'&&!g.missing_due)return false;
  if(qty==='single'&&g.qty!==1||qty==='batch'&&g.qty<=1)return false;
  if($('filter-stage').value&&g.stage!==$('filter-stage').value)return false;
  if(printer==='unassigned'&&g.printer||printer&&printer!=='unassigned'&&g.printer!==printer)return false;
  return !$('filter-new').checked||g.new_today;
 });
 groups.sort((a,b)=>$('sort-order').value==='quantity'?b.qty-a.qty:$('sort-order').value==='name'?a.title.localeCompare(b.title,'de'):(a.due||'9999').localeCompare(b.due||'9999'));
 renderSuggestions();
 const list=$('print-plan');list.className='plan '+view;if(!groups.length){list.innerHTML=$('empty-template').innerHTML;return;}
 const cardHTML=g=>{
 const p=priority(g.due,g.missing_due);const variants=(g.variants||[]).map(v=>`${esc(v.name)}: <b>${esc(v.value)}</b>`).join(' &nbsp;·&nbsp; ');
 const imageUrl=safeEtsyThumbnail(g.image_url);
 const thumbnail=imageUrl?`<img class="listing-thumb" src="${esc(imageUrl)}" width="70" height="70" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:`<span class="thumb-placeholder" aria-hidden="true">▧</span>`;
 const lines=g.lines.map(l=>`<li class="line"><div class="line-info"><b>Bestellung #${esc(l.receipt_id)}</b><span>${esc(fmtDate(l.due))} · ${l.produced} von ${l.qty} gedruckt${l.reserved?` · ${l.reserved} eingeplant auf ${esc(l.reserved_printer)}`:''}</span><div class="deadline-editor"><input type="date" value="${esc(l.due||'')}" aria-label="Versanddatum für ${esc(l.receipt_id)}" data-date-for="${esc(l.receipt_id)}"><button type="button" data-due-save="${esc(l.receipt_id)}">Speichern</button></div></div><div class="line-actions"><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced-1}" ${l.produced<=0?'disabled':''} aria-label="Ein Stück weniger">−</button><span class="qty-number">${l.produced}/${l.qty}</span><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced+1}" ${l.produced>=l.qty?'disabled':''} aria-label="Ein Stück mehr">+</button></div></li>`).join('');
 return `<article class="work ${p.card}"><div class="work-heading"><div class="work-heading-copy"><span class="pill ${p.cls}">${esc(p.label)}</span><h3 title="${esc(g.title)}">${esc(g.title)}</h3></div>${thumbnail}</div><div class="order-count">${g.new_today?'<span class="new-pill">Heute bestellt</span> ':''}${g.unseen?'<span class="new-pill">Neu</span> ':''}${new Set(g.lines.map(l=>l.receipt_id)).size} Etsy-Bestellung(en)</div><div class="variants">${variants||'Keine Farbvarianten angegeben'}</div><div class="numbers"><strong>${g.remaining}</strong><span>Stück noch drucken · ${g.qty} bestellt</span></div><progress class="production-progress" value="${g.qty-g.remaining}" max="${g.qty||1}" aria-label="Druckfortschritt"></progress><div class="work-top"><small>${g.printer?'Bevorzugter Drucker: '+esc(g.printer):'Drucker noch nicht festgelegt'}</small><small>Listing ${esc(g.listing_id)}</small></div><div class="reservation-note">${g.reserved?`${g.reserved} Stück eingeplant · ${esc([...new Set(g.lines.filter(l=>l.reserved).map(l=>l.reserved_printer))].join(', '))} <button class="text-button" data-release="${g.key}">Freigeben</button>`:'Noch keine Menge reserviert'}</div><div class="stage-control">${g.remaining>0?`<label>Phase <select data-stage="${g.key}"><option value="planned" ${g.stage==='planned'?'selected':''}>Geplant</option><option value="printing" ${g.stage==='printing'?'selected':''}>Im Druck</option></select></label>`:'<span class="pill">Gedruckt · bereit zum Verpacken</span>'}</div><div class="work-actions">${g.remaining>0?`<button class="btn printed-action" type="button" data-print-one="${g.key}" aria-label="Ein Stück als gedruckt verbuchen" title="Ein Klick verbucht genau ein fertig gedrucktes Stück">${printerIcon}<span>${g.remaining===1?'Gedruckt':'+1 gedruckt'}</span></button><button class="btn secondary" type="button" data-batch="${g.key}">Mehrere Stück …</button>`:`<span class="printed-complete">✓ Vollständig gedruckt</span>`}<button class="btn secondary" type="button" data-product="${g.key}">✎ Produkt / Drucker</button><button class="btn secondary" type="button" data-catalog-listing="${esc(g.listing_id)}">3MF / Produktdetails</button><button class="btn secondary" type="button" data-expand="${g.key}">Positionen (${g.lines.length}) ▾</button></div><ul class="line-list" data-list="${g.key}" ${expandedGroups.has(g.key)?'':'hidden'}>${lines}</ul></article>`;};
 list.innerHTML=view==='board'?Object.entries(stages).map(([stage,label])=>`<section class="lane"><h2><span class="stage-dot ${stage}"></span>${label}<span class="lane-count">${groups.filter(g=>g.stage===stage).length}</span></h2><div class="lane-cards">${groups.filter(g=>g.stage===stage).map(cardHTML).join('')||'<p class="lane-empty">Keine Aufträge in dieser Phase</p>'}</div></section>`).join(''):groups.map(cardHTML).join('');
 list.querySelectorAll('img.listing-thumb').forEach(img=>{
  img.addEventListener('error',()=>{
   const fallback=document.createElement('span');
   fallback.className='thumb-placeholder';
   fallback.setAttribute('aria-hidden','true');
   fallback.textContent='▧';
   img.replaceWith(fallback);
  },{once:true});
 });
}
for(const name of ['pending','done','products'])$('tab-'+name).addEventListener('click',async()=>{mode=name;render();if(mode==='products')await loadCatalog();});
$('search').addEventListener('input',render);$('sync-now').addEventListener('click',async()=>{try{await api('sync',{});await reload();}catch(e){showAlert(e.message,true)}});
$('settings-toggle').addEventListener('click',()=>{$('settings-status').textContent=model?.configured?'Einstellungen hinterlegt. Beim erneuten Speichern werden nur die Zugangsdaten dieser App verwendet.':'Noch keine Konfiguration gespeichert.';$('settings-modal').showModal()});
$('etsy-config').addEventListener('submit',async(e)=>{e.preventDefault();const form=new FormData(e.target);try{await api('config',Object.fromEntries(form.entries()));$('settings-status').textContent='Etsy-Einstellungen gespeichert. Als Nächstes autorisieren.';await reload();}catch(err){$('settings-status').textContent='Fehler: '+err.message;}});
$('oauth-start').addEventListener('click',async()=>{try{const {url}=await api('oauth/start',{});window.open(url,'_blank','noopener,noreferrer');$('settings-status').textContent='Etsy wurde in einem neuen Tab geöffnet. Nach Bestätigung die vollständige Redirect-Adresse hier einfügen.';}catch(e){$('settings-status').textContent='Fehler: '+e.message;}});
$('oauth-finish').addEventListener('click',async()=>{try{await api('oauth/finish',{redirected_url:$('oauth-return-url').value});$('oauth-return-url').value='';$('settings-modal').close();await reload();}catch(e){$('settings-status').textContent='Fehler: '+e.message;}});
$('print-plan').addEventListener('click',async(e)=>{
 let t=e.target.closest('[data-release],[data-print-one],[data-expand],[data-batch],[data-product],[data-txn],[data-due-save],[data-catalog-listing]');if(!t)return;
 if(t.dataset.release){t.disabled=true;try{await api('reservation/delete',{key:t.dataset.release});await reload();}catch(err){showAlert(err.message,true);}finally{t.disabled=false;}return;}
 if(t.dataset.catalogListing){await loadCatalog();const p=catalog.products.find(p=>p.listing_id===t.dataset.catalogListing);if(p)openCatalog(p);else showAlert('Produkt noch nicht im Katalog. Bitte unter Produkte hinzufügen.',true);return;}
 if(t.dataset.printOne){
  const key=t.dataset.printOne;
  if(pendingPrints.has(key))return;
  pendingPrints.add(key);
  t.disabled=true;
  try{await api('batch',{key,amount:1});await reload();showAlert('1 Stück als gedruckt verbucht. Korrektur bei Bedarf unter „Positionen“ möglich.');}
  catch(err){showAlert('Buchung fehlgeschlagen: '+err.message,true);}
  finally{pendingPrints.delete(key);t.disabled=false;}
  return;
 }
 if(t.dataset.batch){
  const g=[...(model?.groups||[]),...(model?.done_groups||[])].find(x=>x.key===t.dataset.batch);
  if(!g)return;
  const raw=window.prompt(`Wie viele Stück von „${g.title}“ sind fertig gedruckt?\nDie Menge wird zuerst den dringendsten Etsy-Bestellungen zugeordnet.\nNoch offen: ${g.remaining}`,'1');
  if(raw===null)return;
  const amount=Number(raw);
  if(!Number.isInteger(amount)||amount<1||amount>g.remaining){showAlert(`Bitte eine Stückzahl zwischen 1 und ${g.remaining} eingeben.`,true);return;}
  try{await api('batch',{key:g.key,amount});await reload();}catch(err){showAlert(err.message,true)}
  return;
 }
 if(t.dataset.expand){const el=document.querySelector(`[data-list="${t.dataset.expand}"]`);if(el){el.hidden=!el.hidden;if(el.hidden)expandedGroups.delete(t.dataset.expand);else expandedGroups.add(t.dataset.expand);}return;}
 if(t.dataset.product){const g=[...(model?.groups||[]),...(model?.done_groups||[])].find(x=>x.key===t.dataset.product);if(!g)return;$('product-key').value=g.key;$('product-name').value=g.title;$('product-printer').value=g.printer||'';$('product-modal').showModal();return;}
 if(t.dataset.txn){try{await api('progress',{transaction_id:t.dataset.txn,produced:Number(t.dataset.qty)});await reload();}catch(err){showAlert(err.message,true);}return;}
 if(t.dataset.dueSave){const rid=t.dataset.dueSave;const inp=[...document.querySelectorAll('[data-date-for]')].find(x=>x.dataset.dateFor===rid);try{await api('due',{receipt_id:rid,due:inp?.value||''});await reload();}catch(err){showAlert(err.message,true);}}
});
$('product-form').addEventListener('submit',async(e)=>{e.preventDefault();try{await api('product',{key:$('product-key').value,short_name:$('product-name').value,printer:$('product-printer').value});$('product-modal').close();await reload();}catch(err){showAlert(err.message,true)}});
$('print-btn').addEventListener('click',()=>window.print());
$('export-btn').addEventListener('click',async()=>{try{showAlert('Diese JSON-Sicherung enthält Produktionsstände. Für Produktkatalog und 3MF-Dateien eine Home-Assistant-Sicherung der App erstellen.');const backup=await api('export');const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='print-pulse-produktionsstand-'+localDay()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}catch(e){showAlert(e.message,true)}});
reload();timer=setInterval(reload,20000);

// Restore a local production-state export when migrating between installations.
$('import-btn').addEventListener('click',()=>{
 if(!window.confirm('Nur eine eigene Druckplaner-Sicherung importieren. Vorher Etsy synchronisieren und die aktuelle Planung sichern. Fortfahren?'))return;
 $('import-file').click();
});
$('import-file').addEventListener('change',async(e)=>{
 const file=e.target.files?.[0]; if(!file)return;
 try{
  if(file.size>2097152)throw new Error('Sicherungsdatei ist zu groß.');
  const obj=JSON.parse(await file.text());
  if(obj.version!==1||!Array.isArray(obj.orders)||!Array.isArray(obj.progress)||!Array.isArray(obj.products))throw new Error('Kein gültiges Produktionsdaten-Backup.');
  const result=await api('import',obj);
  await reload();
  showAlert(`Wiederherstellung abgeschlossen: ${result.applied.orders} Fristen, ${result.applied.progress} Druckpositionen, ${result.applied.products} Produktzuordnungen übernommen. Bitte mit Etsy abgleichen.`);
 }catch(err){showAlert('Wiederherstellung fehlgeschlagen: '+err.message,true)}
 finally{e.target.value=''}
});

// Views and combinable production filters.
for(const id of ['filter-due','filter-qty','filter-stage','filter-printer','sort-order','filter-new'])$(id).addEventListener('change',render);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;try{localStorage.setItem('pp-view',view);}catch{}render();}));
$('reset-filters').addEventListener('click',()=>{for(const id of ['filter-due','filter-qty','filter-stage','filter-printer'])$(id).value='';$('filter-new').checked=false;$('search').value='';$('sort-order').value='priority';render();});
$('print-plan').addEventListener('change',async e=>{if(!e.target.dataset.stage)return;e.target.disabled=true;try{await api('stage',{key:e.target.dataset.stage,stage:e.target.value});await reload();}catch(err){showAlert(err.message,true);await reload();}});
async function loadCatalog(){try{catalog=await api('catalog');if(mode==='products')renderCatalog();return true;}catch(err){showAlert('Produktkatalog: '+err.message,true);return false;}}
function renderCatalog(){
 const term=$('search').value.toLocaleLowerCase('de');
 const items=catalog.products.filter(p=>`${p.title} ${p.listing_id||''} ${p.notes}`.toLocaleLowerCase('de').includes(term));
 $('catalog-sync').disabled=!!catalog.sync.running;
 $('catalog-status').textContent=catalog.sync.running?'Etsy-Katalog und Produktbilder werden geladen …':catalog.sync.error?'Abgleich fehlgeschlagen: '+catalog.sync.error:`${catalog.products.length} Produkte · ${catalog.products.reduce((n,p)=>n+p.files.length,0)} Druckdateien. Produkte aus Bestellungen werden automatisch übernommen.`;
 $('catalog-grid').innerHTML=items.map(p=>`<button class="catalog-card" data-catalog-id="${esc(p.id)}">${p.image_url?`<img src="${esc(safeEtsyThumbnail(p.image_url))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<span class="catalog-image-placeholder">'+printerIcon+'</span>'}<span class="catalog-card-body"><strong>${esc(p.title)}</strong><span class="muted">${p.listing_id?'Etsy · '+esc(p.listing_id):'Eigenes Produkt'}</span><span class="pill ${p.files.length?'':'amber'}">${p.files.length} / ${catalog.printers.length} Drucker mit 3MF</span></span></button>`).join('')||'<div class="empty"><h2>Noch keine passenden Produkte</h2><p>Lade deinen aktiven Etsy-Katalog oder lege ein eigenes Produkt an.</p></div>';
 $('catalog-grid').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;},{once:true}));
}
function openCatalog(p=null){
 $('catalog-id').value=p?.id||'';$('catalog-title').value=p?.title||'';$('catalog-listing').value=p?.listing_id||'';$('catalog-notes').value=p?.notes||'';
 $('catalog-detail-title').textContent=p?'Produktdetails':'Neues Produkt';$('catalog-feedback').textContent='';renderFiles(p);$('catalog-modal').showModal();
}
function renderFiles(p){
 if(!p){$('printer-files').innerHTML='<p class="muted">Speichere zuerst das Produkt, danach kannst du Druckdateien hochladen.</p>';return;}
 $('printer-files').innerHTML=catalog.printers.map(printer=>{const f=p.files.find(f=>f.printer===printer);const profile=(p.profiles||[]).find(x=>x.printer===printer)||{capacity:1,minutes:0,slicer:printer==='Prusa MK4'?'PrusaSlicer':printer==='Snapmaker U1'?'Snapmaker Orca':'Bambu Studio'};const query=new URLSearchParams({product_id:p.id,printer});return `<div class="printer-file" data-profile-printer="${esc(printer)}"><div><strong>${esc(printer)}</strong><small>${f?esc(f.filename)+' · '+(f.size/1024/1024).toFixed(1)+' MB':'Noch keine 3MF hinterlegt'}</small></div><div class="file-actions">${f?`<button class="btn secondary" data-slicer-download="${esc(printer)}">Für ${esc(profile.slicer)} laden</button><a class="btn secondary" href="api/file?${esc(query)}" download>Herunterladen</a>`:''}<label class="btn secondary file-upload">${f?'Ersetzen':'3MF hochladen'}<input type="file" accept=".3mf" data-upload-printer="${esc(printer)}" aria-label="3MF für ${esc(printer)} ${f?'ersetzen':'hochladen'}"></label>${f?`<button class="btn secondary" data-delete-printer="${esc(printer)}" aria-label="Datei für ${esc(printer)} entfernen">Entfernen</button>`:''}</div><div class="profile-fields"><label>Stück pro Platte<input data-capacity type="number" min="1" max="5000" value="${profile.capacity}"></label><label>Minuten pro Platte<input data-minutes type="number" min="0" max="43200" value="${profile.minutes}"></label><label>Slicer<select data-slicer>${['Bambu Studio','OrcaSlicer','Snapmaker Orca','PrusaSlicer'].map(name=>`<option ${profile.slicer===name?'selected':''}>${name}</option>`).join('')}</select></label><button class="btn secondary" data-profile-save="${esc(printer)}">Druckprofil speichern</button><small>0 Minuten = unbekannt. Kapazität und Zeit gelten für dieses Produkt auf diesem Drucker; Farben und Plattenbelegung im Slicer prüfen.</small></div></div>`;}).join('');
}
$('catalog-add').addEventListener('click',()=>openCatalog());
$('catalog-grid').addEventListener('click',e=>{const t=e.target.closest('[data-catalog-id]');if(t)openCatalog(catalog.products.find(p=>p.id===t.dataset.catalogId));});
$('catalog-sync').addEventListener('click',async()=>{try{$('catalog-sync').disabled=true;await api('catalog/sync',{});await loadCatalog();}catch(e){showAlert(e.message,true);$('catalog-sync').disabled=false;}});
$('catalog-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.target.querySelector('[type=submit]');b.disabled=true;try{const r=await api('catalog/save',{id:$('catalog-id').value,title:$('catalog-title').value,listing_id:$('catalog-listing').value,notes:$('catalog-notes').value});$('catalog-id').value=r.id;$('catalog-detail-title').textContent='Produktdetails';await loadCatalog();renderFiles(catalog.products.find(p=>p.id===r.id));$('catalog-feedback').textContent='Produkt gespeichert.';}catch(err){$('catalog-feedback').textContent=err.message;}finally{b.disabled=false;}});
let fileBusy=false;
$('printer-files').addEventListener('change',async e=>{
 const printer=e.target.dataset.uploadPrinter,file=e.target.files?.[0];if(!printer||!file)return;
 if(fileBusy){e.target.value='';return;}fileBusy=true;
 const pid=$('catalog-id').value;
 const controls=[...$('catalog-modal').querySelectorAll('input,button,textarea')];controls.forEach(el=>el.disabled=true);
 try{
  if(!file.name.toLowerCase().endsWith('.3mf')||file.size>100*1024*1024)throw new Error('Bitte eine 3MF-Datei bis 100 MB auswählen.');
  $('catalog-feedback').textContent=`${file.name} wird für ${printer} hochgeladen …`;
  const query=new URLSearchParams({product_id:pid,printer,filename:file.name});
  const res=await fetch('api/file?'+query,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body:file});
  const data=await res.json().catch(()=>({error:'Upload fehlgeschlagen. Größe oder Verbindung prüfen.'}));if(!res.ok)throw new Error(data.error);
  await loadCatalog();renderFiles(catalog.products.find(p=>p.id===pid));$('catalog-feedback').textContent=`3MF für ${printer} gespeichert.`;
 }catch(err){$('catalog-feedback').textContent=err.message;}
 finally{controls.forEach(el=>el.disabled=false);fileBusy=false;e.target.value='';}
});
$('printer-files').addEventListener('click',async e=>{const t=e.target.closest('[data-delete-printer]');if(!t||fileBusy)return;if(!confirm('Diese Druckdatei entfernen?'))return;fileBusy=true;t.disabled=true;try{const pid=$('catalog-id').value;await api('file/delete',{product_id:pid,printer:t.dataset.deletePrinter});await loadCatalog();renderFiles(catalog.products.find(p=>p.id===pid));$('catalog-feedback').textContent='Datei entfernt.';}catch(err){$('catalog-feedback').textContent=err.message;}finally{fileBusy=false;t.disabled=false;}});

$('catalog-modal').addEventListener('cancel',e=>{if(fileBusy)e.preventDefault();});

// The recommendation is calculated from demand, not from the current UI filter.
function renderSuggestions(){
 const items=(model.suggestions||[]).slice(0,3);
 $('recommendation').hidden=mode!=='pending'||!items.length;
 $('recommendation').innerHTML=`<div class="suggestion-heading"><span class="eyebrow">DEIN NÄCHSTER DRUCK</span><p>Nach Versandfrist und offener Menge · gleiche Varianten gebündelt · bereits eingeplante Mengen berücksichtigt</p></div>`+items.map(s=>`<article class="suggestion"><div><strong>${s.amount} × ${esc(s.title)}</strong><p>${esc(s.variants.map(v=>v.name+': '+v.value).join(' · '))}</p><p>${esc(priority(s.due,s.missing_due).label)} · ${s.available} Stück noch nicht eingeplant</p><small>${s.printer?esc(s.printer):'Bitte zuerst einen Drucker zuordnen'}${s.busy?' · bereits belegt / eingeplant':''} · ${s.has_file?'3MF hinterlegt':'3MF noch ergänzen'}${s.minutes?' · ca. '+s.minutes+' Min. pro Platte':''}${!s.has_profile?' · zunächst 1 Stück, Plattenkapazität unter Produkte eintragen':''}${s.missing_due?' · fehlende Versandtermine prüfen':''}</small></div><button class="btn primary" data-reserve="${s.key}" ${!s.printer||s.busy?'disabled':''}>${s.busy?'Drucker belegt':'Vorschlag übernehmen'}</button></article>`).join('')+'<small>Nachvollziehbare Planung ohne externen KI-Dienst. Eine Übernahme reserviert die Menge; sie startet keinen Drucker.</small>';
}
$('recommendation').addEventListener('click',async e=>{
 const b=e.target.closest('[data-reserve]');if(!b)return;
 const s=model.suggestions.find(s=>s.key===b.dataset.reserve);if(!s)return;b.disabled=true;
 try{await api('reserve',{key:s.key,printer:s.printer,amount:s.amount});await reload();showAlert(`${s.amount} Stück auf ${s.printer} eingeplant.`);}catch(err){await reload();showAlert(err.message,true);}finally{b.disabled=false;}
});
$('new-orders').addEventListener('click',e=>{
 const b=e.target.closest('[data-orders]');if(!b)return;
 const flag=b.dataset.orders==='today'?'new_today':'unseen';const orders=new Map();
 for(const g of [...model.groups,...model.done_groups])for(const l of g.lines){if(!l[flag])continue;if(!orders.has(l.receipt_id))orders.set(l.receipt_id,[]);orders.get(l.receipt_id).push({g,l});}
 $('new-orders-title').textContent=flag==='new_today'?'Heute eingegangene Bestellungen':'Neue Bestellungen seit letzter Bestätigung';
 $('new-orders-list').innerHTML=[...orders].map(([id,items])=>`<article class="order-detail"><h3>Bestellung #${esc(id)}</h3>${items.map(({g,l})=>`<p><b>${l.qty} × ${esc(g.title)}</b><br>${esc(g.variants.map(v=>v.value).join(' · '))}<br><small>${esc(fmtDate(l.due))} · ${l.produced} gedruckt</small></p>`).join('')}</article>`).join('')||'<p>Keine Bestellungen in dieser Auswahl.</p>';
 $('new-orders-modal').showModal();
});
$('printer-files').addEventListener('click',async e=>{
 const save=e.target.closest('[data-profile-save]'),download=e.target.closest('[data-slicer-download]');if((!save&&!download)||fileBusy)return;
 if(download){const row=download.closest('.printer-file');const slicer=row.querySelector('[data-slicer]').value;const a=row.querySelector('a[download]');a.click();$('catalog-feedback').textContent=`Download gestartet. Die 3MF anschließend in ${slicer} über „Datei öffnen“ auswählen (auf dem Mac alternativ Rechtsklick → Öffnen mit → ${slicer}). Direktes Öffnen aus Home Assistant benötigt eine lokale Brücke und ist noch nicht eingerichtet.`;return;}
 const row=save.closest('.printer-file');save.disabled=true;
 try{await api('profile',{product_id:$('catalog-id').value,printer:save.dataset.profileSave,capacity:Number(row.querySelector('[data-capacity]').value),minutes:Number(row.querySelector('[data-minutes]').value),slicer:row.querySelector('[data-slicer]').value});await loadCatalog();renderFiles(catalog.products.find(p=>p.id===$('catalog-id').value));$('catalog-feedback').textContent='Druckprofil gespeichert. Vorschläge berücksichtigen diese Plattenkapazität.';await reload();}catch(err){$('catalog-feedback').textContent=err.message;}finally{save.disabled=false;}
});
