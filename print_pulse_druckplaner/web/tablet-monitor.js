'use strict';
/* Full-screen read-only HA ingress power monitor. No Shelly switching endpoint. */
(() => {
 const byId=id=>document.getElementById(id);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=(v,d=1)=>v==null||!Number.isFinite(Number(v))?'–':
   Number(v).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
 const power=v=>v==null?'– W':fmt(v)+' W';
 const dateFmt=new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
 const timeFmt=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'});
 let current=null,loading=false,range=60,theme='auto',failed=false;
 let activeDeviceEntity=null,detailRequest=0,latestDetail=null;
 let chartMetric='watts';
 try{if(localStorage.getItem('pp-monitor-chart-metric')==='amps')chartMetric='amps'}catch(_){}
 const media=window.matchMedia('(prefers-color-scheme: dark)');
 try{theme=localStorage.getItem('pp-monitor-theme')||'auto'}catch(_){}
 if(!['auto','light','dark'].includes(theme))theme='auto';
 function applyTheme(){
  document.body.dataset.theme=theme==='auto'?(media.matches?'dark':'light'):theme;
  document.querySelectorAll('[data-theme-value]').forEach(btn=>{
   btn.classList.toggle('active',btn.dataset.themeValue===theme);
   btn.setAttribute('aria-pressed',String(btn.dataset.themeValue===theme));
  });
 }
 document.querySelectorAll('[data-theme-value]').forEach(btn=>btn.addEventListener('click',()=>{
  theme=btn.dataset.themeValue;
  try{localStorage.setItem('pp-monitor-theme',theme)}catch(_){}
  applyTheme();
 }));
 media.addEventListener?.('change',()=>{if(theme==='auto')applyTheme()});
 applyTheme();
 function clock(){
  const now=new Date();
  byId('clock').textContent=timeFmt.format(now);
  byId('date').textContent=dateFmt.format(now);
 }
 clock();
 setInterval(clock,1000);
 byId('back-to-planner').addEventListener('click',()=>{
  try {
   if(window.top!==window&&window.top.location.origin===location.origin){
    const parentURL=new URL(window.top.location.href);
    if(parentURL.searchParams.get('pp_view')==='strom'){
     parentURL.searchParams.delete('pp_view');
     window.top.location.assign(parentURL.href);
     return;
    }
   }
  }catch(_){/* keep normal ingress navigation */}
  // Never redirect to a saved ingress token in a separate browser.
  // /monitor and /monitor/ both return to the same authenticated add-on root.
  const url=new URL(window.location.href);
  url.pathname=url.pathname.replace(/\/monitor\/?$/, '/');
  url.search='';
  url.hash='';
  window.location.assign(url.href);
 });
 byId('fullscreen').addEventListener('click',async()=>{
  try{
   if(document.fullscreenElement)await document.exitFullscreen();
   else await document.documentElement.requestFullscreen();
  }catch(_){byId('connection-text').textContent='Vollbild im Browser aktivieren'}
 });
 function updateChartMetric(){
  const amps=chartMetric==='amps';
  byId('chart-title').textContent=amps?'Stromverlauf':'Leistungsverlauf';
  byId('chart').dataset.metric=chartMetric;
  byId('chart-watts').setAttribute('aria-pressed',String(!amps));
  byId('chart-amps').setAttribute('aria-pressed',String(amps));
  byId('chart-source-note').textContent=amps?
   'Direkt gemessene Shelly-Stromsumme. Gestrichelt = unvollständig.':
   'Gemessene Gesamtleistung der zugeordneten Geräte.';
 }
 for(const metric of ['watts','amps']){
  byId('chart-'+metric).addEventListener('click',()=>{
   chartMetric=metric;
   try{localStorage.setItem('pp-monitor-chart-metric',metric)}catch(_){}
   updateChartMetric();
   if(current)chart(current);
  });
 }
 updateChartMetric();
 byId('chart-range').addEventListener('change',()=>{
  range=Number(byId('chart-range').value);
  refresh();
 });
 // Use a native same-origin attachment download through the current
 // Home Assistant ingress session (no blank tab and no copied ingress token).
 // Both /monitor and /monitor/ must resolve to the add-on's /api/ prefix.
 const exportBase=new URL(window.location.href);
 exportBase.pathname=exportBase.pathname.replace(/\/monitor\/?$/, '/api/tablet-history-export');
 exportBase.search='';
 exportBase.hash='';
 function updateExportLink(){
  const period=byId('export-period').value;
  if(['day','week','month','year'].includes(period)){
   const target=new URL(exportBase.href);
   target.searchParams.set('period',period);
   byId('history-export-link').href=target.href;
  }
 }
 byId('export-period').addEventListener('change',updateExportLink);
 updateExportLink();
 const detailBase=new URL(exportBase.href);
 detailBase.pathname=detailBase.pathname.replace(/\/api\/tablet-history-export$/, '/api/tablet-printer-detail');
 detailBase.search='';
 const resetBase=new URL(exportBase.href);
 resetBase.pathname=resetBase.pathname.replace(/\/api\/tablet-history-export$/, '/api/tablet-reset-peaks');
 resetBase.search='';
 let peakResetBusy=false;
 byId('reset-amps-peaks').addEventListener('click',async()=>{
  if(peakResetBusy)return;
  if(!window.confirm(
   'Alle aktuellen Max-A-Werte der Geräte und den Gesamt-Ampere-Peak zurücksetzen? '+
   'Die bisherigen Werte mit Datum bleiben im Protokoll und im CSV-Export erhalten.'))return;
  peakResetBusy=true;
  const button=byId('reset-amps-peaks');
  button.disabled=true;
  button.textContent='Setze zurück …';
  byId('peak-reset-feedback').textContent='';
  try{
   const resp=await fetch(resetBase.href,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'reset_all_amperes'})
   });
   let output={};
   try{output=await resp.json()}catch(_){}
   if(!resp.ok||!output.ok)
    throw new Error(output.error||'Zurücksetzen fehlgeschlagen');
   byId('peak-reset-feedback').textContent=
    output.reset_count+' Max-A-Werte zurückgesetzt. Frühere Spitzen bleiben gespeichert.';
   if(current){
    current.total_amps_peak=null;
    current.peak_reset_history=output.history||[];
    (current.devices||[]).forEach(item=>{
     item.max_amps=null;item.max_amps_source=null;item.max_amps_at=null;
    });
    render(current);
   }
   await refresh();
   if(activeDeviceEntity)await loadDetail();
  }catch(e){
   byId('peak-reset-feedback').textContent='Nicht zurückgesetzt: '+e.message;
  }finally{
   peakResetBusy=false;
   button.disabled=false;
   button.textContent='Max A zurücksetzen';
  }
 });
 async function fetchData(){
  const response=await fetch('api/tablet-monitor?minutes='+range,
   {credentials:'same-origin',cache:'no-store'});
  let data;
  try{data=await response.json()}catch(_){throw new Error('Antwort nicht lesbar')}
  if(!response.ok)throw new Error(data.error||'HA-Abfrage fehlgeschlagen');
  return data;
 }
 const AMP_WARN_A=12;
 const AMP_RED_A=14;
 const AMP_RATED_A=16;
 const AMP_SCALE_MAX=18;
 function setRowStatus(rowId,boxId,titleId,detailId,level,label,detail){
  const row=byId(rowId);
  row.dataset.level=level;
  const badge=byId(boxId);
  badge.querySelector('.status-symbol').textContent=
   level==='normal'?'✓':level==='unknown'?'?':'!';
  byId(titleId).textContent=label;
  byId(detailId).textContent=detail;
 }
 // Zero is a real measurement. A printer's own offline state is not
 // evidence of zero electrical load; only Shelly measurements count.
 function loadCoverage(d,metric){
  const devices=d.devices||[];
  const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const assigned=devices.filter(x=>metric==='watts'?Boolean(x.entity):
   Boolean(x.entity||x.switch_entity||x.current_entity));
  const unassigned=devices.filter(x=>!assigned.includes(x)).map(x=>x.name);
  const measured=assigned.filter(x=>metric==='watts'?valid(x.watts):
   valid(x.amps)&&x.amps_source==='shelly');
  const estimated=metric==='amps'?assigned.filter(x=>valid(x.amps)&&x.amps_source!=='shelly'):[];
  const missing=assigned.filter(x=>!measured.includes(x)&&!estimated.includes(x));
  return {assigned:assigned.length,measured:measured.length,unassigned,
   missing:missing.map(x=>x.name),estimated:estimated.map(x=>x.name),
   complete:assigned.length>0&&assigned.length===measured.length};
 }
 function coverageNote(c){
  return [c.assigned?c.measured+'/'+c.assigned+' zugeordnete Messpunkte erfasst':'Keine Messpunkte zugeordnet',
   c.unassigned.length?'Nicht überwacht: '+c.unassigned.join(', '):'',
   c.missing.length?'Kein Messwert: '+c.missing.join(', '):'',
   c.estimated.length?'Nur geschätzt: '+c.estimated.join(', '):''].filter(Boolean).join(' · ');
 }
 function cardLevel(id,level,label){
  byId(id).dataset.cardLevel=level;
  if(label!==undefined)byId(id+'-status').textContent=label;
 }
 function observedLevel(value,warning,critical){
  if(![value,warning,critical].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0)||critical<=warning)return 'unknown';
  return value>=critical?'critical':value>=warning?'warning':'normal';
 }
 function liveCardLabel(level,coverage){
  if(level==='critical')return 'Kritisch';
  if(level==='warning')return 'Erhöhte Last';
  if(level==='unknown')return 'Messung unvollständig';
  return coverage.unassigned.length?'Erfasste Last normal · Teilsumme':'Normalbereich';
 }
 function groupCardLevel(t,d){
  const w=observedLevel(t.watts,d.warning_w,d.critical_w);
  const a=observedLevel(t.amps,AMP_WARN_A,AMP_RED_A);
  if(w==='critical'||a==='critical')return 'critical';
  if(w==='warning'||a==='warning')return 'warning';
  return t.count>0&&t.wattsCount===t.count&&t.ampsCount===t.count&&!t.estimated&&w==='normal'&&a==='normal'?'normal':'unknown';
 }
 function status(d){
  const faults=(d.faults||[]).filter(f=>f.state==='on');
  const unknown=(d.faults||[]).filter(f=>f.state==='unknown').length;
  const w=loadCoverage(d,'watts'),a=loadCoverage(d,'amps');
  let wl='normal',wt='Messpunkte vollständig',wd=coverageNote(w);
  if(faults.length){wl='critical';wt='Shelly-Störung';wd=faults.length+' aktive Fehlermeldung(en) · '+wd}
  else if(d.watts==null){wl='unknown';wt='Keine Messwerte'}
  else if(d.level==='critical'){wl='critical';wt='Kritische Wattlast';wd='Eingestellte Watt-Grenze erreicht · '+wd}
  else if(d.level==='warning'){wl='warning';wt='Watt-Warnung';wd='Eingestellte Watt-Warnschwelle erreicht · '+wd}
  else if(!w.complete){wl='unknown';wt='Messung unvollständig'}
  else if(w.unassigned.length){wt='Zugeordnete Messpunkte vollständig'}
  if(unknown)wd+=' · '+unknown+' Shelly-Fehlerstatus nicht verfügbar';
  setRowStatus('watt-load-row','status','status-title','status-detail',wl,wt,wd);
  let al='normal',at='Messpunkte vollständig',ad=coverageNote(a);
  const valid=typeof d.amps==='number'&&Number.isFinite(d.amps)&&d.amps>=0;
  if(faults.length){al='critical';at='Shelly-Störung';ad=faults.length+' aktive Fehlermeldung(en) · '+ad}
  else if(!valid){al='unknown';at='Keine Stromwerte'}
  else if(d.amps>=AMP_RATED_A){al='critical';at='16 A erreicht';ad='Nennstromgrenze: Stromkreislast prüfen · '+ad}
  else if(d.amps>=AMP_RED_A){al='critical';at='Hohe Stromlast';ad='Ab 14 A: Last möglichst reduzieren · '+ad}
  else if(d.amps>=AMP_WARN_A){al='warning';at='Strom-Warnung';ad='Ab 12 A: Stromkreis beobachten · '+ad}
  else if(!a.complete){al='unknown';at='Messung unvollständig'}
  else if(a.unassigned.length){at='Zugeordnete Messpunkte vollständig'}
  setRowStatus('amps-load-row','amp-status','amp-status-title','amp-status-detail',al,at,ad);
  cardLevel('kpi-watts',wl,liveCardLabel(wl,w));
  cardLevel('kpi-amps',al,liveCardLabel(al,a));
  const peakLevel=observedLevel(d.total_amps_peak?.amps,AMP_WARN_A,AMP_RED_A);
  cardLevel('kpi-peak',peakLevel,peakLevel==='unknown'?'Noch kein vollständiger Peak':
   'Historischer Peak · '+({normal:'Normalbereich',warning:'Warnbereich',critical:'Kritischer Bereich'}[peakLevel]));
  const severity={normal:0,unknown:1,warning:2,critical:3};
  // A green row only describes its assigned sensors; keep the enclosing
  // overall card neutral if any load is outside measurement coverage.
  const level=severity[wl]>=severity[al]?wl:al;
  byId('load-card').dataset.level=level==='normal'&&(w.unassigned.length||a.unassigned.length)?'unknown':level;
  byId('connection').dataset.state='ok';
  byId('connection-text').textContent='Live · HA verbunden';
 }
 function loadBar(d){
  const warn=Number(d.warning_w)||2500,critical=Number(d.critical_w)||3200;
  const max=critical*1.18;
  const n=Math.max(0,Number(d.watts)||0);
  const pct=Math.min(96,Math.max(4,n/max*100));
  const warningPct=(warn/max*100)+'%';
  const criticalPct=(critical/max*100)+'%';
  const pin=byId('load-pin'),track=byId('load-gradient');
  pin.style.left=pct+'%';
  track.style.setProperty('--marker-left',pct+'%');
  track.style.setProperty('--warning-pct',warningPct);
  track.style.setProperty('--critical-pct',criticalPct);
  byId('warn-tick').parentElement.style.setProperty('--warning-pct',warningPct);
  byId('critical-tick').parentElement.style.setProperty('--critical-pct',criticalPct);
  track.setAttribute('aria-valuemax',String(max));
  track.setAttribute('aria-valuenow',String(Math.min(max,n)));
  byId('load-pin-value').textContent=power(d.watts);
  byId('warn-tick').textContent='Warnung '+fmt(warn,0)+' W';
  byId('critical-tick').textContent='Kritisch '+fmt(critical,0)+' W';

  const amps=typeof d.amps==='number'&&Number.isFinite(d.amps)?Math.max(0,d.amps):null;
  const ampPct=amps==null?4:Math.min(97,Math.max(4,amps/AMP_SCALE_MAX*100));
  const ampPin=byId('amp-load-pin'),ampTrack=byId('amp-load-gradient');
  ampPin.style.left=ampPct+'%';
  ampTrack.style.setProperty('--marker-left',ampPct+'%');
  ampTrack.style.setProperty('--warning-pct',AMP_WARN_A/AMP_SCALE_MAX*100+'%');
  ampTrack.style.setProperty('--red-pct',AMP_RED_A/AMP_SCALE_MAX*100+'%');
  ampTrack.setAttribute('aria-valuenow',String(Math.min(AMP_SCALE_MAX,amps||0)));
  byId('amp-load-pin-value').textContent=amps==null?'– A':fmt(amps,2)+' A';
  const marks=byId('amp-warn-tick').parentElement;
  marks.style.setProperty('--amp-warn-pct',AMP_WARN_A/AMP_SCALE_MAX*100+'%');
  marks.style.setProperty('--amp-red-pct',AMP_RED_A/AMP_SCALE_MAX*100+'%');
  marks.style.setProperty('--amp-limit-pct',AMP_RATED_A/AMP_SCALE_MAX*100+'%');
 }
 function activePrintStage(raw){
  if(typeof raw!=='string'||!raw.trim())return null;
  const key=raw.trim().toLowerCase().replace(/[\s-]+/g,'_');
  const stageMap={
   auto_bed_leveling:['Nivelliert','leveling'],
   bed_leveling:['Nivelliert','leveling'],
   heatbed_preheating:['Heizbett heizt','preparing'],
   heating_hotend:['Düse heizt','preparing'],
   heating_bed:['Heizbett heizt','preparing'],
   waiting_for_heatbed_temperature:['Heizbett heizt','preparing'],
   waiting_for_nozzle_temperature:['Düse heizt','preparing'],
   cleaning_nozzle_tip:['Reinigt Düse','preparing'],
   homing_toolhead:['Referenzfahrt','preparing'],
   calibrating_extrusion:['Kalibriert Extrusion','preparing'],
   calibrating_extrusion_flow:['Kalibriert Fluss','preparing'],
   calibrating_micro_lidar:['Kalibriert Sensor','preparing'],
   calibrating_motor_noise:['Kalibriert Motoren','preparing'],
   checking_extruder_temperature:['Prüft Temperatur','preparing'],
   scanning_bed_surface:['Prüft Druckbett','preparing'],
   inspecting_first_layer:['Prüft erste Schicht','preparing'],
   identifying_build_plate_type:['Erkennt Druckplatte','preparing'],
   sweeping_xy_mech_mode:['Mechanikprüfung','preparing'],
   filament_loading:['Lädt Filament','preparing'],
   filament_unloading:['Entlädt Filament','preparing'],
   changing_filament:['Filamentwechsel','preparing'],
   cooling_chamber:['Kühlt Bauraum','preparing'],
   printing:['Druckt','printing'],
  };
  if(stageMap[key])return {label:stageMap[key][0],state:stageMap[key][1]};
  if(['idle','offline','unknown','none','unavailable','finished'].includes(key))return null;
  if(key.startsWith('paused_'))return {label:'Pausiert',state:'paused'};
  if(/level|nivell|tramming/.test(key))return {label:'Nivelliert',state:'leveling'};
  if(/heat|aufheiz|preheat/.test(key))return {label:'Heizt auf',state:'preparing'};
  if(/calibr|kalibrier/.test(key))return {label:'Kalibriert',state:'preparing'};
  if(/clean|reinig/.test(key))return {label:'Reinigt Düse',state:'preparing'};
  if(/filament|materialwechsel/.test(key))return {label:'Filamentwechsel',state:'preparing'};
  if(/print|druck/.test(key))return {label:'Druckt',state:'printing'};
  if(/^[a-z_äöüß]{3,55}$/i.test(key))
   return {label:raw.replace(/_/g,' ').slice(0,36),state:'preparing'};
  return null;
 }
 function displayPhase(item){
  const pr=item.printer_state;
  if(item.switch_state==='off')return {label:'Aus',state:'off'};
  if(pr==='error')return {label:'Störung',state:'error'};
  if(!item.entity)return {label:'Nicht zugeordnet',state:'missing'};
  if(pr==='offline')return {label:'Offline',state:'offline'};
  if(pr==='paused')return {label:'Pausiert',state:'paused'};
  if(pr==='finished')return {label:'Fertig',state:'finished'};
  if(pr==='idle')return {label:'Bereit',state:'idle'};
  if(pr==='printing'||pr==='preparing'){
   const stage=activePrintStage(item.print_stage);
   if(stage)return stage;
   return pr==='printing'?{label:'Druckt',state:'printing'}:
     {label:'Bereitet vor',state:'preparing'};
  }
  if(item.watts==null&&item.amps==null)return {label:'Nicht erreichbar',state:'missing'};
  if(item.switch_state==='on')return {label:'Eingeschaltet',state:'idle'};
  return {label:'Schaltzustand unbekannt',state:'missing'};
 }
 function renderPeakHistory(d){
  const list=Array.isArray(d.peak_reset_history)?d.peak_reset_history:[];
  const batches=new Map();
  list.forEach(event=>{
   const key=String(event.batch_id||event.at);
   if(!batches.has(key))batches.set(key,{time:event.at,items:[]});
   batches.get(key).items.push(event);
  });
  const groups=[...batches.values()];
  byId('peak-reset-count').textContent=groups.length?'('+groups.length+' letzte Vorgänge)':'';
  if(!groups.length){
   byId('peak-reset-log').innerHTML=
    '<p class="peak-reset-empty">Noch kein Max-A-Reset durchgeführt.</p>';
   return;
  }
  const when=seconds=>seconds?
   new Date(seconds*1000).toLocaleString('de-DE',{
    day:'2-digit',month:'2-digit',year:'numeric',
    hour:'2-digit',minute:'2-digit'}):'';
  byId('peak-reset-log').innerHTML=groups.slice(0,10).map(group=>
   '<div class="peak-reset-batch"><strong>Zurückgesetzt am '+
   esc(when(group.time))+'</strong><ul>'+
   group.items.map(event=>
    '<li><span>'+esc(event.name)+'</span><b>'+
    (event.previous_amps==null?'Noch kein vorheriger Spitzenwert':
      (event.source==='calculated'?'≈ ':'')+fmt(event.previous_amps,3)+' A')+
    '</b>'+(event.previous_at?
     '<small>Gemessen am '+esc(when(event.previous_at))+'</small>':'')+'</li>'
   ).join('')+'</ul></div>'
  ).join('');
 }
 // Keep a fixed registry order within each of three status bands.
 // Active/preparing/ready are equal rank: heating cannot reshuffle them.
 // Confirmed off follows; missing assignment then offline/fault at the bottom.
 function deviceSortRank(item){
  if(item.switch_state==='off')return 1;
  const state=item.printer_state;
  if(state==='error'||state==='offline')return 3;
  if(!item.entity)return 2;
  if(item.watts==null&&item.switch_state!=='on'&&
     !['printing','preparing','paused','finished','idle'].includes(state))return 2;
  return 0;
 }
 function sortedDevices(items){
  return (items||[]).map((item,index)=>({item,index,rank:deviceSortRank(item)}))
   .sort((a,b)=>a.rank-b.rank||a.index-b.index).map(entry=>entry.item);
 }
 // Group only by the explicitly configured device type, not its name.
 function groupDevices(items){
  const rows=sortedDevices(items);
  return [{key:'printer',label:'Drucker',items:rows.filter(d=>d.kind!=='other')},
          {key:'other',label:'Sonstige Verbraucher',items:rows.filter(d=>d.kind==='other')}];
 }
 function groupTotals(items){
  const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
  const watts=items.filter(d=>valid(d.watts));
  const amps=items.filter(d=>valid(d.amps));
  const estimated=amps.filter(d=>d.amps_source!=='shelly').length;
  return {count:items.length,wattsCount:watts.length,ampsCount:amps.length,estimated,
   watts:watts.length?watts.reduce((sum,d)=>sum+d.watts,0):null,
   amps:amps.length?amps.reduce((sum,d)=>sum+d.amps,0):null};
 }
 function renderGroupTotals(groups,d){
  for(const group of groups){
   const totals=groupTotals(group.items);
   cardLevel('kpi-group-'+group.key,groupCardLevel(totals,d));
   byId('group-'+group.key+'-watts').textContent=power(totals.watts);
   byId('group-'+group.key+'-amps').textContent=totals.amps==null?'– A':
    (totals.estimated?'≈ ':'')+fmt(totals.amps,3)+' A';
   byId('group-'+group.key+'-note').textContent=!totals.count?'Keine Geräte eingerichtet':
    'W: '+totals.wattsCount+'/'+totals.count+' · A: '+totals.ampsCount+'/'+totals.count+
    (totals.estimated?' · '+totals.estimated+' geschätzt':'')+
    (totals.wattsCount<totals.count||totals.ampsCount<totals.count?' · unvollständig':'');
  }
 }
 function renderDevices(d){
  const groups=groupDevices(d.devices);
  const rows=groups.flatMap(group=>group.items);
  renderGroupTotals(groups,d);
  byId('device-summary').textContent=rows.length+' Geräte · '+d.measured+' mit Leistungsmessung';
  const renderRow=item=>{
   const phase=displayPhase(item);
   const stateHint=item.switch_state==='off'?'Shelly-Schalter meldet aus. Messwerte bleiben unverändert.':
    phase.state==='offline'?'Drucker in Home Assistant nicht erreichbar; Shelly '+(item.switch_state==='on'?'eingeschaltet':'Schaltzustand unbekannt')+'.':
    phase.state==='missing'?'Messpunkt oder Messwert fehlt.':phase.label;
   const statusMismatch=item.switch_state==='off'&&((item.watts??0)>0||(item.amps??0)>0);
   const amp=item.amps==null?'–':
      (item.amps_source==='shelly'?'':'≈ ')+fmt(item.amps,3)+' A';
   const maxAmp=item.max_amps==null?'–':
      (item.max_amps_source==='shelly'?'':'≈ ')+fmt(item.max_amps,3)+' A';
   const currentHint=item.amps_source==='shelly'?'Shelly-Stromsensor direkt gemessen':
      item.amps_source==='calculated'?'Ersatzwert aus Watt / 230 V':'Kein Stromwert';
   const peakHint=item.max_amps_source==='shelly'?'Höchster gemessener Shelly-Ampere-Wert':
      'Höchster errechneter Ersatzwert';
   const e=item.energy_kwh==null?'–':fmt(item.energy_kwh,2)+' kWh';
   const clickable=!!item.entity;
   const clickAttrs=clickable?
    ' role="button" tabindex="0" data-entity="'+esc(item.entity)+
    '" aria-label="Details zu '+esc(item.name)+' öffnen"':'';
   return '<tr class="device-row state-'+esc(phase.state)+
    (clickable?' pd-clickable':'')+'"'+clickAttrs+'><td class="'+
    (item.kind==='other'?'other-name':'printer-name')+'">'+esc(item.name)+'</td>'+
    '<td>'+esc(power(item.watts))+'</td><td title="'+esc(currentHint)+'">'+esc(amp)+'</td>'+
    '<td class="device-max-watts">'+esc(power(item.max_watts))+'</td>'+
    '<td class="device-max-amps" title="'+esc(peakHint)+'">'+esc(maxAmp)+'</td><td>'+esc(e)+'</td>'+
    '<td><span class="pill '+esc(phase.state)+'" title="'+esc(stateHint)+'">'+esc(phase.label)+'</span>'+
    (statusMismatch?'<small class="device-status-note">Messwert trotz Aus</small>':'')+'</td></tr>';
  };
  const html=groups.map(group=>
   '<tr class="device-group-heading"><th colspan="7" scope="colgroup">'+
   '<span class="device-group-title">'+esc(group.label)+'</span>'+
   '<span class="device-group-count">'+group.items.length+' Geräte</span></th></tr>'+
   (group.items.length?group.items.map(renderRow).join(''):
    '<tr class="device-group-empty"><td colspan="7">'+
     (group.key==='other'?'Noch keine sonstigen Verbraucher eingerichtet.':'Noch keine Drucker eingerichtet.')+
    '</td></tr>')
  ).join('');
  byId('device-rows').innerHTML=html;
 }
 // Per-printer detail window: the main monitoring dashboard stays unchanged.
 const detailDialog=byId('printer-detail');
 let detailLastFetch=0;
 function printerOptions(){
  return groupDevices(current?.devices).flatMap(g=>g.items).filter(d=>d.entity);
 }
 function dateTime(at){
  return at?new Date(at*1000).toLocaleString('de-DE',{
   day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–';
 }
 function updateDetailLive(){
  if(!activeDeviceEntity)return;
  const item=printerOptions().find(x=>x.entity===activeDeviceEntity);
  if(!item)return;
  byId('pd-title').textContent=item.name+' – Geräte-Details';
  const status=displayPhase(item);
  const stage=activePrintStage(item.print_stage);
  byId('pd-status').textContent=status.label;
  byId('pd-status').className='pd-state-tag pd-state-'+status.state;
  byId('pd-subtitle').textContent='Shelly · '+status.label;
  byId('pd-updated').textContent='Live zuletzt: '+dateTime(current.updated);
  byId('pd-watts').textContent=power(item.watts);
  byId('pd-amps').textContent=item.amps==null?'– A':
   (item.amps_source==='shelly'?'':'≈ ')+fmt(item.amps,3)+' A';
 }
 function deviceStep(amount){
  const options=printerOptions();
  if(options.length<2)return;
  const index=options.findIndex(d=>d.entity===activeDeviceEntity);
  if(index<0)return;
  const selected=options[(index+amount+options.length)%options.length];
  openDevice(selected.entity);
 }
 function closeDetail(){
  activeDeviceEntity=null;
  latestDetail=null;
  detailRequest++;
  if(detailDialog.open)detailDialog.close();
 }
 function renderDetailChart(data){
  const chart=byId('pd-chart');
  const series=Array.isArray(data.series)?data.series:[];
  if(!series.length){
   chart.innerHTML='<p class="pd-empty">Für dieses Gerät und diesen Zeitraum sind noch keine Messwerte gespeichert.</p>';
   return;
  }
  const periods={'1h':3600,'24h':86400,'7d':604800,'30d':2592000};
  const span=periods[data.period]||86400;
  const end=Number(data.updated)||Math.floor(Date.now()/1000);
  const begin=end-span;
  const maxW=Math.max(50,...series.map(s=>Number(s.watts)||0))*1.12;
  const maxA=Math.max(.5,...series.map(s=>Number(s.amps)||0))*1.12;
  const width=920,height=270,L=64,R=64,T=21,B=40;
  const plotW=width-L-R,plotH=height-T-B;
  const x=at=>L+Math.max(0,Math.min(1,(at-begin)/span))*plotW;
  const y=(n,max)=>T+plotH-(Math.max(0,Number(n)||0)/max)*plotH;
  const grid=Array.from({length:5},(_,i)=>{
   const pos=T+i*plotH/4;
   const watt=maxW*(1-i/4),amp=maxA*(1-i/4);
   return '<line x1="'+L+'" y1="'+pos+'" x2="'+(width-R)+'" y2="'+pos+'" stroke="currentColor" stroke-opacity=".1"/>'+
    '<text x="'+(L-8)+'" y="'+(pos+4)+'" text-anchor="end">'+
    esc(fmt(watt,0))+' W</text><text x="'+(width-R+8)+'" y="'+(pos+4)+
    '" text-anchor="start">'+esc(fmt(amp,1))+' A</text>';
  }).join('');
  const ticks=Array.from({length:5},(_,i)=>{
   const at=begin+span*i/4;
   const time=new Date(at*1000).toLocaleString('de-DE',
    span<=86400?{hour:'2-digit',minute:'2-digit'}:
    {day:'2-digit',month:'2-digit'});
   return '<text x="'+x(at)+'" y="'+(height-10)+'" text-anchor="middle">'+esc(time)+'</text>';
  }).join('');
  function line(field,max,color){
   let d='',last=null;
   const expected=data.series_step|| (span<=3600?15:span<=86400?300:span<=604800?1800:7200);
   series.forEach(s=>{
    const v=s[field];
    if(v==null||!Number.isFinite(Number(v))){last=null;return}
    const command=!last||s.at-last>expected*2.5?'M':'L';
    d+=command+x(s.at).toFixed(1)+' '+y(v,max).toFixed(1)+' ';
    last=s.at;
   });
   return '<path d="'+d+'" fill="none" stroke="'+color+
    '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  chart.innerHTML='<svg class="pd-plot" viewBox="0 0 '+width+' '+height+
   '" role="img" aria-label="Zeitlicher Watt- und Ampere-Verlauf" preserveAspectRatio="xMidYMid meet">'+
   '<g class="pd-plot-grid">'+grid+ticks+'</g>'+
   line('watts',maxW,'#36b869')+line('amps',maxA,'#308bd5')+'</svg>';
 }
 function renderPhaseRows(data){
  const phases=Array.isArray(data.phases)?data.phases:[];
  const sort=byId('pd-phase-sort').value;
  const rows=phases.slice();
  if(sort==='watts'||sort==='amps'){
   const key=sort+'_peak';
   rows.sort((a,b)=>(b[key]??-1)-(a[key]??-1));
  }
  function peakCell(phase,kind,value){
   const at=phase[kind+'_peak_at'],ctx=phase[kind+'_context'];
   return '<td><strong>'+esc(value)+'</strong>'+
    (ctx?.action&&ctx.action!==phase.label?'<small>'+esc(ctx.action)+'</small>':'')+
    (at?'<small>'+esc(dateTime(at))+'</small>':'')+'</td>';
  }
  byId('pd-phase-rows').innerHTML=rows.length?rows.map(phase=>{
    const real=phase.amps_direct_pct===100;
    const avgA=phase.amps_avg==null?'–':(real?'':'≈ ')+fmt(phase.amps_avg,3)+' A';
    const peakA=phase.amps_peak==null?'–':(real?'':'≈ ')+fmt(phase.amps_peak,3)+' A';
    return '<tr><td><strong>'+esc(phase.label)+'</strong><small>'+
     phase.samples.toLocaleString('de-DE')+' Messungen</small></td>'+
     '<td>'+esc(power(phase.watts_avg))+'</td><td>'+esc(avgA)+'</td>'+
     peakCell(phase,'watts',power(phase.watts_peak))+
     peakCell(phase,'amps',peakA)+'<td>'+esc(fmt(phase.energy_est_kwh,3))+'</td></tr>';
   }).join(''):'<tr><td colspan="6" class="pd-empty">Noch keine Druckphasen aufgezeichnet.</td></tr>';
 }
 byId('pd-phase-sort').addEventListener('change',()=>{if(latestDetail)renderPhaseRows(latestDetail)});
 function renderConsumer(data){
  const summary=data.summary||{}, energy=data.energies||{}, load=data.load_stats||{};
  byId('pd-avg-w').textContent=power(summary.watts_avg);
  byId('pd-avg-a').textContent=summary.amps_avg==null?'– A':(summary.amps_direct_pct===100?'':'≈ ')+fmt(summary.amps_avg,3)+' A';
  const tile=(label,value,note='')=>'<div class="pd-kpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong>'+(note?'<span>'+esc(note)+'</span>':'')+'</div>';
  byId('pd-consumer-energy').innerHTML=[['Heute','today'],['Diese Woche','week'],['Dieser Monat','month']].map(([label,key])=>{
   const e=energy[key]||{};
   return tile(label,e.kwh==null?'– kWh':'≈ '+fmt(e.kwh,3)+' kWh',e.kwh==null?'Keine Messwerte':(e.cost==null?'Kein Stromtarif': '≈ '+fmt(e.cost,2)+' €')+' · '+fmt(e.measured_hours,1)+' h erfasst');
  }).join('')+tile('Shelly-Gesamtzähler',data.energy_total==null?'– kWh':fmt(data.energy_total,3)+' kWh','Direkt vom Shelly');
  byId('pd-consumer-load-title').textContent=(load.label||'Lastanalyse')+' · 24 h';
  byId('pd-consumer-load').innerHTML=tile('Grundlast',power(load.base_w))+
   tile('Erhöhte Last',load.active_minutes==null?'–':fmt(load.active_minutes,1)+' min')+
   tile('Erkannte Laststarts',load.starts==null?'–':String(load.starts))+
   tile('Messzeit',fmt(load.measured_minutes,1)+' min');
  byId('pd-consumer-load-note').textContent='Schätzung anhand der Steckdosenleistung: ab '+load.threshold_w+' W, Ende bei ≤ '+load.release_w+' W. Keine eindeutige Geräte- oder Komponentenerkennung; Messlücken werden nicht hochgerechnet. Detailaufzeichnung ab Update.';
  const electrical=data.electrical||{};
  const row=(label,value)=>'<div class="pd-event"><div><strong>'+esc(label)+'</strong></div><b>'+esc(value)+'</b></div>';
  const faults=new Map((data.faults||[]).map(x=>[x.type,x.state]));
  byId('pd-consumer-health').innerHTML=row('Spannung',electrical.voltage==null?'– V':fmt(electrical.voltage,1)+' V')+
   row('Netzfrequenz',electrical.frequency==null?'– Hz':fmt(electrical.frequency,2)+' Hz')+
   ['Überhitzung','Überlast','Überstrom','Überspannung'].map(label=>row(label,faults.get(label)==='on'?'Störung':faults.get(label)==='off'?'Normal':'Unbekannt')).join('');
 }
 function renderPrinterDetail(data){
  const summary=data.summary||{};
  const other=data.kind==='other';
  const avgCount=Number(data.samples)||0;
  byId('pd-printer-phases').hidden=other;
  byId('pd-consumer-stats').hidden=!other;
  byId('pd-avg-w-box').hidden=!other;
  byId('pd-avg-a-box').hidden=!other;
  byId('pd-events-caption').textContent=other?'Mit Messzeitpunkt':'Mit Druckphase und Uhrzeit';
  if(other)renderConsumer(data);
  const cards=data.card_peaks||{};
  const w=cards.watts||{value:summary.watts_peak,at:summary.watts_peak_at};
  const a=cards.amps||{value:summary.amps_peak,at:summary.amps_peak_at,direct:summary.amps_direct_pct===100};
  byId('pd-peak-w').textContent=power(w.value);
  byId('pd-peak-a').textContent=a.value==null?'– A':
   (a.direct?'':'≈ ')+fmt(a.value,3)+' A';
  const peakNote=p=>(p.at?'Am '+dateTime(p.at):'Noch kein Wert')+
   (p.reset_at?' · Reset '+dateTime(p.reset_at):'');
  const actionText=p=>p.value==null?'Noch kein Peak':
   p.context?.label&&p.context.label!=='Unbekannt'?'Bei: '+p.context.label:(other?'Keine Zustandsdaten zum Peak':'Phase nicht gespeichert');
  byId('pd-peak-w-action').textContent=actionText(w);
  byId('pd-peak-a-action').textContent=actionText(a);
  byId('pd-peak-w-note').textContent=peakNote(w);
  byId('pd-peak-a-note').textContent=peakNote(a);
  const resets=Array.isArray(data.reset_history)?data.reset_history:[];
  byId('pd-reset-history').hidden=!resets.length;
  byId('pd-reset-events').innerHTML=resets.map(r=>{
   const unit=r.kind==='amps'?'A':'W';
   const value=r.previous_value==null?'Kein Messwert':
    (r.kind==='amps'&&!r.previous_direct?'≈ ':'')+
    fmt(r.previous_value,r.kind==='amps'?3:1)+' '+unit;
   return '<div class="pd-event"><div><strong>'+esc(unit==='A'?'Ampere zurückgesetzt':'Watt zurückgesetzt')+
    '</strong><small>'+esc(dateTime(r.at))+
    (r.previous_at?' · Peak am '+esc(dateTime(r.previous_at)):'')+
    '</small></div><b>'+esc(value)+'</b></div>';
  }).join('');
  for(const id of ['pd-reset-w','pd-reset-a'])byId(id).disabled=detailResetBusy;
  byId('pd-phase-total').textContent=avgCount.toLocaleString('de-DE')+' Messungen';
  const phases=Array.isArray(data.phases)?data.phases:[];
  if(!other)renderPhaseRows(data);
  const events=Array.isArray(data.peaks)?data.peaks:[];
  const approximated=new Set(phases.filter(p=>p.amps_direct_pct!==100).map(p=>p.label));
  byId('pd-events').innerHTML=events.length?events.slice(0,10).map(evt=>{
   const unit=evt.kind==='amps'?'A':'W';
   const label=evt.kind==='amps'?'Stromspitze':'Leistungsspitze';
   return '<div class="pd-event"><div><strong>'+esc(evt.phase)+
    '</strong><small>'+esc(label)+' · '+esc(dateTime(evt.at))+
    '</small></div><b>'+
    (evt.kind==='amps'&&(other?data.summary?.amps_direct_pct!==100:approximated.has(evt.phase))?'≈ ':'')+
    esc(fmt(evt.value,evt.kind==='amps'?3:1))+
    ' '+unit+'</b></div>';
  }).join(''):(other?'<p class="pd-empty">Noch keine zeitgenauen Spitzen gespeichert. Die Peak-Karten nutzen die vorhandenen Maxima.</p>':'<p class="pd-empty">Noch keine Spitzen mit Druckphasen gespeichert.</p>');
  byId('pd-chart-note').textContent=data.note||
   '15-Sekunden-Abtastung; sehr kurze Lastspitzen können unentdeckt bleiben.';
  byId('pd-note').textContent=(data.retention||'Bis zu 31 Tage')+
   (other?' · Peak-Karten gelten seit Reset, unabhängig vom Diagrammzeitraum.':' · Peak-Karten seit Reset; Druckphasen im gewählten Zeitraum.');
  renderDetailChart(data);
 }
 async function loadDetail(){
  if(!activeDeviceEntity)return;
  const entity=activeDeviceEntity;
  const period=byId('pd-period').value;
  const ticket=++detailRequest;
  detailLastFetch=Date.now();
  const url=new URL(detailBase.href);
  url.searchParams.set('entity',entity);
  url.searchParams.set('period',period);
  try{
   const response=await fetch(url.href,{credentials:'same-origin',cache:'no-store'});
   let data={};
   try{data=await response.json()}catch(_){}
   if(!response.ok)throw new Error(data.error||'Gerätedaten nicht verfügbar');
   if(ticket!==detailRequest||entity!==activeDeviceEntity)return;
   latestDetail=data;
   renderPrinterDetail(data);
  }catch(error){
   if(ticket!==detailRequest||entity!==activeDeviceEntity)return;
   byId('pd-chart').innerHTML='<p class="pd-empty">'+esc(error.message)+'</p>';
   byId('pd-phase-rows').innerHTML='<tr><td colspan="6">Keine Phasendaten verfügbar.</td></tr>';
   byId('pd-events').innerHTML='<p>Keine Ereignisse verfügbar.</p>';
   for(const id of ['pd-consumer-energy','pd-consumer-load','pd-consumer-health'])byId(id).innerHTML='<p>Keine Daten verfügbar.</p>';
  }
 }
 let detailResetBusy=false;
 async function resetDetailPeak(kind){
  if(detailResetBusy||!activeDeviceEntity||!latestDetail)return;
  const entity=activeDeviceEntity;
  const period=byId('pd-period').value;
  const name=printerOptions().find(x=>x.entity===entity)?.name||entity;
  const label=kind==='watts'?'Watt':'Ampere';
  if(!window.confirm(label+'-Peak von '+name+' zurücksetzen? Alle bisherigen Messungen bleiben erhalten.'))return;
  detailResetBusy=true;
  for(const id of ['pd-reset-w','pd-reset-a'])byId(id).disabled=true;
  byId('pd-reset-feedback').textContent='';
  try{
   const response=await fetch(resetBase.href,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'reset_device_peak',entity,kind,period})
   });
   let data={};
   try{data=await response.json()}catch(_){}
   if(!response.ok||!data.ok)throw new Error(data.error||'Zurücksetzen fehlgeschlagen');
   if(current){
    const item=(current.devices||[]).find(x=>x.entity===entity);
    if(item){
     if(kind==='amps'){item.max_amps=null;item.max_amps_at=null;item.max_amps_source=null;}
     else item.max_watts=null;
    }
    if(data.history)current.peak_reset_history=data.history;
    renderDevices(current);renderPeakHistory(current);
   }
   if(entity===activeDeviceEntity){
    byId('pd-reset-feedback').textContent=label+'-Peak zurückgesetzt. Historie bleibt erhalten.';
    await loadDetail();
   }
   await refresh();
  }catch(error){
   if(entity===activeDeviceEntity)byId('pd-reset-feedback').textContent='Nicht zurückgesetzt: '+error.message;
  }finally{
   detailResetBusy=false;
   for(const id of ['pd-reset-w','pd-reset-a'])byId(id).disabled=!latestDetail;
  }
 }
 byId('pd-reset-w').addEventListener('click',()=>resetDetailPeak('watts'));
 byId('pd-reset-a').addEventListener('click',()=>resetDetailPeak('amps'));
 function openDevice(entity){
  const option=printerOptions().find(x=>x.entity===entity);
  if(!option)return;
  activeDeviceEntity=entity;
  latestDetail=null;
  const other=option.kind==='other';
  byId('pd-device-glyph').textContent=other?'◈':'▣';
  byId('pd-printer-phases').hidden=other;
  byId('pd-consumer-stats').hidden=!other;
  byId('pd-avg-w-box').hidden=!other;byId('pd-avg-a-box').hidden=!other;
  for(const id of ['pd-consumer-energy','pd-consumer-load','pd-consumer-health'])byId(id).innerHTML='<p>Lade Messwerte …</p>';
  byId('pd-consumer-load-note').textContent='';
  byId('pd-avg-w').textContent='– W';byId('pd-avg-a').textContent='– A';
  byId('pd-reset-feedback').textContent='';
  byId('pd-reset-history').hidden=true;
  for(const id of ['pd-reset-w','pd-reset-a'])byId(id).disabled=true;
  byId('pd-period').value='24h';
  byId('pd-chart').innerHTML='<p class="pd-empty">Lade Messwerte …</p>';
  byId('pd-phase-rows').innerHTML='<tr><td colspan="6">Lade Druckphasen …</td></tr>';
  byId('pd-events').innerHTML='<p>Lade Ereignisse …</p>';
  byId('pd-peak-w').textContent='– W';
  byId('pd-peak-a').textContent='– A';
  byId('pd-peak-w-action').textContent='–';
  byId('pd-peak-a-action').textContent='–';
  byId('pd-peak-w-note').textContent='–';
  byId('pd-peak-a-note').textContent='–';
  byId('pd-prev').disabled=printerOptions().length<2;
  byId('pd-next').disabled=printerOptions().length<2;
  updateDetailLive();
  if(!detailDialog.open)detailDialog.showModal();
  loadDetail();
 }
 byId('device-rows').addEventListener('click',event=>{
  const row=event.target.closest('tr[data-entity]');
  if(row)openDevice(row.dataset.entity);
 });
 byId('device-rows').addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const row=event.target.closest('tr[data-entity]');
  if(!row)return;
  event.preventDefault();
  openDevice(row.dataset.entity);
 });
 byId('pd-close').addEventListener('click',closeDetail);
 byId('pd-done').addEventListener('click',closeDetail);
 byId('pd-prev').addEventListener('click',()=>deviceStep(-1));
 byId('pd-next').addEventListener('click',()=>deviceStep(1));
 byId('pd-period').addEventListener('change',loadDetail);
 detailDialog.addEventListener('close',()=>{
  activeDeviceEntity=null;latestDetail=null;detailRequest++;
 });
 detailDialog.addEventListener('click',event=>{
  if(event.target===detailDialog)closeDetail();
 });

 const types=['Überlast','Überstrom','Überhitzung','Überspannung'];
 function renderFaults(d){
  const known=d.faults||[];
  let count=0,all=0;
  const html=types.map(type=>{
   const checks=known.filter(f=>f.type===type);
   const failed=checks.filter(f=>f.state==='on');
   const available=checks.filter(f=>f.state==='off');
   const unknown=checks.filter(f=>f.state==='unknown');
   all+=checks.length;
   count+=failed.length;
   const label=failed.length?failed.map(f=>f.device).join(', '):
    (unknown.length?unknown.length+' unbekannt':available.length?
     available.length+' ohne Meldung':'Keine Sensoren');
   const cls=failed.length?'problem':(!checks.length||unknown.length)?'missing':'';
   return '<div class="fault-row '+cls+'"><span><b>'+esc(type)+'</b></span><strong class="'+
    (failed.length?'bad':!checks.length||unknown.length?'unknown':'good')+'">'+esc(label)+'</strong></div>';
  }).join('');
  byId('faults').innerHTML=html;
  byId('fault-summary').textContent=count?count+' aktive Warnungen':all? 'Keine aktiven Fehler':'Keine Fehlersensoren';
 }
 function chart(data){
  const amps=chartMetric==='amps';
  const unit=amps?'A':'W';
  const list=(data.history||[]).filter(p=>p.at!=null&&Number.isFinite(Number(p.at)));
  const host=byId('chart');
  const now=Math.round(Date.now()/1000),min=now-range*60;
  const read=p=>{
   const value=amps?(p.amps_observed??p.amps):p.watts;
   return value==null?null:Number(value);
  };
  const partial=p=>amps&&(p.amps_complete===false||(p.amps_complete==null&&p.amps==null));
  if(amps){
   const devices=data.devices||[];
   const missing=devices.filter(d=>d.amps_source!=='shelly');
   const real=devices.length-missing.length;
   byId('chart-source-note').textContent='Direkt gemessen: '+real+'/'+devices.length+' aktive Geräte. '+
    (missing.length?'Fehlend oder nur geschätzt: '+missing.map(d=>d.name).join(', ')+'. ':'')+
    'Gestrichelt = unvollständige Stromsumme; kein Nachweis der Gesamtlast.';
  }
  const valid=list.filter(p=>p.at>=min&&p.at<=now&&Number.isFinite(read(p)));
  if(!valid.length){
   host.innerHTML='<p class="placeholder">'+(amps?
    'Noch keine direkt gemessenen Ampere-Werte in diesem Zeitraum. Neue Messungen werden alle 15 Sekunden erfasst.':
    'Noch kein Verlauf vorhanden. Aufzeichnung läuft im Hintergrund.')+'</p>';
   return;
  }
  const W=580,H=230,L=55,R=15,T=14,B=28;
  const innerW=W-L-R,innerH=H-T-B;
  const peak=valid.reduce((max,p)=>Math.max(max,read(p)),0);
  const max=amps?Math.max(16,Math.ceil(peak*1.1/4)*4):
   Math.max(150,Number(data.warning_w)||0,Number(data.critical_w)||0,peak)*1.1;
  const xx=t=>L+Math.max(0,Math.min(1,(t-min)/(range*60)))*innerW;
  const yy=v=>T+innerH-Math.max(0,Math.min(1,v/max))*innerH;
  const lines=[];
  let last=null,segment=[],lastPartial=null,lastCoverage=null;
  for(const sample of list){
   const val=read(sample);
   if(!Number.isFinite(val)||val===null||sample.at<min||sample.at>now){if(segment.length){lines.push(segment);segment=[]}last=null;continue;}
   const isPartial=partial(sample);
   const coverage=amps?String(sample.amps_count??'?')+'/'+String(sample.amps_expected??'?'):'';
   if(last!=null&&(sample.at-last>45||isPartial!==lastPartial||coverage!==lastCoverage)&&segment.length){
    lines.push(segment);segment=[];
   }
   segment.push([xx(sample.at),yy(val),sample.at,val,isPartial]);
   last=sample.at;lastPartial=isPartial;lastCoverage=coverage;
  }
  if(segment.length)lines.push(segment);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+(amps?'Gemessener Strom':'Gemessene Leistung')+' der letzten '+range+' Minuten">';
  for(let i=0;i<=4;i++){
   const val=max*i/4,y=yy(val);
   svg+='<line class="grid-line" x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'"/>'+
     '<text x="'+(L-6)+'" y="'+(y+3)+'" text-anchor="end">'+esc(fmt(val,amps&&val%1!==0?1:0))+' '+unit+'</text>';
  }
  for(let i=0;i<=4;i++){
   const t=min+i*(range*60)/4,x=xx(t);
   svg+='<text x="'+x+'" y="'+(H-6)+'" text-anchor="middle">'+
    esc(new Date(t*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}))+'</text>';
  }
  for(const points of lines){
   const path=points.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
   const incomplete=points[0][4];
   if(points.length>1&&!incomplete)svg+='<path class="graph-fill" d="'+path+' L '+
     points[points.length-1][0].toFixed(1)+' '+yy(0)+' L '+points[0][0].toFixed(1)+' '+yy(0)+' Z"/>';
   if(points.length===1)svg+='<circle class="chart-sample'+(incomplete?' chart-partial-point':'')+'" cx="'+points[0][0]+'" cy="'+points[0][1]+'" r="2"/>';
   else svg+='<path class="graph-line'+(incomplete?' chart-partial':'')+'" d="'+path+'"/>';
  }
  const end=lines.length?lines[lines.length-1].at(-1):null;
  if(end&&end[2]>=now-100){
   svg+='<circle class="chart-cursor'+(end[4]?' chart-partial-point':'')+'" cx="'+end[0]+'" cy="'+end[1]+'" r="5"/>';
  }
  svg+='</svg>';
  host.innerHTML=svg;
 }
 function render(d){
  byId('watts').textContent=power(d.watts);
  byId('amps').textContent=d.amps==null?'– A':fmt(d.amps,2)+' A';
  const real=Number(d.amps_real_count)||0,estimated=Number(d.amps_estimated_count)||0;
  byId('amps-method').textContent=real&&estimated?
    real+' direkt · '+estimated+' geschätzt':
    real?real+' Shelly-Sensoren direkt gemessen':
    estimated?'≈ Nur berechnete Ersatzwerte':'Noch keine Strommessung';
  const high=d.total_peak;
  byId('total-peak').textContent=high?power(high.watts):'– W';
  byId('total-peak-note').textContent=high?
    'Am '+new Date(high.at*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+
    ' · '+high.measured+'/'+high.expected+' Drucker erfasst':
    'Noch kein Gesamtpeak gespeichert';
  const average=d.average_amps_24h;
  byId('average-amps-24h').textContent=average?fmt(average.amps,2)+' A':'– A';
  byId('average-amps-note').textContent=average?
    'Aus '+average.samples.toLocaleString('de-DE')+' vollständigen Messungen · 24-h-Fenster':
    'Noch keine vollständigen 24-h-Strommessungen';
  const ampHigh=d.total_amps_peak;
  byId('total-amps-peak').textContent=ampHigh?fmt(ampHigh.amps,2)+' A':'– A';
  byId('total-amps-peak-note').textContent=ampHigh?
    'Am '+new Date(ampHigh.at*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+
    ' · '+ampHigh.measured+' Shellys direkt':
    'Ab Update: nur vollständige Shelly-Werte';
  byId('measured').textContent=(d.measured??0)+' / '+(d.devices||[]).length;
  byId('warning').textContent=power(d.warning_w);
  byId('critical').textContent=power(d.critical_w);
  status(d);loadBar(d);renderDevices(d);renderPeakHistory(d);renderFaults(d);chart(d);
  if(activeDeviceEntity&&detailDialog.open){
   updateDetailLive();
   if(Date.now()-detailLastFetch>30000)loadDetail();
  }
  const t=d.updated?new Date(d.updated*1000):new Date();
  byId('updated').textContent='Letzte Aktualisierung: '+t.toLocaleTimeString('de-DE')+
   ((!loadCoverage(d,'watts').complete||!loadCoverage(d,'amps').complete)?' · Zugeordnete Messwerte fehlen':
    (loadCoverage(d,'watts').unassigned.length||loadCoverage(d,'amps').unassigned.length)?' · Nicht alle Geräte überwacht':'');
 }
 async function refresh(){
  if(loading||document.hidden)return;
  loading=true;
  try{
   const d=await fetchData();
   current=d;failed=false;render(d);
  }catch(e){
   failed=true;
   byId('connection').dataset.state='error';
   byId('connection-text').textContent='Keine Live-Verbindung';
   byId('load-card').dataset.level='unknown';
   for(const id of ['kpi-watts','kpi-amps','kpi-peak'])cardLevel(id,'unknown','Keine aktuellen Daten');
   for(const key of ['printer','other'])cardLevel('kpi-group-'+key,'unknown');
   for(const name of ['watt-load-row','amps-load-row'])byId(name).dataset.level='unknown';
   byId('status-title').textContent='Verbindung unterbrochen';
   byId('status-detail').textContent=e.message;
   byId('amp-status-title').textContent='Verbindung unterbrochen';
   byId('amp-status-detail').textContent='Keine aktuellen Shelly-Messwerte';
   for(const key of ['printer','other']){
    byId('group-'+key+'-watts').textContent='– W';
    byId('group-'+key+'-amps').textContent='– A';
    byId('group-'+key+'-note').textContent='Keine aktuellen Daten';
   }
   byId('updated').textContent='Keine aktuellen Daten: '+e.message;
  }finally{loading=false}
 }
 refresh();
 setInterval(refresh,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();