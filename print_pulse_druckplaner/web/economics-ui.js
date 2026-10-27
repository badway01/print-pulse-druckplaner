'use strict';
/* Connected workshop calculator. Only /api/economics persists data. No order or stock changes. */
let economyData=null, economyLoaded=false, economyLoading=false;
let economyMaterials=[], economyProfile=null, economyInvestmentId=null;
let economyTab='cost';
const econFieldLabels={
 batch_units:'Stück je Druck',minutes:'Druckdauer je Druck (Min.)',
 power_watts:'Leistungsaufnahme (W)',energy_eur_kwh:'Strompreis (€/kWh)',
 machine_eur_hour:'Maschinenkosten (€/h)',labor_minutes:'Arbeitszeit je Stück (Min.)',
 labor_eur_hour:'Arbeitskosten (€/h)',packaging_eur:'Verpackung je Stück (€)',
 other_eur:'Weitere Kosten je Stück (€)',selling_eur:'Verkaufspreis je Stück (€)',
 shipping_paid_eur:'Vom Kunden bezahlter Versand (€)',shipping_cost_eur:'Versandkosten (€)',
 etsy_percent:'Plattformgebühren gesamt (%)',etsy_fixed_eur:'Feste Gebühren (€)',
 additional_fee_eur:'Zusätzliche Gebühren (€)'
};
const econDefaults={batch_units:1,minutes:0,power_watts:120,energy_eur_kwh:.35,
 machine_eur_hour:0,labor_minutes:0,labor_eur_hour:0,packaging_eur:0,
 other_eur:0,selling_eur:0,shipping_paid_eur:0,shipping_cost_eur:0,
 etsy_percent:10.5,etsy_fixed_eur:.30,additional_fee_eur:0,
 etsy_enabled:0,offsite_percent:0,listing_fee_eur:0,units_per_order:1};
const econMoney=value=>value===null||!Number.isFinite(Number(value))?'—':Number(value).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const econNum=(value,fallback=0)=>{const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)&&n>=0?n:fallback;};
function econProduct(){return (model?.products||[]).find(p=>String(p.id)===$('econ-product').value);}
function econProfileKey(){return [$('econ-product').value,$('econ-variant').value,$('econ-printer').value].join(':');}
function econPick(){
 if(!economyData)return null;
 return economyData.profiles.find(p=>[p.listing_id,p.variant_id,p.printer].join(':')===econProfileKey())||null;
}
function econSelectOptions(rows,valueKey,labeler,selected){
 return rows.map(r=>'<option value="'+esc(r[valueKey])+'" '+(String(r[valueKey])===String(selected)?'selected':'')+'>'+esc(labeler(r))+'</option>').join('');
}
function econProductsMarkup(selected){
 return '<option value="">Produkt auswählen …</option>'+econSelectOptions((model?.products||[]).filter(p=>p.state==='active'),'id',p=>p.title,selected);
}
function econRenderSelects(){
 if(!economyData||!model)return;
 const products=(model.products||[]).filter(p=>p.state==='active');
 const current=$('econ-product').value||products[0]?.id||'';
 $('econ-product').innerHTML=econProductsMarkup(current);
 const p=econProduct(), existing=$('econ-variant').value;
 $('econ-variant').innerHTML='<option value="">Standard / alle Varianten</option>'+
  (p?.items||[]).map(i=>'<option value="'+esc(i.id)+'" '+(String(i.id)===existing?'selected':'')+'>'+esc(i.label)+'</option>').join('');
 $('econ-printer').innerHTML=econSelectOptions(economyData.printers.map(x=>({id:x})),'id',x=>x.id,$('econ-printer').value||'H2D');
}
function econSpoolOptions(id){
 const filaments=economyData?.filaments||[];
 return '<option value="">Filament auswählen …</option>'+filaments.map(f=>{
  const label=(f.internal_code?'#'+f.internal_code+' · ':'')+f.brand+' · '+f.color+' · '+f.material+
   (f.price_cents===null?' · Preis fehlt':' · '+econMoney(f.price_cents/100)+' je Spule');
  return '<option value="'+f.id+'" '+(Number(id)===f.id?'selected':'')+'>'+esc(label)+'</option>';
 }).join('');
}
function econRenderMaterials(){
 const target=$('econ-materials');if(!target)return;
 target.innerHTML=economyMaterials.length?economyMaterials.map((m,i)=>
  '<div class="econ-material-line" data-econ-material="'+i+'">'+
  '<label>Filament<select data-econ-mat-field="filament_id" data-econ-mat-index="'+i+'">'+econSpoolOptions(m.filament_id)+'</select></label>'+
  '<label>Verbrauch je Druck (g)<input type="number" min="0" max="100000" step="0.1" inputmode="decimal" data-econ-mat-field="grams" data-econ-mat-index="'+i+'" value="'+esc(m.grams)+'"></label>'+
  '<label>Spulengewicht (g)<input type="number" min="1" max="100000" step="1" inputmode="numeric" data-econ-mat-field="spool_g" data-econ-mat-index="'+i+'" value="'+esc(m.spool_g)+'"></label>'+
  '<button type="button" class="secondary small" data-econ-remove="'+i+'" aria-label="Filament entfernen">Entfernen</button></div>'
 ).join(''):'<p class="hint">Noch kein Material zugeordnet. Filamente kommen direkt aus deinem Lager.</p>';
}
function econSuggestionMaterials(){
 const lid=$('econ-product').value,variant=$('econ-variant').value,printer=$('econ-printer').value;
 const profiles=printTools?.profiles||[];
 const profile=profiles.find(p=>p.listing_id===lid&&p.variant_id===variant&&p.printer===printer)||
   profiles.find(p=>p.listing_id===lid&&p.variant_id===''&&p.printer===printer);
 if(!profile)return [];
 const ids=[...new Set((profile.sources||[]).flatMap(source=>source.slots||[]).map(Number).filter(Number.isInteger))];
 return ids.filter(id=>economyData.filaments.some(f=>f.id===id)).map(id=>({filament_id:id,grams:0,spool_g:1000}));
}
function econRenderPrinterChecklist(){
 const target=$('econ-printer-checklist');
 if(!target||!economyData)return;
 const lid=$('econ-product').value,variant=$('econ-variant').value;
 target.innerHTML='<div class="econ-printer-checklist-title"><b>Deine Druckerfreigaben</b><small>Nur bestätigte Testdrucke sind freigegeben. Drucker auswählen, Status prüfen und speichern.</small></div>'+
  economyData.printers.map(name=>{
   const rows=economyData.profiles.filter(p=>p.listing_id===lid&&p.printer===name);
   const row=rows.find(p=>p.variant_id===variant)||rows.find(p=>p.variant_id==='');
   const status=row?.status||'untested';
   const label=status==='approved'?'✓ Erfolgreich getestet':status==='issue'?'! Nachbessern':'— Noch nicht getestet';
   return '<button type="button" data-econ-printer-pick="'+esc(name)+'" class="econ-printer-chip '+esc(status)+
    (name===$('econ-printer').value?' active':'')+'" aria-pressed="'+String(name===$('econ-printer').value)+'">'+
    '<b>'+esc(name)+'</b><small>'+esc(label)+(row&&row.variant_id!==variant?' · Standard':'')+'</small></button>';
  }).join('');
}

function econDurationDisplay(total){
 const minutes=Math.max(0,Math.round(econNum(total)));
 return Math.floor(minutes/60)+' Std. '+String(minutes%60).padStart(2,'0')+' Min.';
}
function econSetMode(enabled){
 $('econ-etsy-toggle').checked=Boolean(enabled);
 $('econ-etsy-details').hidden=!enabled;
}
function econRenderFeeRates(){
 const rates=economyData?.etsy_fees||{};
 const checked=rates.checked_at?new Date(rates.checked_at*1000).toLocaleString('de-DE'):'Ausgangswerte geprüft am 27.10.2026';
 $('econ-fees-checked').textContent='Gebührenstand: '+checked;
 const listing=rates.listing_eur===null||rates.listing_eur===undefined
  ?'Umrechnung ausstehend – Online-Update erforderlich'
  :econMoney(rates.listing_eur)+' je verkauftem Stück';
 $('econ-fees-status').innerHTML='<span>Transaktion: <b>'+econNum(rates.transaction_percent,6.5)+' %</b></span>'+
  '<span>Zahlungsbearbeitung: <b>'+econNum(rates.payments_percent,4)+' % + '+econMoney(rates.payments_fixed_eur??.30)+'/Bestellung</b></span>'+
  '<span>Listing: <b>'+econMoney(rates.listing_usd??.20).replace('€','USD')+' (USD; '+esc(listing)+')</b></span>'+
  '<span>Offsite Ads: <b>'+econNum(rates.offsite_standard_percent,15)+' % / '+econNum(rates.offsite_reduced_percent,12)+' %</b></span>';
 const selected=$('econ-offsite').value;
 $('econ-offsite').innerHTML='<option value="0">Keine Offsite Ads</option>'+
  '<option value="'+econNum(rates.offsite_standard_percent,15)+'">'+econNum(rates.offsite_standard_percent,15)+' % (unter 10.000 USD)</option>'+
  '<option value="'+econNum(rates.offsite_reduced_percent,12)+'">'+econNum(rates.offsite_reduced_percent,12)+' % (ab 10.000 USD)</option>';
 $('econ-offsite').value=selected||'0';
}
function econApplyFeeRates(){
 const f=$('econ-form').elements,r=economyData?.etsy_fees||{};
 f.etsy_percent.value=econNum(r.transaction_percent,6.5)+econNum(r.payments_percent,4);
 f.etsy_fixed_eur.value=econNum(r.payments_fixed_eur,.30);
 f.listing_fee_eur.value=econNum(r.listing_eur,0);
 econRenderFeeRates();
}

function econLoadProfile(){
 economyProfile=econPick();
 const fields={...econDefaults,...(economyProfile?.fields||{})};
 const form=$('econ-form');
 for(const [key,value] of Object.entries(fields)){
  const input=form.elements.namedItem(key);
  if(input)input.value=value;
 }
 $('econ-hours').value=Math.floor(econNum(fields.minutes)/60);
 $('econ-minutes').value=Math.round(econNum(fields.minutes)%60);
 econSetMode(Boolean(fields.etsy_enabled));
 if(!economyProfile)econApplyFeeRates();else econRenderFeeRates();
 form.elements.namedItem('status').value=economyProfile?.status||'untested';
 form.elements.namedItem('notes').value=economyProfile?.notes||'';
 economyMaterials=economyProfile?economyProfile.materials.map(m=>({...m})):econSuggestionMaterials();
 econRenderMaterials();econPreview();econRenderPrinterChecklist();
 $('econ-record').textContent=economyProfile
  ?'Gespeichert am '+new Date(economyProfile.updated*1000).toLocaleString('de-DE')
  :'Für diesen Drucker noch keine Kalkulation angelegt.';
}
function econFields(){
 const form=$('econ-form'),result={};
 for(const key of Object.keys(econDefaults)){
  if(key==='minutes'||key==='etsy_enabled')continue;
  result[key]=econNum(form.elements.namedItem(key)?.value,econDefaults[key]);
 }
 result.minutes=Math.floor(econNum($('econ-hours').value))*60+Math.min(59,Math.floor(econNum($('econ-minutes').value)));
 result.etsy_enabled=$('econ-etsy-toggle').checked?1:0;
 return result;
}
function econCalculation(){
 const f=econFields(),units=Math.max(1,f.batch_units||1),orderUnits=Math.max(1,f.units_per_order||1);
 const missing=[];
 let material=0;
 for(const part of economyMaterials){
  const filament=economyData.filaments.find(x=>x.id===Number(part.filament_id));
  if(!part.filament_id||!filament)continue;
  if(filament.price_cents===null){
   missing.push(filament.brand+' · '+filament.color);continue;
  }
  material+=econNum(part.grams)*filament.price_cents/100/(econNum(part.spool_g,1000)||1000);
 }
 const incomplete=missing.length>0||!economyMaterials.some(m=>Number(m.filament_id)&&econNum(m.grams)>0)||
  !f.minutes||(f.etsy_enabled&&(!f.selling_eur||!f.listing_fee_eur));
 const energy=f.minutes/60*f.power_watts/1000*f.energy_eur_kwh/units;
 const machine=f.minutes/60*f.machine_eur_hour/units;
 const print=material/units+energy+machine;
 const labor=f.etsy_enabled?f.labor_minutes/60*f.labor_eur_hour:0;
 const income=f.etsy_enabled?f.selling_eur+f.shipping_paid_eur/orderUnits:0;
 const fees=f.etsy_enabled?
  income*(f.etsy_percent+f.offsite_percent)/100+f.etsy_fixed_eur/orderUnits+
   f.listing_fee_eur+f.additional_fee_eur:0;
 const others=f.etsy_enabled?
  f.packaging_eur+f.other_eur+f.shipping_cost_eur/orderUnits:0;
 const total=print+labor+fees+others;
 return {material:material/units,energy,machine,print,labor,fees,others,total,income,
  contribution:income-total,incomplete,missing,enabled:Boolean(f.etsy_enabled)};
}
function econPreview(){
 if(!economyData)return;
 const r=econCalculation(),c=$('econ-results'),validMat=!r.missing.length;
 const row=(name,value)=>'<div class="econ-result-row"><span>'+esc(name)+'</span><strong>'+econMoney(value)+'</strong></div>';
 const warning=r.incomplete?'<div class="econ-warning">Bitte Filament, Gramm, Druckzeit'+
  (r.enabled?', Verkaufspreis und umgerechnete Listinggebühr':'')+(r.missing.length?' und Filamentpreis ('+esc(r.missing.join(', '))+')':'')+
  ' prüfen. Fehlende Angaben werden nicht als bestätigte Kosten behandelt.</div>':'';
 c.innerHTML=warning+
  row('Material pro Stück',validMat?r.material:null)+row('Strom',r.energy)+row('Maschine',r.machine)+
  '<div class="econ-total">'+row('Reine Druckkosten / Stück',validMat?r.print:null)+'</div>'+
  (r.enabled?
   row('Arbeitszeit',r.labor)+row('Verpackung, Versand und Sonstiges',r.others)+
   row('Etsy-Gebühren inkl. gewählter Offsite Ads',r.fees)+
   '<div class="econ-total">'+row('Herstellung + Vertrieb',validMat?r.total:null)+
   row('Erlös je Stück inkl. Versandanteil',r.income)+
   row('Deckungsbeitrag vor Steuern',r.incomplete?null:r.contribution)+'</div>':'')+
  '<small>'+(r.enabled?
   'Etsy-Modus: Standard-Etsy-Gebühren sind hinterlegt. Etwaige Umsatzsteuer auf Gebühren, Etsy Ads-Klickkosten oder Etsy Plus gegebenenfalls separat eintragen.':
   'Nur Druckkosten. Verkauf, Verpackung, Arbeitszeit und Etsy-Gebühren sind ausgeschaltet.')+'</small>'+
  (r.enabled&&!econFields().listing_fee_eur?
   '<p class="econ-fee-warning">Die 0,20 USD Listinggebühr ist noch nicht in Euro umgerechnet. Bitte „Gebühren online aktualisieren“ wählen.</p>':'');
 const comparisons=(economyData.profiles||[]).filter(p=>p.listing_id===$('econ-product').value&&
  p.variant_id===$('econ-variant').value&&p.status==='approved');
 $('econ-comparison').innerHTML=comparisons.length?
  comparisons.map(p=>'<div class="econ-compare-row"><strong>'+esc(p.printer)+'</strong><span>'+econDurationDisplay(p.result.minutes_per_unit??0)+'/Stück</span>'+
   '<span>'+econMoney(p.result.print_eur??p.result.total_eur)+'</span><span class="econ-verified">✓ Druck freigegeben</span></div>').join(''):
  '<p class="hint">Noch keine erfolgreich getesteten Drucker für diese Ausführung hinterlegt.</p>';
}
function econRenderInvestmentList(){
 const target=$('econ-investment-list');if(!target||!economyData)return;
 target.innerHTML=economyData.investments.length?economyData.investments.map(inv=>
  '<div class="econ-investment-item"><div><b>'+esc(inv.name)+'</b><small>'+esc(inv.printer||'Drucker offen')+
  ' · '+(inv.result.payback_months===null?'Keine positive Amortisation':inv.result.payback_months+' Monate Amortisation')+
  ' · '+econMoney(inv.result.monthly_net_eur)+'/Monat</small></div>'+
  '<button type="button" class="secondary small" data-econ-invest-edit="'+inv.id+'">Bearbeiten</button>'+
  '<button type="button" class="text-button" data-econ-invest-delete="'+inv.id+'">Löschen</button></div>'
 ).join(''):'<p class="hint">Noch keine Investitionen gespeichert.</p>';
}
function econInvestmentPreview(){
 const form=$('econ-invest-form');
 const price=econNum(form.elements.purchase_eur.value)+econNum(form.elements.setup_eur.value);
 const monthly=econNum(form.elements.monthly_units.value)*econNum(form.elements.contribution_eur.value)-
  econNum(form.elements.monthly_extra_eur.value);
 $('econ-invest-result').innerHTML='<div class="econ-invest-fig"><small>Investition</small><b>'+econMoney(price)+'</b></div>'+
  '<div class="econ-invest-fig"><small>Zusätzlicher Deckungsbeitrag/Monat</small><b>'+econMoney(monthly)+'</b></div>'+
  '<div class="econ-invest-fig"><small>Amortisation</small><b>'+
  (monthly>0?(price/monthly).toLocaleString('de-DE',{maximumFractionDigits:1})+' Monate':'Nicht erreichbar')+'</b></div>'+
  '<p class="hint">Nur zusätzliche, tatsächlich verkaufbare Stücke zählen. Kapazität ohne Nachfrage bringt keinen Deckungsbeitrag.</p>';
}
function econShowTab(tab){
 economyTab=tab;
 $('econ-cost-pane').hidden=tab!=='cost';
 $('econ-invest-pane').hidden=tab!=='invest';
 document.querySelectorAll('[data-econ-tab]').forEach(b=>{
  const active=b.dataset.econTab===tab;
  b.classList.toggle('selected',active);
  b.setAttribute('aria-pressed',String(active));
 });
}
function econFillInvestForm(inv=null){
 const form=$('econ-invest-form');form.reset();
 economyInvestmentId=inv?.id??null;
 for(const key of ['name','printer','purchase_eur','setup_eur','monthly_units','contribution_eur','monthly_extra_eur','notes']){
  if(inv&&form.elements.namedItem(key))form.elements.namedItem(key).value=inv[key]??'';
 }
 if(!inv)form.elements.printer.value=$('econ-printer').value||'H2D';
 $('econ-invest-edit-status').textContent=inv?'Szenario bearbeiten: '+inv.name:'Neues Investitionsszenario';
 econInvestmentPreview();
}
function econRefresh(){
 if(!economyData)return;
 econRenderSelects();econLoadProfile();econRenderInvestmentList();
 const selected=$('econ-invest-form').elements.printer.value;
 $('econ-invest-form').elements.printer.innerHTML='<option value="">Drucker offen</option>'+
  econSelectOptions(economyData.printers.map(x=>({id:x})),'id',x=>x.id,selected);
 econInvestmentPreview();
}
async function loadEconomics(force=false){
 if(economyLoading||(!force&&economyLoaded))return;
 economyLoading=true;
 try{
  economyData=await api('economics');
  economyLoaded=true;
  econRefresh();
  if(typeof renderPriorityUI==='function')renderPriorityUI();
  if(typeof renderCatalog==='function'&&model)renderCatalog();
 }catch(err){$('econ-message').textContent='Rechner konnte nicht geladen werden: '+err.message;}
 finally{economyLoading=false;}
}
function economicsApprovedFor(item){
 if(!economyData)return [];
 const listing=String(item.listingId||item.listing_id||'');
 const variant=String(item.itemId||item.item_id||'');
 const entries=economyData.profiles.filter(p=>p.listing_id===listing&&(p.variant_id===variant||p.variant_id===''));
 return economyData.printers.filter(printer=>{
  const profile=entries.find(p=>p.printer===printer&&p.variant_id===variant)||
   entries.find(p=>p.printer===printer&&p.variant_id==='');
  return profile?.status==='approved';
 });
}
function economicsPrinterText(listingId,variantId=''){
 if(!economyData)return '';
 const printers=economicsApprovedFor({listingId,itemId:variantId});
 return printers.length?'✓ '+printers.join(' · '):'Druckerfreigabe fehlt';
}
function openEconomicsForProduct(id,variant=''){
 showWorkspace('calculator');
 loadEconomics().then(()=>{
  if(economyLoaded&&model)econRefresh();
  const product=$('econ-product');
  if((model?.products||[]).some(p=>String(p.id)===String(id))){
   product.value=String(id);
   econRenderSelects();
   const p=econProduct();
   $('econ-variant').value=(p?.items||[]).some(i=>String(i.id)===String(variant))?String(variant):'';
   econLoadProfile();econShowTab('cost');
  }
 });
}
$('econ-product').addEventListener('change',()=>{econRenderSelects();$('econ-variant').value='';econLoadProfile();});
for(const id of ['econ-variant','econ-printer'])$(id).addEventListener('change',econLoadProfile);
document.querySelectorAll('[data-econ-tab]').forEach(b=>b.addEventListener('click',()=>econShowTab(b.dataset.econTab)));
$('econ-printer-checklist').addEventListener('click',event=>{
 const button=event.target.closest('[data-econ-printer-pick]');if(!button)return;
 $('econ-printer').value=button.dataset.econPrinterPick;econLoadProfile();
});
$('econ-add-material').addEventListener('click',()=>{
 economyMaterials.push({filament_id:0,grams:0,spool_g:1000});econRenderMaterials();econPreview();
});
$('econ-materials').addEventListener('input',event=>{
 const el=event.target,idx=Number(el.dataset.econMatIndex);
 if(!Number.isInteger(idx)||!economyMaterials[idx])return;
 const field=el.dataset.econMatField;
 if(!['filament_id','grams','spool_g'].includes(field))return;
 economyMaterials[idx][field]=field==='filament_id'?Number(el.value):econNum(el.value);
 econPreview();
});
$('econ-materials').addEventListener('change',event=>{
 const el=event.target;if(!el.dataset.econMatField)return;
 const idx=Number(el.dataset.econMatIndex),field=el.dataset.econMatField;
 if(economyMaterials[idx])economyMaterials[idx][field]=field==='filament_id'?Number(el.value):econNum(el.value);
 econPreview();
});
$('econ-materials').addEventListener('click',event=>{
 const button=event.target.closest('[data-econ-remove]');if(!button)return;
 economyMaterials.splice(Number(button.dataset.econRemove),1);econRenderMaterials();econPreview();
});
$('econ-form').addEventListener('input',econPreview);
$('econ-etsy-toggle').addEventListener('change',()=>{
 econSetMode($('econ-etsy-toggle').checked);
 econPreview();
});
$('econ-fees-refresh').addEventListener('click',async()=>{
 const button=$('econ-fees-refresh');
 button.disabled=true;button.textContent='Prüfe Etsy …';
 try{
  const previous=econNum($('econ-offsite').value);
  const oldRates=economyData?.etsy_fees||{};
  economyData=await api('economics',{action:'refresh-etsy-fees'});
  econApplyFeeRates();
  if(previous&&previous===econNum(oldRates.offsite_standard_percent,15))
   $('econ-offsite').value=String(economyData.etsy_fees.offsite_standard_percent);
  else if(previous&&previous===econNum(oldRates.offsite_reduced_percent,12))
   $('econ-offsite').value=String(economyData.etsy_fees.offsite_reduced_percent);
  econPreview();
  flash('Etsy-Gebühren und EZB-Kurs erfolgreich geprüft. Werte in der aktuellen Maske aktualisiert; bitte speichern.');
 }catch(err){flash('Online-Update nicht möglich: '+err.message,true);}
 finally{button.disabled=false;button.textContent='Gebühren online aktualisieren';}
});
$('econ-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const data={
  action:'save-profile',listing_id:$('econ-product').value,
  variant_id:$('econ-variant').value,printer:$('econ-printer').value,
  status:$('econ-form').elements.status.value,notes:$('econ-form').elements.notes.value,
  fields:econFields(),materials:economyMaterials.filter(m=>Number(m.filament_id)>0).map(m=>({
   filament_id:Number(m.filament_id),grams:Number(m.grams),spool_g:Number(m.spool_g)||1000}))
 };
 const button=$('econ-save');button.disabled=true;
 try{
  economyData=await api('economics',data);econRefresh();
  if(typeof renderPriorityUI==='function')renderPriorityUI();
  if(typeof renderCatalog==='function')renderCatalog();
  flash('Kalkulation und Druckerfreigabe gespeichert.');
 }catch(err){flash(err.message,true);}
 finally{button.disabled=false;}
});
$('econ-invest-form').addEventListener('input',econInvestmentPreview);
$('econ-invest-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=event.target;
 const body={action:'save-investment',id:economyInvestmentId,
  listing_id:$('econ-product').value,variant_id:$('econ-variant').value};
 for(const key of ['name','printer','notes'])body[key]=form.elements[key].value;
 for(const key of ['purchase_eur','setup_eur','monthly_units','contribution_eur','monthly_extra_eur'])
  body[key]=econNum(form.elements[key].value);
 const save=$('econ-invest-save');save.disabled=true;
 try{economyData=await api('economics',body);econRefresh();econFillInvestForm();flash('Investitionsszenario gespeichert.');}
 catch(err){flash(err.message,true);}
 finally{save.disabled=false;}
});
$('econ-invest-new').addEventListener('click',()=>econFillInvestForm());
$('econ-invest-list').addEventListener('click',async event=>{
 const edit=event.target.closest('[data-econ-invest-edit]');
 if(edit){econFillInvestForm(economyData.investments.find(i=>i.id===Number(edit.dataset.econInvestEdit)));return;}
 const del=event.target.closest('[data-econ-invest-delete]');
 if(!del||!confirm('Dieses Investitionsszenario löschen?'))return;
 try{economyData=await api('economics',{action:'delete-investment',id:Number(del.dataset.econInvestDelete)});
  econRenderInvestmentList();flash('Szenario gelöscht.');
 }catch(err){flash(err.message,true);}
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-econ-open]');
 if(button){openEconomicsForProduct(button.dataset.econOpen,button.dataset.econVariant||'');}
});
// Prime printer approvals for the dashboard even if the calculator tab is not opened.
loadEconomics();

