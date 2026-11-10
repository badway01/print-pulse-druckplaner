'use strict';
/* 3MF physical loading guide: only saved profiles provide real slot assignments. */
(() => {
 const assigned=id=>id!==null&&id!==undefined&&String(id).trim()!=='';
 const colorDot=hex=>'<span class="pp-catalog-loading-dot" style="background:'+
  esc(masterSwatchHex(hex))+'"></span>';
 const getProfile=file=>{
  const options=(printTools.profiles||[]).filter(row=>
   String(row.listing_id)===String(file.listing_id)&&row.printer===file.printer);
  return options.find(row=>String(row.variant_id||'')===String(file.variant_id||''))||
   options.find(row=>!row.variant_id)||null;
 };
 const getFilament=(id,profile)=>{
  const stored=(filamentData?.filaments||[]).find(row=>String(row.id)===String(id));
  const saved=(profile?.colors||[]).find(row=>String(row.id)===String(id));
  const library=(printTools.filaments_library||[]).find(row=>String(row.id)===String(id));
  return {
   code:stored?.internal_code||saved?.code||library?.code||'',
   color:stored?.color||saved?.color||library?.name||'Filament '+id,
   brand:stored?.brand||saved?.brand||'',
   material:stored?.material||saved?.material||'',
   hex:stored?.color_hex||saved?.hex||library?.hex||''
  };
 };
 const sourceMarkup=(source,profile)=>{
  const name=source.type==='toolhead'?'Kopf '+String(source.side||'').toUpperCase():
   source.label||(source.type==='ams'?'AMS':source.type==='ams_ht'?'AMS HT':'Externe Spule');
  const slots=(source.slots||[]).map((id,i)=>{
   const slot=source.type==='ams'?'Slot '+(i+1):source.type==='toolhead'?'Filament':'Spule';
   if(!assigned(id))return '<div class="pp-catalog-loading-slot is-empty"><span class="pp-catalog-loading-place">'+
    esc(slot)+'</span><span>frei</span></div>';
   const f=getFilament(id,profile);
   return '<div class="pp-catalog-loading-slot"><span class="pp-catalog-loading-place">'+esc(slot)+'</span>'+
    colorDot(f.hex)+'<span class="pp-catalog-loading-filament"><b>'+
    esc([f.code,f.color].filter(Boolean).join(' · '))+'</b>'+
    ([f.brand,f.material].filter(Boolean).length?'<small>'+
    esc([f.brand,f.material].filter(Boolean).join(' · '))+'</small>':'')+
    '</span></div>';
  }).join('');
  return '<div class="pp-catalog-loading-source"><strong>'+esc(name)+'</strong>'+slots+'</div>';
 };
 const group=(title,sources,profile)=>{
  return '<section class="pp-catalog-loading-group"><h4>'+esc(title)+'</h4>'+
   (sources.length?sources.map(s=>sourceMarkup(s,profile)).join(''):
   '<p class="pp-catalog-loading-empty">Noch nicht zugeordnet</p>')+'</section>';
 };
 window.ppCatalog3mfInfo=function(file){
  const profile=getProfile(file);
  const sources=Array.isArray(profile?.sources)?profile.sources.filter(s=>s&&Array.isArray(s.slots)):[];
  const hasSaved=sources.some(s=>s.slots.some(assigned));
  const printer=String(file.printer||'Drucker');
  let layout='';
  if(printer==='H2D'){
   const left=sources.filter(s=>s.side==='left'),right=sources.filter(s=>s.side==='right');
   const pending=sources.filter(s=>s.side!=='left'&&s.side!=='right');
   layout='<div class="pp-catalog-loading-grid">'+group('Düse links',left,profile)+
    group('Düse rechts',right,profile)+'</div>'+
    (pending.length?'<div class="pp-catalog-loading-unassigned">'+
     group('Düse noch nicht zugeordnet',pending,profile)+'</div>':'');
  }else if(printer==='Snapmaker U1'){
   layout='<div class="pp-catalog-loading-grid">'+['t0','t1','t2','t3'].map(head=>
    group('Kopf '+head.toUpperCase(),sources.filter(s=>s.side===head),profile)).join('')+'</div>';
  }else{
   layout='<div class="pp-catalog-loading-grid pp-catalog-loading-ams">'+
    (sources.length?sources.map(source=>group(source.label||'Filamentzuführung',[source],profile)).join(''):
     group('AMS / Filamentzuführung',[],profile))+'</div>';
  }
  const original=Array.isArray(file.insights?.filaments)?file.insights.filaments:[];
  const consumption=original.length?'<div class="pp-catalog-loading-original">'+
   '<strong>Verbrauch laut 3MF</strong><div class="pp-catalog-loading-original-grid">'+
   original.map(row=>{
    const name=[row.code,row.name].filter(Boolean).join(' · ')||'3MF-Filament';
    const grams=Number.isFinite(row.grams)?Number(row.grams).toLocaleString('de-DE',{maximumFractionDigits:2})+' g':'';
    return '<div class="pp-catalog-loading-original-row">'+colorDot(row.color_hex)+
     '<span>'+esc(name)+'</span>'+(grams?'<b>'+esc(grams)+'</b>':'')+'</div>';
   }).join('')+'</div><small>Farben aus der Druckdatei – keine automatische Zuordnung zu AMS-Slots.</small></div>':'';
  return '<div class="pp-catalog-loading-plan"><div class="pp-catalog-loading-heading">'+
   '<strong>Filamentbelegung · '+esc(printer)+'</strong><span>'+
   (hasSaved?'Gespeichertes Druckprofil':'Zuordnung fehlt')+'</span></div>'+
   (!hasSaved?'<p class="pp-catalog-loading-warning">Noch keine konkrete Belegung für diesen Drucker gespeichert. Nur die Farben aus der 3MF verraten nicht, in welchen Platz sie gehören.</p>':'')+
   layout+consumption+
   '<button type="button" class="pp-catalog-loading-edit" data-catalog-file-edit="'+
   esc(file.id)+'">Belegung bearbeiten</button></div>';
 };
})();
