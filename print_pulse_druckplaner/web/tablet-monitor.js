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
 function status(d){
  const faults=(d.faults||[]).filter(f=>f.state==='on');
  const unknown=(d.faults||[]).filter(f=>f.state==='unknown').length;
  let wl='normal',wt='Normal',wd='Unter den eingestellten Watt-Warnschwellen';
  if(faults.length){wl='critical';wt='Shelly-Störung';wd=faults.length+' aktive Fehlermeldung(en)'}
  else if(d.watts==null){wl='unknown';wt='Keine Messwerte';wd='Kein Leistungssensor erreichbar'}
  else if(d.level==='critical'){wl='critical';wt='Kritische Wattlast';wd='Eingestellte Watt-Grenze erreicht'}
  else if(d.level==='warning'){wl='warning';wt='Watt-Warnung';wd='Eingestellte Watt-Warnschwelle erreicht'}
  else if(!d.complete){
   wl='unknown';
   const missing=(d.devices||[]).filter(x=>x.kind==='printer'&&x.watts==null);
   const unassigned=missing.filter(x=>!x.entity).map(x=>x.name);
   const unavailable=missing.filter(x=>x.entity).map(x=>x.name);
   wt=unassigned.length?'Messpunkte fehlen':'Unvollständige Messung';
   wd=[
    unassigned.length?'Nicht zugeordnet: '+unassigned.join(', '):'',
    unavailable.length?'Kein Messwert: '+unavailable.join(', '):''
   ].filter(Boolean).join(' · ')||'Nicht alle Watt-Sensoren liefern Werte';
  }
  if(unknown&&wl==='normal')wd=unknown+' Shelly-Fehlerstatus nicht verfügbar';
  setRowStatus('watt-load-row','status','status-title','status-detail',wl,wt,wd);
  let al='normal',at='Normal',ad='Unter 12 A der erfassten Shellys';
  const valid=typeof d.amps==='number'&&Number.isFinite(d.amps)&&d.amps>=0;
  const devices=d.devices||[];
  const allDirect=devices.length>0&&d.amps_real_count===devices.length&&
   d.amps_estimated_count===0&&d.complete;
  if(faults.length){al='critical';at='Shelly-Störung';ad=faults.length+' aktive Fehlermeldung(en)'}
  else if(!valid){al='unknown';at='Keine Stromwerte';ad='Shelly-Ampere nicht verfügbar'}
  else if(d.amps>=AMP_RATED_A){al='critical';at='16 A erreicht';ad='Nennstromgrenze: Stromkreislast prüfen'}
  else if(d.amps>=AMP_RED_A){al='critical';at='Hohe Stromlast';ad='Ab 14 A: Last möglichst reduzieren'}
  else if(d.amps>=AMP_WARN_A){al='warning';at='Strom-Warnung';ad='Ab 12 A: Stromkreis beobachten'}
  else if(!allDirect){al='unknown';at='Messung unvollständig';ad=d.amps_estimated_count?
     'Mindestens ein Ampere-Wert nur berechnet':
     'Nicht alle Shelly-Amperewerte vorhanden'}
  setRowStatus('amps-load-row','amp-status','amp-status-title','amp-status-detail',al,at,ad);
  const severity={normal:0,unknown:1,warning:2,critical:3};
  byId('load-card').dataset.level=severity[wl]>=severity[al]?wl:al;
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
  if(pr==='offline')return {label:'Offline',state:'error'};
  if(pr==='paused')return {label:'Pausiert',state:'paused'};
  if(pr==='finished')return {label:'Fertig',state:'finished'};
  if(pr==='idle')return {label:'Bereit',state:'idle'};
  if(pr==='printing'||pr==='preparing'){
   const stage=activePrintStage(item.print_stage);
   if(stage)return stage;
   return pr==='printing'?{label:'Druckt',state:'printing'}:
     {label:'Bereitet vor',state:'preparing'};
  }
  if(item.switch_state==='on')return {label:'Eingeschaltet',state:'idle'};
  if(!item.entity)return {label:'Nicht zugeordnet',state:'missing'};
  if(item.watts==null)return {label:'Nicht erreichbar',state:'missing'};
  return {label:'Misst',state:'idle'};
 }
 function renderDevices(d){
  const rows=(d.devices||[]);
  byId('device-summary').textContent=rows.length+' Geräte · '+d.measured+' mit Leistungsmessung';
  const html=rows.map(item=>{
   const available=item.watts!=null;
   const phase=displayPhase(item);
   const amp=item.amps==null?'–':
      (item.amps_source==='shelly'?'':'≈ ')+fmt(item.amps,3)+' A';
   const maxAmp=item.max_amps==null?'–':
      (item.max_amps_source==='shelly'?'':'≈ ')+fmt(item.max_amps,3)+' A';
   const currentHint=item.amps_source==='shelly'?'Shelly-Stromsensor direkt gemessen':
      item.amps_source==='calculated'?'Ersatzwert aus Watt / 230 V':'Kein Stromwert';
   const peakHint=item.max_amps_source==='shelly'?'Höchster gemessener Shelly-Ampere-Wert':
      'Höchster errechneter Ersatzwert';
   const e=item.energy_kwh==null?'–':fmt(item.energy_kwh,2)+' kWh';
   return '<tr class="device-row state-'+esc(phase.state)+'"><td class="'+
    (item.kind==='other'?'other-name':'printer-name')+'">'+esc(item.name)+'</td>'+
    '<td>'+esc(power(item.watts))+'</td><td title="'+esc(currentHint)+'">'+esc(amp)+'</td>'+
    '<td class="device-max-amps" title="'+esc(peakHint)+'">'+esc(maxAmp)+'</td><td>'+esc(e)+'</td>'+
    '<td><span class="pill '+esc(phase.state)+'">'+esc(phase.label)+'</span></td></tr>';
  }).join('');
  byId('device-rows').innerHTML=html||
    '<tr><td colspan="6" class="placeholder">Keine aktiven Geräte. Im Druckplaner hinzufügen.</td></tr>';
 }
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
  const list=(data.history||[]).filter(p=>Number.isFinite(Number(p.at)));
  const host=byId('chart');
  if(!list.length){host.innerHTML='<p class="placeholder">Noch kein Verlauf vorhanden. Aufzeichnung läuft im Hintergrund.</p>';return;}
  const W=580,H=230,L=43,R=15,T=14,B=28;
  const innerW=W-L-R,innerH=H-T-B;
  const now=Math.round(Date.now()/1000),min=now-range*60;
  const max=Math.max(150,Number(data.warning_w)||0,Number(data.critical_w)||0,
    ...list.map(p=>p.watts==null?0:Number(p.watts)||0))*1.1;
  const xx=t=>L+Math.max(0,Math.min(1,(t-min)/(range*60)))*innerW;
  const yy=v=>T+innerH-Math.max(0,Math.min(1,v/max))*innerH;
  const lines=[];
  let last=null,segment=[];
  for(const sample of list){
   const val=sample.watts==null?null:Number(sample.watts);
   if(!Number.isFinite(val)||val===null||sample.at<min){if(segment.length){lines.push(segment);segment=[]}last=null;continue;}
   if(last!=null&&sample.at-last>45&&segment.length){lines.push(segment);segment=[];}
   segment.push([xx(sample.at),yy(val),sample.at,val]);
   last=sample.at;
  }
  if(segment.length)lines.push(segment);
  let svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Gemessene Leistung der letzten '+range+' Minuten">';
  for(let i=0;i<=4;i++){
   const val=max*i/4,y=yy(val);
   svg+='<line class="grid-line" x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'"/>'+
     '<text x="'+(L-6)+'" y="'+(y+3)+'" text-anchor="end">'+esc(fmt(val,0))+'</text>';
  }
  for(let i=0;i<=4;i++){
   const t=min+i*(range*60)/4,x=xx(t);
   svg+='<text x="'+x+'" y="'+(H-6)+'" text-anchor="middle">'+
    esc(new Date(t*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}))+'</text>';
  }
  for(const points of lines){
   const path=points.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
   if(points.length>1)svg+='<path class="graph-fill" d="'+path+' L '+
     points[points.length-1][0].toFixed(1)+' '+yy(0)+' L '+points[0][0].toFixed(1)+' '+yy(0)+' Z"/>';
   svg+='<path class="graph-line" d="'+path+'"/>';
  }
  const end=lines.length?lines[lines.length-1].at(-1):null;
  if(end&&end[2]>=now-100){
   svg+='<circle class="chart-cursor" cx="'+end[0]+'" cy="'+end[1]+'" r="5"/>';
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
  const ampHigh=d.total_amps_peak;
  byId('total-amps-peak').textContent=ampHigh?fmt(ampHigh.amps,2)+' A':'– A';
  byId('total-amps-peak-note').textContent=ampHigh?
    'Am '+new Date(ampHigh.at*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+
    ' · '+ampHigh.measured+' Shellys direkt':
    'Ab Update: nur vollständige Shelly-Werte';
  byId('measured').textContent=(d.printers_measured??0)+' / '+(d.printers_total??0);
  byId('warning').textContent=power(d.warning_w);
  byId('critical').textContent=power(d.critical_w);
  status(d);loadBar(d);renderDevices(d);renderFaults(d);chart(d);
  const t=d.updated?new Date(d.updated*1000):new Date();
  byId('updated').textContent='Letzte Aktualisierung: '+t.toLocaleTimeString('de-DE')+
   (d.complete?'':' · Messung teilweise unvollständig');
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
   for(const name of ['watt-load-row','amps-load-row'])byId(name).dataset.level='unknown';
   byId('status-title').textContent='Verbindung unterbrochen';
   byId('status-detail').textContent=e.message;
   byId('amp-status-title').textContent='Verbindung unterbrochen';
   byId('amp-status-detail').textContent='Keine aktuellen Shelly-Messwerte';
   byId('updated').textContent='Keine aktuellen Daten: '+e.message;
  }finally{loading=false}
 }
 refresh();
 setInterval(refresh,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();