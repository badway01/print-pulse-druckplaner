/* Druckfarm: no fictitious readings; all calculations come from the HA backend. */
let farmDays=7, farmBusy=false, farmStats=null;
let statsPeriod='month',statsSerial=0;
const statsPeriodName={week:'Kalenderwoche',month:'Kalendermonat',year:'Kalenderjahr',all:'Gesamt'};
async function loadSalesStatistics(){
 const serial=++statsSerial,host=document.getElementById('stats-sales-content');
 if(!host)return;
 host.textContent='Verkaufsdaten werden geladen …';
 try{
  const d=await api('sales-statistics?period='+statsPeriod);
  if(serial!==statsSerial)return;
  const euro=n=>Number(n||0).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
  const rank=(rows,key,format)=>rows.length?rows.map((p,i)=>'<div class="stats-rank"><span>'+ (i+1)+'. '+farmSafe(p.title)+'</span><b>'+farmSafe(format(p[key]))+'</b></div>').join(''):'<p class="hint">Noch keine Daten.</p>';
  host.innerHTML='<div class="farm-kpis">'+
   farmKpi('Bestellungen',String(d.orders+d.local_orders),d.orders+' Etsy · '+d.local_orders+' lokal')+
   farmKpi('Verkaufte Artikel',String(d.items),'Etsy · Stückzahl')+
   farmKpi('Etsy-Bestellwert',d.revenue_missing===d.orders&&d.orders?'–':euro(d.revenue)+(d.revenue_missing?' *':''),'Inkl. Versand/Steuern, vor Gebühren')+
   '</div><div class="stats-ranking"><section><h4>Top 5 nach Stückzahl</h4>'+rank(d.top_quantity,'quantity',n=>n+' Stk.')+'</section>'+
   '<section><h4>Top 5 nach Artikelwert</h4>'+rank(d.top_revenue,'revenue',euro)+'</section></div>'+
   '<p class="hint">'+(d.history_imported?'Historische Etsy-Positionen eingelesen.':'Ältere Verkäufe können fehlen. Etsy-Historie einmal einlesen.')+
   (d.revenue_missing?' * '+d.revenue_missing+' Bestellungen ohne erfassten Euro-Betrag.':'')+' Kein Nettogewinn; Rückerstattungen und Etsy-Gebühren sind nicht verrechnet.</p>';
 }catch(e){if(serial===statsSerial)host.textContent='Verkaufsdaten nicht verfügbar: '+e.message;}
}

function farmSafe(value){
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function farmHours(seconds){
 const n=Math.max(0,Number(seconds)||0);
 return (n/3600).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' h';
}
function farmPercent(n){return Math.max(0,Math.min(100,Number(n)||0));}
function farmPctLabel(n){return n==null?'–':farmPercent(n).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';}
function farmMeasured(printing,recorded){
 return recorded>=3600?farmPercent(100*printing/recorded):null;
}
function farmUtilization(printing,recorded){
 const measured=farmMeasured(printing,recorded);
 return '<div class="farm-utilization"><div class="farm-utilization-head"><div><small>Gemessene Auslastung</small><strong>'+farmPctLabel(measured)+'</strong></div><span>'+farmHours(recorded)+' erfasst</span></div>'+
  (measured===null?'<div class="farm-utilization-track is-unknown" role="img" aria-label="Noch zu wenig Messdaten"></div>':
   '<progress class="farm-utilization-track" max="100" value="'+measured+'" aria-label="'+farmSafe(farmPctLabel(measured)+' gedruckt, '+farmPctLabel(100-measured)+' ohne Druck')+'"></progress>')+
  '<div class="farm-utilization-key"><span><i class="farm-dot-print"></i>'+farmHours(printing)+' Druckzeit</span><span><i class="farm-dot-other"></i>'+farmHours(Math.max(0,recorded-printing))+' ohne Druck</span></div>'+
  (measured===null?'<p class="farm-card-hint">Mindestens eine Stunde Messdaten erforderlich.</p>':'')+'</div>';
}
function farmCoverage(recorded,capacity,percent){
 const cover=farmPercent(percent);
 return '<div class="farm-coverage"><div class="farm-bar-title"><span>Messabdeckung</span><b>'+farmPctLabel(cover)+'</b></div>'+
  '<progress class="farm-coverage-track" max="100" value="'+cover+'" aria-label="'+farmSafe(farmPctLabel(cover)+' des Zeitraums erfasst')+'"></progress>'+
  '<div class="farm-coverage-caption">'+farmHours(recorded)+' von '+farmHours(capacity)+' erfasst'+
  (cover<75?' · Noch wenig Messdaten':'')+'</div></div>';
}
function farmKpi(title,value,sub){
 return '<div class="farm-kpi"><small>'+farmSafe(title)+'</small><strong>'+farmSafe(value)+'</strong><span>'+farmSafe(sub)+'</span></div>';
}
function farmButton(printer,action,label,tone){
 return '<button type="button" class="'+(tone||'secondary')+' small" data-farm-printer="'+farmSafe(printer)+'" data-farm-action="'+farmSafe(action)+'">'+farmSafe(label)+'</button>';
}
function farmPrinterCard(r,data){
 const recorded=Math.max(0,Number(r.observed_seconds)||0);
 const printing=Math.max(0,Number(r.printing_seconds)||0);
 const cover=farmPercent(r.coverage_percent);
 const capacity=Math.max(0,Number(data.end)-Number(data.start))||0;
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
   farmUtilization(printing,recorded)+farmCoverage(recorded,capacity,cover)+
   '<details class="farm-card-details"><summary>Weitere Messwerte</summary>'+
   '<div class="farm-card-bottom"><span>Nachgewiesener Anteil der 24/7-Kapazität: '+farmPctLabel(r.capacity_percent)+'</span></div>'+
   '<div class="farm-card-bottom"><span>Leerlauf: '+farmHours(r.idle_seconds)+'</span><span>Pausen: '+farmHours(r.paused_seconds)+'</span><span>Vorbereitung: '+farmHours(r.preparing_seconds)+'</span><span>Störung: '+farmHours(r.fault_seconds)+'</span></div>'+
   '<div class="farm-card-bottom"><span>Erkannte Fertigstellungen: '+Number(r.successes||0)+'</span><span>Fehldrucke erkannt: '+Number(r.failures||0)+'</span></div>'+
   '<div class="farm-card-bottom"><span>Strom: '+(r.energy_kwh==null?'keine Messung':Number(r.energy_kwh).toLocaleString('de-DE',{maximumFractionDigits:3})+' kWh')+'</span><span>Kosten: '+(r.energy_cost==null?'–':Number(r.energy_cost).toLocaleString('de-DE',{style:'currency',currency:'EUR'}))+'</span></div>'+
   (manual?'<p class="farm-card-hint">Nur die manuell gestartete Druckzeit wird erfasst. Fehlende Stunden bleiben unbekannt.</p>':
    '<p class="farm-card-hint">Letzter protokollierter HA-Status: '+farmSafe(last)+'</p>')+
   '</details>'+actionHtml+'</article>';
}
function renderFarmStats(){
 const root=document.getElementById('farm-printer-grid');
 const kpis=document.getElementById('farm-kpis');
 const invest=document.getElementById('farm-invest');
 if(!root||!kpis||!invest)return;
 if(!farmStats){root.innerHTML='';kpis.innerHTML='';invest.innerHTML='';return;}
 const d=farmStats;
 const total=Math.max(0,Number(d.capacity_seconds)||0);
 const recorded=Math.max(0,Number(d.observed_seconds)||0);
 const printing=Math.max(0,Number(d.printing_seconds)||0);
 kpis.innerHTML=[
   '<div class="farm-overview-utilization">'+farmUtilization(printing,recorded)+farmCoverage(recorded,total,d.coverage_percent)+'</div>',
   farmKpi('Erfasste Druckzeit',farmHours(printing),'Über alle '+String(d.printer_count)+' Produktionsdrucker'),
   farmKpi('Ohne Druck',farmHours(Math.max(0,recorded-printing)),'Nur gemessene Zeit, keine unbekannten Stunden'),
   farmKpi('Produktionsdrucker',String(d.printer_count),'P1S Old · P1S New · H2D · U1 · X2D')
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
 const requested=farmDays;
 farmBusy=true;
 const label=document.getElementById('farm-status');
 const refresh=document.getElementById('farm-refresh');
 if(refresh)refresh.disabled=true;
 if(label)label.textContent='Messdaten werden aktualisiert …';
 try{
   const result=await api('farm-stats?days='+requested);
   if(requested===farmDays){
    farmStats=result;
    renderFarmStats();
    if(label)label.textContent='Letzte '+(requested===1?'24 Stunden':requested+' Tage')+
      ' · Unbekannte Zeiten werden nicht als Leerlauf gewertet.';
   }
 }catch(err){
   if(label)label.textContent='Druckfarm derzeit nicht erreichbar: '+err.message;
 }finally{
   if(refresh)refresh.disabled=false;
   farmBusy=false;
   if(requested!==farmDays)loadFarmStats();
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
document.querySelectorAll('[data-filament-stats-period]').forEach(btn=>btn.addEventListener('click',()=>{
 statsPeriod=btn.dataset.filamentStatsPeriod;
 loadSalesStatistics();
}));
document.querySelectorAll('[data-stats-period]').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('[data-stats-period]').forEach(b=>{b.classList.toggle('selected',b===btn);b.setAttribute('aria-pressed',String(b===btn));});
 document.querySelector('[data-filament-stats-period="'+btn.dataset.statsPeriod+'"]').click();
}));
document.getElementById('stats-history')?.addEventListener('click',async event=>{
 const b=event.currentTarget;b.disabled=true;
 try{
  await api('filament-history',{action:'start'});
  flash('Etsy-Historie wird eingelesen. Das kann einige Minuten dauern.');
 }catch(e){flash(e.message,true);}
 finally{b.disabled=false;}
});
const energyDetails=document.getElementById('farm-energy-config');
async function loadEnergySettings(){
 const status=document.getElementById('farm-energy-status');
 status.textContent='Sensoren werden geladen …';
 try{
  const d=await api('farm-energy-settings');
  document.getElementById('farm-energy-tariff').value=d.tariff;
  document.getElementById('farm-energy-fields').innerHTML=d.printers.map(name=>{
   const saved=d.bindings[name]||'';
   const sensors=d.sensors.slice();
   if(saved&&!sensors.some(s=>s.id===saved))sensors.push({id:saved,name:'Gespeichert, derzeit nicht verfügbar'});
   return '<label>'+farmSafe(name)+'<select data-energy-printer="'+farmSafe(name)+'"><option value="">Nicht zugeordnet</option>'+sensors.map(s=>'<option value="'+farmSafe(s.id)+'" '+(s.id===saved?'selected':'')+'>'+farmSafe(s.name+' · '+s.id)+'</option>').join('')+'</select></label>';
  }).join('');
  status.textContent=d.sensors.length?'Nur kumulative Energiezähler werden angeboten.':'Keine passenden HA-Energiezähler verfügbar.';
 }catch(e){status.textContent=e.message;}
}
energyDetails?.addEventListener('toggle',()=>{if(energyDetails.open)loadEnergySettings();});
document.getElementById('farm-energy-form')?.addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.currentTarget,btn=form.querySelector('button[type="submit"]'),status=document.getElementById('farm-energy-status');
 const bindings=Object.fromEntries([...form.querySelectorAll('[data-energy-printer]')].map(el=>[el.dataset.energyPrinter,el.value]));
 btn.disabled=true;
 try{
  await api('farm-energy-settings',{bindings,tariff:document.getElementById('farm-energy-tariff').value});
  status.textContent='Gespeichert. Messung startet mit der nächsten HA-Abfrage.';loadFarmStats(true);
 }catch(e){status.textContent=e.message;}
 finally{btn.disabled=false;}
});
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
