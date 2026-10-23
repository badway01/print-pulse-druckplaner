'use strict';
/* Priorities are advice only. No automatic printer start or inventory mutation.
   Rebuild from live Etsy jobs, counted on-hand inventory and part states. */
let priorityExpanded=false;
function priorityCandidates(snapshot){
 if(!snapshot)return [];
 const products=(snapshot.products||[]).filter(p=>p.state==='active');
 const listings=new Map(products.map(p=>[String(p.id),p]));
 const itemIndex=new Map();
 for(const product of products)for(const item of product.items||[]){
  itemIndex.set(String(item.id),{item,product});
 }
 const orders=[...(snapshot.orders||[])].sort((a,b)=>
  (Number(a.ship_by)||Infinity)-(Number(b.ship_by)||Infinity)||
  (Number(a.created)||0)-(Number(b.created)||0));
 const available=new Map();
 const classic=new Map(),demand=new Map(),unmapped=new Map(),waiting=new Map();
 const firstShipment=new Map(),firstReceipt=new Map();
 const now=Date.now()/1000;
 function add(group,key,task,qty){
  if(qty<=0)return;
  const old=group.get(key);
  if(old){
   old.qty+=qty;old.orders.add(task.orderId);
   if((task.shipBy||Infinity)<(old.shipBy||Infinity)){
    old.shipBy=task.shipBy;old.orderId=task.orderId;old.lineId=task.lineId;
   }
  }else group.set(key,{...task,qty,orders:new Set([task.orderId])});
 }
 for(const order of orders){
  for(const line of order.items||[]){
   if(!line.item_id||Number(line.remaining)<=0)continue;
   const product=listings.get(String(line.listing_id));
   if(!product)continue;
   const common={listingId:String(product.id),productTitle:product.title,
    orderId:String(order.id),lineId:String(line.transaction_id),
    shipBy:Number(order.ship_by)||Infinity,created:Number(order.created)||0,
    sold7:Number(product.sold7)||0,sold30:Number(product.sold30)||0};
   if(product.components_enabled){
    for(const part of line.components||[]){
     if(part.error||!Number.isFinite(Number(part.required))||Number(part.required)<1)continue;
     if(part.kind==='stock'){
      const key=String(product.id)+'::'+String(part.id);
      const pending=Math.max(0,Number(part.required)-Number(part.booked||0));
      if(!pending)continue;
      const old=waiting.get(key);
      if(old){old.qty+=pending;if(common.shipBy<old.shipBy){old.shipBy=common.shipBy;old.orderId=common.orderId;old.lineId=common.lineId;}}
      else waiting.set(key,{...common,key,partId:String(part.id),partName:part.name,qty:pending});
     }else if(part.kind==='demand'){
      const qty=Math.max(0,Number(part.required)-Number(part.printing||0)-Number(part.finished||0));
      const key=String(product.id)+'::'+String(part.id)+'::'+String(part.label||'');
      add(demand,key,{...common,tier:1,type:'order',
       partId:String(part.id),title:part.name+(part.label?' · '+part.label:''),
       note:product.title},qty);
     }
    }
   }else{
    const indexed=itemIndex.get(String(line.item_id));
    if(!indexed)continue;
    const item=indexed.item,key=String(item.id),remaining=Math.max(0,Number(line.remaining)||0);
    if(item.on_hand===null||item.on_hand===undefined){
     add(unmapped,key,{...common,tier:1,type:'check',itemId:key,
      title:product.title,note:String(line.variant||item.label)+' · Bestand noch nicht gezählt'},remaining);
     continue;
    }
    if(!available.has(key))available.set(key,Math.max(0,Number(item.allocatable)||0));
    const free=Math.min(remaining,available.get(key));
    available.set(key,available.get(key)-free);
    const shortage=remaining-free;
    add(classic,key,{...common,tier:1,type:'order',itemId:key,
     title:product.title,note:String(line.variant||item.label)},shortage);
   }
  }
 }
 const out=[...classic.values(),...demand.values(),...unmapped.values()];
 for(const pending of waiting.values()){
  const product=listings.get(pending.listingId);
  const part=(product?.components||[]).find(c=>String(c.id)===pending.partId);
  if(!part)continue;
  const stock=Math.max(0,Number(part.stock)||0);
  const printing=Math.max(0,Number(part.printing_stock)||0);
  const short=Math.max(0,pending.qty-stock-printing);
  if(short)out.push({...pending,tier:1,type:'part',
   title:part.name,note:product.title+' · gemeinsames Bauteil für Etsy-Aufträge',
   qty:short,orders:new Set([pending.orderId])});
 }
 // A preproduction goal is opt-in. It is the desired free stock AFTER
 // existing Etsy reservations. Already-started free-part batches count.
 for(const product of products){
  if(!product.components_enabled)continue;
  for(const part of product.components||[]){
   if(part.kind!=='stock'||!(Number(part.target_stock)>0))continue;
   const key=String(product.id)+'::'+String(part.id);
   const pending=waiting.get(key)?.qty||0;
   const stock=Math.max(0,Number(part.stock)||0);
   const printing=Math.max(0,Number(part.printing_stock)||0);
   const freeAfterOrders=Math.max(0,stock+printing-pending);
   const refill=Math.max(0,Number(part.target_stock)-freeAfterOrders);
   // A batch earmarked for customers is shown in tier 1. This lower tier
   // is solely the surplus needed to restore the free component target.
   if(refill)out.push({tier:2,type:'part',listingId:String(product.id),
    partId:String(part.id),title:part.name,note:product.title,
    qty:refill,sold7:Number(product.sold7)||0,sold30:Number(product.sold30)||0,
    shipBy:Infinity,orders:new Set()});
  }
 }
 const orderedVariantIds=new Set([...classic.keys(),...unmapped.keys()]);
 for(const product of products){
  if(product.components_enabled||product.made_to_order||Number(product.sold30||0)<=0)continue;
  for(const item of product.items||[]){
   const qty=Math.max(0,Number(item.need)||0);
   if(!item.enabled||item.on_hand===null||!qty||orderedVariantIds.has(String(item.id)))continue;
   out.push({tier:3,type:'variant',listingId:String(product.id),itemId:String(item.id),
    title:product.title,note:String(item.label||''),qty,
    sold7:Number(item.sold7)||Number(product.sold7)||0,
    sold30:Number(item.sold30)||Number(product.sold30)||0,shipBy:Infinity,orders:new Set()});
  }
 }
 const priority=entry=>entry.tier===1?0:entry.tier===2?1:2;
 out.sort((a,b)=>priority(a)-priority(b)||
  (a.tier===1?(a.shipBy||Infinity)-(b.shipBy||Infinity):0)||
  (b.sold7||0)-(a.sold7||0)||(b.sold30||0)-(a.sold30||0)||
  String(a.title).localeCompare(String(b.title),'de'));
 return out;
}
function priorityCard(item,index){
 const isOrder=item.tier===1;
 const group=isOrder?'Kundenauftrag':item.tier===2?'Vorproduktion':'Fertigwarenlager';
 const details=item.type==='check'?'Bestand prüfen':isOrder?
  'Für offene Etsy-Bestellungen · Versand '+(item.shipBy===Infinity?'prüfen':shortDate(item.shipBy)):
  item.tier===2?'Vorrat nach deinem Auffüllziel ergänzen':'Bestand nach Verkäufen auffüllen';
 const button=item.type==='part'?'Bauteil öffnen':item.type==='variant'?'Druck vorbereiten':
  'Auftrag öffnen';
 return '<article class="priority-item priority-'+item.tier+'">'+
  '<div class="priority-number" aria-hidden="true">'+(index+1)+'</div>'+
  '<div class="priority-description">'+
   '<div class="priority-meta"><span>'+esc(group)+'</span>'+
   (item.orders.size>1?'<span>'+item.orders.size+' Aufträge</span>':'')+'</div>'+
   '<b title="'+esc(item.title)+'">'+esc(item.qty)+' × '+esc(item.title)+'</b>'+
   '<small>'+esc(item.note||'')+'</small>'+
   '<small class="priority-reason">'+esc(details)+'</small></div>'+
   '<button type="button" class="secondary priority-jump" data-priority-index="'+index+'" aria-label="'+esc(button+' für '+item.title)+'">'+esc(button)+' ↗</button>'+
   '</article>';
}
let currentPriorities=[];
function renderPriorityUI(){
 const shell=$('priority-shell');
 if(!shell||!model)return;
 currentPriorities=priorityCandidates(model);
 const total=currentPriorities.length;
 const shown=priorityExpanded?currentPriorities:currentPriorities.slice(0,3);
 $('priority-count').textContent=total?total+(total===1?' Vorschlag':' Vorschläge'):'Alles im Blick';
 updateHTML($('priority-list'),shown.length?shown.map(priorityCard).join(''):
  '<p class="priority-empty">Keine offenen Druckempfehlungen. Bei Vorratsbauteilen kannst du optional ein Auffüllziel festlegen.</p>');
 const more=$('priority-more');
 more.hidden=total<=3;
 more.textContent=priorityExpanded?'Weniger anzeigen':'Alle '+total+' Vorschläge anzeigen';
 more.setAttribute('aria-expanded',String(priorityExpanded));
}
function openPriority(item){
 if(!item)return;
 showWorkspace('production');
 if(item.type==='part'){
  if(!model.products.some(p=>String(p.id)===item.listingId))return;
  componentOpen(item.listingId);
  const rows=[...$('components-list').querySelectorAll('[data-component-row]')];
  const row=rows.find(x=>x.dataset.componentRow===item.partId);
  if(row)row.scrollIntoView({block:'nearest',behavior:'smooth'});
 }else if(item.type==='variant'){
  const product=model.products.find(p=>String(p.id)===item.listingId);
  if(!product)return;
  selectedVariants.set(product.id,item.itemId);
  productPrintDialog(product.id,'printing');
 }else{
  const order=(model.orders||[]).find(o=>String(o.id)===item.orderId);
  if(!order)return;
  showOrder(order.id);
  const candidates=[...$('order-details-content').querySelectorAll('[data-component-id],[data-order-quick],[data-order-line]')];
  const exact=candidates.find(b=>(b.dataset.componentId===item.partId&&
    b.dataset.componentTid===item.lineId)||b.dataset.orderQuick===item.lineId||b.dataset.orderLine===item.lineId);
  if(exact)exact.focus({preventScroll:true});
 }
}
$('priority-more').addEventListener('click',()=>{
 priorityExpanded=!priorityExpanded;renderPriorityUI();
});
$('priority-list').addEventListener('click',event=>{
 const button=event.target.closest('[data-priority-index]');
 if(!button)return;
 const index=Number(button.dataset.priorityIndex);
 if(Number.isSafeInteger(index)&&index>=0)openPriority(currentPriorities[index]);
});
const normalOrdersRender=renderOrders;
renderOrders=function(){
 normalOrdersRender();
 renderPriorityUI();
};
