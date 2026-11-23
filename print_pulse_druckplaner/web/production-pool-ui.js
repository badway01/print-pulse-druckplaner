'use strict';
/* Print & Pulse production pool.
 * Read-only grouping from the current HA snapshot. No Etsy, inventory or printer writes.
 * Different variants/personalizations are never silently combined.
 */
let ppPoolSort='due';
let ppPoolOnlyNeeded=true;
let ppPoolRows=[];
function ppPoolNumber(value){return Math.max(0,Number(value)||0);}
function ppPoolTitle(line,item){
 const variant=String(line.variant||item?.label||'').trim();
 const color=String(line.color||'').trim();
 const custom=String(line.personalization||'').trim();
 const label=[variant];
 if(color&&!variant.toLocaleLowerCase('de').includes(color.toLocaleLowerCase('de')))label.push('Farbe: '+color);
 if(custom)label.push('Wunsch: '+custom);
 return label.filter(Boolean).join(' · ')||'Standard';
}
/* Etsy order variations are the authoritative color selection.
 * A fixed component name ("Katze - weiß") is not the ordered color. */
function ppPoolNormalize(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('de').replace(/ß/g,'ss').trim();
}
function ppPoolVariantFields(line){
 return String(line?.variant||'').split(/\s+[·|]\s+/).map(raw=>{
  const sep=raw.indexOf(':');
  return sep<0?null:{name:raw.slice(0,sep).trim(),value:raw.slice(sep+1).trim()};
 }).filter(x=>x&&x.name&&x.value);
}
function ppPoolRole(value){
 const name=ppPoolNormalize(value).split(/\s*[-–]\s*/)[0];
 return name.replace(/[^a-z0-9]/g,'').replace(/(?:farben?|farbwahl)/g,'')
  .replace(/(?:en|e|n|s)$/,'');
}
function ppPoolPropertyRole(name){
 return ppPoolNormalize(name).replace(/(?:farbe|farbwahl|wunschfarbe|der|des|die|das|von|fur|für)/g,'')
  .replace(/[^a-z0-9]/g,'').replace(/(?:en|e|n|s)$/,'');
}
function ppPoolColorsMatch(a,b){
 const left=ppPoolNormalize(a).replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
 const right=ppPoolNormalize(b).replace(/ß/g,'ss').replace(/[^a-z0-9]/g,'');
 return !!left&&left===right;
}
function ppPoolColorChoice(part,line){
 const fields=ppPoolVariantFields(line);
 const fixed=String(part?.color||'').trim();
 const required=String(part?.property_name||'').trim();
 if(required){
  const match=fields.find(x=>ppPoolNormalize(x.name)===ppPoolNormalize(required));
  if(match)return {color:match.value,source:'mapped'};
  if(part.label)return {color:String(part.label),source:'mapped'};
  return {color:'',source:'unknown'};
 }
 const role=ppPoolRole(part?.name||'');
 const matched=fields.filter(x=>{
  const key=ppPoolPropertyRole(x.name);
  return role.length>=3&&key.length>=3&&(role===key||key.includes(role)||role.includes(key));
 });
 if(matched.length===1)return {color:matched[0].value,source:'inferred'};
 if(matched.length>1)return {color:'',source:'unknown'};
 // A lone color property is safe only for one single part; otherwise the
 // "Farbe" field could refer to the lantern rather than to the cat.
 const generic=fields.filter(x=>/farbe|color/i.test(x.name));
 const allParts=(line.components||[]).filter(p=>p.kind==='demand'&&p.id!==part.id);
 if(generic.length===1&&fields.length===1&&!allParts.length)
  return {color:generic[0].value,source:'inferred'};
 if(fields.length&&(/(?:weiss|weiß|schwarz|beige|rot|blau|grun|grün)/i.test(part.name||'')||fixed))
  return {color:'',source:'unknown'};
 return {color:fixed,source:'fixed'};
}
function ppPoolPartDisplay(part,line){
 const choice=ppPoolColorChoice(part,line);
 const raw=String(part.name||'Bauteil').trim();
 const stripped=raw.replace(/\s*[-–]\s*(?:weiss|weiß|schwarz|beige|gold|rot|blau|grün|gruen|rosa|pink|silber)\s*$/i,'').trim()||raw;
 const label=choice.color?stripped+' · '+choice.color:
  (choice.source==='unknown'?stripped+' · Farbe prüfen':raw);
 // Where the parts list says "Katze - weiß" but the customer chose black,
 // display the actual choice AND highlight the incorrect model configuration.
 const fixedName=raw.match(/[-–]\s*(weiss|weiß|schwarz|beige|gold|rot|blau|grün|gruen|rosa|pink|silber)\s*$/i);
 const conflict=!!choice.color&&
  ((fixedName&&!ppPoolColorsMatch(fixedName[1],choice.color))||
   (part.color&&!ppPoolColorsMatch(part.color,choice.color)));
 const unknown=choice.source==='unknown';
 // Never merge unknown-color parts from distinct Etsy option signatures.
 const identity=choice.color?'color:'+ppPoolNormalize(choice.color):
  unknown?'check:'+ppPoolNormalize(line.variant)+'|'+String(line.transaction_id||''):'common';
 const warning=conflict?'Bauteilfarbe widerspricht der Bestellung. Bauteilzuordnung prüfen.':
  unknown?'Farbe nicht eindeutig der Etsy-Variante zugeordnet. Bauteile konfigurieren.':'';
 return {label,identity,warning,color:choice.color,source:choice.source};
}
function ppPoolExplicitColor(part){
 const named=String(part?.name||'').match(/[-–]\s*(weiss|weiß|schwarz|beige|gold|rot|blau|grün|gruen|rosa|pink|silber)\s*$/i);
 return String(part?.color||named?.[1]||'').trim();
}
function ppPoolHasBetterPart(line,part,orderedColor){
 return !!orderedColor&&(line.components||[]).some(other=>other.id!==part.id&&
  ppPoolRole(other.name)===ppPoolRole(part.name)&&
  ppPoolColorsMatch(ppPoolExplicitColor(other),orderedColor));
}
function ppPoolBuild(snapshot){
 const products=new Map((snapshot?.products||[]).map(p=>[String(p.id),p]));
 const groups=new Map(),rows=new Map();
 const orders=Array.isArray(snapshot?.orders)?snapshot.orders:[];
 const sorted=orders.slice().sort((a,b)=>
  (Number(a.ship_by)||Infinity)-(Number(b.ship_by)||Infinity)||
  (Number(a.created)||0)-(Number(b.created)||0));
 let totalOrdered=0,needsReview=0;
 function add(order,line,options,qty,inPrint){
  const q=ppPoolNumber(qty),running=ppPoolNumber(inPrint);
  if(!q&&!running&&!options.review)return;
  const listingId=String(options.listingId||line.listing_id||'');
  const product=products.get(listingId);
  const groupKey=product?'listing:'+listingId:'special:'+String(options.title||line.title||'Sonderleistung');
  let group=groups.get(groupKey);
  if(!group){
   group={key:groupKey,listingId:product?listingId:'',title:product?.title||options.title||line.title||'Sonderleistung',
    image:product?.image||'',rows:[],qty:0,earliest:Infinity,orders:new Set()};
   groups.set(groupKey,group);
  }
  const rowKey=groupKey+'|'+options.key;
  let row=rows.get(rowKey);
  if(!row){
   row={key:rowKey,group,kind:options.kind,label:options.label||'Standard',
    itemId:options.itemId||'',partId:options.partId||'',personalized:!!options.personalized,warning:options.warning||'',
    pending:0,inPrint:0,ordered:0,fromStock:0,toPrint:0,earliest:Infinity,stock:0,
    stockRunning:0,review:!!options.review,orders:new Map()};
   rows.set(rowKey,row);
   group.rows.push(row);
  }
  row.pending+=q;
  row.inPrint+=running;
  row.ordered+=ppPoolNumber(line.quantity);
  row.review=row.review||!!options.review;
  if(options.warning)row.warning=options.warning;
  const due=Number(order.ship_by)||Infinity;
  row.earliest=Math.min(row.earliest,due);
  group.earliest=Math.min(group.earliest,due);
  row.orders.set(String(order.id),{orderId:String(order.id),shipBy:due,lineId:String(line.transaction_id||'')});
  group.orders.add(String(order.id));
  if(options.kind==='stock'){
   row.stock=ppPoolNumber(options.stock);
   row.stockRunning=ppPoolNumber(options.stockRunning);
  }
  if(options.kind==='classic'&&options.itemId){
   const item=(product?.items||[]).find(i=>String(i.id)===options.itemId);
   row.stock=Number.isSafeInteger(item?.allocatable)?ppPoolNumber(item.allocatable):0;
   row.stockKnown=item?.on_hand!==null&&item?.on_hand!==undefined;
  }
 }
 for(const order of sorted){
  for(const line of order.items||[]){
   totalOrdered+=ppPoolNumber(line.quantity);
   const product=products.get(String(line.listing_id||''));
   const item=(product?.items||[]).find(i=>String(i.id)===String(line.item_id||''));
   const remaining=ppPoolNumber(line.remaining);
   const printing=ppPoolNumber(line.printing);
   if(line.local_custom){
    const label=[line.custom_kind==='laser'?'Laserarbeit':'Sonderanfertigung',
     line.variant,line.color,line.personalization].filter(Boolean).join(' · ');
    add(order,line,{kind:'special',key:'custom:'+line.transaction_id,title:line.title||'Sonderleistung',label},remaining,printing);
    continue;
   }
   if(!line.item_id||(!product&&remaining)){
    if(remaining)needsReview+=remaining;
    add(order,line,{kind:'review',key:'unmapped:'+line.transaction_id,
      title:line.title||'Artikel prüfen',label:ppPoolTitle(line,item),review:true},remaining,0);
    continue;
   }
   const legacy=typeof componentLegacyJob==='function'&&componentLegacyJob(line);
   if(line.components_enabled&&!legacy){
    if(!Array.isArray(line.components)||!line.components.length){
     if(remaining)needsReview+=remaining;
     add(order,line,{kind:'review',key:'no-parts:'+line.transaction_id,
      label:'Bauteile fehlen · '+ppPoolTitle(line,item),review:true},remaining,0);
     continue;
    }
    for(const part of line.components){
     const amount=part.error?ppPoolNumber(line.remaining):
      (typeof orderComponentOutstanding==='function'?orderComponentOutstanding(line,part):0);
     if(part.error)needsReview+=amount;
     const stock=part.kind==='stock';
     const detail=ppPoolPartDisplay(part,line);
     // If an older setup has separate fixed-color components, exclude the
     // wrong-color component when another one explicitly matches this order.
     if(detail.color&&ppPoolExplicitColor(part)&&
       !ppPoolColorsMatch(ppPoolExplicitColor(part),detail.color)&&
       ppPoolHasBetterPart(line,part,detail.color))continue;
     const key=(stock?'stock:':'demand:')+String(part.id)+'|'+detail.identity;
     // Unverified per-color stock is never silently applied to another color.
     // A common stock component without a color choice remains shared.
     const colorStockUnverified=stock&&detail.source!=='fixed'&&
      !(part.color&&ppPoolColorsMatch(part.color,detail.color));
     const rowKind=part.error?'review':stock?'stock':'demand';
     add(order,line,{kind:rowKind,
      key:part.error?'error:'+line.transaction_id+':'+key:key,label:detail.label,
      partId:String(part.id),warning:detail.warning||
       (colorStockUnverified?'Farbspezifischen Bauteilvorrat prüfen.':''),
      stock:stock&&!colorStockUnverified?(product?.components||[]).find(p=>String(p.id)===String(part.id))?.stock:0,
      stockRunning:stock&&!colorStockUnverified?(product?.components||[]).find(p=>String(p.id)===String(part.id))?.printing_stock:0,
      review:!!part.error},amount,ppPoolNumber(part.printing));
    }
    continue;
   }
   const label=ppPoolTitle(line,item);
   // The Etsy item ID alone is insufficient when color/personalization is entered
   // in order properties rather than in the Etsy stock-keeping variant.
   const key='classic:'+String(line.item_id)+'|'+String(line.variant||'')+'|'+
    String(line.color||'')+'|'+String(line.personalization||'');
   const selectedColor=String(line.color||'').replace(/^\s*(?:farbe|farbwahl)\s*:\s*/i,'')
    .trim().toLocaleLowerCase('de');
   const stockVariant=String(item?.label||'').toLocaleLowerCase('de');
   // A generic Etsy variation is not proof that its shelf inventory matches
   // a separately supplied colour. In that case err on the safe side.
   const colorMatchesStock=!selectedColor||stockVariant.includes(selectedColor);
   add(order,line,{kind:'classic',key,label,itemId:String(line.item_id),
    personalized:!!String(line.personalization||'').trim()||!colorMatchesStock},remaining,printing);
  }
 }
 const result=[...groups.values()];
 // Shared on-hand stock must only be offered once, even when a single
 // inventory item ID has several separately labelled order variations.
 const classicRows=[...rows.values()].filter(r=>r.kind==='classic').sort((a,b)=>a.earliest-b.earliest);
 const leftByItem=new Map();
 for(const row of classicRows){
  if(!leftByItem.has(row.itemId))leftByItem.set(row.itemId,row.stock);
  const available=row.personalized?0:leftByItem.get(row.itemId);
  row.fromStock=Math.min(row.pending,available);
  row.toPrint=Math.max(0,row.pending-row.fromStock);
  if(!row.personalized)leftByItem.set(row.itemId,Math.max(0,available-row.fromStock));
 }
 for(const row of rows.values()){
  if(row.kind==='stock'){
   row.fromStock=Math.min(row.pending,row.stock);
   row.toPrint=Math.max(0,row.pending-row.fromStock-row.stockRunning);
  }else if(row.kind==='demand'||row.kind==='special'){
   row.toPrint=row.pending;
  }else if(row.kind==='review'){
   row.toPrint=0; // An unresolved order must never be proposed as a printable file.
  }
 }
 for(const group of result){
  group.qty=group.rows.reduce((n,r)=>n+r.pending+r.inPrint,0);
  group.toPrint=group.rows.reduce((n,r)=>n+r.toPrint,0);
  group.inPrint=group.rows.reduce((n,r)=>n+r.inPrint+(r.kind==='stock'?r.stockRunning:0),0);
  group.review=group.rows.some(r=>r.review);
 }
 return {orders:orders.length,totalOrdered,needsReview,
  toPrint:result.reduce((n,g)=>n+g.toPrint,0),
  inPrint:result.reduce((n,g)=>n+g.inPrint,0),groups:result};
}
function ppPoolDeadline(timestamp){
 if(!Number.isFinite(timestamp))return 'Frist prüfen';
 return 'bis '+shortDate(timestamp);
}
function ppPoolOrderLinks(row){
 const entries=[...row.orders.values()].sort((a,b)=>a.shipBy-b.shipBy);
 return '<details class="pp-pool-orders"><summary>'+entries.length+
  (entries.length===1?' Bestellung':' Bestellungen')+' ansehen</summary><div class="pp-pool-order-links">'+
  entries.map(o=>'<button type="button" class="secondary small" data-pp-order="'+esc(o.orderId)+
   '">#'+esc(o.orderId)+' · '+esc(ppPoolDeadline(o.shipBy))+'</button>').join('')+'</div></details>';
}
function ppPoolShortTitle(title){
 const value=String(title||'Artikel').trim();
 return value.split(/\s+[–|]\s+/)[0].trim()||value;
}
function ppPoolRowHTML(row){
 const urgency=Number.isFinite(row.earliest)?ppPoolDeadline(row.earliest):'Frist prüfen';
 const quantity=row.toPrint;
 const status=row.review?'<span class="pp-pool-pill is-warning">Zuordnung prüfen</span>':
  quantity?'<span class="pp-pool-pill is-needed">'+quantity+' × drucken</span>':
  '<span class="pp-pool-pill is-stock">Gedeckt</span>';
 const orderCount=row.orders.size;
 const showParts=row.kind==='stock'||row.kind==='demand';
 const title=showParts?row.label:
  ppPoolShortTitle(row.group.title)+(row.label==='Standard'?'':' · '+row.label);
 const picture=typeof thumbnail==='function'?thumbnail(row.group.image):'';
 return '<article class="pp-pool-line">'+
  '<div class="pp-pool-line-count">'+quantity+'<small>×</small></div>'+
  (picture?'<img class="pp-pool-line-image" loading="lazy" src="'+esc(picture)+'" alt="">':'')+
  '<div class="pp-pool-line-content">'+
   '<strong title="'+esc(title)+'">'+esc(title)+'</strong>'+
   '<div class="pp-pool-line-meta">'+
    '<span>'+esc(ppPoolShortTitle(row.group.title))+'</span>'+
    '<span>'+esc(urgency)+'</span>'+
    '<span>'+orderCount+' '+(orderCount===1?'Auftrag':'Aufträge')+'</span>'+
   '</div>'+
   (row.warning?'<span class="pp-pool-line-warning">⚠ '+esc(row.warning)+'</span>':'')+
  '</div>'+
  '<div class="pp-pool-line-status">'+status+
    (row.fromStock?'<span class="pp-pool-pill is-stock">'+row.fromStock+' × Lager</span>':'')+
    (row.inPrint||row.stockRunning?'<span class="pp-pool-pill is-printing">'+
      (row.inPrint+row.stockRunning)+' × im Druck</span>':'')+
  '</div>'+
  '<details class="pp-pool-line-details"><summary aria-label="Details und Aufträge für '+esc(title)+' anzeigen">Details</summary>'+
   '<div class="pp-pool-line-detail-content">'+ppPoolOrderLinks(row)+
   (row.group.listingId?'<button type="button" class="secondary small" data-pp-master="'+esc(row.group.listingId)+
   '">3MF & Belegung öffnen</button>':'')+'</div></details>'+
 '</article>';
}
function renderProductionPoolUI(){
 const box=$('production-pool');
 if(!box||!model)return;
 const data=ppPoolBuild(model);
 $('pp-pool-orders').textContent=data.orders;
 $('pp-pool-ordered').textContent=data.totalOrdered;
 $('pp-pool-needed').textContent=data.toPrint;
 $('pp-pool-printing').textContent=data.inPrint;
 const search=String($('pp-pool-search').value||'').trim().toLocaleLowerCase('de');
 let rows=data.groups.flatMap(g=>g.rows).filter(r=>
   (!ppPoolOnlyNeeded||r.toPrint>0||r.inPrint>0||r.stockRunning>0||r.review)&&
   (!search||(r.group.title+' '+r.label).toLocaleLowerCase('de').includes(search)));
 const compare=(a,b)=>ppPoolSort==='qty'?b.toPrint-a.toPrint||a.earliest-b.earliest:
  ppPoolSort==='name'?a.label.localeCompare(b.label,'de'):
  a.earliest-b.earliest||b.toPrint-a.toPrint||a.label.localeCompare(b.label,'de');
 rows.sort(compare);
 ppPoolRows=rows;
 const warningCount=rows.filter(r=>r.review||r.warning).length;
 $('pp-pool-result').textContent=rows.length+' Druckpositionen'+
  (warningCount?' · '+warningCount+' Zuordnung'+(warningCount===1?'':'en')+' prüfen':'');
 updateHTML($('pp-pool-list'),rows.length?rows.map(ppPoolRowHTML).join(''):
  '<p class="pp-pool-empty">Kein offener Produktionsbedarf für diesen Filter.</p>');
}
$('pp-pool-search').addEventListener('input',renderProductionPoolUI);
$('pp-pool-sort').addEventListener('change',event=>{
 ppPoolSort=event.target.value;renderProductionPoolUI();
});
$('pp-pool-only-needed').addEventListener('change',event=>{
 ppPoolOnlyNeeded=event.target.checked;renderProductionPoolUI();
});
$('pp-pool-list').addEventListener('click',event=>{
 const order=event.target.closest('[data-pp-order]');
 if(order){
  const found=(model?.orders||[]).find(o=>String(o.id)===order.dataset.ppOrder);
  if(found){showWorkspace('queue');showOrder(found.id);}
  return;
 }
 const master=event.target.closest('[data-pp-master]');
 if(master&&typeof openMasterEditor==='function')openMasterEditor(master.dataset.ppMaster);
});
// The existing priority view is still responsible for day-by-day ordering.
// Refresh this overview whenever the same live HA model is re-rendered.
const ppPoolOldRenderPriority=renderPriorityUI;
renderPriorityUI=function(){
 ppPoolOldRenderPriority();
 renderProductionPoolUI();
};
