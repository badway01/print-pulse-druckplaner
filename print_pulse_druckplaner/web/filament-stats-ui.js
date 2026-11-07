/* Read-only filament statistics. GLD snapshots, not inferred Etsy demand. */
(()=>{
 'use strict';
 const root=document.getElementById('filament-statistics');
 if(!root)return;
 const el=id=>document.getElementById(id);
 const fmt=(n,digits=1)=>Number(n||0).toLocaleString('de-DE',{minimumFractionDigits:digits,maximumFractionDigits:digits});
 const eur=n=>n==null?'—':Number(n).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const escape=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 let period='month',seen=0,loading=false,pending=false,serial=0,lastPeriod='',lastData=null;
 function tile(label,value,sub,muted=false){
  return '<div class="filament-stats-tile'+(muted?' is-muted':'')+'"><span>'+escape(label)+'</span>'+
    '<strong>'+escape(value)+'</strong><small>'+escape(sub)+'</small></div>';
 }
 function render(data){
  const have=data.recorded_prints>0;
  const totalCost=data.material_cost_eur==null&&have?eur(data.known_material_cost_eur)+'*':eur(data.material_cost_eur);
  const emptyCount=data.empty_rolls;
  const meters=data.meters_estimate;
  const spent=data.purchase_spend_eur==null&&data.purchased_rolls?eur(data.known_purchase_spend_eur)+'*':eur(data.purchase_spend_eur);
  const tiles=[
   tile('Bestätigter Materialverbrauch',fmt(data.printed_grams/1000,2)+' kg',
    fmt(data.printed_grams,0)+' g · '+data.recorded_prints+' Druck'+(data.recorded_prints===1?'':'e')),
   tile('Entspricht vollen Rollen',fmt(data.roll_equivalents,2)+' Rollen',
    'Gerechnet aus hinterlegten Spulengewichten'),
   tile('Filamentstrecke',meters==null?'—':fmt(meters,0)+' m',
    'Näherung mit 1,75-mm-Filament und Materialdichte'),
   tile('Materialkosten (GLD)',totalCost,
    'Preisstand zum bestätigten Druck'),
   tile('Als leer ausgebuchte Rollen',String(emptyCount),
    'Nur tatsächlich mit „Leer“ bestätigte Rollen'),
   tile('Dokumentierte Einkäufe',spent,
    data.purchased_rolls+' '+(data.purchased_rolls===1?'Rolle':'Rollen')+' mit Wareneingang')
  ];
  el('filament-stats-tiles').innerHTML=tiles.join('');
  const max=Math.max(1,...data.chart.map(x=>x.grams));
  const chart=el('filament-stats-chart');
  chart.innerHTML=data.chart.map((x,i)=>
    '<div class="filament-stats-bar-col"><small>'+escape(fmt(x.grams,0)+' g')+'</small>'+
    '<div class="filament-stats-bar-track"><span class="filament-stats-bar" data-bar-index="'+i+
    '"></span></div><span class="filament-stats-bar-label">'+escape(x.label)+'</span></div>'
  ).join('');
  chart.querySelectorAll('[data-bar-index]').forEach(bar=>{
   const grams=Number(data.chart[Number(bar.dataset.barIndex)]?.grams||0);
   bar.style.height=(grams>0?Math.max(4,100*grams/max):0)+'%';
   bar.title=fmt(grams,1)+' Gramm';
  });
  const top=el('filament-stats-top');
  top.innerHTML=data.by_material.length?data.by_material.map((x,i)=>{
   const fraction=Math.min(100,100*x.grams/Math.max(1,data.printed_grams));
   return '<div class="filament-stats-material"><div><b>'+escape(x.name)+'</b>'+
    '<span>'+escape(fmt(x.grams,0))+' g'+(x.cost_eur==null?'': ' · '+escape(eur(x.cost_eur)))+
    '</span></div><div class="filament-stats-track"><span data-mat-index="'+i+'"></span></div></div>';
  }).join(''):'<p class="filament-stats-empty">Noch keine dokumentierten Druckverbräuche für diesen Zeitraum.</p>';
  top.querySelectorAll('[data-mat-index]').forEach(bar=>{
   const grams=Number(data.by_material[Number(bar.dataset.matIndex)]?.grams||0);
   bar.style.width=Math.min(100,100*grams/Math.max(1,data.printed_grams))+'%';
  });
  let notes=['Die Auswertung beginnt mit den bestätigten Druck- und Rollenbuchungen dieser Version. Vorherige 3MF-Druckzähler ohne Datum werden nicht rückwirkend als Verbrauch gebucht.'];
  if(data.incomplete_prints)notes.push(data.incomplete_prints+' Druckbuchung(en) ohne vollständige Grammwerte – der tatsächliche Verbrauch kann höher sein.');
  if(data.unpriced_grams)notes.push(fmt(data.unpriced_grams,0)+' g ohne eindeutig hinterlegten GLD: Kosten mit * sind nur der bekannte Teil.');
  if(data.missing_meter_grams)notes.push('Für '+fmt(data.missing_meter_grams,0)+' g ist das Material unbekannt; Meterangabe zeigt nur den berechenbaren Teil.');
  if(data.unpriced_purchase_rolls)notes.push(data.unpriced_purchase_rolls+' dokumentierte Einkaufsrollen ohne Preis; Einkaufskosten mit * sind unvollständig.');
  notes.push('Leere Rollen und Druckverbrauch werden getrennt gezählt. Meter sind eine Näherung, keine Messung am Drucker.');
  el('filament-stats-notes').textContent=notes.join(' ');
  el('filament-stats-status').textContent=data.recorded_prints||data.empty_rolls||data.purchased_rolls?
   'Erfasst: '+data.recorded_prints+' Druckbuchungen · '+data.empty_rolls+' leere Rollen · '+data.purchased_rolls+' eingekaufte Rollen':
   'Noch keine Buchungen in diesem Zeitraum. Neue Daten erscheinen nach „Druck zählen“ oder einer Rollenbuchung.';
 }
 async function refresh(force=false){
  if(root.hidden)return;
  if(loading){pending=true;return;}
  if(!force&&lastData&&lastPeriod===period&&Date.now()-seen<60000){render(lastData);return;}
  loading=true;
  const current=++serial,requested=period;
  el('filament-stats-status').textContent='Filament-Statistik wird geladen …';
  try{
   const data=await api('filament-stats?period='+encodeURIComponent(period));
   if(current!==serial||requested!==period)return;
   lastData=data;lastPeriod=requested;seen=Date.now();
   render(data);
  }catch(err){
   el('filament-stats-status').textContent='Filament-Statistik derzeit nicht verfügbar: '+err.message;
  }finally{
   loading=false;
   if(pending){pending=false;refresh(true);}
  }
 }
 root.addEventListener('click',event=>{
  const b=event.target.closest('[data-filament-stats-period]');
  if(!b)return;
  period=b.dataset.filamentStatsPeriod;
  for(const button of root.querySelectorAll('[data-filament-stats-period]')){
   const active=button.dataset.filamentStatsPeriod===period;
   button.classList.toggle('selected',active);
   button.setAttribute('aria-pressed',String(active));
  }
  seen=0;
  refresh(true);
 });
 window.ppFilamentStats={refresh};
})();
