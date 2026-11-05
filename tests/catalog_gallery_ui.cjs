'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({
   viewport:{width:1280,height:900},
   userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
  });
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const file={id:'aaaaaaaaaaaaaaaaaaaaaaaa',listing_id:'101',variant_id:'',
    printer:'H2D',filename:'Gemeinsamer_Geist.3mf',
    bytes:1048576,created:Math.floor(Date.now()/1000),
    insights:{total_grams:28,time_seconds:5400,filaments:[]}};
  await page.route('**/api/print-tools*',route=>route.fulfill({
   json:{files:[file],profiles:[],component_links:[],order_master_defaults:[],filaments_library:[]}
  }));
  await page.route('**/api/master-thumbnail*',route=>route.fulfill({
   status:404,json:{error:'No embedded thumbnail'}
  }));
  await page.route('**/api/master-share-inbox',route=>route.fulfill({
   json:{files:[],folder:'/share/print-pulse/3mf-eingang'}
  }));
  await page.route('**/api/filaments',route=>route.fulfill({json:{filaments:[]}}));
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-workspace="catalog"]').click();
  await page.evaluate(()=>{const p=model.products.find(p=>p.id==='101');p.items.push({...p.items[0],id:'101-color-two',label:'Farbe: Schwarz'});renderCatalog();});
  await page.locator('[data-catalog-item="101"] [data-catalog-expand]').click();
  const card=page.locator('[data-catalog-item="101"]');
  await card.locator('[data-catalog-file="'+file.id+'"]').waitFor();
  assert.equal(await card.locator('[data-catalog-file]').count(),1);
  assert.match(await card.innerText(),/Alle Farbvarianten/);
  assert.match(await card.innerText(),/1 h 30 min/);
  assert.match(await card.innerText(),/28 g/);
  await card.locator('[data-catalog-variant]').selectOption({index:1});
  assert.equal(await card.locator('[data-catalog-file]').count(),1,'Shared masters must remain visible for specific colors');
  await card.locator('.pp-catalog-file-extra>[data-catalog-info]').click();
  assert.match(await card.locator('.pp-catalog-file-popover').innerText(),/1[.,]0 MB/);
  await card.locator('.pp-catalog-file-open>summary').click();
  assert.equal(await card.locator('.pp-catalog-open-links .pp-slicer-action').count(),4);
  assert.match(await card.locator('.pp-slicer-prusa').getAttribute('href'),/^printpulse3mf:\/\/prusa\/aaaaaaaaaaaaaaaaaaaaaaaa/);
  await page.locator('[data-catalog-view="list"]').click();
  assert.equal(await page.locator('#catalog-rows').evaluate(el=>el.classList.contains('pp-catalog-list')),true);
  assert.equal(await page.locator('[data-catalog-item="101"] [data-catalog-file]').count(),1);
  await card.locator('[data-master-open]').first().click();
  assert.equal(await page.locator('#master-variant').inputValue(),'','The default must be shared across color variants');
  await page.locator('[data-close="master-editor"]').click();
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('MakerWorld-inspired catalog shared-master checks passed.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
