'use strict';
/* Print & Pulse: charge-based, live calculator. Only /api/economics can persist. */
let economyData=null,economyLoaded=false,economyLoading=false;
let economyMaterials=[],economyProfile=null,economyInvestmentId=null,economyTab='cost';
let econPrinterDraft=null;
const econDefaults={
 batch_units:1,minutes:0,power_watts:120,energy_eur_kwh:.35,machine_eur_hour:0,
 labor_minutes:0,labor_eur_hour:0,packaging_eur:0,other_eur:0,selling_eur:0,
 shipping_paid_eur:0,shipping_cost_eur:0,etsy_percent:10.5,etsy_fixed_eur:.30,
 additional_fee_eur:0,etsy_enabled:1,offsite_percent:0,listing_fee_eur:.18,
 units_per_order:1,calc_version:2,sales_units:1,orders_count:1,discount_percent:0,
 shipping_free:0,overhead_enabled:0
};
const econMoney=n=>n===null||n===undefined||!Number.isFinite(Number(n))?'—':
 Number(n).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const econNum=(v,fallback=0)=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)&&n>=0?n:fallback;};
const econPositive=(v,fallback=1)=>Math.max(1,Math.floor(econNum(v,fallback)));
const econEsc=x=>esc(String(x??''));
const econSetting=()=>economyData?.cost_settings||{};
const econProduct=()=>((typeof model!=='undefined'&&model?.products)||[]).find(p=>String(p.id)===$('econ-product').value);
const econProfileKey=()=>[$('econ-product').value,$('econ-variant').value,$('econ-printer').value].join(':');
const econPick=()=>economyData?.profiles.find(p=>[p.listing_id,p.variant_id,p.printer].join(':')===econProfileKey())||null;
const econSelectOptions=(rows,key,label,selected)=>rows.map(r=>'<option value="'+econEsc(r[key])+'" '+(String(r[key])===String(selected)?'selected':'')+'>'+econEsc(label(r))+'</option>').join('');
function econProductsMarkup(selected){
 return '<option value="">Produkt wählen …</option>'+econSelectOptions(
  (model?.products||[]).filter(p=>p.state==='active'),'id',p=>p.title,selected);
}
function econRenderSelects(){
 if(!economyData||!model)return;
 const selected=$('econ-product').value||(model.products||[]).find(p=>p.state==='active')?.id||'';
 $('econ-product').innerHTML=econProductsMarkup(selected);$('econ-product').value=String(selected);
 const p=econProduct(),variant=$('econ-variant').value;
 $('econ-variant').innerHTML='<option value="">Standard / alle Varianten</option>'+
  (p?.items||[]).map(i=>'<option value="'+econEsc(i.id)+'">'+econEsc(i.label)+'</option>').join('');
 if((p?.items||[]).some(i=>String(i.id)===variant))$('econ-variant').value=variant;
 const printer=$('econ-printer').value||'H2D';
 $('econ-printer').innerHTML=econSelectOptions(economyData.printers.map(id=>({id})),'id',r=>r.id,printer);
}
function econSortedFilaments(){
 const key=f=>{const n=String(f.internal_code||'').match(/\d+/);return n?Number(n[0]):Number.MAX_SAFE_INTEGER;};
 return [...(economyData?.filaments||[])].sort((a,b)=>key(a)-key(b)||
  String(a.internal_code||'').localeCompare(String(b.internal_code||''),'de',{numeric:true})||
  (a.color||'').localeCompare(b.color||'','de'));
}
function econSpoolOptions(id,search=''){
 const q=String(search||'').toLocaleLowerCase('de').trim();
 const options=econSortedFilaments().filter(f=>!q||[f.internal_code,f.color,f.brand,f.material,f.manufacturer_code,f.color_hex].some(t=>String(t||'').toLocaleLowerCase('de').includes(q))||Number(id)===f.id);
 return '<option value="">Filament wählen …</option>'+options.map(f=>{
  const label=(f.internal_code?'#'+f.internal_code+' · ':'')+f.color+' · '+f.brand+' · '+f.material+
   (f.manufacturer_code?' · '+f.manufacturer_code:'')+
   (f.price_cents===null?' · Preis fehlt':' · '+econMoney(f.price_cents/100)+' / '+(f.spool_g||1000)+' g');
  return '<option value="'+f.id+'" '+(Number(id)===f.id?'selected':'')+'>'+econEsc(label)+'</option>';
 }).join('');
}
function econMaterialInfo(m){
 const f=economyData?.filaments?.find(x=>x.id===Number(m.filament_id));
 if(!f)return 'Bitte Filament auswählen';
 if(f.price_cents===null)return 'Kein Preis im Filamentlager hinterlegt';
 const weight=econNum(m.spool_g,f.spool_g||1000)||1000;
 return econMoney(f.price_cents/100)+' / '+weight+' g · '+econMoney(f.price_cents/100/weight)+' pro g';
}
function econRenderMaterials(){
 const el=$('econ-materials');if(!el)return;
 if(!economyMaterials.length)economyMaterials=[{filament_id:0,grams:0,spool_g:1000,search:''}];
 el.innerHTML=economyMaterials.map((m,i)=>'<div class="econ-material-line" data-econ-material="'+i+'">'+
  '<label class="econ-filament-field">Farbe / Lagernummer suchen<input data-econ-search="'+i+'" type="search" placeholder="z. B. 26, Weiß, Bambu…" value="'+econEsc(m.search||'')+'">'+
  '<select aria-label="Filament '+(i+1)+'" data-econ-mat-field="filament_id" data-econ-mat-index="'+i+'">'+econSpoolOptions(m.filament_id,m.search)+'</select></label>'+
  '<label>Gesamtverbrauch (g)<input type="number" min="0" max="100000" step=".01" inputmode="decimal" data-econ-mat-field="grams" data-econ-mat-index="'+i+'" value="'+econEsc(m.grams)+'"></label>'+
  '<small class="econ-mat-info" data-econ-mat-info="'+i+'">'+econEsc(econMaterialInfo(m))+'</small>'+
  '<details class="econ-mat-weight"><summary>Spulengewicht</summary><label>Gramm je Spule<input type="number" min="1" step="1" data-econ-mat-field="spool_g" data-econ-mat-index="'+i+'" value="'+econEsc(m.spool_g||1000)+'"></label></details>'+
  (economyMaterials.length>1?'<button class="secondary small" type="button" data-econ-remove="'+i+'">Entfernen</button>':'')+'</div>').join('');
}
function econSuggestionMaterials(){
 const lid=$('econ-product').value,v=$('econ-variant').value,p=$('econ-printer').value;
 const profiles=(typeof printTools!=='undefined'&&printTools?.profiles)||[];
 const found=profiles.find(x=>x.listing_id===lid&&x.variant_id===v&&x.printer===p)||
  profiles.find(x=>x.listing_id===lid&&x.variant_id===''&&x.printer===p);
 const ids=[...new Set((found?.sources||[]).flatMap(x=>x.slots||[]).map(Number).filter(Number.isInteger))];
 return ids.filter(id=>economyData.filaments.some(f=>f.id===id)).map(id=>({
  filament_id:id,grams:0,spool_g:economyData.filaments.find(f=>f.id===id).spool_g||1000,search:''
 }));
}
function econRenderPrinterChecklist(){
 const el=$('econ-printer-checklist');if(!el||!economyData)return;
 const lid=$('econ-product').value,v=$('econ-variant').value;
 el.innerHTML=economyData.printers.map(name=>{
  const p=economyData.profiles.find(p=>p.listing_id===lid&&p.variant_id===v&&p.printer===name);
  const status=p?.status||'untested';
  return '<button type="button" class="econ-printer-chip '+econEsc(status)+(name===$('econ-printer').value?' active':'')+'" data-econ-printer-pick="'+econEsc(name)+'"><b>'+econEsc(name)+'</b><small>'+
   (status==='approved'?'✓ Freigegeben':status==='issue'?'! Nachbessern':'— Nicht freigegeben')+'</small></button>';
 }).join('');
}
const econDurationDisplay=total=>Math.floor(econNum(total)/60)+' Std. '+String(Math.round(econNum(total)%60)).padStart(2,'0')+' Min.';
function econRenderFeeRates(){
 const r=economyData?.etsy_fees||{};
 const time=r.checked_at?new Date(r.checked_at*1000).toLocaleDateString('de-DE'):'hinterlegte Ausgangswerte';
 $('econ-fees-checked').textContent='Stand: '+time;
 $('econ-fees-status').innerHTML='<span>Transaktion <b>'+econNum(r.transaction_percent,6.5)+' %</b></span>'+
 '<span>Etsy Payments <b>'+econNum(r.payments_percent,4)+' % + '+econMoney(r.payments_fixed_eur??.30)+'/Bestellung</b></span>'+
 '<span>Listing <b>'+econNum(r.listing_usd??.2).toFixed(2)+' USD</b></span>'+
 '<span>EUR/USD: <b>'+econNum(econSetting().eur_per_usd,.92)+' € je USD (einstellbar)</b></span>';
}
function econLoadProfile(){
 economyProfile=econPick();const fields={...econDefaults,...(economyProfile?.fields||{})},form=$('econ-form');
 for(const [key,value] of Object.entries(fields)){
  let el=form.elements.namedItem(key);if(el&&el.type!=='checkbox')el.value=value;
 }
 $('econ-hours').value=Math.floor(econNum(fields.minutes)/60);
 $('econ-minutes').value=Math.round(econNum(fields.minutes)%60);
 form.elements.shipping_free.checked=Boolean(fields.shipping_free);
 form.elements.overhead_enabled.checked=Boolean(fields.overhead_enabled??econSetting().use_overhead);
 $('econ-channel').value=fields.etsy_enabled?'etsy':'direct';
 form.elements.status.value=economyProfile?.status||'untested';
 form.elements.notes.value=economyProfile?.notes||'';
 economyMaterials=economyProfile?.materials.map(m=>({...m,search:''}))||econSuggestionMaterials();
 if(!economyMaterials.length)economyMaterials=[{filament_id:0,grams:0,spool_g:1000,search:''}];
 econRenderMaterials();econRenderFeeRates();econRenderPrinterChecklist();econPreview();
 $('econ-record').textContent=economyProfile?'Gespeichert '+new Date(economyProfile.updated*1000).toLocaleString('de-DE'):'Noch keine Kalkulation gespeichert';
}
function econFields(){
 const form=$('econ-form'),f={...econDefaults};
 for(const key of Object.keys(f)){
  const el=form.elements.namedItem(key);
  if(el&&el.type!=='checkbox'&&key!=='minutes'&&key!=='etsy_enabled'&&key!=='calc_version')f[key]=econNum(el.value,f[key]);
 }
 f.batch_units=econPositive(f.batch_units);f.sales_units=econPositive(f.sales_units);f.orders_count=econPositive(f.orders_count);
 f.minutes=Math.floor(econNum($('econ-hours').value))*60+Math.min(59,Math.floor(econNum($('econ-minutes').value)));
 f.etsy_enabled=$('econ-channel').value==='etsy'?1:0;f.calc_version=2;
 f.shipping_free=form.elements.shipping_free.checked?1:0;
 f.overhead_enabled=form.elements.overhead_enabled.checked?1:0;
 return f;
}
function econRounded(amount,mode){
 const p=Math.max(0,amount);if(mode==='90'||mode==='99'){const x=mode==='90'?.90:.99;return Math.round(Math.max(x,Math.ceil(p-x-1e-9)+x)*100)/100;}
 return Math.ceil((p-1e-9)*100)/100;
}
function econCalculation(){
 const f=econFields(),cfg=econSetting(),printer=cfg.printers?.[$('econ-printer').value]||
  {power_watts:120,purchase_eur:0,depreciation_years:4,annual_hours:1000,maintenance_eur_year:0};
 const rates=economyData?.etsy_fees||{};
 let material=0;const missing=[];
 for(const part of economyMaterials){
  if(!part.filament_id||!econNum(part.grams))continue;
  const spool=economyData.filaments.find(x=>x.id===Number(part.filament_id));
  if(!spool||spool.price_cents===null){missing.push(spool?spool.color:'Filament');continue;}
  material+=econNum(part.grams)*spool.price_cents/100/Math.max(1,econNum(part.spool_g,spool.spool_g||1000));
 }
 const units=f.batch_units,sold=f.sales_units,orders=f.orders_count,hours=f.minutes/60;
 const energy=hours*econNum(printer.power_watts,120)/1000*econNum(cfg.energy_eur_kwh,.35);
 const machineHour=econNum(printer.purchase_eur)/Math.max(.01,econNum(printer.depreciation_years,4)*econNum(printer.annual_hours,1000))+
  econNum(printer.maintenance_eur_year)/Math.max(.01,econNum(printer.annual_hours,1000));
 const machine=hours*machineHour,failed=(material+energy+machine)*econNum(cfg.failure_percent,5)/100;
 const batch=material+energy+machine+failed,unit=batch/units;
 const overhead=f.overhead_enabled?econNum(cfg.monthly_overhead_eur)/Math.max(1,econNum(cfg.monthly_sold_units,100)):0;
 const extras=f.labor_minutes/60*econNum(cfg.labor_eur_hour)+f.packaging_eur+f.other_eur+overhead;
 const production=(unit+extras)*sold+f.shipping_cost_eur*orders;
 const etsy=Boolean(f.etsy_enabled),vat=etsy?econNum(cfg.fee_vat_percent)/100:0;
 const rate=etsy?(econNum(rates.transaction_percent,6.5)+econNum(rates.payments_percent,4)+f.offsite_percent)/100*(1+vat):0;
 const fixed=etsy?((econNum(rates.listing_usd,.20)*econNum(cfg.eur_per_usd,.92)+f.additional_fee_eur)*sold+
  econNum(rates.payments_fixed_eur,.30)*orders)*(1+vat):0;
 const discount=f.discount_percent/100,shipping=f.shipping_free?0:f.shipping_paid_eur*orders;
 const revenue=f.selling_eur*sold*(1-discount)+shipping,fees=rate*revenue+fixed,profit=revenue-production-fees;
 const tiers={};
 for(const [name,key] of [['break_even','break_even_margin'],['minimum','minimum_margin'],['standard','standard_margin'],['luxury','luxury_margin']]){
  const target=econNum(cfg[key],name==='standard'?40:name==='luxury'?60:name==='minimum'?20:0);
  const divisor=1-rate-target/100;
  if(divisor<=0||discount>=1){tiers[name]={price_eur:null,target_margin:target,margin_percent:null};continue;}
  const needed=(production+fixed)/divisor;
  const price=econRounded(Math.max(0,(needed-shipping)/(sold*(1-discount))),cfg.rounding||'none');
  const gross=price*sold*(1-discount)+shipping;
  tiers[name]={price_eur:price,target_margin:target,margin_percent:gross>0?(gross*(1-rate)-production-fixed)/gross*100:null};
 }
 const hasMat=economyMaterials.some(m=>Number(m.filament_id)&&econNum(m.grams)>0);
 return {material,energy,machine,failed,batch,unit,extras,production,revenue,fees,profit,tiers,
  rate,missing,hasMat,complete:hasMat&&f.minutes>0&&!missing.length,etsy,sold,orders,
  margin:revenue>0?profit/revenue*100:null};
}
function econPreview(){
 if(!economyData)return;
 const f=econFields(),r=econCalculation(),cfg=econSetting(),ok=r.complete;
 document.querySelectorAll('#econ-form .econ-etsy-only').forEach(el=>el.hidden=!r.etsy);
 const tiers=$('econ-prices'),labels=[['break_even','Break-even','break-even'],['minimum','Untergrenze','minimum'],
  ['standard','Standard','standard'],['luxury','Luxus','luxury']];
 $('econ-price-main').textContent=ok?econMoney(r.tiers.standard.price_eur):'—';
 tiers.innerHTML=labels.map(([key,label,tone])=>'<div class="econ-price-card '+tone+'"><span>'+label+'</span>'+
  '<strong>'+econMoney(ok?r.tiers[key].price_eur:null)+'</strong>'+
  '<small>'+econNum(r.tiers[key].target_margin)+' % Ziel · erreicht '+
  (ok&&r.tiers[key].margin_percent!==null?r.tiers[key].margin_percent.toLocaleString('de-DE',{maximumFractionDigits:1})+' %':'—')+'</small></div>').join('');
 const line=(name,val)=>'<div class="econ-result-row"><span>'+econEsc(name)+'</span><strong>'+econMoney(ok?val:null)+'</strong></div>';
 const incomplete=!ok?'<div class="econ-warning">Für eine zuverlässige Empfehlung bitte Filament, Gramm, Gesamtdruckzeit und einen hinterlegten Filamentpreis eingeben'+
  (r.missing.length?': '+econEsc(r.missing.join(', ')):'')+'.</div>':'';
 $('econ-results').innerHTML=incomplete+
  line('Material · gesamte Charge',r.material)+line('Strom · gesamte Charge',r.energy)+
  line('Maschine / Abschreibung',r.machine)+line('Fehldruckreserve',r.failed)+
  '<div class="econ-total">'+line('Gesamtkosten der Druckcharge',r.batch)+line('Produktionskosten je Stück',r.unit)+'</div>'+
  line('Zusätzliche Kosten je verkauftem Stück',r.extras)+line('Versand & weitere Auftragskosten',r.production-(r.unit+r.extras)*r.sold)+
  line('Etsy-Gebühren · alle Bestellungen',r.fees)+
  '<div class="econ-total">'+line('Gesamtkosten inkl. Vertrieb',r.production+r.fees)+
  line('Umsatz mit aktuellem Verkaufspreis',r.revenue)+
  line('Tatsächlicher Gewinn nach Gebühren',r.profit)+'</div>'+
  '<small>Charge: '+f.batch_units+' gedruckt · '+r.sold+' verkauft · '+r.orders+' Bestellung(en). '+
  'Gewinnmarge auf Umsatz: <b>'+(ok&&r.margin!==null?r.margin.toLocaleString('de-DE',{maximumFractionDigits:1})+' %':'—')+'</b>. '+
  (r.etsy?'Etsy-Gebühren inkl. konfigurierter USt.':'Keine Etsy-Gebühren bei Direktverkauf.')+'</small>';
 const comparisons=(economyData.profiles||[]).filter(p=>p.listing_id===$('econ-product').value&&
  p.variant_id===$('econ-variant').value&&p.status==='approved');
 $('econ-comparison').innerHTML=comparisons.length?comparisons.map(p=>'<div class="econ-compare-row"><b>'+econEsc(p.printer)+'</b><span>'+
  econDurationDisplay(p.result.minutes_per_unit||0)+'/Stück</span><span>'+econMoney(p.result.print_eur)+'</span><span class="econ-verified">✓ freigegeben</span></div>').join(''):
  '<p class="hint">Noch keine erfolgreich getesteten Drucker für diese Variante hinterlegt.</p>';
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

$('econ-product').addEventListener('change',()=>{ $('econ-variant').value='';econRenderSelects();econLoadProfile(); });
for(const id of ['econ-variant','econ-printer'])$(id).addEventListener('change',econLoadProfile);
$('econ-channel').addEventListener('change',econPreview);
document.querySelectorAll('[data-econ-tab]').forEach(b=>b.addEventListener('click',()=>econShowTab(b.dataset.econTab)));
$('econ-printer-checklist').addEventListener('click',e=>{
 const button=e.target.closest('[data-econ-printer-pick]');if(!button)return;
 $('econ-printer').value=button.dataset.econPrinterPick;econLoadProfile();
});
$('econ-add-material').addEventListener('click',()=>{
 economyMaterials.push({filament_id:0,grams:0,spool_g:1000,search:''});econRenderMaterials();econPreview();
});
$('econ-materials').addEventListener('input',e=>{
 const el=e.target,idx=Number(el.dataset.econMatIndex??el.dataset.econSearch);
 if(!Number.isInteger(idx)||!economyMaterials[idx])return;
 const m=economyMaterials[idx];
 if(el.dataset.econSearch!==undefined){
  m.search=el.value;
  const select=$('econ-materials').querySelector('[data-econ-material="'+idx+'"] select[data-econ-mat-field="filament_id"]');
  const previous=select.value;select.innerHTML=econSpoolOptions(m.filament_id,m.search);
  select.value=previous;return;
 }
 const key=el.dataset.econMatField;
 if(key==='grams'||key==='spool_g'){m[key]=econNum(el.value);econPreview();}
});
$('econ-materials').addEventListener('change',e=>{
 const el=e.target,idx=Number(el.dataset.econMatIndex);
 if(!Number.isInteger(idx)||!economyMaterials[idx])return;
 const key=el.dataset.econMatField;if(!key)return;
 const m=economyMaterials[idx];
 if(key==='filament_id'){
  m.filament_id=Number(el.value);
  const f=economyData.filaments.find(x=>x.id===m.filament_id);
  m.spool_g=f?.spool_g||1000;
  const weight=$('econ-materials').querySelector('[data-econ-material="'+idx+'"] [data-econ-mat-field="spool_g"]');
  if(weight)weight.value=m.spool_g;
 }else m[key]=econNum(el.value);
 const info=$('econ-materials').querySelector('[data-econ-mat-info="'+idx+'"]');
 if(info)info.textContent=econMaterialInfo(m);
 econPreview();
});
$('econ-materials').addEventListener('click',e=>{
 const b=e.target.closest('[data-econ-remove]');if(!b)return;
 economyMaterials.splice(Number(b.dataset.econRemove),1);econRenderMaterials();econPreview();
});
$('econ-form').addEventListener('input',e=>{if(!e.target.closest('#econ-materials'))econPreview();});
$('econ-form').addEventListener('change',econPreview);
$('econ-fees-refresh').addEventListener('click',async()=>{
 const b=$('econ-fees-refresh');b.disabled=true;
 try{economyData=await api('economics',{action:'refresh-etsy-fees'});econRenderFeeRates();econPreview();flash('Offizielle Gebühren aktualisiert.');}
 catch(err){flash('Gebührenprüfung: '+err.message,true);}
 finally{b.disabled=false;}
});
function econPayload(approval=false){
 const f=econFields();
 return {action:'save-profile',listing_id:$('econ-product').value,variant_id:$('econ-variant').value,
  printer:$('econ-printer').value,fields:f,
  materials:economyMaterials.filter(m=>m.filament_id).map(m=>({
   filament_id:Number(m.filament_id),grams:econNum(m.grams),spool_g:econNum(m.spool_g,1000)||1000})),
  ...(approval?{approval_change:true,status:$('econ-form').elements.status.value,
  notes:$('econ-form').elements.notes.value}:{})};
}
async function econSave(approval=false){
 const b=$(approval?'econ-approval-save':'econ-save');b.disabled=true;
 try{economyData=await api('economics',econPayload(approval));econRefresh();
  if(typeof renderPriorityUI==='function')renderPriorityUI();
  if(typeof renderCatalog==='function')renderCatalog();
  flash(approval?'Druckerfreigabe ausdrücklich gespeichert.':'Kalkulation gespeichert. Freigabestatus unverändert.');
 }catch(err){flash(err.message,true);}finally{b.disabled=false;}
}
$('econ-form').addEventListener('submit',e=>{e.preventDefault();econSave(false);});
$('econ-approval-save').addEventListener('click',()=>econSave(true));
$('econ-catalog-save').addEventListener('click',async()=>{
 const b=$('econ-catalog-save');b.disabled=true;
 try{
  await econSave(false);
  economyData=await api('economics',{action:'save-catalog-recommendation',
   listing_id:$('econ-product').value,variant_id:$('econ-variant').value,printer:$('econ-printer').value});
  flash('Preisempfehlung vorgemerkt – Etsy-Preis nicht verändert.');
 }catch(err){flash(err.message,true);}finally{b.disabled=false;}
});
const ECON_SETTINGS_FIELDS=[
 ['energy_eur_kwh','Strompreis (€ / kWh)'],['labor_eur_hour','Arbeitsstundensatz (€)'],
 ['failure_percent','Fehldruckreserve (%)'],['fee_vat_percent','USt. auf Etsy-Verkäufergebühren (%)'],
 ['eur_per_usd','EUR je USD für Listinggebühr'],['listing_usd','Etsy-Listinggebühr (USD)'],
 ['monthly_overhead_eur','Monatliche Fixkosten (€)'],['monthly_sold_units','Erwartete verkaufte Stück / Monat'],
 ['break_even_margin','Break-even-Marge (%)'],['minimum_margin','Untergrenze (%)'],
 ['standard_margin','Standardmarge (%)'],['luxury_margin','Luxusmarge (%)']
];
const ECON_PRINTER_FIELDS=[
 ['power_watts','Durchschnittliche Leistung (W)'],['purchase_eur','Anschaffung (€)'],
 ['depreciation_years','Abschreibungsdauer (Jahre)'],['annual_hours','Betriebsstunden / Jahr'],
 ['maintenance_eur_year','Wartung (€ / Jahr)']
];
function econSettingInputs(items,values,prefix){
 return items.map(([key,label])=>'<label>'+econEsc(label)+'<input type="number" name="'+prefix+key+
 '" data-econ-setting="'+econEsc(key)+'" min="0" step="any" value="'+econEsc(values[key]??0)+'"></label>').join('');
}
function econRenderPrinterSettings(){
 const name=$('econ-settings-printer').value;
 $('econ-printer-settings-fields').innerHTML=econSettingInputs(ECON_PRINTER_FIELDS,
  econPrinterDraft[name]||{},'printer_');
}
$('econ-settings-open').addEventListener('click',()=>{
 const cfg=econSetting();
 econPrinterDraft=JSON.parse(JSON.stringify(cfg.printers||{}));
 $('econ-settings-fields').innerHTML=econSettingInputs(ECON_SETTINGS_FIELDS,cfg,'global_')+
 '<label>Preisrundung<select name="rounding"><option value="none">Centgenau</option><option value="90">Auf ,90 €</option><option value="99">Auf ,99 €</option></select></label>'+
 '<label class="econ-inline-check"><input type="checkbox" name="use_overhead"> Fixkosten standardmäßig berücksichtigen</label>';
 $('econ-settings-form').elements.rounding.value=cfg.rounding||'none';
 $('econ-settings-form').elements.use_overhead.checked=Boolean(cfg.use_overhead);
 $('econ-settings-printer').innerHTML=econSelectOptions(economyData.printers.map(id=>({id})),'id',r=>r.id,$('econ-printer').value);
 $('econ-settings-printer').value=$('econ-printer').value;
 econRenderPrinterSettings();
 $('econ-cost-settings').showModal();
});
$('econ-settings-printer').addEventListener('change',econRenderPrinterSettings);
$('econ-printer-settings-fields').addEventListener('input',e=>{
 if(!e.target.dataset.econSetting)return;
 econPrinterDraft[$('econ-settings-printer').value][e.target.dataset.econSetting]=econNum(e.target.value);
});
document.querySelectorAll('[data-econ-settings-close]').forEach(b=>b.addEventListener('click',()=>$('econ-cost-settings').close()));
$('econ-settings-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.target,settings={printers:econPrinterDraft,rounding:form.elements.rounding.value,
  use_overhead:form.elements.use_overhead.checked};
 for(const [key] of ECON_SETTINGS_FIELDS)settings[key]=econNum(form.elements['global_'+key].value);
 try{
  economyData=await api('economics',{action:'save-cost-settings',settings});
  $('econ-cost-settings').close();econRefresh();flash('Zentrale Kostenstandards gespeichert.');
 }catch(err){flash(err.message,true);}
});
$('econ-invest-form').addEventListener('input',econInvestmentPreview);
$('econ-invest-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.target;
 const body={action:'save-investment',id:economyInvestmentId,
  listing_id:$('econ-product').value,variant_id:$('econ-variant').value};
 for(const key of ['name','printer','notes'])body[key]=form.elements[key].value;
 for(const key of ['purchase_eur','setup_eur','monthly_units','contribution_eur','monthly_extra_eur'])body[key]=econNum(form.elements[key].value);
 const b=$('econ-invest-save');b.disabled=true;
 try{economyData=await api('economics',body);econRefresh();econFillInvestForm();flash('Investition gespeichert.');}
 catch(err){flash(err.message,true);}finally{b.disabled=false;}
});
$('econ-invest-new').addEventListener('click',()=>econFillInvestForm());
$('econ-invest-list').addEventListener('click',async event=>{
 const edit=event.target.closest('[data-econ-invest-edit]');
 if(edit){econFillInvestForm(economyData.investments.find(i=>i.id===Number(edit.dataset.econInvestEdit)));return;}
 const del=event.target.closest('[data-econ-invest-delete]');
 if(!del||!confirm('Dieses Szenario löschen?'))return;
 try{economyData=await api('economics',{action:'delete-investment',id:Number(del.dataset.econInvestDelete)});
  econRenderInvestmentList();flash('Szenario gelöscht.');}
 catch(err){flash(err.message,true);}
});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-econ-open]');
 if(b)openEconomicsForProduct(b.dataset.econOpen,b.dataset.econVariant||'');
});
loadEconomics();
