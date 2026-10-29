'use strict';
/* Einkauf optimieren: read-only analysis until explicit user approval. */
(() => {
 const $=id=>document.getElementById(id);
 const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const euros=c=>c==null?'Preis nicht gepflegt':(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 const planButton=$('fp-calculate'),importButton=$('fp-history'),applyButton=$('fp-apply');
 const info=$('fp-info'),results=$('fp-results');
 let plan=null,running=false,poll=null;
 function status(message,error=false){info.textContent=message;info.classList.toggle('fp-error',error);}
 function options(){return {spools:Number($('fp-spools').value),days:Number($('fp-days').value)};}
 function validate(){
  const {spools,days}=options();
  if(!Number.isInteger(spools)||spools<1||spools>100)throw Error('Bitte 1 bis 100 Spulen eingeben.');
  if(![30,60,90].includes(days))throw Error('Ungültiger Planungszeitraum.');
  return {spools,days};
 }
 function render(){
  if(!plan)return;
  const p=plan;
  const candidates=p.suggestions.filter(x=>x.add_spools>0);
  const missing=p.suggestions.filter(x=>x.needed_spools>0&&!x.add_spools);
  const summary='<div class="fp-summary"><div><small>Im Einkaufswagen</small><strong>'+p.current_cart+' Spulen</strong></div>'+
   '<div><small>Zusätzlich sinnvoll</small><strong>'+p.recommended_add+' Spulen</strong></div>'+
   '<div><small>Ohne sichere Farbzuordnung</small><strong>'+p.unassigned_count_90+' Artikel</strong></div></div>';
  const history=p.history_checked_at?
   'Historie eingelesen: '+new Date(p.history_checked_at*1000).toLocaleDateString('de-DE')+
    ' ('+p.history_count+' Positionen)':
   'Noch keine vollständige Historie importiert. Die vorhandenen Bestellungen werden bereits berücksichtigt.';
  const note='<p class="fp-note">'+h(history)+'</p><p class="fp-note">Letzte 90 Tage: '+p.sales_count_90+
   ' verkaufte Stück · '+(p.assigned_g_90/1000).toLocaleString('de-DE',{maximumFractionDigits:2})+
   ' kg zugeordnet · '+(p.unassigned_g_90/1000).toLocaleString('de-DE',{maximumFractionDigits:2})+
   ' kg ohne eindeutige Farbe. Die Schätzung beträgt '+p.default_grams+
   ' g pro Artikel. Angebrochene Spulen sind rechnerisch mit je 500 g angesetzt.</p>';
  const rows=candidates.map(f=>'<div class="fp-line"><span class="fp-swatch" style="background:'+h(f.color_hex)+'"></span>'+
    '<div class="fp-name"><b>'+h(f.color)+'</b><small>'+h(f.brand)+' · '+h(f.material)+
    (f.internal_code?' · Code '+h(f.internal_code):'')+'</small>'+
    '<small>Verbrauch 90 T.: '+f.historical_g+' g · Prognose '+p.days+' T.: '+f.forecast_g+
    ' g · '+f.stock_spools+' volle, '+f.open_spools+' angebrochene Spulen</small></div>'+
    '<div class="fp-quantity"><b>+'+f.add_spools+'</b><small>'+euros(f.price_cents)+'/Sp.</small></div></div>').join('');
  const totalCost=candidates.reduce((sum,f)=>sum+(f.price_cents??0)*f.add_spools,0);
  const unknownPrices=candidates.some(f=>f.price_cents==null);
  let messages='';
  if(p.current_cart>p.target_spools)messages+='<p class="fp-warning">Deine Einkaufsliste enthält schon mehr als '+p.target_spools+' Spulen. Es wird nichts entfernt.</p>';
  if(p.remaining_capacity>0)messages+='<p class="fp-warning">Nicht künstlich auffüllen: '+p.remaining_capacity+' Spulen bleiben frei, weil kein ausreichend belegter Mehrbedarf erkannt wurde.</p>';
  if(missing.length)messages+='<p class="fp-warning">Weitere '+missing.length+' Farben hätten rechnerisch Bedarf, passen aber nicht mehr in die gewählte Menge.</p>';
  if(p.unassigned_count_90)messages+='<p class="fp-warning">Unklare Farben wurden nicht geraten. Deine Empfehlung kann dadurch zu niedrig ausfallen.</p>';
  const footer=candidates.length?'<p class="fp-note">Zusätzlicher Schätzwert nach hinterlegten Preisen: <b>'+euros(totalCost)+'</b>'+
    (unknownPrices?' + Preise offen':'')+'. Keine Live-Bambu-Preise und keine bestätigten Bulk-Rabatte.</p>':
    '<p class="fp-note">Keine zusätzlichen Spulen mit sicher belegtem Farbbedarf erkannt. Bestehende Einkaufsliste bleibt erhalten.</p>';
  results.innerHTML=summary+note+(rows?'<div class="fp-lines">'+rows+'</div>':'')+footer+messages;
  applyButton.hidden=!candidates.length;
  applyButton.disabled=!candidates.length||running;
  status(p.history_status?.running?'Etsy-Historie wird gerade eingelesen …':
         p.history_status?.error?'Historie: '+p.history_status.error:
         'Bedarf berechnet. Erst mit „Zur Einkaufsliste hinzufügen“ werden Mengen gespeichert.',
         Boolean(p.history_status?.error));
 }
 async function calculate(){
  if(running)return;
  running=true;planButton.disabled=true;applyButton.disabled=true;
  try{
   const {spools,days}=validate();
   status('Filamentbedarf wird aus Verkäufen und Bestand berechnet …');
   plan=await api('filament-plan?spools='+spools+'&days='+days);
   render();
  }catch(error){status(error.message,true);}
  finally{running=false;planButton.disabled=false;if(plan)applyButton.disabled=!plan.suggestions.some(x=>x.add_spools>0);}
 }
 async function importHistory(){
  if(running)return;
  running=true;importButton.disabled=true;planButton.disabled=true;applyButton.disabled=true;
  try{
   const response=await api('filament-history',{action:'start'});
   if(response.running){
    status('Historische Etsy-Bestellungen werden eingelesen. Du kannst im Druckplaner weiterarbeiten.');
    if(poll)clearInterval(poll);
    poll=setInterval(async()=>{
      try{
       const {spools,days}=validate();
       plan=await api('filament-plan?spools='+spools+'&days='+days);
       if(!plan.history_status.running){
        clearInterval(poll);poll=null;
        running=false;importButton.disabled=false;planButton.disabled=false;
        render();
       }else status('Etsy-Historie wird eingelesen. Bisherige Einkaufsdaten bleiben unverändert.');
      }catch(error){
       clearInterval(poll);poll=null;
       running=false;importButton.disabled=false;planButton.disabled=false;
       status(error.message,true);
      }
    },3000);
   }else{
    running=false;importButton.disabled=false;planButton.disabled=false;
    await calculate();
   }
  }catch(error){
   running=false;importButton.disabled=false;planButton.disabled=false;
   status(error.message,true);
  }
 }
 async function apply(){
  if(running||!plan)return;
  const additions=plan.suggestions.filter(x=>x.add_spools>0).map(x=>({id:x.id,qty:x.add_spools}));
  if(!additions.length)return;
  if(!confirm('Jetzt '+additions.reduce((sum,x)=>sum+x.qty,0)+' empfohlene Spulen zur vorhandenen Einkaufsliste hinzufügen? Die bisherigen Einträge bleiben erhalten.'))return;
  running=true;applyButton.disabled=true;
  try{
   await api('filament-plan',{action:'apply',additions,expected_cart:plan.cart_snapshot});
   await loadFilaments();
   status('Empfohlene Spulen wurden zur bestehenden Einkaufsliste hinzugefügt.');
   plan=null;results.innerHTML='';
   applyButton.hidden=true;
  }catch(error){status(error.message,true);}
  finally{running=false;}
 }
 planButton.addEventListener('click',calculate);
 importButton.addEventListener('click',importHistory);
 applyButton.addEventListener('click',apply);
 $('fp-spools').addEventListener('change',()=>{plan=null;applyButton.hidden=true;results.innerHTML='';});
 $('fp-days').addEventListener('change',()=>{plan=null;applyButton.hidden=true;results.innerHTML='';});
})();
