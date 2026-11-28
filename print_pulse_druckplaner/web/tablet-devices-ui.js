'use strict';
/* Manage only monitored HA devices. No actions to switch any outlet. */
(() => {
 const root=document.getElementById('pp-devices-manager');
 if(!root)return;
 const list=root.querySelector('#pp-device-list');
 const info=root.querySelector('#pp-device-info');
 const add=root.querySelector('#pp-device-add');
 const save=root.querySelector('#pp-device-save');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let sensors=[],switches=[],items=[],loaded=false,busy=false;
 async function api(path,data){
  const resp=await fetch('api/'+path,{method:data?'POST':'GET',
   credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:{},
   body:data?JSON.stringify(data):undefined});
  const output=await resp.json();
  if(!resp.ok)throw new Error(output.error||'HA-Abfrage fehlgeschlagen');
  return output;
 }
 function fieldChoices(choices,value,label){
  const all=choices.slice();
  if(value&&!all.some(c=>c.id===value))all.push({id:value,name:'Gespeichert, aktuell nicht auffindbar'});
  return '<option value="">'+esc(label)+'</option>'+
   all.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===value?' selected':'')+'>'+
   esc(c.name+' · '+c.id)+'</option>').join('');
 }
 function draw(){
  const power=sensors.filter(s=>s.kind==='power'),energy=sensors.filter(s=>s.kind==='energy'),current=sensors.filter(s=>s.kind==='current');
  list.innerHTML=items.map((item,index)=>
   '<article class="pp-device-edit" data-device-id="'+esc(item.id)+'">'+
    '<div class="pp-device-edit-head"><strong>'+esc(item.name||'Neues Gerät')+'</strong>'+
    '<button type="button" class="pp-device-remove secondary" data-remove="'+esc(item.id)+'">Entfernen</button></div>'+
    '<div class="pp-device-edit-grid">'+
     '<label>Gerätename<input class="pp-device-name" maxlength="70" value="'+esc(item.name||'')+'"></label>'+
     '<label>Typ<select class="pp-device-kind"><option value="printer"'+(item.kind==='printer'?' selected':'')+'>3D-Drucker</option>'+
       '<option value="other"'+(item.kind==='other'?' selected':'')+'>Sonstige Verbraucher</option></select></label>'+
     '<label>Leistungsmessung (W)<select class="pp-device-power">'+fieldChoices(power,item.power_entity,'Kein Leistungssensor')+'</select></label>'+
     '<label>Strommessung (A)<select class="pp-device-current">'+fieldChoices(current,item.current_entity,'Automatisch (gleiche Shelly-ID)')+'</select></label>'+
     '<label>Verbrauchszähler (kWh)<select class="pp-device-energy">'+fieldChoices(energy,item.energy_entity,'Optional')+'</select></label>'+
     '<label>Steckdosenschalter (nur Status)<select class="pp-device-switch">'+fieldChoices(switches,item.switch_entity,'Optional')+'</select></label>'+
     '<label class="pp-device-enabled"><input class="pp-device-active" type="checkbox"'+(item.enabled!==false?' checked':'')+'>Aktiv überwachen</label>'+ 
     '<label class="pp-device-enabled"><input class="pp-device-maintenance" type="checkbox"'+(item.maintenance===true?' checked':'')+'>Wartung (Messung bleibt aktiv)</label>'+
    '</div></article>'
  ).join('')||'<p class="pp-power-help">Noch kein Gerät vorhanden. Über „Gerät hinzufügen“ starten.</p>';
  info.textContent=items.length+' Geräte angelegt. Nur aktive Geräte erscheinen im Tablet-Monitor.';
 }
 async function load(){
  if(loaded||busy)return;
  busy=true;info.textContent='Lade Home-Assistant-Sensoren …';
  try{
   const d=await api('tablet-devices');
   sensors=d.sensors||[];switches=d.switches||[];items=(d.devices||[]).map(x=>({...x}));
   loaded=true;draw();
  }catch(e){info.textContent='Geräteliste nicht verfügbar: '+e.message;}
  finally{busy=false}
 }
 root.addEventListener('toggle',()=>{if(root.open)load()});
 function collect(){
  return [...list.querySelectorAll('.pp-device-edit')].map(row=>({
   id:row.dataset.deviceId,
   name:row.querySelector('.pp-device-name').value.trim(),
   kind:row.querySelector('.pp-device-kind').value,
   power_entity:row.querySelector('.pp-device-power').value,
   energy_entity:row.querySelector('.pp-device-energy').value,
   current_entity:row.querySelector('.pp-device-current').value,
   switch_entity:row.querySelector('.pp-device-switch').value,
   enabled:row.querySelector('.pp-device-active').checked,
   maintenance:row.querySelector('.pp-device-maintenance').checked
  }));
 }
 function automatch(row){
  const power=row.querySelector('.pp-device-power').value;
  const m=power.match(/shellyplugsg3_([a-f0-9]{12})/);
  if(!m)return;
  const prefix='shellyplugsg3_'+m[1];
  const energy=row.querySelector('.pp-device-energy');
  const sw=row.querySelector('.pp-device-switch');
  const current=row.querySelector('.pp-device-current');
  if(!current.value){
   const found=sensors.find(s=>s.id.startsWith('sensor.'+prefix+'_')&&s.kind==='current');
   if(found)current.value=found.id;
  }
  if(!energy.value){
   const found=sensors.find(s=>s.id.includes(prefix)&&s.kind==='energy'&&
      /(?:_energieverbrauch|_energie)$/.test(s.id));
   if(found)energy.value=found.id;
  }
  if(!sw.value){
   const found=switches.find(s=>s.id==='switch.'+prefix);
   if(found)sw.value=found.id;
  }
 }
 list.addEventListener('change',event=>{
  const row=event.target.closest('.pp-device-edit');
  if(row&&event.target.classList.contains('pp-device-power'))automatch(row);
 });
 list.addEventListener('click',event=>{
  const btn=event.target.closest('[data-remove]');
  if(!btn)return;
  const row=btn.closest('.pp-device-edit');
  const name=row?.querySelector('.pp-device-name')?.value||'Gerät';
  if(!confirm(name+' aus der Live-Überwachung entfernen? Der bisherige Gesamtleistungsverlauf bleibt erhalten.'))return;
  items=collect().filter(x=>x.id!==btn.dataset.remove);
  draw();info.textContent='Noch nicht gespeichert. Mit „Änderungen speichern“ übernehmen.';
 });
 add.addEventListener('click',()=>{
  if(!loaded||items.length>=40)return;
  items=collect();
  const base='custom-'+Date.now().toString(36);
  const id=items.some(x=>x.id===base)?base+'-'+Math.floor(Math.random()*9999):base;
  items.push({id,name:'Neuer Drucker',kind:'printer',power_entity:'',
   energy_entity:'',switch_entity:'',current_entity:'',enabled:true});
  draw();
  list.lastElementChild?.querySelector('input.pp-device-name')?.focus();
 });
 save.addEventListener('click',async()=>{
  if(!loaded||busy)return;
  busy=true;save.disabled=true;
  try{
   const payload={devices:collect()};
   const result=await api('tablet-devices',payload);
   items=result.devices;
   draw();
   info.textContent='Gespeichert. Tablet-Monitor und Stromüberwachung übernehmen die Geräte automatisch.';
   window.dispatchEvent(new CustomEvent('pp-devices-updated'));
  }catch(e){info.textContent='Nicht gespeichert: '+e.message;}
  finally{busy=false;save.disabled=false}
 });
})();