/* Print & Pulse: light per-file 3MF metrics used in the master editor and orders. */
'use strict';
(() => {
 const money = n => n === null || n === undefined ? '—' :
   Number(n).toLocaleString('de-DE', {style:'currency',currency:'EUR'});
 const duration = seconds => Number.isFinite(seconds) && seconds >= 0 ?
   Math.floor(seconds / 3600) + ' h ' + String(Math.floor(seconds / 60) % 60).padStart(2,'0') + ' min' : '—';
 const date = seconds => seconds ? new Date(seconds * 1000).toLocaleDateString('de-DE') : 'Noch kein Druck protokolliert';
 const safeColor = value => /^#[a-f\d]{6}$/i.test(value || '') ? value : '#d5dadd';
 function profileColors(file) {
   const rows = (printTools.profiles || []).filter(row => row.listing_id === file.listing_id &&
     row.printer === file.printer && (row.variant_id === file.variant_id || !row.variant_id));
   const picked = rows.find(row => row.variant_id === file.variant_id) || rows[0];
   return picked?.colors || [];
 }
 function filamentRows(file) {
   const profile=profileColors(file);
   const slicer=Array.isArray(file.insights?.filaments)?file.insights.filaments:[];
   if(!profile.length)return {rows:slicer,fromProfile:false,unmatched:[]};
   // Never distribute a plate's total weight evenly among colors.
   // A per-color estimate is only assigned to a saved profile color when
   // the filament ID, unambiguous color code or exact HEX agrees.
   const used=new Set();
   const normalizeHex=value=>/^#[a-f\d]{6}$/i.test(value||'')?value.toLowerCase():null;
   const uniqueMatch=(filter)=>{
     const indices=slicer.map((f,i)=>({f,i})).filter(({f,i})=>!used.has(i)&&filter(f));
     return indices.length===1?indices[0]:null;
   };
   const rows=profile.map(f=>{
     const match=uniqueMatch(row=>f.id!=null&&row.filament_id!=null&&String(f.id)===String(row.filament_id))||
       uniqueMatch(row=>Boolean(f.code&&row.code)&&String(f.code)===String(row.code))||
       uniqueMatch(row=>Boolean(normalizeHex(f.hex))&&normalizeHex(f.hex)===normalizeHex(row.color_hex));
     if(match)used.add(match.i);
     const grams=match&&Number.isFinite(match.f.grams)&&match.f.grams>=0?match.f.grams:null;
     return {filament_id:f.id,name:f.color,color_hex:f.hex,code:f.code,grams,slot:f.slot};
   });
   const unmatched=slicer.filter((f,i)=>!used.has(i)&&Number.isFinite(f.grams)&&f.grams>0);
   return {rows,fromProfile:true,unmatched};
 }
 function paletteHtml(file,orderColor='',compact=false) {
   if (!compact && typeof window.masterPalettePreviewMarkup==='function' && masterContext?.id===file.listing_id) return window.masterPalettePreviewMarkup(file);
   const {rows,fromProfile,unmatched} = filamentRows(file);
   const knownGrams=rows.some(f=>Number.isFinite(f.grams)&&f.grams>0)||unmatched.length>0;
   const formatGrams=n=>Number(n).toLocaleString('de-DE',{maximumFractionDigits:2})+' g';
   const wish = file.insights?.color_mode === 'custom';
   const chosen = wish && String(orderColor||'').trim();
   return '<div class="master-insight-palette">' +
     '<strong>' + (wish ? 'Farbzuordnung · Wunschfarbe' : 'Benötigte Filamente') + '</strong>' +
     (chosen ? '<p class="pp-insight-wish"><b>Kundenfarbe: ' + esc(chosen) + '</b></p>' : '') +
     (wish && rows.length ? '<small>Hinterlegte Referenzfilamente (die Bestellfarbe kann abweichen)</small>' : '') +
     (rows.length ? '<div class="master-insight-colors">' + rows.map(f =>
       '<span class="master-insight-color" title="' + esc(f.slot || f.name || 'Filament') + '">' +
       '<span class="master-insight-dot" style="background:' + safeColor(f.color_hex) + '"></span>' +
       '<span>' + esc(f.code ? f.code + ' · ' + f.name : f.name || 'Filament') + '</span>' +
       (Number.isFinite(f.grams) ? '<small class="pp-insight-grams">' + formatGrams(f.grams) + '</small>' : '') +
       '</span>').join('') + '</div>' :
       '<p class="master-insight-missing">Noch keine Filamente hinterlegt.</p>') +
     (unmatched.length ? '<div class="pp-insight-unmatched"><strong>Weitere Mengen aus der 3MF (Farbe nicht eindeutig zugeordnet)</strong>' +
       '<div class="master-insight-colors">'+unmatched.map(f=>
       '<span class="master-insight-color"><span class="master-insight-dot" style="background:'+safeColor(f.color_hex)+'"></span>'+
       '<span>'+esc(f.name||f.code||'3MF-Filament')+'</span><small class="pp-insight-grams">'+formatGrams(f.grams)+'</small></span>'
       ).join('')+'</div></div>':'') +
     (fromProfile && rows.length ? '<small>Farben aus dem Druckprofil'+(knownGrams?' · Grammwerte aus der 3MF oder gespeicherten Druckdaten.':' · Gramm je Farbe noch nicht hinterlegt. Unter Bearbeiten ergänzen.')+'</small>' : '') +
     '</div>';
 }

 // Collect every distinct filament already assigned in the upper 3MF profile.
 // A repeated filament ID in two AMS slots still needs just one grams field.
 function assignedFilaments(file){
   const choices=(printTools.profiles||[]).filter(p=>
     String(p.listing_id)===String(file.listing_id)&&p.printer===file.printer);
   const saved=choices.find(p=>String(p.variant_id||'')===String(file.variant_id||''))||
     choices.find(p=>!p.variant_id);
   const current=typeof selectedMasterTarget==='function'?selectedMasterTarget():null;
   const draft=masterContext&&String(masterContext.id)===String(file.listing_id)&&
     masterColorEditFileId===file.id&&current&&current.printer===file.printer&&
     String(current.variant_id||'')===String(file.variant_id||'');
   const sources=draft?masterSources:saved?.sources;
   const assigned=new Map();
   for(const src of Array.isArray(sources)?sources:[]){
     if(!Array.isArray(src?.slots))continue;
     src.slots.forEach((fid,i)=>{
       const id=Number(fid);
       if(!Number.isSafeInteger(id)||id<=0)return;
       const record=(filamentData?.filaments||[]).find(f=>Number(f.id)===id);
       const snapshot=(saved?.colors||[]).find(f=>Number(f.id)===id);
       const library=(printTools.filaments_library||[]).find(f=>Number(f.id)===id);
       const where=[
         file.printer==='H2D'?(src.side==='left'?'Düse links':src.side==='right'?'Düse rechts':'Düse nicht zugeordnet'):'',
         src.label||'Filamentquelle',src.type==='ams'?'Slot '+(i+1):'Spule'
       ].filter(Boolean).join(' · ');
       if(assigned.has(id)){assigned.get(id).places.push(where);return;}
       assigned.set(id,{filament_id:id,
         code:record?.internal_code||snapshot?.code||library?.code||'',
         name:record?.color||snapshot?.color||library?.name||'Filament '+id,
         hex:record?.color_hex||snapshot?.hex||library?.hex||'',
         material:record?.material||snapshot?.material||'',
         places:[where],grams:null});
     });
   }
   const rows=[...assigned.values()];
   const measurements=Array.isArray(file.insights?.filaments)?file.insights.filaments:[];
   const used=new Set();
   for(const item of rows){
     let found=measurements.map((m,i)=>({m,i})).filter(({m,i})=>
       !used.has(i)&&m.filament_id!=null&&Number(m.filament_id)===item.filament_id);
     if(found.length!==1){
       const hex=String(item.hex||'').toLowerCase();
       const code=String(item.code||'');
       const codeUnique=code&&rows.filter(x=>x.code===code).length===1;
       const hexUnique=/^#[0-9a-f]{6}$/.test(hex)&&rows.filter(x=>String(x.hex||'').toLowerCase()===hex).length===1;
       const byCode=codeUnique?measurements.map((m,i)=>({m,i})).filter(({m,i})=>
         !used.has(i)&&m.code&&String(m.code)===code):[];
       const byHex=hexUnique?measurements.map((m,i)=>({m,i})).filter(({m,i})=>
         !used.has(i)&&String(m.color_hex||'').toLowerCase()===hex):[];
       found=byCode.length===1?byCode:byHex.length===1?byHex:[];
     }
     if(found.length===1){
       const {m,i}=found[0];
       item.grams=Number.isFinite(m.grams)&&m.grams>0?m.grams:null;
       used.add(i);
     }
   }
   return rows;
 }
 function assignedInputRow(item){
   const name=[item.code,item.name].filter(Boolean).join(' · ');
   return '<div class="master-insight-input-row pp-insight-assigned-row">'+
    '<div class="pp-insight-assigned-color"><span class="master-insight-dot" style="background:'+safeColor(item.hex)+'"></span>'+
    '<span><strong>'+esc(name)+'</strong><small>'+esc([item.material,...item.places].filter(Boolean).join(' · '))+'</small></span></div>'+
    '<input type="hidden" data-insight-filament value="'+item.filament_id+'">'+
    '<label>Verbrauch (g)<input type="number" data-insight-grams inputmode="decimal" min="0" max="100000" step="0.01"'+
    ' placeholder="Gramm fehlen" aria-label="Verbrauch in Gramm für '+esc(name)+'" value="'+
    (Number.isFinite(item.grams)?item.grams:'')+'"></label></div>';
 }
 // Rebuild only the lower 3MF form when the upper palette changes.
 // Duration and pending gram entries are retained.
 window.ppSyncMasterInsightForms=function(){
   document.querySelectorAll('#master-files form[data-master-insight-form]').forEach(form=>{
     const file=(printTools.files||[]).find(f=>String(f.id)===form.dataset.masterInsightForm);
     if(!file)return;
     const details=form.closest('.master-insight-edit');
     if(!details)return;
     const hours=form.querySelector('[data-insight-hours]')?.value||'';
     const minutes=form.querySelector('[data-insight-minutes]')?.value||'';
     const mode=form.querySelector('[data-insight-mode]')?.value||'fixed';
     const masses=new Map([...form.querySelectorAll('.master-insight-input-row')].map(row=>[
       row.querySelector('[data-insight-filament]')?.value||'',
       row.querySelector('[data-insight-grams]')?.value||''
     ]));
     const template=document.createElement('template');
     template.innerHTML=editHtml(file);
     const next=template.content.firstElementChild;
     next.open=details.open;
     const nextForm=next.querySelector('form');
     nextForm.querySelector('[data-insight-hours]').value=hours;
     nextForm.querySelector('[data-insight-minutes]').value=minutes;
     nextForm.querySelector('[data-insight-mode]').value=mode;
     nextForm.querySelectorAll('.master-insight-input-row').forEach(row=>{
       const id=row.querySelector('[data-insight-filament]')?.value||'';
       const value=masses.get(id);
       if(id&&value!==undefined&&value!=='')row.querySelector('[data-insight-grams]').value=value;
     });
     details.replaceWith(next);
   });
 };
 function spoolOptionHtml(selected) {
   const options = (printTools.filaments_library || []).slice().sort((a,b) =>
     (a.code || '').localeCompare(b.code || '', 'de', {numeric:true}) ||
     a.name.localeCompare(b.name, 'de'));
   return '<option value="">Filament wählen …</option>' + options.map(f =>
     '<option value="' + f.id + '"' + (Number(selected) === Number(f.id) ? ' selected' : '') + '>' +
     esc([f.code, f.name].filter(Boolean).join(' · ')) + '</option>').join('');
 }
 function inputRow(item={}) {
   return '<div class="master-insight-input-row"><label>Filament' +
     '<select data-insight-filament>' + spoolOptionHtml(item.filament_id) + '</select></label>' +
     '<label>Verbrauch (g)<input type="number" inputmode="decimal" min="0" max="100000" step="0.01" ' +
     'data-insight-grams placeholder="z. B. 24,5" value="' +
     (Number.isFinite(item.grams) ? item.grams : '') + '"></label>' +
     '<button type="button" data-insight-remove aria-label="Filamentzeile entfernen" title="Zeile entfernen">×</button></div>';
 }
 function editHtml(file,expanded=false) {
   const rows=file.insights?.filaments||[];
   const assigned=assignedFilaments(file);
   const auto=assigned.length>0;
   const complete=auto&&assigned.every(f=>Number.isFinite(f.grams)&&f.grams>0);
   const missing=assigned.filter(f=>!Number.isFinite(f.grams)||f.grams<=0).length;
   const defaults=rows.length?rows:profileColors(file).map(f=>({filament_id:f.id,grams:null}));
   const seconds=file.insights?.time_seconds;
   const hours=Number.isFinite(seconds)?Math.floor(seconds/3600):'';
   const minutes=Number.isFinite(seconds)?Math.floor(seconds/60)%60:'';
   const mode=file.insights?.color_mode==='custom'?'custom':'fixed';
   return '<details class="master-insight-edit"'+(expanded?' open':'')+'><summary>Gramm und Druckzeit bearbeiten</summary>'+
    '<form data-master-insight-form="'+esc(file.id)+'" class="master-insight-form"'+(auto?' data-insight-auto="true"':'')+'>'+
    '<div class="master-workflow-mass-title"><strong>Verbrauch pro Farbe</strong>'+
    '<small>'+(auto?(complete?'Aus 3MF oder gespeicherten Daten übernommen. Bei Bedarf korrigieren.':
      missing+' Farbe'+(missing===1?'':'n')+' benötigt noch einen Grammwert.'):'Noch keine AMS-Belegung gespeichert. Farben hier vorläufig manuell auswählbar.')+
    '</small></div>'+
    (auto?'<div data-insight-rows>'+assigned.map(assignedInputRow).join('')+'</div>':
      '<div class="pp-insight-no-profile"><strong>Farben zuerst in Schritt 2 zuordnen.</strong>'+
      '<small>Solange keine Belegung hinterlegt ist, kannst du bestehende Druckdaten weiterhin manuell erfassen.</small></div>'+
      '<div data-insight-rows>'+(defaults.length?defaults.map(inputRow).join(''):inputRow())+'</div>'+
      '<button type="button" class="secondary small" data-insight-add>+ Filament</button>')+
    '<div class="master-workflow-time-title"><strong>Druckdauer laut Slicer</strong></div>'+
    '<div class="master-insight-time"><label>Stunden<input type="number" data-insight-hours min="0" max="2400" inputmode="numeric" value="'+
    hours+'" placeholder="0"></label>'+
    '<label>Minuten<input type="number" data-insight-minutes min="0" max="59" inputmode="numeric" value="'+
    minutes+'" placeholder="0"></label></div>'+
    '<details class="pp-insight-optional-mode"'+(mode==='custom'?' open':'')+'><summary>Farbmodus / Wunschfarben (optional)</summary>'+
    '<label>Farbzuordnung<select data-insight-mode>'+
    '<option value="fixed"'+(mode==='fixed'?' selected':'')+'>Festfarben – immer gleiche Farben</option>'+
    '<option value="custom"'+(mode==='custom'?' selected':'')+'>Wunschfarben – aus der Bestellung</option>'+
    '</select></label></details>'+
    '<div class="master-insight-edit-actions"><button type="submit" class="primary small">Druckdaten speichern</button></div>'+
    '<small>Kosten werden aus den bekannten Grammwerten und Filamentpreisen berechnet. Unbekannte Mengen werden nicht geschätzt.</small>'+
    '</form></details>';
 }
 window.masterInsightsMarkup = function(file, compact=false, orderColor='', hidePalette=false, expandEditor=false) {
   if (!file) return '';
   const info = file.insights || {};
   const price = info.production_eur ?? info.material_eur;
   const moneyLabel = info.production_eur != null ? 'Druckkosten / Platte' :
     info.material_eur != null ? 'Materialkosten / Platte' : 'Druckkosten fehlen';
   return '<section class="master-insight-card pp-master-summary' + (compact ? ' is-compact' : '') +
     '" aria-label="Druckdaten zu ' + esc(file.filename) + '">' +
     (!compact ? '<strong class="pp-insight-heading">Druckdaten</strong>' : '') +
     '<div class="pp-insight-stats">' +
     '<div><small>Druckzeit laut Slicer</small><strong>' + duration(info.time_seconds) + '</strong></div>' +
     (info.total_grams != null ? '<div><small>Filament / Platte</small><strong>' +
       Number(info.total_grams).toLocaleString('de-DE') + ' g</strong></div>' : '') +
     '<div><small>' + moneyLabel + '</small><strong class="pp-insight-price">' + money(price) + '</strong></div>' +
     '</div>' +
     (hidePalette?'':paletteHtml(file,orderColor,compact)) +
     (!compact ? editHtml(file,expandEditor) : '') +
     '</section>';
 };
 window.masterSlicerButtonsMarkup = function(file) {
   if (!file) return '';
   const mac = typeof masterSlicerMac==='function' && masterSlicerMac();
   const labels=[['bambu','Bambu Studio'],['orca','OrcaSlicer'],['snapmaker','Snapmaker Orca'],['prusa','PrusaSlicer']];
   return '<div class="pp-slicer-actions" aria-label="3MF in Slicer öffnen">' + labels.map(([key,label]) => {
     const url = mac ? masterSlicerUrl(file,key) : 'api/master-download?id='+encodeURIComponent(file.id);
     return '<a class="pp-slicer-action pp-slicer-'+key+(['bambu','orca'].includes(key)?' simple-part-master-open':'')+'" href="'+esc(url)+'"'+
       (mac?'':' download title="Auf diesem Gerät die 3MF herunterladen, dann im Slicer öffnen"')+
       '>'+esc(label)+(mac?' öffnen':' · 3MF')+'</a>';
   }).join('')+'</div>' + (!mac ?
     '<small class="pp-slicer-device-hint">Direkt öffnen mit installiertem Mac-Helfer. Hier wird die 3MF heruntergeladen.</small>' : '');
 };
 async function refreshFile(fileId) {
   const file=(printTools.files || []).find(f => f.id === fileId);
   if (!file) return;
   const lid=file.listing_id;
   const data=await api('print-tools?listing_id=' + encodeURIComponent(lid));
   if (!Array.isArray(data.files)) throw Error('3MF-Daten konnten nicht neu geladen werden.');
   printTools.files=[...printTools.files.filter(f => String(f.listing_id) !== String(lid)), ...data.files];
   printTools.filaments_library=data.filaments_library || printTools.filaments_library || [];
   if (typeof renderMasterFiles === 'function' && masterContext?.id === lid) renderMasterFiles();
   if (typeof renderCatalog === 'function') renderCatalog();
   if (typeof render === 'function') render();
 }
 document.addEventListener('click', async event => {
   const add=event.target.closest('[data-insight-add]');
   if (add) {
     const rows=add.closest('form')?.querySelector('[data-insight-rows]');
     if (!rows) return;
     if (rows.children.length >= 16) { flash('Maximal 16 Filamente.',true); return; }
     rows.insertAdjacentHTML('beforeend',inputRow());
     return;
   }
   const remove=event.target.closest('[data-insight-remove]');
   if (remove) { remove.closest('.master-insight-input-row')?.remove(); return; }
   const count=event.target.closest('[data-master-insight-count]');
   if (count) {
     event.preventDefault();
     count.disabled=true;
     try {
       await api('master-insights',{id:count.dataset.masterInsightCount,action:'count'});
       await refreshFile(count.dataset.masterInsightCount);
       flash('Druck für diese 3MF protokolliert.');
     } catch(error) { flash('Druck konnte nicht erfasst werden: ' + error.message,true);count.disabled=false; }
   }
 });
 document.addEventListener('submit', async event => {
   const form=event.target.closest('[data-master-insight-form]');
   if (!form) return;
   event.preventDefault();
   const id=form.dataset.masterInsightForm;
   const rows=[...form.querySelectorAll('.master-insight-input-row')];
   const filaments=[];
   for (const row of rows) {
     const value=row.querySelector('[data-insight-filament]').value;
     const grams=row.querySelector('[data-insight-grams]').value.trim().replace(',','.');
     // Blank is unknown. Duration-only saves must not invent mass or cost.
     if (!value&&!grams || value&&!grams)continue;
     if (!value||!Number.isFinite(Number(grams))||Number(grams)<=0){
       flash('Bitte eine gültige Grammzahl größer 0 eingeben.',true);return;
     }
     filaments.push({filament_id:Number(value),grams:Number(grams)});
   }
   const hours=Number(form.querySelector('[data-insight-hours]').value || 0);
   const minutes=Number(form.querySelector('[data-insight-minutes]').value || 0);
   const button=form.querySelector('[type="submit"]');
   button.disabled=true;
   try {
     await api('master-insights',{id,action:'save',hours,minutes,filaments,clear_filaments:rows.length===0,color_mode:form.querySelector('[data-insight-mode]').value});
     await refreshFile(id);
     flash('Druckdaten gespeichert. Bekannte Grammwerte und Kosten aktualisiert.');
   } catch(error) { flash('Druckdaten nicht gespeichert: ' + error.message,true);button.disabled=false; }
 });
})();
