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
 async function fetchData(){
  const response=await fetch('api/tablet-monitor?minutes='+range,
   {credentials:'same-origin',cache:'no-store'});
  let data;
  try{data=await response.json()}catch(_){throw new Error('Antwort nicht lesbar')}
  if(!response.ok)throw new Error(data.error||'HA-Abfrage fehlgeschlagen');
  return data;
 }
 function status(d){
  const faults=(d.faults||[]).filter(f=>f.state==='on');
  const unknown=(d.faults||[]).filter(f=>f.state==='unknown').length;
  let level='normal',label='Normal',detail='Unter den eingestellten Warnschwellen';
  if(d.watts==null){level='unknown';label='Keine Messwerte';detail='Kein Leistungssensor erreichbar'}
  else if(faults.length){level='critical';label='Shelly-Störung';detail=faults.length+' aktive Fehlermeldung(en)'}
  else if(d.level==='critical'){level='critical';label='Kritische Last';detail='Kritische Schwelle überschritten'}
  else if(d.level==='warning'){level='warning';label='Erhöhte Last';detail='Warnschwelle überschritten'}
  else if(!d.complete){level='unknown';label='Unvollständige Messung';detail='Nicht alle Drucker-Sensoren liefern Werte'}
  byId('load-card').dataset.level=level;
  byId('status-title').textContent=label;
  byId('status-detail').textContent=detail;
  byId('status').querySelector('.status-symbol').textContent=level==='normal'?'✓':level==='critical'?'!':level==='warning'?'!':'?';
  byId('connection').dataset.state='ok';
  byId('connection-text').textContent='Live · HA verbunden';
  if(unknown&&level==='normal')byId('status-detail').textContent=unknown+' Shelly-Fehlerstatus nicht verfügbar';
 }
 function loadBar(d){
  const warn=Number(d.warning_w)||2500,critical=Number(d.critical_w)||3200;
  const max=critical*1.18;
  const n=Math.max(0,Number(d.watts)||0);
  // The marker uses a calculated reference range, not an electrical safety rating.
  const pct=Math.min(96,Math.max(4,n/max*100));
  const pin=byId('load-pin'),track=byId('load-gradient');
  pin.style.left=pct+'%';
  track.style.setProperty('--marker-left',pct+'%');
  track.setAttribute('aria-valuemax',String(max));
  track.setAttribute('aria-valuenow',String(Math.min(max,n)));
  byId('load-pin-value').textContent=power(d.watts);
  byId('warn-tick').textContent='Warnung '+fmt(warn,0)+' W';
  byId('critical-tick').textContent='Kritisch '+fmt(critical,0)+' W';
 }
 function renderDevices(d){
  const rows=(d.devices||[]);
  const states={printing:'Druckt',paused:'Pausiert',preparing:'Heizt vor',
   finished:'Fertig',idle:'Bereit',error:'Störung'};
  byId('device-summary').textContent=rows.length+' Geräte · '+d.measured+' mit Leistungsmessung';
  const html=rows.map(item=>{
   const available=item.watts!=null;
   let cls='on',label='Misst';
   const pr=item.printer_state;
   if(pr&&states[pr]){cls=pr==='error'?'error':pr==='paused'?'paused':pr==='printing'?'printing':'on';label=states[pr]}
   else if(item.switch_state==='off'){cls='off';label='Aus'}
   else if(item.switch_state==='on'){cls='on';label='Eingeschaltet'}
   else if(!item.entity){cls='missing';label='Nicht zugeordnet'}
   else if(!available){cls='missing';label='Nicht erreichbar'}
   if(!available&&item.entity&&cls!=='off'){cls='missing';label='Keine Messung'}
   const amp=available?fmt(item.watts/230,2)+' A':'–';
   const e=item.energy_kwh==null?'–':fmt(item.energy_kwh,2)+' kWh';
   return '<tr><td class="'+(item.kind==='other'?'other-name':'printer-name')+'">'+esc(item.name)+'</td>'+
    '<td>'+esc(power(item.watts))+'</td><td>'+esc(amp)+'</td><td>'+esc(e)+'</td>'+
    '<td><span class="pill '+cls+'">'+esc(label)+'</span></td></tr>';
  }).join('');
  byId('device-rows').innerHTML=html||'<tr><td colspan="5" class="placeholder">Keine aktiven Geräte. Im Druckplaner hinzufügen.</td></tr>';
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
   byId('status-title').textContent='Verbindung unterbrochen';
   byId('status-detail').textContent=e.message;
   byId('updated').textContent='Keine aktuellen Daten: '+e.message;
  }finally{loading=false}
 }
 refresh();
 setInterval(refresh,15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
})();