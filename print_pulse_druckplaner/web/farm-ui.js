/* Druckfarm: no fictitious readings; all calculations come from the HA backend. */
let farmDays=7, farmBusy=false, farmStats=null;

function farmSafe(value){
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function farmHours(seconds){
 const n=Math.max(0,Number(seconds)||0);
 return (n/3600).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' h';
}
function farmPercent(n){return Math.max(0,Math.min(100,Number(n)||0));}
function farmKpi(title,value,sub){
 return '<div class="farm-kpi"><small>'+farmSafe(title)+'</small><strong>'+farmSafe(value)+'</strong><span>'+farmSafe(sub)+'</span></div>';
}
function farmButton(printer,action,label,tone){
 return '<button type="button" class="'+(tone||'secondary')+' small" data-farm-printer="'+farmSafe(printer)+'" data-farm-action="'+farmSafe(action)+'">'+farmSafe(label)+'</button>';
}
function farmPrinterCard(r,data){
 const recorded=Math.max(0,Number(r.observed_seconds)||0);
 const printing=Math.max(0,Number(r.printing_seconds)||0);
 const cover=farmPercent(r.coverage_percent),capacity=farmPercent(r.capacity_percent);
 const goodSample=recorded>=3600;
 const measured=goodSample&&r.measured_utilization_percent!==null
  ?Number(r.measured_utilization_percent).toLocaleString('de-DE',{maximumFractionDigits:0})+' %':'noch offen';
 const manual=r.source==='manual',running=!!r.manual_active_since;
 const last=r.last_sample_at?new Date(r.last_sample_at*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'keine';
 let actionHtml='';
 if(manual){
   actionHtml='<div class="farm-manual-actions">'+(running
    ?farmButton(r.printer,'finish','✓ Druck fertig','primary')+farmButton(r.printer,'failed','Fehldruck')+farmButton(r.printer,'cancel','Abbruch')
    :farmButton(r.printer,'start','▶ Druck starten','primary'))+'</div>';
 }
 let status=manual?(running?'Manueller Druck läuft':'Manuelle Zeiterfassung'):(r.last_sample_at?'HA-Erfassung':'Noch keine Statusdaten');
 return '<article class="farm-card'+(running?' is-running':'')+'">'+
   '<div class="farm-card-head"><div><small>'+farmSafe(manual?'MANUELL · STOPPUHR':'HOME ASSISTANT · STATUS')+'</small><h3>'+farmSafe(r.printer)+'</h3></div><span class="farm-card-status">'+farmSafe(status)+'</span></div>'+
   '<div class="farm-card-numbers"><div><small>Gedruckt</small><b>'+farmHours(printing)+'</b></div>'+
   '<div><small>24/7-Auslastung</small><b>'+capacity.toLocaleString('de-DE',{maximumFractionDigits:1})+' %</b></div></div>'+
   '<div class="farm-bar-title"><span>Druckzeit</span><b>'+capacity.toLocaleString('de-DE',{maximumFractionDigits:1})+' % der möglichen Zeit</b></div>'+
   '<div class="farm-bar" role="img" aria-label="'+farmSafe(r.printer+': '+capacity.toFixed(1)+' Prozent der theoretischen Zeit gedruckt')+'"><span style="width:'+capacity+'%"></span></div>'+
   '<div class="farm-bar-title muted"><span>Messabdeckung</span><b>'+cover.toLocaleString('de-DE',{maximumFractionDigits:1})+' %</b></div>'+
   '<div class="farm-bar is-coverage"><span style="width:'+cover+'%"></span></div>'+
   '<div class="farm-card-bottom"><span>Erfasst: '+farmHours(recorded)+'</span><span>Druck-Anteil der erfassten Zeit: '+farmSafe(measured)+'</span></div>'+
   '<div class="farm-card-bottom"><span>Erkannte Fertigstellungen: '+Number(r.successes||0)+'</span><span>Fehldrucke erkannt: '+Number(r.failures||0)+'</span></div>'+
   (manual?'<p class="farm-card-hint">Nur die manuell gestartete Druckzeit wird erfasst. Fehlende Stunden bleiben unbekannt.</p>':
    '<p class="farm-card-hint">Letzter protokollierter HA-Status: '+farmSafe(last)+'</p>')+
   actionHtml+'</article>';
}
function renderFarmStats(){
 const root=document.getElementById('farm-printer-grid');
 const kpis=document.getElementById('farm-kpis');
 const invest=document.getElementById('farm-invest');
 if(!root||!kpis||!invest)return;
 if(!farmStats){root.innerHTML='';kpis.innerHTML='';invest.innerHTML='';return;}
 const d=farmStats;
 const total=Math.max(0,Number(d.capacity_seconds)||0);
 kpis.innerHTML=[
   farmKpi('Erfasste Druckzeit',farmHours(d.printing_seconds),'Über alle sechs Drucker'),
   farmKpi('24/7-Auslastung',farmPercent(d.capacity_percent).toLocaleString('de-DE',{maximumFractionDigits:1})+' %','Bezogen auf '+farmHours(total)+' maximal mögliche Zeit'),
   farmKpi('Messabdeckung',farmPercent(d.coverage_percent).toLocaleString('de-DE',{maximumFractionDigits:1})+' %','Fehlende Sensordaten zählen nicht als Leerlauf'),
   farmKpi('Eingesetzte Drucker',String(d.printer_count),'Vorhandene Drucker, kein zweiter H2D angenommen')
 ].join('');
 root.innerHTML=(d.printers||[]).map(r=>farmPrinterCard(r,d)).join('');
 const h2d=(d.printers||[]).find(p=>p.printer==='H2D');
 let headline='Investitions-Check: zweiter H2D';
 let message='';
 if(d.days!==7){
   message='Wähle „7 Tage“, damit die Entscheidung auf einer vergleichbaren Produktionswoche basiert.';
 }else if(!h2d||h2d.coverage_percent<75){
   message='Noch zu wenig zuverlässige H2D-Messdaten für eine Kaufempfehlung. Nach rund einer vollständig erfassten Woche lässt sich der Engpass besser beurteilen.';
 }else if(h2d.capacity_percent>=75){
   message='Dein H2D hat mindestens 75 % der gesamten Woche tatsächlich gedruckt. Ein zweiter H2D könnte helfen, wenn passende Kundenaufträge warten und der freie Cashflow ausreicht.';
 }else if(h2d.capacity_percent>=55){
   message='Dein H2D ist regelmäßig beschäftigt. Prüfe zusätzlich die wartenden H2D-Aufträge und die Verteilung auf die anderen Drucker.';
 }else{
   message='Der gemessene H2D liegt noch unter 55 % der 24/7-Kapazität. Zuerst nach Engpässen bei anderen Druckern und Rüstzeiten schauen.';
 }
 invest.innerHTML='<h3>'+headline+'</h3><p>'+farmSafe(message)+'</p>'+
  '<small>Die Auswertung zeigt Auslastung, aber keine Rentabilität. Zusätzlicher Deckungsbeitrag, Ausfallrisiko und Investitionsbudget bleiben für die Kaufentscheidung wichtig.</small>';
}
async function loadFarmStats(force=false){
 if(farmBusy || document.hidden)return;
 farmBusy=true;
 const label=document.getElementById('farm-status');
 const refresh=document.getElementById('farm-refresh');
 if(refresh)refresh.disabled=true;
 if(label)label.textContent='Messdaten werden aktualisiert …';
 try{
   farmStats=await api('farm-stats?days='+farmDays);
   renderFarmStats();
   if(label)label.textContent='Zeitraum: '+(farmDays===1?'letzte 24 Stunden':'letzte '+farmDays+' Tage')+
     ' · Daten werden im Home-Assistant-Add-on gespeichert, auch über Nacht.';
 }catch(err){
   if(label)label.textContent='Druckfarm derzeit nicht erreichbar: '+err.message;
 }finally{
   if(refresh)refresh.disabled=false;
   farmBusy=false;
 }
}
document.querySelectorAll('[data-farm-days]').forEach(btn=>btn.addEventListener('click',()=>{
 const days=Number(btn.dataset.farmDays);
 if(![1,7,30].includes(days))return;
 farmDays=days;
 document.querySelectorAll('[data-farm-days]').forEach(b=>{
  const selected=b===btn;
  b.classList.toggle('selected',selected);
  b.setAttribute('aria-pressed',String(selected));
 });
 loadFarmStats();
}));
document.getElementById('farm-refresh')?.addEventListener('click',()=>loadFarmStats(true));
document.getElementById('farm-printer-grid')?.addEventListener('click',async event=>{
 const btn=event.target.closest('[data-farm-action]');
 if(!btn||farmBusy)return;
 const printer=btn.dataset.farmPrinter, action=btn.dataset.farmAction;
 if(!['A1 mini','Prusa MK4'].includes(printer)||!['start','finish','failed','cancel'].includes(action))return;
 if((action==='failed'||action==='cancel')&&!window.confirm(
  action==='failed'?'Diesen Druck als fehlgeschlagen verbuchen?':'Manuelle Druckzeit abbrechen?'))return;
 farmBusy=true;
 btn.disabled=true;
 try{
   await api('farm-manual',{printer,action});
   if(typeof flash==='function')flash('Druckfarm: '+printer+' aktualisiert.');
 }catch(err){
   if(typeof flash==='function')flash(err.message,true);
 }finally{
   farmBusy=false;
   btn.disabled=false;
 }
 await loadFarmStats(true);
});
setInterval(()=>{if(typeof workspace!=='undefined'&&workspace==='farm')loadFarmStats();},120000);
