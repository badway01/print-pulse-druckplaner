'use strict';
/* Chromium smoke test: actual local-order dialog and persisted API state. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:850}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-product="102"]').waitFor();
  await page.locator('#local-order-new').click();
  await page.locator('#local-customer').fill('Kundin Vasen');
  const due=new Date(Date.now()+5*86400000).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
  await page.locator('#local-due').fill(due);
  await page.locator('[data-local-search="0"]').fill('Kleine Winter');
  await page.locator('[data-local-choose="0"]').first().click();
  await page.locator('[data-local-variant="0"]').selectOption('102-default');
  await page.locator('[data-local-quantity="0"]').fill('1');
  await page.locator('#local-add-line').click();
  await page.locator('[data-local-search="1"]').fill('Kleine Winter');
  await page.locator('[data-local-choose="1"]').first().click();
  await page.locator('[data-local-variant="1"]').selectOption('102-black');
  await page.locator('[data-local-color="1"]').fill('Jadeweiß');
  await page.locator('[data-local-personalization="1"]').fill('Gravur von Hand');
  await page.locator('[data-local-quantity="1"]').fill('1');
  await Promise.all([
   page.waitForResponse(r=>r.url().endsWith('/api/local-order')&&r.request().method()==='POST'),
   page.locator('#local-order-save').click()
  ]);
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  let state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  const local=state.orders.find(o=>o.source==='local'&&o.customer==='Kundin Vasen');
  assert(local,'Local order must be visible alongside Etsy orders');
  assert.equal(local.items.length,2);
  assert.deepEqual(local.items.map(i=>i.selected_variant_id),['102-default','102-black']);
  assert.equal(local.items[1].color,'Jadeweiß');
  assert.equal(local.items[1].personalization,'Gravur von Hand');
  assert.equal(local.items[1].local_custom,true);
  assert.equal(local.items[1].item_id,null,'A custom colour may not debit an Etsy stock variant');
  const pdfResponse=await page.request.get('http://127.0.0.1:8099/api/local-order-pdf?id='+encodeURIComponent(local.id));
  assert.equal(pdfResponse.status(),200,'active local customer PDF must download');
  assert((pdfResponse.headers()['content-type']||'').startsWith('application/pdf'));
  assert((pdfResponse.headers()['content-disposition']||'').includes('attachment'));
  assert((await pdfResponse.body()).subarray(0,5).toString()==='%PDF-');
  const absent=await page.request.get('http://127.0.0.1:8099/api/local-order-pdf?id=LOK-NOT-FOUND');
  assert.equal(absent.status(),404,'unknown local orders must not leak customer data');

  await page.reload();
  const card=page.locator('.order-card').filter({hasText:local.id});
  assert.equal(await card.locator('a.local-order-pdf[download]').count(),1,
   'local card needs a directly accessible A4 print/PDF link');
  assert((await card.locator('a.local-order-pdf').getAttribute('href')).includes(encodeURIComponent(local.id)));
  await card.locator('[data-order-open]').click();
  assert.equal(await page.locator('#order-details-content a.local-order-pdf[download]').count(),1);
  assert((await page.locator('#order-details-content').textContent()).includes('Jadeweiß'));
  assert((await page.locator('#order-details-content').textContent()).includes('Gravur von Hand'));
  await page.locator('#order-details-content [data-local-edit]').click();
  await page.locator('#local-notes').fill('Abholung nach 16 Uhr');
  await page.locator('#local-order-save').click();
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.orders.find(o=>o.id===local.id).notes,'Abholung nach 16 Uhr');
  // Custom print starts and finishes independently of counted Etsy variant stock.
  const custom=state.orders.find(o=>o.id===local.id).items[1];
  const initialStock=state.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black').on_hand;
  await page.locator('.order-card').filter({hasText:local.id}).locator('[data-order-open]').click();
  await page.locator('#order-details-content [data-local-type="start"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].printing===1,local.id);
  await page.locator('#order-details-content [data-local-type="finish"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].finished===1,local.id);
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black').on_hand,initialStock);
  await page.locator('#order-details [data-close="order-details"]').click();
  // A completed direct sale decrements only physically free counted stock.
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  const before=state.products.find(p=>p.id==='103').items.find(i=>i.id==='103-default').on_hand;
  assert(before>=1);
  await page.locator('#local-order-new').click();
  await page.locator('#local-customer').fill('Direktverkauf Test');
  await page.locator('#local-order-type input[value="direct"]').check();
  await page.locator('[data-local-search="0"]').fill('Buchstaben');
  await page.locator('[data-local-choose="0"]').first().click();
  await page.locator('[data-local-variant="0"]').selectOption('103-default');
  await page.locator('#local-order-save').click();
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.products.find(p=>p.id==='103').items.find(i=>i.id==='103-default').on_hand,before-1);
  assert(!state.orders.some(o=>o.customer==='Direktverkauf Test'));
  await page.locator('#local-history-open').click();
  await page.waitForFunction(()=>document.querySelector('#local-history-list')?.textContent?.includes('Direktverkauf Test'));
  assert.deepEqual(errors,[]);
  console.log('LOCAL UI PASS: search suggestions, variant rows, personalized production, due date, edit, direct sale, history');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
