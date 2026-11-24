'use strict';
/* Shelly Stromüberwachung – Anzeige und Einrichtung, keine Schaltautomation.
 * WARNING: summed device loads do not establish circuit loading.
 */
(function () {
 const host=document.getElementById('dashboard-orders-summary');
 if(!host)return;
 const escP=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>n==null?'–':new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(n);
 host.insertAdjacentHTML('beforeend',
  '<section id="pp-power" class="pp-power" aria-label="Shelly Stromüberwachung">'+
   '<div class="pp-power-head"><div><small>DRUCKERFARM · SHELLY LIVE</small><h3>Stromüberwachung</h3></div><span id="pp-power-state" class="pp-power-state">Lade …</span></div>'+
   '<div class="pp-power-grid">'+
    '<div><small>Gemessene Leistung</small><strong id="pp-power-watts">– W</strong></div>'+
    '<div><small>Rechnerisch bei 230 V</small><strong id="pp-power-amps">– A</strong></div>'+
    '<div><small>Aktive Drucker-Messpunkte</small><strong id="pp-power-count">– / 7</strong></div>'+
   '</div>'+
   '<div class="pp-power-track" role="progressbar" aria-label="Gemessene Leistung relativ zu 3.680 Watt, nur unverbindliche Referenz" aria-valuemin="0" aria-valuemax="3680" aria-valuenow="0"><div id="pp-power-bar"></div></div>'+
   '<p class="pp-power-disclaimer">16 A / 3.680 W sind nur eine Rechenreferenz. Zwei Wandsteckdosen können am selben Stromkreis liegen. Shelly-Werte ersetzen weder Sicherung noch Prüfung der Leitungen.</p>'+
   '<div id="pp-power-devices" class="pp-power-devices"></div>'+
   '<details id="pp-power-settings" class="pp-power-settings"><summary>Messpunkte und ntfy-Warnung einrichten</summary>'+
    '<p class="pp-power-help">Jedem Drucker den passenden Shelly-Leistungssensor (W) zuordnen. Der Kühlschrank ist optional. Nicht zugeordnete oder ausgefallene Sensoren werden nicht als 0 W gezählt.</p>'+
    '<div id="pp-power-bindings" class="pp-power-bindings"></div>'+
    '<div class="pp-power-fields"><label>Warnung ab (W)<input id="pp-power-warning" inputmode="numeric" type="number" min="300" max="9000"></label>'+
    '<label>Alarm ab (W)<input id="pp-power-critical" inputmode="numeric" type="number" min="400" max="10000"></label>'+
    '<label class="pp-power-topic">ntfy.sh-Topic (bestehendes iPhone-Abo)<input id="pp-power-topic" type="text" maxlength="128" spellcheck="false" autocomplete="off" placeholder="Eigenen ntfy-Topic-Namen eintragen"></label></div>'+
    '<p class="pp-power-help">Warnung nach mindestens 30 Sekunden erhöhter Leistung; erneute Warnung erst nach Entwarnung für 2 Minuten. ntfy wird erst nach Eintragen und Speichern des Topics aktiviert. Keine automatische Abschaltung.</p>'+
    '<div class="pp-power-actions"><button type="button" id="pp-power-save" class="primary">Einstellungen speichern</button><button type="button" id="pp-power-test" class="secondary">ntfy testen</button></div>'+
    '<p id="pp-power-feedback" role="status" aria-live="polite"></p>'+
   '</details></section>');
 const el=id=>document.getElementById(id);
 async function request(path,payload){
  const response=await fetch('api/'+path,{
   method:payload===undefined?'GET':'POST',
   headers:payload===undefined?{}:{'Content-Type':'application/json'},
   body:payload===undefined?undefined:JSON.stringify(payload),
   cache:'no-store',credentials:'same-origin'});
  const text=await response.text();let data={};
  try{data=JSON.parse(text);}catch(_){throw new Error('Keine gültige Antwort der App.');}
  if(!response.ok)throw new Error(data.error||'Abfrage fehlgeschlagen.');
  return data;
 }
 let loaded=false, saving=false;
 async function settings(){
  if(loaded)return;
  const feedback=el('pp-power-feedback');
  feedback.textContent='Lade Shelly-Sensoren …';
  try{
   const data=await request('power-monitor-settings');
   const opts=(data.sensors||[]);
   const bindings=data.bindings||{};
   el('pp-power-warning').value=data.warning_w;
   el('pp-power-critical').value=data.critical_w;
   el('pp-power-topic').value=data.ntfy_topic||'';
   el('pp-power-bindings').innerHTML=(data.devices||[]).map(name=>{
    const selected=bindings[name]||'';
    const choices=opts.slice();
    if(selected&&!choices.some(s=>s.id===selected))choices.push({id:selected,name:'Gespeichert – derzeit nicht erreichbar'});
    return '<label>'+escP(name)+'<select data-power-device="'+escP(name)+'"><option value="">Nicht zugeordnet</option>'+
     choices.map(s=>'<option value="'+escP(s.id)+'"'+(s.id===selected?' selected':'')+'>'+escP(s.name+' · '+s.id)+'</option>').join('')+
     '</select></label>';
   }).join('');
   loaded=true;
   feedback.textContent=data.ntfy_topic?'ntfy-Topic gespeichert.':'Für Pushmeldungen deinen bestehenden ntfy-Topic eintragen.';
  }catch(e){feedback.textContent=e.message;}
 }
 async function refresh(){
  try{
   const d=await request('power-monitor');
   el('pp-power-watts').textContent=fmt(d.watts)+' W';
   el('pp-power-amps').textContent=fmt(d.amps)+' A';
   el('pp-power-count').textContent=d.printers_measured+' / 7';
   const badge=el('pp-power-state');
   const state=d.level==='critical'?'Alarm':d.level==='warning'?'Erhöhte Last':
    !d.complete?'Unvollständig':'Normaler Messwert';
   badge.textContent=state+(d.ntfy_enabled?' · ntfy':' · ntfy aus');
   badge.dataset.level=d.level;
   const progress=el('pp-power').querySelector('[role="progressbar"]');
   const n=d.watts==null?0:Math.max(0,d.watts);
   progress.setAttribute('aria-valuenow',String(Math.min(3680,n)));
   el('pp-power-bar').style.width=Math.min(100,n/3680*100)+'%';
   el('pp-power-devices').innerHTML=(d.devices||[]).map(x=>
     '<span class="pp-power-device"><b>'+escP(x.name)+'</b><em>'+
      (x.watts==null?(x.entity?'Nicht verfügbar':'Nicht zugeordnet'):fmt(x.watts)+' W')+
     '</em></span>').join('');
  }catch(e){
   el('pp-power-state').textContent='Keine Messdaten';
   el('pp-power-watts').textContent='– W';
   el('pp-power-amps').textContent='– A';
   el('pp-power-count').textContent='– / 7';
   el('pp-power-bar').style.width='0%';
   el('pp-power-devices').textContent='Home Assistant nicht erreichbar: '+e.message;
  }
 }
 el('pp-power-settings').addEventListener('toggle',()=>{if(el('pp-power-settings').open)settings();});
 el('pp-power-save').addEventListener('click',async()=>{
  if(saving)return;
  const feedback=el('pp-power-feedback');
  saving=true;el('pp-power-save').disabled=true;
  try{
   const bindings={};
   for(const sel of el('pp-power-bindings').querySelectorAll('select[data-power-device]')){
    bindings[sel.dataset.powerDevice]=sel.value;
   }
   await request('power-monitor-settings',{
    bindings,warning_w:Number(el('pp-power-warning').value),
    critical_w:Number(el('pp-power-critical').value),
    ntfy_topic:el('pp-power-topic').value.trim()});
   feedback.textContent='Gespeichert. Stromüberwachung und ntfy-Warnschwellen aktiv, sofern ein Topic eingetragen ist.';
   await refresh();
  }catch(e){feedback.textContent='Nicht gespeichert: '+e.message;}
  finally{saving=false;el('pp-power-save').disabled=false;}
 });
 el('pp-power-test').addEventListener('click',async()=>{
  const feedback=el('pp-power-feedback');
  el('pp-power-test').disabled=true;
  try{
   await request('power-monitor-test',{});
   feedback.textContent='Testnachricht an ntfy.sh gesendet. Bitte auf dem iPhone prüfen.';
  }catch(e){feedback.textContent='ntfy-Test fehlgeschlagen: '+e.message;}
  finally{el('pp-power-test').disabled=false;}
 });
 refresh();
 window.setInterval(refresh,15000);
})();
