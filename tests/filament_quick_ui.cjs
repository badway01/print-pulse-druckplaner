'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const base='http://127.0.0.1:8099';
  const create=await page.request.post(base+'/api/filament',{data:{
   action:'save',id:null,brand:'Bambu Lab',material:'PLA Basic',
   color:'GLD Testfarbe',color_hex:'#ddffee',
   stock_qty:2,open_qty:0,internal_code:'',manufacturer_code:'',
   notes:'',purchase_url:'',price:'10,00'
  }});
  assert.equal(create.status(),200,await create.text());
  const all=await create.json();
  const target=all.filaments.find(f=>f.color==='GLD Testfarbe');
  assert(target?.id);
  await page.goto(base+'/');
  await page.locator('[data-workspace="filament"]').click();
  await page.locator('#filament-rows [data-filament-rolls="'+target.id+'"]').click();
  assert.equal(await page.locator('#filament-rolls').isVisible(),true);
  assert.equal(await page.locator('#filament-rolls-full').textContent(),'2');
  await page.locator('#filament-roll-add').click();
  assert.equal(await page.locator('#filament-quick-dialog').isVisible(),true);
  assert.equal(await page.locator('#filament-quick-id').inputValue(),String(target.id));
  await page.locator('#filament-quick-quantity').fill('3');
  await page.locator('#filament-quick-price').fill('14,00');
  assert((await page.locator('#filament-quick-preview').textContent()).includes('12,40'));
  await page.locator('#filament-quick-save').click();
  await page.locator('#filament-quick-dialog').waitFor({state:'hidden'});
  await page.locator('#filament-rolls').waitFor({state:'visible'});
  assert.equal(await page.locator('#filament-rolls-full').textContent(),'5');
  assert.equal(await page.locator('#pp-purchase-shell').isVisible(),false,
   'old purchase/receipt workflow must not be visible');
  await page.locator('#filament-rolls [data-close="filament-rolls"]').click();
  await page.locator('#filament-quick-top').click();
  await page.locator('#filament-quick-id').selectOption(String(target.id));
  await page.locator('#filament-quick-quantity').fill('1');
  await page.locator('#filament-quick-price').fill('10,00');
  assert((await page.locator('#filament-quick-preview').textContent()).includes('12,00'));
  await page.locator('#filament-quick-save').click();
  await page.locator('#filament-quick-dialog').waitFor({state:'hidden'});
  const current=await page.request.get(base+'/api/filaments').then(r=>r.json());
  const spool=current.filaments.find(f=>f.id===target.id);
  assert.equal(spool.stock_qty,6);
  assert.equal(spool.price_cents,1200);
  assert.equal(spool.gl_d_active,1);
  await page.locator('[data-workspace="production"]').click();
  const cardCheck=await page.evaluate(()=>{
   if(!model.orders?.length)return null;
   const sample=model.orders[0],template=document.createElement('div');
   template.innerHTML=orderCard(sample);
   const card=template.querySelector('.order-card');
   return {
    headerText:card.querySelector('.pp-order-overview')?.textContent||'',
    totalTiles:card.querySelectorAll('.simple-order-tile').length,
    products:sample.items.length,
    itemTitle:orderShortProductTitle(sample.items[0].title),
    productInHeader:card.querySelector('.pp-order-overview')?.textContent.includes(orderShortProductTitle(sample.items[0].title))
   };
  });
  if(cardCheck){
   assert(cardCheck.headerText.includes('KUNDENBESTELLUNG'));
   assert.equal(cardCheck.totalTiles,cardCheck.products);
   assert.equal(cardCheck.productInHeader,false,'first ordered product must only appear in its one product tile');
  }
  assert.deepEqual(errors,[]);
  console.log('FILAMENT QUICK / GLD / DASHBOARD UI PASS: mobile, direct receipt, real average, no duplicate order title');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
