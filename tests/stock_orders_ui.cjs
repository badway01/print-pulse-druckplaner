'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/api/status',async route=>{
   const reply=await route.fetch();
   const data=await reply.json();
   const product=data.products.find(p=>p.id==='103'),item=product.items[0];
   item.on_hand=7;item.allocatable=5;item.free=4;item.reserved=3;item.label='Farbe: Beige';
   const now=Math.floor(Date.now()/1000);
   const first={listing_id:'103',item_id:item.id,transaction_id:'line-a',image:'',
    title:'Regal aus Druck',variant:'Farbe: Beige',quantity:2,printing:0,finished:0,allocated:0,assembled:0,remaining:2};
   data.orders=[
    {id:'order-a',customer:'Testkunde Beige',created:now-7200,ship_by:now+36000,
      quantity:3,items:[first,{...first,transaction_id:'line-b',title:'Zweiter Artikel',quantity:1,remaining:1}]},
    {id:'order-b',customer:'Testkunde Blau',created:now-1800,ship_by:now+86400*4,
      quantity:1,items:[{...first,transaction_id:'line-c',quantity:1,finished:1,remaining:0}]}
   ];
   await route.fulfill({response:reply,json:data});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('.product').first().waitFor();
  assert.equal(await page.locator('[data-workspace="production"] span').textContent(),'Aufträge & Druckplan');
  await page.locator('[data-workspace="orders"]').click();
  assert.equal(await page.locator('#full-orders-shell').isVisible(),true);
  assert.equal(await page.locator('#orders-shell').isVisible(),false);
  assert.equal(await page.locator('#full-orders-grid .board-order').count(),2);
  assert.equal(await page.locator('#full-orders-grid .board-order-product').count(),3);
  await page.locator('[data-full-orders-view="list"]').click();
  assert.equal(await page.locator('#full-orders-grid').getAttribute('class'),'board-order-grid as-list');
  await page.locator('#full-orders-search').fill('Beige');
  assert.equal(await page.locator('#full-orders-grid .board-order').count(),1);
  await page.locator('#full-orders-search').fill('');
  await page.locator('[data-full-orders-filter="ready"]').click();
  assert.equal(await page.locator('#full-orders-grid .board-order').count(),1);
  await page.locator('[data-full-orders-filter="all"]').click();
  await page.locator('[data-full-order="order-a"]').click();
  assert.equal(await page.locator('#order-details').isVisible(),true);
  assert.equal(await page.locator('#order-details .order-work-items .order-work-item').count(),2);
  await page.locator('[data-close="order-details"]').click();
  await page.locator('[data-workspace="production"]').click();
  assert.equal(await page.locator('#orders-shell').isVisible(),true);
  assert.equal(await page.locator('[data-order-expand]').count(),2);
  await page.locator('[data-workspace="stock"]').click();
  assert.equal(await page.locator('#stock-shell').isVisible(),true);
  assert.equal(await page.locator('#orders-shell').isVisible(),false);
  const stock=page.locator('#stock-grid');
  assert(await stock.locator('.board-stock-card').count()>0);
  const beige=stock.locator('.board-stock-line').filter({hasText:'Farbe: Beige'});
  assert.equal(await beige.count(),1);
  assert((await beige.textContent()).includes('5 ×'),'already assigned orders excluded from shelf count');
  assert((await beige.textContent()).includes('4 frei'),'pending reservations shown separately');
  await page.locator('[data-stock-view="list"]').click();
  assert.equal(await stock.getAttribute('class'),'board-stock-grid as-list');
  await page.locator('#stock-search').fill('nichts-vorhanden');
  assert.equal(await stock.locator('.board-stock-card').count(),0);
  await page.locator('#stock-search').fill('Beige');
  assert.equal(await beige.count(),1);
  await page.locator('[data-stock-filter="parts"]').click();
  assert.equal(await beige.count(),0);
  await page.locator('[data-stock-filter="all"]').click();
  await page.setViewportSize({width:390,height:844});
  const bounds=await stock.evaluate(el=>({right:el.getBoundingClientRect().right,viewport:innerWidth}));
  assert(bounds.right<=bounds.viewport+1,'stock board fits phone');
  assert.deepEqual(errors,[]);
  console.log('STOCK & ORDERS UI PASS');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
