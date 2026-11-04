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
 function paletteHtml(file) {
   const {rows,fromProfile} = filamentRows(file);
   return '<div class="master-insight-palette"><strong>' +
     (fromProfile ? 'Filamentbelegung aus Druckprofil' : 'Filamentbelegung dieser Datei') +
     '</strong>' + (rows.length ?
       '<div class="master-insight-colors">' + rows.map(f =>
         '<span class="master-insight-color" title="' + esc(f.slot || f.name || 'Filament') + '">' +
         '<span class="master-insight-dot" style="background:' + safeColor(f.color_hex) + '"></span>' +
         '<span>' + esc(f.code ? f.code + ' · ' + f.name : f.name || 'Filament') + '</span>' +
         (f.grams !== null && f.grams !== undefined ? '<small>' + Number(f.grams).toLocaleString('de-DE') + ' g</small>' : '') +
         '</span>').join('') + '</div>' :
       '<p class="master-insight-missing">Keine Filamentbelegung hinterlegt.</p>') +
     (fromProfile && rows.length ? '<small>Die Farben stammen aus dem gespeicherten Druckprofil.</small>' : '') +
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
   // Profiles provide convenient defaults but don't claim material consumption.
   const defaults = rows.length ? rows : profileColors(file).map(f => ({filament_id:f.id,grams:null}));
   const seconds = file.insights?.time_seconds;
   const hours = Number.isFinite(seconds) ? Math.floor(seconds / 3600) : '';
   const minutes = Number.isFinite(seconds) ? Math.floor(seconds / 60) % 60 : '';
   return '<details class="master-insight-edit"><summary>Verbrauch und Druckzeit bearbeiten</summary>' +
     '<form data-master-insight-form="' + esc(file.id) + '" class="master-insight-form">' +
     '<div class="master-insight-time"><label>Druckzeit Stunden<input type="number" data-insight-hours min="0" max="2400" inputmode="numeric" value="' +
     hours + '" placeholder="0"></label>' +
     '<label>Minuten<input type="number" data-insight-minutes min="0" max="59" inputmode="numeric" value="' +
     minutes + '" placeholder="0"></label></div>' +
     '<strong>Filamentverbrauch für diese gesamte Druckcharge</strong>' +
     '<div data-insight-rows>' + (defaults.length ? defaults.map(inputRow).join('') : inputRow()) + '</div>' +
     '<div class="master-insight-edit-actions"><button type="button" class="secondary small" data-insight-add>+ Filament</button>' +
     '<button type="submit" class="primary small">Druckdaten speichern</button></div>' +
     '<small>Verbrauch und Zeit gelten für die komplette 3MF-Druckcharge. Die Kosten werden anhand deiner gespeicherten Filamentpreise und der Rechner-Einstellungen berechnet. Ohne Angaben erscheint kein erfundener Preis.</small>' +
     '</form></details>';
 }
 window.masterInsightsMarkup = function(file, compact=false) {
   if (!file) return '';
   const info = file.insights || {};
   const hasHistory = info.total_spend_eur !== null && info.total_spend_eur !== undefined;
   const result = hasHistory ? info.total_spend_eur : (info.production_eur ?? info.material_eur);
   const label = hasHistory ? 'Gesamtausgaben · protokolliert' :
     (info.production_eur !== null && info.production_eur !== undefined ?
      'Druckkosten / Charge' : 'Materialkosten / Charge');
   const averageCost = info.avg_cost_eur ?? info.production_eur ?? info.material_eur;
   const averageTime = info.avg_time_seconds ?? info.time_seconds;
   return '<section class="master-insight-card' + (compact ? ' is-compact' : '') +
     '" aria-label="Druckdaten zu ' + esc(file.filename) + '">' +
     '<div class="master-insight-top"><div><strong>Druckdaten</strong><small>Letzter Druck: ' +
     esc(date(info.last_print)) + '</small></div>' +
     '<div class="master-insight-cost"><strong>' + money(result) + '</strong><span>' + label + '</span></div></div>' +
     '<div class="master-insight-kpis">' +
     '<div><strong>' + (Number(info.print_count) || 0) + '</strong><small>Drucke erfasst</small></div>' +
     '<div><strong>' + money(averageCost) + '</strong><small>' +
       (info.avg_cost_eur != null ? 'Ø Kosten je Druck' : 'Kosten / Charge') + '</small></div>' +
     '<div><strong>' + duration(averageTime) + '</strong><small>' +
       (info.avg_time_seconds != null ? 'Ø Zeit je Druck' : 'Druckzeit / Charge') + '</small></div>' +
     '</div>' +
     (info.total_grams != null ? '<p class="master-insight-consumption">Filament pro Charge: <b>' +
       Number(info.total_grams).toLocaleString('de-DE') + ' g</b></p>' : '') +
     paletteHtml(file) +
     (!compact ? '<div class="master-insight-foot"><small>Interne Kalkulation ohne Etsy-Gebühren, Verpackung und Versand.</small>' +
       '<button type="button" class="secondary small" data-master-insight-count="' + esc(file.id) +
       '" title="Einen tatsächlich abgeschlossenen Druck erfassen">+ Druck protokollieren</button></div>' +
       editHtml(file) : '') + '</section>';
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
     await api('master-insights',{id,action:'save',hours,minutes,filaments});
     await refreshFile(id);
     flash('Druckzeit und Filamentverbrauch gespeichert. Kosten neu berechnet.');
   } catch(error) { flash('Druckdaten nicht gespeichert: ' + error.message,true);button.disabled=false; }
 });
})();
