'use strict';
/* Dedicated order and physical shelf tabs. All writes use existing APIs. */
(() => {
 const pref=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
 const save=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
 let orderView=['grid','list'].includes(pref('pp-order-board','grid'))?pref('pp-order-board','grid'):'grid';
 let stockView=['grid','list'].includes(pref('pp-stock-board','grid'))?pref('pp-stock-board','grid'):'grid';
 let sort='ship',orderFilter='all',stockFilter='all',onlyPositive=true;
 const count=value=>Math.max(0,Number(value)||0);
 const searchText=value=>String(value||'').toLocaleLowerCase('de');
 function shelf(item){if(item.on_hand===null)return null;return Number.isSafeInteger(item.allocatable)?count(item.allocatable):count(item.on_hand);}
 function free(item){const available=shelf(item);return available===null?null:Math.min(available,Number.isSafeInteger(item.free)?count(item.free):available);}
 function picture(url,title){
  const safe=thumbnail(url||'');
  return safe?'<img src="'+esc(safe)+'" alt="'+esc(title)+'" loading="lazy" referrerpolicy="no-referrer">':
   '<span class="board-photo-placeholder" aria-hidden="true">P+P</span>';
 }
 function selectButtons(type,value){
  document.querySelectorAll('['+type+']').forEach(b=>{
   const active=b.getAttribute(type)===value;
   b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));
  });
 }
 function status(order){
  const progress=orderPrintProgress(order);
  if(progress.complete)return ['Fertig','ready'];
  const printing=(order.items||[]).reduce((sum,line)=>sum+count(line.printing)+
   (line.components_enabled?(line.components||[]).reduce((n,part)=>n+count(part.printing),0):0),0);
  if(printing>0)return [printing+' im Druck','printing'];
  if(progress.finished)return [progress.finished+'/'+progress.total+' fertig','partial'];
  return ['Offen','pending'];
 }
 function orderCardFull(order){
  const details=shipInfo(order),lines=order.items||[],state=status(order);
  const total=count(orderPrintProgress(order).total),done=count(orderPrintProgress(order).finished);
  const rows=lines.slice(0,6).map(line=>{
   const qty=count(line.quantity),finished=Math.min(qty,count(line.finished)+count(line.allocated)+count(line.assembled));
   return '<div class="board-order-product">'+picture(line.image,line.title)+'<div><strong>'+qty+' × '+esc(line.title)+'</strong>'+
    (line.variant?'<small>'+esc(line.variant)+'</small>':'')+
    (line.color?'<small>Farbe: '+esc(line.color)+'</small>':'')+
    (line.personalization?'<small>Wunsch: '+esc(line.personalization)+'</small>':'')+
    '<small>'+finished+'/'+qty+' erledigt</small>'+
    '<div class="board-order-work">'+orderCardWorkLine(line)+'</div></div></div>';
  }).join('');
  return '<article class="board-order" data-full-order="'+esc(order.id)+'" tabindex="0" role="button" '+
    'aria-label="Bestellung '+esc(order.id)+' groß anzeigen"><div class="board-order-head">'+
    '<b>'+(order.source==='local'?'Lokal':'Etsy')+' · #'+esc(order.id)+'</b><span class="board-status '+state[1]+'">'+esc(state[0])+'</span></div>'+
    '<h3>'+esc(order.customer)+'</h3><div class="board-deadline">'+esc(details.date)+
    (details.countdown?'<span>'+esc(details.countdown)+'</span>':'')+'</div>'+
    '<div class="board-order-products">'+rows+'</div>'+
    (lines.length>6?'<small>+ '+(lines.length-6)+' weitere Positionen</small>':'')+
    '<div class="board-order-foot"><span>'+lines.length+' Positionen · '+(total-done)+' Stück offen</span><b>Groß ansehen ↗</b></div></article>';
 }
 function renderFullOrders(){
  if(workspace!=='orders'||!model)return;
  const query=searchText($('full-orders-search').value.trim());
  const rows=(model.orders||[]).filter(order=>{
   const finished=orderPrintProgress(order).complete;
   if(orderFilter==='ready'&&!finished)return false;
   if(orderFilter==='pending'&&finished)return false;
   return !query||searchText([order.id,order.customer,...(order.items||[]).flatMap(x=>[x.title,x.variant,x.color,x.personalization])].join(' ')).includes(query);
  }).sort((a,b)=>sort==='new'?(b.created-a.created):((a.ship_by||Infinity)-(b.ship_by||Infinity)||b.created-a.created));
  $('full-orders-count').textContent=(model.orders||[]).length+' offene Bestellungen · '+rows.length+' angezeigt';
  const host=$('full-orders-grid');host.className='board-order-grid as-'+orderView;
  host.innerHTML=rows.length?rows.map(orderCardFull).join(''):'<p class="board-no-results">Keine passenden Bestellungen gefunden.</p>';
  selectButtons('data-full-orders-view',orderView);
  selectButtons('data-full-orders-sort',sort);
  selectButtons('data-full-orders-filter',orderFilter);
 }
 function inventoryRows(){
  const query=searchText($('stock-search').value.trim()),result=[];
  let pieces=0,parts=0,variants=0,uncounted=0;
  for(const p of model.products||[]){
   const listed=[];
   for(const i of p.items||[]){
    const qty=shelf(i);
    if(qty===null)uncounted++;
    else if(qty>0){pieces+=qty;variants++;}
    if(stockFilter==='parts'||(onlyPositive&&!(qty>0)))continue;
    if(query&&!searchText(p.title+' '+i.label).includes(query))continue;
    listed.push({id:i.id,name:i.label,qty,free:free(i),type:'product'});
   }
   for(const part of p.components||[]){
    if(part.kind!=='stock')continue;
    const qty=count(part.stock);parts+=qty;
    if(stockFilter==='finished'||(onlyPositive&&qty===0))continue;
    if(query&&!searchText(p.title+' '+part.name).includes(query))continue;
    listed.push({id:part.id,name:part.name+(part.color?' · Farbe: '+part.color:''),qty,free:qty,type:'part'});
   }
   if(listed.length){
    listed.sort((a,b)=>(b.qty??-1)-(a.qty??-1)||a.name.localeCompare(b.name,'de'));
    result.push({p,rows:listed,qty:listed.reduce((n,row)=>n+(row.qty||0),0)});
   }
  }
  result.sort((a,b)=>a.p.title.localeCompare(b.p.title,'de'));
  return {result,pieces,parts,variants,uncounted};
 }
 function stockRow(product,row){
  const label=row.qty===null?'Zählen':row.qty+' ×';
  const controls=row.type==='part'
   ?'<button type="button" data-stock-part="'+esc(product.id)+'">Bearbeiten</button>'
   :'<button type="button" data-stock-edit="'+esc(row.id)+'">Bearbeiten</button>'+
    '<button type="button" class="board-plus" data-stock-plus="'+esc(row.id)+'" aria-label="Ein '+esc(row.name)+' einlagern">+1</button>';
  return '<div class="board-stock-line"><div><strong>'+esc(row.name)+'</strong>'+
    (row.type==='part'?'<small>Bauteilvorrat</small>':row.free!==null&&row.free<row.qty?
    '<small>'+row.free+' frei · '+(row.qty-row.free)+' für Bestellungen vorgemerkt</small>':'')+
    '</div><div class="board-stock-actions"><b>'+label+'</b>'+controls+'</div></div>';
 }
 function stockCardFull(group){
  const rows=group.rows,visible=rows.slice(0,6),hidden=rows.slice(6);
  return '<article class="board-stock-card"><div class="board-stock-image">'+picture(group.p.image,group.p.title)+
   '<span>'+group.qty+' × im Regal</span></div><div class="board-stock-content"><h3>'+esc(group.p.title)+'</h3>'+
   '<small>'+rows.length+' Varianten / Bauteile</small><div class="board-stock-lines">'+visible.map(x=>stockRow(group.p,x)).join('')+'</div>'+
   (hidden.length?'<details class="board-stock-more"><summary>Weitere '+hidden.length+' anzeigen</summary>'+
    '<div class="board-stock-lines">'+hidden.map(x=>stockRow(group.p,x)).join('')+'</div></details>':'')+
   '</div></article>';
 }
 function renderStock(){
  if(workspace!=='stock'||!model)return;
  const {result,pieces,parts,variants,uncounted}=inventoryRows();
  $('stock-pieces').textContent=pieces.toLocaleString('de-DE');
  $('stock-variants').textContent=variants.toLocaleString('de-DE');
  $('stock-parts').textContent=parts.toLocaleString('de-DE');
  $('stock-results').textContent=result.length+' Produkte'+(uncounted?' · '+uncounted+' Varianten noch nicht gezählt':'');
  const host=$('stock-grid');host.className='board-stock-grid as-'+stockView;
  host.innerHTML=result.length?result.map(stockCardFull).join(''):'<p class="board-no-results">Keine passenden vorhandenen Artikel. Aktiviere „Auch leere anzeigen“, um nicht gezählte Bestände aufzunehmen.</p>';
  selectButtons('data-stock-view',stockView);
  selectButtons('data-stock-filter',stockFilter);
  $('stock-only').checked=onlyPositive;
 }
 const previousShow=showWorkspace;
 showWorkspace=function(value){
  previousShow(value);
  $('full-orders-shell').hidden=value!=='orders';
  $('stock-shell').hidden=value!=='stock';
  if(value==='orders')renderFullOrders();
  if(value==='stock')renderStock();
 };
 const previousRender=render;
 render=function(){
  previousRender();
  if(workspace==='orders')renderFullOrders();
  if(workspace==='stock')renderStock();
 };
 $('full-orders-search').addEventListener('input',renderFullOrders);
 $('full-orders-tools').addEventListener('click',event=>{
  const view=event.target.closest('[data-full-orders-view]'),
        sorting=event.target.closest('[data-full-orders-sort]'),
        filtering=event.target.closest('[data-full-orders-filter]');
  if(view){orderView=view.dataset.fullOrdersView;save('pp-order-board',orderView);}
  else if(sorting)sort=sorting.dataset.fullOrdersSort;
  else if(filtering)orderFilter=filtering.dataset.fullOrdersFilter;
  else return;
  renderFullOrders();
 });
 $('full-orders-new').addEventListener('click',()=>$('local-order-new').click());
 $('full-orders-grid').addEventListener('click',async event=>{
  const quick=event.target.closest('[data-order-quick]');
  if(quick){event.stopPropagation();await runOrderQuick(quick);return;}
  const local=event.target.closest('[data-local-custom-action]');
  if(local){event.stopPropagation();await localCustomProductionClick(local);return;}
  const component=event.target.closest('[data-component-tid]');
  if(component){event.stopPropagation();await componentOrderAction(component);return;}
  const card=event.target.closest('[data-full-order]');
  if(card)showOrder(card.dataset.fullOrder);
 });
 $('full-orders-grid').addEventListener('keydown',event=>{
  const card=event.target.closest('[data-full-order]');
  if(card&&event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();showOrder(card.dataset.fullOrder);}
 });
 $('stock-search').addEventListener('input',renderStock);
 $('stock-tools').addEventListener('click',event=>{
  const view=event.target.closest('[data-stock-view]'),
        filter=event.target.closest('[data-stock-filter]');
  if(view){stockView=view.dataset.stockView;save('pp-stock-board',stockView);}
  else if(filter)stockFilter=filter.dataset.stockFilter;
  else return;
  renderStock();
 });
 $('stock-only').addEventListener('change',event=>{onlyPositive=event.target.checked;renderStock();});
 const oldComponentPatch=applyComponentStockPatch;
 applyComponentStockPatch=function(patch){
  oldComponentPatch(patch);
  if(workspace==='stock')renderStock();
 };
 $('stock-grid').addEventListener('click',async event=>{
  const edit=event.target.closest('[data-stock-edit]');
  const plus=event.target.closest('[data-stock-plus]');
  const part=event.target.closest('[data-stock-part]');
  if(edit){quantityDialog(edit.dataset.stockEdit,'set');return;}
  if(part){if(typeof componentOpen==='function'&&!busy)componentOpen(part.dataset.stockPart);return;}
  if(plus&&!busy){
   const id=plus.dataset.stockPlus,record=findItem(id);
   if(!record)return;
   if(record.i.on_hand===null){quantityDialog(id,'set');return;}
   await mutate('stock',{id,action:'adjust',delta:1});
  }
 });
})();
