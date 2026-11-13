'use strict';
/* WebKit iPhone regression: tapping suggestions must select products and save a local order. */
const {webkit,devices}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await webkit.launch({headless:true});
 const context=await browser.newContext({...devices['iPhone 13']});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-product="102"]').waitFor();
  await page.locator('#local-order-new').tap();
  const name='Mobile Auswahl '+Date.now();
  await page.locator('#local-customer').fill(name);
  await page.locator('[data-local-search="0"]').fill('Buchstaben');
  await page.locator('[data-local-choose="0"]').first().waitFor({state:'visible'});
  await page.locator('[data-local-choose="0"]').first().tap();
  assert((await page.locator('[data-local-search="0"]').inputValue()).includes('Buchstaben'),
   'Product must be selected after touch');
  await page.locator('[data-local-variant="0"]').selectOption('103-default');

  // Multi-position order, as in the iPhone screenshot.
  await page.locator('#local-add-line').tap();
  await page.locator('[data-local-search="1"]').fill('Kleine Winter');
  const suggestion=page.locator('[data-local-choose="1"]').first();
  await suggestion.waitFor({state:'visible'});
  await suggestion.tap();
  assert((await page.locator('[data-local-search="1"]').inputValue()).includes('Kleine Winter'));
  await page.locator('[data-local-variant="1"]').selectOption('102-black');
  await page.locator('[data-local-color="1"]').fill('11 Pink-Pastell');

  assert.equal(await page.locator('[data-local-search="1"]').getAttribute('aria-expanded'),'false');
  assert(await page.locator('#local-add-line').evaluate(el=>el.previousElementSibling?.id==='local-order-lines'),
   'Bottom add button must remain immediately after the last position on iPhone');
  await page.locator('#local-add-line').tap();
  await page.locator('[data-local-kind="2"]').selectOption('laser');
  await page.locator('[data-local-title="2"]').fill('Namensschild lasern');
  await page.locator('[data-local-description="2"]').fill('3 mm Holz, Kundenmotiv');
  await page.locator('[data-local-personalization="2"]').fill('Testname');
  await Promise.all([
   page.waitForResponse(r=>r.url().endsWith('/api/local-order')&&r.request().method()==='POST'&&r.ok()),
   page.locator('#local-order-save').tap()
  ]);
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  const response=await page.request.get('http://127.0.0.1:8099/api/status');
  assert(response.ok());
  const state=await response.json();
  const order=state.orders.find(o=>o.source==='local'&&o.customer===name);
  assert(order,'Mobile local order was not saved');
  assert.equal(order.items.length,3);
  assert.deepEqual(order.items.slice(0,2).map(item=>item.selected_variant_id),['103-default','102-black']);
  assert.equal(order.items[2].title,'Namensschild lasern');
  assert.equal(order.items[2].custom_kind,'laser');
  assert.equal(order.items[2].item_id,null);
  assert.equal(order.items[1].color,'11 Pink-Pastell');
  assert.deepEqual(errors,[]);
  console.log('MOBILE LOCAL PASS: WebKit touch selections, two positions, persisted order');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
