/* Historical Druckfarm buckets. All data is read from HA's existing SQLite store. */
let farmHistoryMode='daily',farmHistoryBusy=false,farmHistoryData=null,farmHistorySelected=null;

const farmGroupTitles={
 hourly:'Stündlich · letzte 24 Stunden',
 daily:'Täglich · letzte 14 Tage',
 weekly:'Wöchentlich · letzte 12 Kalenderwochen',
 monthly:'Monatlich · letzte 12 Kalendermonate'
};
const farmHistoricals=['H2D','P1S Old','P1S New','Snapmaker U1','A1 mini','Prusa MK4'];

function farmHistoryHours(secs){
 const num=Math.max(0,Number(secs)||0);
 return (num/3600).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' h';
}
function farmHistoryPct(n){
 return Math.max(0,Math.min(100,Number(n)||0));
}
function farmHistoryLocalDate(unix){
 return new Date(unix*1000).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
}
function renderFarmHistory(){
 const bars=document.getElementById('farm-history-bars');
 const detail=document.getElementById('farm-history-detail');
 if(!bars||!detail)return;
 const buckets=farmHistoryData?.buckets||[];
 if(!buckets.length){bars.innerHTML='<p class="hint">Noch keine Messwerte vorhanden.</p>';detail.innerHTML='';return;}
 const selected=farmHistorySelected===null?buckets.length-1:
  Math.max(0,Math.min(buckets.length-1,farmHistorySelected));
 farmHistorySelected=selected;
 bars.className='farm-history-bars farm-history-'+farmHistoryMode;
 bars.innerHTML=buckets.map((bucket,i)=>{
  const used=farmHistoryPct(bucket.utilization_percent);
  const cover=farmHistoryPct(bucket.coverage_percent);
  const chosen=i===selected;
  const title=bucket.label+' · '+farmHistoryHours(bucket.printing_seconds)+
    ' Druckzeit · '+used.toLocaleString('de-DE',{maximumFractionDigits:1})+
    ' % Auslastung · '+cover.toLocaleString('de-DE',{maximumFractionDigits:1})+' % Messabdeckung';
  return '<button type="button" class="farm-history-bin'+(chosen?' selected':'')+
   '" data-history-bin="'+i+'" aria-pressed="'+String(chosen)+'" title="'+farmSafe(title)+'">'+
   '<span class="farm-history-pct">'+farmSafe(used.toLocaleString('de-DE',{maximumFractionDigits:0}))+'%</span>'+
   '<span class="farm-history-column"><span class="farm-history-cover" style="height:'+cover+'%"></span>'+
   '<span class="farm-history-used" style="height:'+used+'%"></span></span>'+
   '<span class="farm-history-caption">'+farmSafe(bucket.label)+'</span></button>';
 }).join('');
 const picked=buckets[selected];
 const duration=Math.max(0,Math.min(farmHistoryData.end,picked.end)-picked.start);
 const list=picked.by_printer||[];
 detail.innerHTML='<div class="farm-history-detail-head"><div><small>AUSGEWÄHLTER ZEITRAUM</small><h4>'+farmSafe(
  farmHistoryMode==='hourly'?farmHistoryLocalDate(picked.start):picked.label)+
  '</h4><span>'+farmHistoryHours(picked.printing_seconds)+' gedruckt · '+
  farmHistoryPct(picked.coverage_percent).toLocaleString('de-DE',{maximumFractionDigits:1})+
  ' % Messabdeckung</span></div></div>'+
  '<div class="farm-history-machines">'+list.map(r=>{
   const p=farmHistoryPct(r.utilization_percent);
   return '<div class="farm-history-machine"><div class="farm-history-machine-head"><strong>'+
    farmSafe(r.printer)+'</strong><span>'+farmHistoryHours(r.printing_seconds)+' / '+
    farmHistoryHours(duration)+' · '+p.toLocaleString('de-DE',{maximumFractionDigits:1})+
    '%</span></div><div class="farm-history-machine-track"><span style="width:'+p+'%"></span></div></div>';
  }).join('')+'</div>';
}
async function loadFarmHistory(){
 if(farmHistoryBusy||document.hidden)return;
 farmHistoryBusy=true;
 const status=document.getElementById('farm-history-status');
 if(status)status.textContent='Historie wird geladen …';
 try{
   farmHistoryData=await api('farm-history?group='+encodeURIComponent(farmHistoryMode));
   farmHistorySelected=null;
   renderFarmHistory();
   if(status)status.textContent=farmGroupTitles[farmHistoryMode]+' · Zeitraum antippen, um einzelne Drucker zu vergleichen.';
 }catch(err){
   if(status)status.textContent='Historie nicht verfügbar: '+err.message;
 }finally{farmHistoryBusy=false;}
}
document.querySelectorAll('[data-farm-group]').forEach(btn=>btn.addEventListener('click',()=>{
 const group=btn.dataset.farmGroup;
 if(!Object.hasOwn(farmGroupTitles,group)||farmHistoryBusy)return;
 farmHistoryMode=group;
 document.querySelectorAll('[data-farm-group]').forEach(b=>{
  const selected=btn===b;
  b.classList.toggle('selected',selected);
  b.setAttribute('aria-pressed',String(selected));
 });
 loadFarmHistory();
}));
document.getElementById('farm-history-bars')?.addEventListener('click',e=>{
 const btn=e.target.closest('[data-history-bin]');
 if(!btn)return;
 const index=Number(btn.dataset.historyBin);
 if(!Number.isSafeInteger(index)||index<0||index>=(farmHistoryData?.buckets?.length||0))return;
 farmHistorySelected=index;
 renderFarmHistory();
});
setInterval(()=>{if(typeof workspace!=='undefined'&&workspace==='farm')loadFarmHistory();},120000);
