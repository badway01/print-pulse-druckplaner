'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PP_TEST_CHROMIUM?{executablePath:process.env.PP_TEST_CHROMIUM}: {})});
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
      quantity:1,items:[{...first,transaction_id:'line-c',variant:'Farbe: Blau',quantity:1,finished:1,remaining:0}]}
   ];
   data.order_counts={today:4,week:18,month:67};
   await route.fulfill({response:reply,json:data});
  });
  await page.route('**/api/shipping-address',route=>route.fulfill({json:{address:{first_name:'Test',last_name:'Blau',street:'Testweg',number:'2',zip:'12345',city:'Teststadt',country:'DEU'},notice:''}}));
  await page.route('**/api/hermes-export',async route=>{
   const rows=route.request().postDataJSON().rows;
   assert.equal(rows.length,1);assert.equal(rows[0].id,'order-b');assert.equal(rows[0].confirmed,true);assert.equal(rows[0].address.number,'2a');
   await route.fulfill({json:{count:1,content:Buffer.from('Test;Blau;;Testweg;2a;12345;Teststadt;;DEU;;;;\r\n').toString('base64')}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('.product').first().waitFor();
  assert.equal(await page.locator('[data-workspace="production"] span').textContent(),'Dashboard');
  assert.equal(await page.locator('#dashboard-title').textContent(),'Dashboard');
  assert.equal(await page.locator('.dashboard-sync-details').getAttribute('open'),null,'sync details collapsed by default');
  await page.locator('.dashboard-sync-details summary').click();
  assert(await page.locator('#sync').isVisible());
  await page.locator('.dashboard-sync-details summary').click();
  assert.equal(await page.locator('#dashboard-orders-summary').isVisible(),true);
  assert.equal(await page.locator('#orders-today').textContent(),'4');
  assert.equal(await page.locator('#orders-week').textContent(),'18');
  assert.equal(await page.locator('#orders-month').textContent(),'67');
  assert.equal(await page.locator('.order-card,.board-order').count(),0,'dashboard must not render duplicate cards');
  await page.setViewportSize({width:390,height:844});
  const summary=await page.locator('#dashboard-orders-open').boundingBox();
  assert(summary.width<=390&&summary.height<170,'order summary must fit on phones and stay compact');
  const title=await page.locator('#dashboard-title').boundingBox(),printer=await page.locator('#printer-strip').boundingBox();
  assert(title.y+title.height<=summary.y,'orders must appear directly under dashboard title');
  assert(printer.y>=summary.y+summary.height&&printer.y-(summary.y+summary.height)<=30,'printer status follows order summary immediately');
  await page.locator('#dashboard-orders-open').click();
  await page.setViewportSize({width:1280,height:900});
  assert.equal(await page.locator('#full-orders-shell').isVisible(),true);
  assert.equal(await page.locator('#orders-shell').isVisible(),false);
  assert.equal(await page.locator('#dashboard-orders-summary').isVisible(),false);
  assert.equal(await page.locator('#dashboard-title').isVisible(),false);
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
  await page.locator('[data-workspace="shipping"]').click();
  assert(await page.locator('#shipping-shell').isVisible());
  assert.equal(await page.locator('#shipping-cards .pp-shipping-card').count(),1);
  await page.locator('[data-shipping-select]').check();
  await page.waitForFunction(()=>document.querySelector('[data-shipping-field="zip"]')?.value==='12345');
  await page.locator('[data-shipping-confirm]').check();
  assert(!(await page.locator('#shipping-export').isDisabled()));
  await page.locator('[data-shipping-field="number"]').fill('2a');
  assert(await page.locator('#shipping-export').isDisabled());
  await page.locator('[data-shipping-confirm]').check();
  const download=page.waitForEvent('download');await page.locator('#shipping-export').click();
  assert((await download).suggestedFilename().startsWith('Hermes-Adressen-'));
  await page.locator('[data-workspace="orders"]').click();
  await page.locator('[data-full-order="order-a"]').click();
  assert.equal(await page.locator('#order-details').isVisible(),true);
  assert.equal(await page.locator('#order-details .simple-order-zoom-tiles .simple-order-tile').count(),2);
  await page.locator('[data-close="order-details"]').click();
  await page.locator('[data-full-orders-view="cards"]').click();
  assert.equal(await page.locator('#orders-shell').isVisible(),true);
  assert.equal(await page.locator('[data-order-expand]').count(),2);
  assert.equal(await page.locator('#full-orders-grid .board-order').count(),0);
  await page.locator('[data-workspace="production"]').click();
  assert(await page.locator('#dashboard-orders-summary').isVisible());
  assert.equal(await page.locator('.order-card,.board-order').count(),0);
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
