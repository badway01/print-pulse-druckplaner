'use strict';
/* Simple new-roll intake: no old purchase/order/receipt workflow. */
(() => {
 const $=id=>document.getElementById(id);
 const dlg=$('filament-quick-dialog'),form=$('filament-quick-form');
 if(!dlg||!form)return;
 const filaments=()=>filamentData?.filaments||[];
 let submitting=false,requestKey='',resumeNewColor=false,returnToRoll=null;

 const money=c=>c==null?'Preis unbekannt':(c/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
 function euroCents(raw){
  const value=String(raw||'').trim().replace(/€/g,'').replace(/\s/g,'');
  if(!value)return null;
  const v=value.includes(',')?value.replace(/\./g,'').replace(',','.'):value;
  if(!/^\d{1,5}(?:\.\d{1,2})?$/.test(v))return NaN;
  const [whole,fraction='']=v.split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
 }
 function current(){
  return filaments().find(f=>f.id===Number($('filament-quick-id').value));
 }
 function viewError(message){
  const notice=$('filament-quick-error');
  notice.textContent=message||'';
  notice.hidden=!message;
 }
 function regenerateKey(){
  requestKey=(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):
   Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''));
 }
 function refillOptions(preferredId){
  const selected=preferredId??Number($('filament-quick-id').value);
  const options=filaments().slice().sort((a,b)=>
   (a.brand+' '+a.material+' '+a.color).localeCompare(b.brand+' '+b.material+' '+b.color,'de'));
  const chooser=$('filament-quick-id');
  chooser.replaceChildren();
  if(!options.length){
   chooser.add(new Option('Noch keine Farbe angelegt',''));
  }else for(const f of options){
   const name=[f.brand,f.material,f.color,
    f.internal_code?'Intern '+f.internal_code:'',f.manufacturer_code?'#'+f.manufacturer_code:''].filter(Boolean).join(' · ');
   chooser.add(new Option(name,String(f.id)));
  }
  if(options.some(f=>f.id===selected))chooser.value=String(selected);
 }
 function preview(){
  const f=current();
  const amount=Number($('filament-quick-quantity').value);
  const cents=euroCents($('filament-quick-price').value);
  const box=$('filament-quick-preview');
  if(!f){box.textContent='Lege zuerst eine Farbe an.';return;}
  const old=f.stock_qty||0;
  const priceText=f.price_cents==null?'noch kein Preis hinterlegt':money(f.price_cents);
  let html='<strong>Aktuell: '+old+' volle Rollen · Preisbasis '+priceText+'</strong>';
  if(Number.isInteger(amount)&&amount>=1&&amount<=500&&Number.isInteger(cents)&&cents>=0){
   const weight=f.price_cents==null?0:old;
   const newPrice=Math.floor((weight*(f.price_cents||0)+amount*cents+(weight+amount)/2)/(weight+amount));
   html+='<span>Nach Eingang: <b>'+(old+amount)+' volle Rollen</b> · GLD <b>'+money(newPrice)+'</b> je Rolle</span>';
   if(old&&!weight)html+='<small>Achtung: Für die bisherigen Rollen fehlt eine Preisbasis. Der GLD startet nur mit dem neuen Einkaufspreis.</small>';
  }else html+='<span>Stückzahl und tatsächlichen Preis je Rolle eintragen.</span>';
  box.innerHTML=html;
 }
 function open(preferredId=null){
  if($('filament-rolls')?.open){
   returnToRoll=Number($('filament-rolls').dataset.filamentId);
   $('filament-rolls').close();
  }else returnToRoll=null;
  refillOptions(preferredId);
  form.reset();
  $('filament-quick-quantity').value='1';
  $('filament-quick-price').value='';
  if(preferredId!=null)$('filament-quick-id').value=String(preferredId);
  regenerateKey();
  viewError('');
  preview();
  if(!dlg.open)dlg.showModal();
  if(preferredId!=null)$('filament-quick-quantity').focus();
  else $('filament-quick-id').focus();
 }
 function close(){
  if(submitting)return;
  dlg.close();viewError('');
 }
 $('filament-quick-close').addEventListener('click',close);
 $('filament-quick-top').addEventListener('click',()=>open());
 $('filament-roll-add').addEventListener('click',()=>{
  open(Number($('filament-rolls').dataset.filamentId));
 });
 for(const name of ['filament-quick-id','filament-quick-quantity','filament-quick-price']){
  $(name).addEventListener(name==='filament-quick-id'?'change':'input',preview);
 }
 $('filament-quick-new-color').addEventListener('click',()=>{
  if(submitting)return;
  resumeNewColor=true;
  dlg.close();
  if($('filament-rolls')?.open)$('filament-rolls').close();
  openFilamentEditor(null);
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(submitting)return;
  const f=current();
  if(!f){viewError('Bitte zuerst eine Filamentfarbe auswählen oder neu anlegen.');return;}
  const qty=Number($('filament-quick-quantity').value);
  const price=euroCents($('filament-quick-price').value);
  if(!Number.isInteger(qty)||qty<1||qty>500){viewError('Bitte 1 bis 500 neue Rollen eingeben.');return;}
  if(!Number.isInteger(price)||price<0||price>500000){
   viewError('Preis je Rolle bitte in Euro eingeben, z. B. 12,90.');return;
  }
  submitting=true;viewError('');
  const btn=$('filament-quick-save'),label=btn.textContent;
  btn.disabled=true;btn.textContent='Rollen werden eingebucht …';
  try{
   const booked=await api('filament-quick-book',{
    filament_id:f.id,quantity:qty,unit_price_cents:price,request_key:requestKey
   });
   filamentData=await api('filaments');
   renderFilaments();
   window.ppFilamentStats?.refresh?.(true);
   if(!booked||booked.stock_qty!==f.stock_qty+qty){
    // Idempotent retry may have already booked after a connection interruption.
    // Reload exact stock; never rebook with a new key just for display.
    const after=filaments().find(x=>x.id===f.id);
    if(!booked?.replayed&&after?.stock_qty!==f.stock_qty+qty)
     throw Error('Bestand wurde nicht eindeutig bestätigt. Bitte aktualisieren und prüfen.');
   }
   dlg.close();
   if(typeof flash==='function'){
    flash(qty+' neue '+(qty===1?'Rolle':'Rollen')+' eingebucht · GLD '+money(booked.gld_cents));
   }
   if(returnToRoll!=null)openFilamentRolls(returnToRoll);
   returnToRoll=null;
   regenerateKey();
  }catch(ex){viewError(ex.message||'Buchung fehlgeschlagen. Bitte erneut versuchen.');}
  finally{submitting=false;btn.disabled=false;btn.textContent=label;}
 });
 // If the user creates a new colour inside the existing catalog editor,
 // reopen the direct-booking dialog with that colour already selected.
 window.ppFilamentQuick={
  open,
  resumeAfterColor(id){
   if(!resumeNewColor)return;
   resumeNewColor=false;
   open(id);
  }
 };
})();