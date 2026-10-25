'use strict';
/* Order enlargement on top of existing Etsy, component and local-order logic.
   No new booking paths: all actions remain the original order-work buttons. */
(() => {
 const originalCard=orderCard;
 orderCard=function(order){
  const html=originalCard(order);
  const icon='<button type="button" class="order-card-zoom" data-order-expand="'+esc(order.id)+'" aria-label="Bestellung '+esc(order.id)+' groß anzeigen" title="Großansicht öffnen">'+
   '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/></svg></button>';
  // Keep all card content and actions exactly as before, including local PDFs.
  return html.replace(/(<div class="order-card-top">[\s\S]*?)(<small>[^<]*<\/small>)(<\/div>)/,
    (_,start,date,end)=>start+'<span class="order-card-top-tools">'+date+icon+'</span>'+end);
 };
 $('orders').addEventListener('click',event=>{
  const button=event.target.closest('[data-order-expand]');
  if(button)showOrder(button.dataset.orderExpand);
 });

 const modal=$('order-details');
 const header=modal.querySelector('.dialog-heading');
 header.classList.add('order-zoom-header');
 const title=header.querySelector('h2');
 const label=document.createElement('span');
 label.className='order-zoom-kicker';
 label.textContent='AUFTRAG · GROẞANSICHT';
 const titleBox=document.createElement('div');
 titleBox.className='order-zoom-header-copy';
 title.before(titleBox);
 titleBox.append(label,title);
 header.querySelector('[data-close]')?.classList.add('order-zoom-close');

 const originalShow=showOrder;
 showOrder=function(id){
  originalShow(id); // Includes local customer notes, PDFs and component actions.
  const order=(model?.orders||[]).find(o=>String(o.id)===String(id));
  if(!order||!modal.open)return;
  const content=$('order-details-content');
  const meta=content.querySelector('.order-work-meta');
  const progress=orderPrintProgress(order);
  const number=Math.max(0,progress.total-progress.finished);
  if(meta){
   meta.insertAdjacentHTML('afterend',
    '<div class="order-zoom-stats" aria-label="Auftragsfortschritt">'+
    '<div><small>Positionen</small><strong>'+(order.items||[]).length+'</strong></div>'+
    '<div><small>Bestellte Stücke</small><strong>'+progress.total+'</strong></div>'+
    '<div><small>Für Auftrag fertig</small><strong class="order-zoom-ready">'+progress.finished+'</strong></div>'+
    '<div><small>Noch nicht fertig</small><strong>'+number+'</strong></div></div>');
  }
  const worklist=content.querySelector('.order-worklist');
  if(!worklist)return;
  const items=Array.from(worklist.children).filter(el=>el.classList.contains('order-work-item'));
  if(!items.length)return;
  const grid=document.createElement('div');
  grid.className='order-work-items '+(items.length===1?'is-single':'is-multi');
  items.forEach((item,index)=>{
   const main=document.createElement('div');
   main.className='order-zoom-item-main';
   const kicker=document.createElement('span');
   kicker.className='order-zoom-line-number';
   kicker.textContent='POSITION '+(index+1)+' VON '+items.length;
   main.append(kicker);
   const side=document.createElement('div');
   side.className='order-zoom-item-side';
   for(const child of Array.from(item.children)){
    if(child.matches('.order-work-product,.order-work-variants,.local-line-notes'))
     main.append(child);
    else side.append(child);
   }
   item.append(main,side);
   grid.append(item);
  });
  worklist.append(grid);
 };
})();
