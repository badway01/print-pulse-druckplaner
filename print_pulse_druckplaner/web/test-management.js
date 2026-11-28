'use strict';
/* Experimental read-only planner. No POST, no shared production mutations. */
(function(){
const N=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):0;
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/ß/g,'ss').trim();
const compact=v=>norm(v).replace(/[^a-z0-9]/g,'');
const fields=l=>String(l.variant||'').split(' · ').map(x=>{const i=x.indexOf(':');return i<0?null:{name:x.slice(0,i).trim(),value:x.slice(i+1).trim()};}).filter(Boolean);
function setInfo(line){
 const matches=fields(line).filter(x=>/^(set|setgroesse|setgrosse|setanzahl|stuckzahl|anzahl|packung|menge|quantity|setsize)$/.test(compact(x.name))||/^\d{1,2}\s*er\s*[- ]?\s*set$|^einzelstuck$/i.test(norm(x.value)));
 const parse=v=>{const s=norm(v);if(/^(einzel(stuck|figur|set)?|single|1(er)?(\s*[- ]?\s*set)?)$/.test(s))return 1;const m=s.match(/^(\d{1,2})\s*(?:er\s*[- ]?\s*set|er|[- ]?\s*set|stuck|pcs)?$/);return m&&+m[1]>=1&&+m[1]<=50?+m[1]:null;};
 if(!matches.length)return {size:1,explicit:false,error:''};
 const sizes=matches.map(x=>parse(x.value));
 return sizes.some(x=>x===null)||new Set(sizes).size!==1?{size:null,explicit:true,error:'Setgröße nicht eindeutig'}:{size:sizes[0],explicit:true,error:''};
}
function demand(snapshot,rules={},done={}){
 const products=new Map((snapshot?.products||[]).map(p=>[String(p.id),p])),groups=new Map(),rows=[],reviews=[],orders=[];
 for(const o of (snapshot?.orders||[]).slice().sort((a,b)=>(a.ship_by||Infinity)-(b.ship_by||Infinity))){
  if(o.bulk_completed||o.status==='ready')continue;
  const lines=[];
  for(const l of o.items||[]){
   const q=N(l.quantity),remaining=N(l.remaining),p=products.get(String(l.listing_id)),set=setInfo(l);
   if(!remaining&&l.item_id)continue;
   const entry={line:l,set,rows:[],warnings:[]};lines.push(entry);
   const fail=msg=>{entry.warnings.push(msg);reviews.push({orderId:String(o.id),title:l.title||p?.title||'Artikel',message:msg});};
   function add(part,color,need,total,running,warning){
    const key=JSON.stringify([String(l.listing_id),String(part?.id||''),part?norm(color):String(l.item_id||''),part?'':String(l.variant||'')]);
    const id=JSON.stringify([String(o.id),String(l.transaction_id),String(part?.id||''),norm(color)]);
    const testDone=Math.min(need,N(done[id]?.qty));
    const r={key,id,orderId:String(o.id),listingId:String(l.listing_id),variantId:String(l.item_id||''),partId:String(part?.id||''),title:part?.name||p?.title||l.title,product:p?.title||l.title,image:l.image||p?.image||'',color:String(color||''),due:Number(o.ship_by)||Infinity,qty:Math.max(0,need-testDone),total,running,testDone,warning:warning||''};
    entry.rows.push(r);rows.push(r);
    if(warning&&need)fail(r.title+': '+warning);
   }
   if(!q||!l.item_id||!p||l.local_custom){fail('Artikel oder Variante nicht eindeutig zugeordnet');continue;}
   if(set.error){fail(set.error);continue;}
   if(l.components_enabled){
    if(!(l.components||[]).length){fail('Bauteile fehlen');continue;}
    if(N(l.printing)||N(l.finished)||N(l.allocated)){fail('Bestehender klassischer Druckauftrag – Mengen prüfen');continue;}
    for(const part of l.components){
     const cp=p.components?.find(x=>String(x.id)===String(part.id))||part;
     const rule=rules.parts?.[String(part.id)]||'auto',configured=Boolean(part.quantity_property);
     const base=N(cp.units)||(!configured&&N(part.required)%q===0?N(part.required)/q:0);
     if(part.error&&(!set.explicit||!base||!/setgro|setgröße|setgrösse/i.test(part.error))){fail(part.name+': '+part.error);continue;}
     if(!base){fail(part.name+': Stückzahl je Figur fehlt');continue;}
     const required=rule==='auto'&&configured&&!part.error&&N(part.required)>0?N(part.required):q*base*(rule==='once'?1:set.size);
     if(!Number.isSafeInteger(required)||required<1||required>100000||required%q){fail(part.name+': ungültige Bauteilmenge');continue;}
     const detail=typeof ppPoolPartDisplay==='function'?ppPoolPartDisplay(part,l):{color:part.label||part.color||'',warning:''};
     let color=detail.color,warning=detail.warning||'';
     if(!part.property_name&&!color&&cp.color&&!fields(l).some(x=>compact(x.name).includes(compact(part.name)))){color=cp.color;warning='';}
     if(color&&typeof ppPoolExplicitColor==='function'&&ppPoolExplicitColor(part)&&!ppPoolColorsMatch(ppPoolExplicitColor(part),color)&&ppPoolHasBetterPart(l,part,color))continue;
     if(part.property_name&&(!color||/[,+/;]|\s(?:und|and)\s/i.test(color)))warning='Mehrere oder unklare Farben: Aufteilung prüfen';
     if(String(l.personalization||'').trim()&&part.property_name)warning='Personalisierung prüfen';
     const finished=Math.max(0,N(part.finished)+(part.kind==='stock'?N(part.booked):0)-N(part.consumed));
     const running=N(part.printing);
     add(part,color,Math.max(0,remaining*(required/q)-finished-running),required,running,warning);
    }
   }else{
    if(set.size>1){fail('Set ohne Bauteildefinition – Einzelteile in Modelle hinterlegen');continue;}
    const color=String(l.color||fields(l).filter(x=>/farbe|color/i.test(x.name)).map(x=>x.value).join(' · ')||'');
    add(null,color,remaining,q,N(l.printing),String(l.personalization||'').trim()?'Personalisierung prüfen':'');
   }
  }
  if(lines.length)orders.push({order:o,lines});
 }
 for(const r of rows){
  if(!r.qty&&!r.running&&!r.testDone)continue;
  if(!groups.has(r.key))groups.set(r.key,{...r,qty:0,running:0,testDone:0,total:0,due:Infinity,rows:[],variants:new Set()});
  const g=groups.get(r.key);g.qty+=r.qty;g.running+=r.running;g.testDone+=r.testDone;g.total+=r.total;g.due=Math.min(g.due,r.due);g.rows.push(r);g.variants.add(r.variantId);g.warning=g.warning||r.warning;
 }
 return {orders,rows,groups:[...groups.values()].sort((a,b)=>a.due-b.due||a.title.localeCompare(b.title,'de')),reviews};
}
function preferred(g,printer,rules){
 const custom=rules.preferred?.[g.partId||g.listingId];if(custom)return custom===printer?0:2;
 if(/laterne/.test(norm(g.title)))return /^P1S/.test(printer)?0:1;
 if(/katze/.test(norm(g.title)))return /^(H2D|X2D)/.test(printer)?0:1;
 return 1;
}
function options(g,printer,tools){
 if(g.warning)return [];
 const all=(tools.files||[]).filter(f=>!f.is_history&&!f.needs_review&&f.printer===printer&&String(f.listing_id)===g.listingId&&/^[a-f0-9]{24}$/.test(f.id));
 let candidates=[];
 if(g.partId){
  const links=(tools.component_links||[]).filter(l=>String(l.component_id)===g.partId&&l.printer===printer);
  const variants=[...g.variants].map(v=>{const exact=links.filter(l=>String(l.variant_id||'')===v);return exact.length?exact:links.filter(l=>!l.variant_id);});
  const ids=variants[0]?.map(l=>l.file_id).filter(id=>variants.every(ls=>ls.some(l=>l.file_id===id)))||[];
  candidates=all.filter(f=>ids.includes(f.id));
 }else{
  const variants=[...g.variants];if(variants.length!==1)return [];
  const v=variants[0],def=(tools.order_master_defaults||[]).find(d=>String(d.listing_id)===g.listingId&&String(d.variant_id||'')===v);
  candidates=all.filter(f=>String(f.variant_id||'')===v||(def&&def.file_id===f.id));
  if(def&&candidates.some(f=>f.id===def.file_id))candidates=candidates.filter(f=>f.id===def.file_id);
 }
 return candidates.flatMap(f=>{
  const batch=N(f.insights?.batch_units),seconds=N(f.insights?.time_seconds);if(!batch||!seconds)return [];
  const filament=(f.insights?.filaments||[]).filter(x=>Number(x.grams)>0);
  const names=filament.map(x=>norm(x.name)),codes=filament.map(x=>String(x.code||'').trim()),color=norm(g.color);
  const code=color.match(/^\s*(\d{1,3})(?:\s|[-.:]|$)/)?.[1];
  const verified=!color||names.some(n=>n===color||n.endsWith(' '+color))||Boolean(code&&codes.includes(code));
  return [{f,batch,seconds,cost:f.insights?.production_eur??null,requiresColorCheck:!verified||f.insights?.color_mode==='custom'}];
 });
}
function makePlan(groups,printers,tools,rules={},active={}){
 const rowLeft=new Map(groups.flatMap(g=>g.rows.map(r=>[r.id,r.qty])));
 for(const a of Object.values(active))for(const x of a.allocations||[])rowLeft.set(x.id,Math.max(0,(rowLeft.get(x.id)||0)-N(x.qty)));
 const left=new Map(groups.map(g=>[g.key,g.rows.reduce((n,r)=>n+(rowLeft.get(r.id)||0),0)]));
 const out=printers.map(printer=>({printer,active:active[printer.id]||null,job:null}));
 const eligible=x=>['idle','finished','printing','preparing'].includes(x.printer.state)&&!rules.disabled?.[x.printer.id]&&(!['printing','preparing'].includes(x.printer.state)||Number.isFinite(x.printer.remaining_seconds));
 const compare=(a,b)=>a.g.due-b.g.due||Number(a.option.requiresColorCheck)-Number(b.option.requiresColorCheck)||a.preference-b.preference||a.finish-b.finish||b.cover-a.cover||((a.option.cost??Infinity)-(b.option.cost??Infinity));
 for(let pass=0;pass<out.length;pass++){
  const choices=[];
  for(const row of out.filter(x=>!x.job&&eligible(x)))for(const g of groups){
   const qty=left.get(g.key)||0;if(!qty||g.warning)continue;
   for(const option of options(g,row.printer.id,tools)){
    if(option.batch>qty&&!rules.surplus)continue;
    choices.push({row,g,option,cover:Math.min(qty,option.batch),preference:preferred(g,row.printer.id,rules),finish:(row.printer.remaining_seconds||0)+option.seconds});
   }
  }
  if(!choices.length)break;
  choices.sort(compare);const x=choices[0],allocations=[];let remain=x.cover;
  for(const r of x.g.rows){const n=Math.min(remain,rowLeft.get(r.id)||0);if(n){allocations.push({id:r.id,qty:n,orderId:r.orderId});rowLeft.set(r.id,rowLeft.get(r.id)-n);remain-=n;}}
  x.row.job={key:x.g.key,title:x.g.title,color:x.g.color,qty:x.option.batch,cover:x.cover,surplus:x.option.batch-x.cover,allocations,...x.option};
  left.set(x.g.key,left.get(x.g.key)-x.cover);
 }
 return {rows:out,left};
}
if(typeof module!=='undefined'&&module.exports){module.exports={setInfo,demand,options,makePlan};return;}
const $t=id=>document.getElementById(id);
let settings={preferred:{},parts:{},disabled:{},surplus:false,slicer:{}},done={},active={},snapshot=null,live=null,tools=null,power=null,errors={},refreshing=false,lastPlan=null,lastDemand=null;
const storageKey='pp-test-management-v1';
try{const x=JSON.parse(localStorage.getItem(storageKey)||'{}');settings={...settings,...x.settings};done=x.done||{};active=x.active||{};}catch{}
function save(){try{localStorage.setItem(storageKey,JSON.stringify({settings,done,active}));}catch{flash('Testdaten konnten nicht im Browser gespeichert werden.',true);}}
function status(label,ok,detail){return '<div class="tm-source"><span class="tm-dot '+(ok?'good':'muted')+'"></span><div><b>'+esc(label)+'</b><small>'+esc(detail)+'</small></div></div>';}
const fmtTime=s=>Number.isFinite(s)?printerRemaining(s):'–';
const fmtMoney=n=>Number.isFinite(n)?n.toLocaleString('de-DE',{style:'currency',currency:'EUR'}):'Kosten offen';
function deadline(d){if(!Number.isFinite(d))return 'Versanddatum offen';const n=calendarDaysUntil(d);return n<0?'Überfällig':n===0?'Versand heute':n===1?'Versand morgen':n===2?'Versand übermorgen':'Versand '+new Date(d*1000).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});}
function picture(url,title){const safe=thumbnail(url);return safe?'<img class="tm-photo" src="'+esc(safe)+'" alt="'+esc(title)+'" loading="lazy">':'<span class="tm-photo tm-placeholder">▣</span>';}
function openLink(j,p){
 const mac=masterSlicerMac(),slicer=settings.slicer?.[p]||(p==='Snapmaker U1'?'snapmaker':'bambu');
 const url=mac?masterSlicerUrl(j.f,slicer):'api/master-download?id='+encodeURIComponent(j.f.id);
 return '<a class="tm-open" href="'+esc(url)+'"'+(mac?'':' download')+'>'+(mac?'3MF öffnen ↗':'3MF herunterladen ↓')+'</a>';
}
function render(){
 if(workspace!=='test-management')return;
 if(!snapshot){$t('tm-content').innerHTML='<p class="hint">'+esc(errors.status||'Bestellungen werden geladen …')+'</p>';return;}
 const data=demand(snapshot,settings,done);
 const printers=(live?.printers?.length?live.printers:printerRows()).map(p=>errors.printers?{...p,state:'unknown'}:p);
 const fresh=Boolean(!errors.status&&snapshot.authorized&&snapshot.last_sync&&Date.now()/1000-Number(snapshot.last_sync)<3600&&!snapshot.sync?.error);
 const masterOK=Boolean(tools&&!errors['print-tools']);
 const plannerTools=masterOK&&fresh&&live?.connected&&!errors.printers?tools:{files:[],component_links:[],order_master_defaults:[]};
 const plan=makePlan(data.groups,printers,plannerTools,settings,active);lastPlan=plan;lastDemand=data;
 const files=(tools?.files||[]).filter(f=>!f.is_history);
 const sources=status('Etsy',fresh,errors.status|| (snapshot.last_sync?'Abgleich '+new Date(snapshot.last_sync*1000).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'}):'Kein bestätigter Abgleich'))+status('Druckerfarm',!!live?.connected&&!errors.printers,errors.printers||printers.length+' Drucker · '+printers.filter(p=>p.configured).length+' zugeordnet')+status('Masterdateien',masterOK,errors['print-tools']||files.length+' aktive 3MF')+status('Filament',masterOK&&!!tools?.filaments_library?.length,(tools?.filaments_library||[]).length+' Farbdaten · AMS aus HA')+status('Stromüberwachung',!!power&&!errors['power-monitor'],Number.isFinite(power?.watts)?power.watts.toLocaleString('de-DE')+' W aktuell · nur Anzeige':'Keine Messwerte');
 const ruleGroups=data.groups.filter(g=>g.qty>0);
 const rules=ruleGroups.map(g=>'<div class="tm-rule"><b>'+esc(g.title)+(g.color?' · '+esc(g.color):'')+'</b><label>Bevorzugt<select data-tm-pref="'+esc(g.partId||g.listingId)+'"><option value="">Automatisch</option>'+printers.map(p=>'<option value="'+esc(p.id)+'"'+(settings.preferred?.[g.partId||g.listingId]===p.id?' selected':'')+'>'+esc(p.id)+'</option>').join('')+'</select></label>'+(g.partId?'<label>Setmenge<select data-tm-part="'+esc(g.partId)+'"><option value="auto"'+(!settings.parts[g.partId]||settings.parts[g.partId]==='auto'?' selected':'')+'>Automatisch</option><option value="each"'+(settings.parts[g.partId]==='each'?' selected':'')+'>Je Figur</option><option value="once"'+(settings.parts[g.partId]==='once'?' selected':'')+'>Einmal je Set</option></select></label>':'')+'</div>').join('');
 const needs=data.groups.map(g=>'<div class="tm-need">'+picture(g.image,g.product)+'<div><b>'+g.qty+' × '+esc(g.title)+'</b><small>'+esc(g.color||g.product)+'</small>'+(g.running?'<small>'+g.running+' im Live-Auftrag gebucht</small>':'')+(g.warning?'<small class="tm-warn">Prüfen</small>':'')+(g.testDone?'<small>'+g.testDone+' im Test fertig</small>':'')+'</div></div>').join('');
 const grouped=new Map();for(const o of data.orders){const k=deadline(Number(o.order.ship_by)||Infinity);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(o);}
 const orders=[...grouped].map(([label,arr])=>'<section class="tm-day"><h4>'+esc(label)+' <small>'+arr.length+' Bestellungen</small></h4>'+arr.map(({order,lines})=>'<article class="tm-order"><div class="tm-order-title"><b>'+(order.source==='local'?'Lokal':'Etsy')+' #'+esc(order.id)+'</b><small>'+esc(order.ship_by?new Date(order.ship_by*1000).toLocaleDateString('de-DE'):'Termin offen')+'</small></div>'+lines.map(({line,set,rows,warnings})=>'<div class="tm-order-line">'+picture(line.image,line.title)+'<div><strong>'+esc(line.title)+'</strong><b>'+N(line.quantity)+' × '+(set.size===null?'Set prüfen':set.size>1?set.size+'er-Set':'Einzelstück')+'</b><small>'+esc(line.variant||'Standard')+'</small>'+rows.map(r=>'<small>'+r.total+' × '+esc(r.title)+(r.color?' · '+esc(r.color):'')+' · '+r.qty+' offen</small>').join('')+warnings.map(w=>'<small class="tm-warn">'+esc(w)+'</small>').join('')+'</div></div>').join('')+'</article>').join('')+'</section>').join('');
 const cards=plan.rows.map(({printer:p,job:j,active:a})=>{
  const running=['printing','preparing','paused'].includes(p.state),blocked=settings.disabled?.[p.id],pstate=printerStateLabels[p.state]||'Status unklar';
  const current=a?'<b>'+a.qty+' × '+esc(a.title)+'</b> · Testzuordnung':esc(p.filename||'Datei nicht gemeldet');
  const choices=running&&!a?'<select data-tm-running="'+esc(p.id)+'"><option value="">Laufenden Druck zuordnen …</option>'+data.groups.filter(g=>g.qty&&!g.warning).map(g=>'<option value="'+esc(g.key)+'">'+esc(g.title+' '+g.color)+' · '+g.qty+' offen</option>').join('')+'</select>':'';
  return '<article class="tm-printer" data-tm-printer="'+esc(p.id)+'"><div class="tm-printer-head"><div><b>'+esc(p.id)+'</b><small class="tm-printer-state '+esc(p.state)+'">'+esc(pstate)+'</small></div><label class="tm-disable"><input type="checkbox" data-tm-disable="'+esc(p.id)+'"'+(blocked?' checked':'')+'> Sperren</label></div>'+
   (running||a?'<div class="tm-current"><small>Aktuell</small><div>'+current+'</div>'+(running?'<small>'+esc(fmtTime(p.remaining_seconds))+' Restzeit'+(Number.isFinite(p.progress)?' · '+p.progress+' %':'')+'</small>':'<small>HA: '+esc(pstate)+' · Ergebnis bestätigen</small>')+choices+(a?'<div class="tm-actions"><button type="button" class="secondary small" data-tm-finish="'+esc(p.id)+'"'+(!['idle','finished'].includes(p.state)||errors.printers?' disabled':'')+'>Test fertig</button><button type="button" class="secondary small" data-tm-cancel="'+esc(p.id)+'">Zuordnung lösen</button></div>':'')+'</div>':'')+
   (j?'<div class="tm-job"><small>'+(running||a?'Danach':'Jetzt empfohlen')+'</small><strong>'+j.qty+' × '+esc(j.title)+(j.color?' · '+esc(j.color):'')+'</strong><span>'+esc(fmtTime(j.seconds))+' · '+esc(fmtMoney(j.cost))+' je Platte</span><small>'+esc(j.f.filename)+'</small><small>'+j.cover+' für Bestellungen'+(j.surplus?' · '+j.surplus+' Überschuss':'')+' · '+(j.requiresColorCheck?'Farbe im Slicer prüfen':'Farbmetadaten passend')+'</small><small>'+esc([...new Set(j.allocations.map(x=>'#'+x.orderId))].join(', '))+'</small><div class="tm-actions">'+openLink(j,p.id)+(!a&&!running?'<button type="button" class="secondary small" data-tm-start="'+esc(p.id)+'">Test zuordnen</button>':'')+'</div><label>Slicer <select data-tm-slicer="'+esc(p.id)+'">'+[['bambu','Bambu Studio'],['orca','OrcaSlicer'],['snapmaker','Snapmaker Orca']].map(([v,n])=>'<option value="'+v+'"'+((settings.slicer?.[p.id]||(p.id==='Snapmaker U1'?'snapmaker':'bambu'))===v?' selected':'')+'>'+n+'</option>').join('')+'</select></label></div>':'<div class="tm-no-job">'+esc(blocked?'Für Test gesperrt':!['idle','finished','printing','preparing'].includes(p.state)?'Nicht verfügbar':!fresh?'Etsy-Daten nicht aktuell':!masterOK?'Masterdaten fehlen':'Kein eindeutiger passender Druckjob')+'</div>')+'</article>';
 }).join('');
 const unplanned=data.groups.filter(g=>(plan.left.get(g.key)||0)>0).map(g=>'<li>'+plan.left.get(g.key)+' × '+esc(g.title+' '+g.color)+(g.warning?' · prüfen':' · keine weitere passende Platte zugeordnet')+'</li>').join('');
 const html='<div class="tm-layout"><aside class="tm-column"><section class="tm-panel"><h3>Datenquellen · Live</h3>'+sources+'</section><section class="tm-panel"><h3>Planungsregeln · Test</h3><p class="hint">Testregeln und Buchungen nur lokal in diesem Browser.</p><label class="tm-check"><input type="checkbox" id="tm-surplus"'+(settings.surplus?' checked':'')+'> Volle Druckplatte mit Überschuss erlauben</label><details><summary>Drucker- und Setzuordnung</summary>'+rules+'</details><button class="secondary small" id="tm-reset" type="button">Testdaten zurücksetzen</button></section></aside><div class="tm-column"><section class="tm-panel"><h3>Noch zu drucken <small>'+data.groups.reduce((n,g)=>n+g.qty,0)+' Teile</small></h3><div class="tm-need-grid">'+(needs||'<p class="hint">Kein bestätigter Bedarf.</p>')+'</div></section>'+(data.reviews.length?'<section class="tm-panel tm-review"><h3>Bitte prüfen · '+data.reviews.length+'</h3>'+data.reviews.map(r=>'<p>#'+esc(r.orderId)+' · '+esc(r.title)+': '+esc(r.message)+'</p>').join('')+'</section>':'')+'<section class="tm-panel"><h3>Bestellungen <small>'+data.orders.length+'</small></h3>'+(orders||'<p class="hint">Keine offenen Bestellungen.</p>')+'</section></div><div class="tm-column"><section class="tm-panel"><h3>Druckplan <small>Automatisch</small></h3><p class="hint">Je Drucker eine nächste Platte · keine automatische Druckersteuerung</p>'+cards+'</section>'+(unplanned?'<section class="tm-panel"><h3>Noch nicht eingeplant</h3><ul class="tm-unplanned">'+unplanned+'</ul></section>':'')+'</div></div>';
 updateHTML($t('tm-content'),html);
}
async function refresh(full=true){
 if(refreshing)return;refreshing=true;
 const endpoints=full?['status','printers','print-tools','power-monitor']:['status','printers','power-monitor'];
 const btn=$t('tm-refresh');btn.disabled=true;
 try{
  await Promise.all(endpoints.map(async key=>{try{
   const x=await api(key);
   if(key==='status'){if(!Array.isArray(x.orders)||!Array.isArray(x.products))throw Error('Bestelldaten unvollständig');snapshot=x;}
   if(key==='printers'){if(!Array.isArray(x.printers))throw Error('Druckerdaten unvollständig');live=x;}
   if(key==='print-tools'){if(!Array.isArray(x.files))throw Error('Masterdaten unvollständig');tools=x;}
   if(key==='power-monitor')power=x;
   delete errors[key];
  }catch(e){errors[key]=String(e.message||e);}}));
 }finally{refreshing=false;btn.disabled=false;render();}
}
function enter(){render();refresh(true);}
function assign(printer,key,qty,allocations,title){if(active[printer])return;active[printer]={key,qty,allocations,title};save();render();}
$t('tm-refresh').addEventListener('click',()=>refresh(true));
$t('tm-content').addEventListener('change',e=>{
 const b=e.target;
 if(b.id==='tm-surplus')settings.surplus=b.checked;
 else if(b.dataset.tmPref!==undefined)settings.preferred[b.dataset.tmPref]=b.value;
 else if(b.dataset.tmPart!==undefined)settings.parts[b.dataset.tmPart]=b.value;
 else if(b.dataset.tmDisable!==undefined)settings.disabled[b.dataset.tmDisable]=b.checked;
 else if(b.dataset.tmSlicer!==undefined)settings.slicer[b.dataset.tmSlicer]=b.value;
 else if(b.dataset.tmRunning!==undefined&&b.value){
  const g=lastDemand?.groups.find(x=>x.key===b.value);if(!g)return;
  const reserved=new Map();for(const a of Object.values(active))for(const x of a.allocations||[])reserved.set(x.id,(reserved.get(x.id)||0)+N(x.qty));
  const maximum=g.rows.reduce((n,r)=>n+Math.max(0,r.qty-(reserved.get(r.id)||0)),0);if(!maximum){b.value='';return;}
  const value=prompt('Wie viele Teile dieses laufenden Drucks sind für offene Bestellungen? (max. '+maximum+')',String(maximum));
  if(value===null){b.value='';return;}const qty=N(value);if(!qty||qty>maximum){flash('Ungültige Testmenge.',true);b.value='';return;}
  let left=qty;const allocations=[];for(const r of g.rows){const n=Math.min(left,Math.max(0,r.qty-(reserved.get(r.id)||0)));if(n){allocations.push({id:r.id,qty:n});left-=n;}}
  assign(b.dataset.tmRunning,g.key,qty,allocations,g.title+' '+g.color);return;
 }else return;
 save();render();
});
$t('tm-content').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.id==='tm-reset'){if(!confirm('Nur die lokalen Testregeln und Testbuchungen zurücksetzen?'))return;settings={preferred:{},parts:{},disabled:{},surplus:false,slicer:{}};done={};active={};save();render();return;}
 const start=b.dataset.tmStart;if(start){const row=lastPlan?.rows.find(x=>x.printer.id===start);if(!row?.job||active[start]||!['idle','finished'].includes(row.printer.state))return;const j=row.job;assign(start,j.key,j.cover,j.allocations,j.title+' '+j.color);return;}
 const finish=b.dataset.tmFinish;if(finish&&active[finish]){const p=live?.printers?.find(x=>x.id===finish);if(errors.printers||!p||!['idle','finished'].includes(p.state)){flash('Drucker muss bereit oder fertig sein.',true);return;}if(!confirm('Sind die zugeordneten Teile vollständig und fehlerfrei? Nur Teststatus wird geändert.'))return;for(const x of active[finish].allocations||[])done[x.id]={qty:N(done[x.id]?.qty)+N(x.qty)};delete active[finish];save();render();return;}
 const cancel=b.dataset.tmCancel;if(cancel){delete active[cancel];save();render();}
});
window.ppTestManagement={enter,render};
setInterval(()=>{if(workspace==='test-management'&&!document.hidden)refresh(false);},20000);
})();
