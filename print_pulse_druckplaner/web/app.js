"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model = null, mode = 'pending', timer = null;
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
async function reload(){try{model=await api('status');render();}catch(e){showAlert('Verbindungsfehler: '+e.message,true);}}
function render(){if(!model)return;
 $('stat-orders').textContent=model.orders; $('stat-units').textContent=model.open_units;$('stat-groups').textContent=model.groups.length;$('stat-unknown').textContent=model.missing_dates;
 const last=model.last_sync?new Date(model.last_sync*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'–';$('sync-time').textContent='Letzter erfolgreicher Abgleich: '+last;
 $('sync-indicator').textContent=model.sync.running?'Synchronisiert …':model.authorized?'Etsy verbunden':'Etsy noch nicht verbunden';
 $('sync-now').disabled=model.sync.running||!model.authorized;
 if(model.sync.error)showAlert('Etsy-Synchronisierung fehlgeschlagen: '+model.sync.error,true);
 else if(!model.configured)showAlert('Bitte unter ⚙ deine Etsy-App einrichten. Es werden noch keine echten Etsy-Daten angezeigt.');
 else if(!model.authorized)showAlert('Etsy-Einstellungen gespeichert. Bitte die einmalige Autorisierung unter ⚙ abschließen.');
 else if((model.sync.review_receipts||[]).length)showAlert(`Achtung: ${model.sync.review_receipts.length} Bestellung(en) mit unklarem Zahlungs-/Erstattungsstatus wurden vorsorglich nicht eingeplant. Bitte in Etsy prüfen: ${model.sync.review_receipts.join(', ')}.`, true);
 else if(model.missing_dates)showAlert(`Bei ${model.missing_dates} Bestellung(en) fehlt ein zuverlässiger Versandtermin. Bitte die Daten mit Etsy vergleichen und gegebenenfalls eintragen.`);
 else showAlert('');
 const groups=(mode==='pending'?model.groups:model.done_groups).filter(g=>`${g.title} ${g.listing_id} ${g.lines.map(l=>l.receipt_id).join(' ')}`.toLocaleLowerCase('de').includes($('search').value.toLocaleLowerCase('de')));
 const list=$('print-plan');if(!groups.length){list.innerHTML=$('empty-template').innerHTML;return;}
 list.innerHTML=groups.map(g=>{
 const p=priority(g.due,g.missing_due);const variants=(g.variants||[]).map(v=>`${esc(v.name)}: <b>${esc(v.value)}</b>`).join(' &nbsp;·&nbsp; ');
 const imageUrl=safeEtsyThumbnail(g.image_url);
 const thumbnail=imageUrl?`<img class="listing-thumb" src="${esc(imageUrl)}" width="70" height="70" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:`<span class="thumb-placeholder" aria-hidden="true">▧</span>`;
 const lines=g.lines.map(l=>`<li class="line"><div class="line-info"><b>Bestellung #${esc(l.receipt_id)}</b><span>${esc(fmtDate(l.due))} · ${l.produced} von ${l.qty} gedruckt</span><div class="deadline-editor"><input type="date" value="${esc(l.due||'')}" aria-label="Versanddatum für ${esc(l.receipt_id)}" data-date-for="${esc(l.receipt_id)}"><button type="button" data-due-save="${esc(l.receipt_id)}">Speichern</button></div></div><div class="line-actions"><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced-1}" ${l.produced<=0?'disabled':''} aria-label="Ein Stück weniger">−</button><span class="qty-number">${l.produced}/${l.qty}</span><button class="qty-button" data-txn="${esc(l.transaction_id)}" data-qty="${l.produced+1}" ${l.produced>=l.qty?'disabled':''} aria-label="Ein Stück mehr">+</button></div></li>`).join('');
 return `<article class="work ${p.card}"><div class="work-heading"><div class="work-heading-copy"><span class="pill ${p.cls}">${esc(p.label)}</span><h3 title="${esc(g.title)}">${esc(g.title)}</h3></div>${thumbnail}</div><div class="order-count">${new Set(g.lines.map(l=>l.receipt_id)).size} Etsy-Bestellung(en)</div><div class="variants">${variants||'Keine Farbvarianten angegeben'}</div><div class="numbers"><strong>${g.remaining}</strong><span>Stück noch drucken · ${g.qty} bestellt</span></div><div class="divider"></div><div class="work-top"><small>${g.printer?'Bevorzugter Drucker: '+esc(g.printer):'Drucker noch nicht festgelegt'}</small><small>Listing ${esc(g.listing_id)}</small></div><div class="work-actions">${g.remaining>0?`<button class="btn printed-action" type="button" data-print-one="${g.key}" aria-label="Ein Stück als gedruckt verbuchen" title="Ein Klick verbucht genau ein fertig gedrucktes Stück">${printerIcon}<span>${g.remaining===1?'Gedruckt':'+1 gedruckt'}</span></button><button class="btn secondary" type="button" data-batch="${g.key}">Mehrere Stück …</button>`:`<span class="printed-complete">✓ Vollständig gedruckt</span>`}<button class="btn secondary" type="button" data-product="${g.key}">✎ Produkt / Drucker</button><button class="btn secondary" type="button" data-expand="${g.key}">Positionen (${g.lines.length}) ▾</button></div><ul class="line-list" data-list="${g.key}" ${expandedGroups.has(g.key)?'':'hidden'}>${lines}</ul></article>`;}).join('');
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
$('tab-pending').addEventListener('click',()=>{mode='pending';$('tab-pending').classList.add('active');$('tab-done').classList.remove('active');render()});
$('tab-done').addEventListener('click',()=>{mode='done';$('tab-done').classList.add('active');$('tab-pending').classList.remove('active');render()});
$('search').addEventListener('input',render);$('sync-now').addEventListener('click',async()=>{try{await api('sync',{});await reload();}catch(e){showAlert(e.message,true)}});
$('settings-toggle').addEventListener('click',()=>{$('settings-status').textContent=model?.configured?'Einstellungen hinterlegt. Beim erneuten Speichern werden nur die Zugangsdaten dieser App verwendet.':'Noch keine Konfiguration gespeichert.';$('settings-modal').showModal()});
$('etsy-config').addEventListener('submit',async(e)=>{e.preventDefault();const form=new FormData(e.target);try{await api('config',Object.fromEntries(form.entries()));$('settings-status').textContent='Etsy-Einstellungen gespeichert. Als Nächstes autorisieren.';await reload();}catch(err){$('settings-status').textContent='Fehler: '+err.message;}});
$('oauth-start').addEventListener('click',async()=>{try{const {url}=await api('oauth/start',{});window.open(url,'_blank','noopener,noreferrer');$('settings-status').textContent='Etsy wurde in einem neuen Tab geöffnet. Nach Bestätigung die vollständige Redirect-Adresse hier einfügen.';}catch(e){$('settings-status').textContent='Fehler: '+e.message;}});
$('oauth-finish').addEventListener('click',async()=>{try{await api('oauth/finish',{redirected_url:$('oauth-return-url').value});$('oauth-return-url').value='';$('settings-modal').close();await reload();}catch(e){$('settings-status').textContent='Fehler: '+e.message;}});
$('print-plan').addEventListener('click',async(e)=>{
 let t=e.target.closest('[data-print-one],[data-expand],[data-batch],[data-product],[data-txn],[data-due-save]');if(!t)return;
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
$('export-btn').addEventListener('click',async()=>{try{const backup=await api('export');const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='print-pulse-produktionsstand-'+localDay()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);}catch(e){showAlert(e.message,true)}});
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
