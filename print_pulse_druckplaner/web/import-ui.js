'use strict';
// Settings-only import administration. This never changes production cards until
// a user explicitly approves new Etsy listings.
let etsyImportItems=[],etsyImportBusy=false,etsyImportScanned=0;
function renderEtsyImports(message=''){
 const rows=$('etsy-import-rows');
 if(!rows)return;
 $('etsy-import-count').hidden=!etsyImportItems.length;
 $('etsy-import-count').textContent=etsyImportItems.length+' neu';
 $('etsy-import-last').textContent=etsyImportScanned
  ?'Letzter Etsy-Produktvergleich: '+new Date(etsyImportScanned*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Berlin'})
  :'Noch kein Produktvergleich durchgeführt. Mit der Suche die aktiven Etsy-Artikel prüfen.';
 $('etsy-import-message').textContent=message;
 $('etsy-import-scan').disabled=etsyImportBusy;
 const all=$('etsy-import-all');
 all.hidden=!etsyImportItems.length;
 all.disabled=etsyImportBusy;
 all.textContent=etsyImportItems.length>20?'Nächste 20 importieren':'Alle fehlenden importieren';
 rows.innerHTML=etsyImportItems.length?etsyImportItems.map(p=>
  '<div class="etsy-import-row"><div><b>'+esc(p.title)+'</b><small>Etsy-ID: '+esc(p.id)+' · Noch nicht importiert</small></div>'+
  '<button type="button" class="secondary small" data-etsy-import-id="'+esc(p.id)+'" '+(etsyImportBusy?'disabled':'')+'>Importieren</button></div>'
 ).join(''):'<p class="hint">Keine neuen aktiven Artikel in der Liste. „Neue Etsy-Artikel suchen“ fragt Etsy direkt ab.</p>';
}
function receiveEtsyImports(data,message=''){
 etsyImportItems=Array.isArray(data.items)?data.items:[];
 etsyImportScanned=Number(data.last_scan)||0;
 renderEtsyImports(message);
}
async function refreshEtsyImports(){
 if(etsyImportBusy)return;
 try{receiveEtsyImports(await api('import-candidates'));}
 catch(err){renderEtsyImports('Vorschläge konnten nicht geladen werden: '+err.message);}
}
async function scanEtsyImports(){
 if(etsyImportBusy)return;
 etsyImportBusy=true;renderEtsyImports('Aktive Etsy-Artikel werden verglichen …');
 let message='';
 try{receiveEtsyImports(await api('import-scan',{}));message='Etsy-Vergleich abgeschlossen.';}
 catch(err){message='Etsy-Suche fehlgeschlagen: '+err.message;}
 finally{etsyImportBusy=false;renderEtsyImports(message);}
}
async function acceptEtsyImports(ids){
 if(etsyImportBusy||!ids.length)return;
 etsyImportBusy=true;renderEtsyImports('Artikel und Varianten werden importiert …');
 let message='';
 try{
  const result=await api('import-products',{ids});
  receiveEtsyImports(result);
  message=result.imported+' Artikel erfolgreich importiert.';
  // Settings dialogs pause polling, so the product catalog is refreshed here.
  setModel(await api('status'),true);
 }catch(err){message='Import fehlgeschlagen: '+err.message;}
 finally{etsyImportBusy=false;renderEtsyImports(message);}
}
$('etsy-import-panel').addEventListener('toggle',()=>{
 if($('etsy-import-panel').open)refreshEtsyImports();
});
$('etsy-import-scan').addEventListener('click',scanEtsyImports);
$('etsy-import-all').addEventListener('click',()=>{
 acceptEtsyImports(etsyImportItems.slice(0,20).map(p=>p.id));
});
$('etsy-import-rows').addEventListener('click',event=>{
 const button=event.target.closest('[data-etsy-import-id]');
 if(button)acceptEtsyImports([button.dataset.etsyImportId]);
});
