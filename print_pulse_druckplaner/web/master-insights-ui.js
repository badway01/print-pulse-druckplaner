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
   const detected = file.insights?.filaments || [];
   if (detected.length) return {rows:detected,fromProfile:false};
   return {rows:profileColors(file).map(f => ({
     filament_id:f.id, name:f.material + ' ' + f.color, color_hex:f.hex, code:f.code,
     grams:null, slot:f.slot
   })),fromProfile:true};
 }
 function paletteHtml(file,orderColor='') {
   const {rows,fromProfile} = filamentRows(file);
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
       (f.grams !== null && f.grams !== undefined ? '<small>' + Number(f.grams).toLocaleString('de-DE') + ' g</small>' : '') +
       '</span>').join('') + '</div>' :
       '<p class="master-insight-missing">Noch keine Filamente hinterlegt.</p>') +
     (fromProfile && rows.length ? '<small>Farben aus dem Druckprofil.</small>' : '') +
     '</div>';
 }
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
 function editHtml(file) {
   const rows = file.insights?.filaments || [];
   const defaults = rows.length ? rows : profileColors(file).map(f => ({filament_id:f.id,grams:null}));
   const seconds = file.insights?.time_seconds;
   const hours = Number.isFinite(seconds) ? Math.floor(seconds / 3600) : '';
   const minutes = Number.isFinite(seconds) ? Math.floor(seconds / 60) % 60 : '';
   const mode = file.insights?.color_mode === 'custom' ? 'custom' : 'fixed';
   return '<details class="master-insight-edit"><summary>Master & Druckdaten bearbeiten</summary>' +
     '<form data-master-insight-form="' + esc(file.id) + '" class="master-insight-form">' +
     '<label>Farbzuordnung<select data-insight-mode>' +
     '<option value="fixed"' + (mode==='fixed'?' selected':'') + '>Festfarben – immer gleiche Farben</option>' +
     '<option value="custom"' + (mode==='custom'?' selected':'') + '>Wunschfarben – aus der Bestellung</option>' +
     '</select></label>' +
     '<div class="master-insight-time"><label>Stunden laut Slicer<input type="number" data-insight-hours min="0" max="2400" inputmode="numeric" value="' +
     hours + '" placeholder="0"></label>' +
     '<label>Minuten<input type="number" data-insight-minutes min="0" max="59" inputmode="numeric" value="' +
     minutes + '" placeholder="0"></label></div>' +
     '<strong>Filament aus deiner Bibliothek · Verbrauch je Druckplatte</strong>' +
     '<div data-insight-rows>' + (defaults.length ? defaults.map(inputRow).join('') : inputRow()) + '</div>' +
     '<div class="master-insight-edit-actions"><button type="button" class="secondary small" data-insight-add>+ Filament</button>' +
     '<button type="submit" class="primary small">Druckdaten speichern</button></div>' +
     '<small>Die Kosten werden automatisch mit deinen gespeicherten Filamentpreisen und Druckereinstellungen berechnet. Bei Wunschfarben ist der Preis ein Richtwert auf Grundlage der hinterlegten Referenzfilamente.</small>' +
     '</form></details>';
 }
 window.masterInsightsMarkup = function(file, compact=false, orderColor='') {
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
     paletteHtml(file,orderColor) +
     (!compact ? editHtml(file) : '') +
     '</section>';
 };
 window.masterSlicerButtonsMarkup = function(file) {
   if (!file) return '';
   const mac = typeof masterSlicerMac==='function' && masterSlicerMac();
   const labels=[['bambu','Bambu'],['orca','Orca'],['snapmaker','Snapmaker']];
   return '<div class="pp-slicer-actions" aria-label="3MF in Slicer öffnen">' + labels.map(([key,label]) => {
     const url = mac ? masterSlicerUrl(file,key) : 'api/master-download?id='+encodeURIComponent(file.id);
     return '<a class="pp-slicer-action pp-slicer-'+key+(key!=='snapmaker'?' simple-part-master-open':'')+'" href="'+esc(url)+'"'+
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
     const grams=row.querySelector('[data-insight-grams]').value;
     if (!value && !grams) continue;
     if (value && !grams) continue;
     if (!value || !grams || Number(grams) <= 0) {
       flash('Bitte zu jedem Filament auch eine Grammzahl eintragen.',true);
       return;
     }
     filaments.push({filament_id:Number(value),grams:Number(grams)});
   }
   const hours=Number(form.querySelector('[data-insight-hours]').value || 0);
   const minutes=Number(form.querySelector('[data-insight-minutes]').value || 0);
   const button=form.querySelector('[type="submit"]');
   button.disabled=true;
   try {
     await api('master-insights',{id,action:'save',hours,minutes,filaments,color_mode:form.querySelector('[data-insight-mode]').value});
     await refreshFile(id);
     flash('Druckzeit und Filamentverbrauch gespeichert. Kosten neu berechnet.');
   } catch(error) { flash('Druckdaten nicht gespeichert: ' + error.message,true);button.disabled=false; }
 });
})();
