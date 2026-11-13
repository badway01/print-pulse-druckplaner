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
  assert.equal(await card.locator('button.local-order-pdf[data-local-pdf-id]').count(),1,
   'local card must offer the A4 template selection');
  assert.equal(await card.locator('button.local-order-pdf').getAttribute('data-local-pdf-id'),local.id);
  await card.locator('button.local-order-pdf').click();
  await page.locator('#local-pdf-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('#local-pdf-dialog [data-local-pdf-kind]').count(),2);
  const pdfRoute='**/api/local-order-pdf?*';
  await page.route(pdfRoute,route=>route.fulfill({
   status:401,contentType:'text/plain',body:'401: Unauthorized'
  }));
  await page.locator('#local-pdf-dialog [data-local-pdf-kind="customer"]').click();
  await page.locator('#local-pdf-error').waitFor({state:'visible'});
  assert((await page.locator('#local-pdf-error').textContent()).includes('HTTP 401'),
   'Expired Home Assistant session must show a clear error, never download text');
  await page.unroute(pdfRoute);
  const directWorkPdf=await page.request.get('http://127.0.0.1:8099/api/local-order-pdf?id='+
   encodeURIComponent(local.id)+'&kind=internal');
  assert.equal(directWorkPdf.status(),200);
  assert((await directWorkPdf.body()).subarray(0,5).toString()==='%PDF-');
  const downloadPromise=page.waitForEvent('download');
  await page.locator('#local-pdf-dialog [data-local-pdf-kind="internal"]').click();
  const workDownload=await downloadPromise;
  assert(workDownload.suggestedFilename().includes('Werkstattauftrag'));
  await page.locator('#local-pdf-dialog').waitFor({state:'hidden'});
  await card.locator('[data-order-expand]').click();
  assert.equal(await page.locator('#order-details-content button.local-order-pdf[data-local-pdf-id]').count(),1);
  assert((await page.locator('#order-details-content').textContent()).includes('Jadeweiß'));
  assert((await page.locator('#order-details-content').textContent()).includes('Gravur von Hand'));
  await page.locator('#order-details-content .simple-order-advanced summary').click();
  await page.locator('#order-details-content [data-local-edit]').click();
  await page.locator('#local-notes').fill('Abholung nach 16 Uhr');
  await page.locator('#local-order-save').click();
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.orders.find(o=>o.id===local.id).notes,'Abholung nach 16 Uhr');
  // Custom print starts and finishes independently of counted Etsy variant stock.
  const custom=state.orders.find(o=>o.id===local.id).items[1];
  const initialStock=state.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black').on_hand;
  if(await page.locator('#order-details').isVisible())await page.locator('#order-details [data-close="order-details"]').click();
  await page.locator('.order-card').filter({hasText:local.id}).locator('[data-order-position]').nth(1).click();
  assert.equal(await page.locator('#order-position').isVisible(),true);
  await page.locator('#order-position [data-focus-action="start"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].printing===1,local.id);
  await page.locator('#order-position [data-focus-action="complete"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].finished===1,local.id);
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black').on_hand,initialStock);
  await page.locator('#order-position [data-focus-close]').click();
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

  // Existing local production records become ready without re-creating orders.
  const openLocal=state.orders.find(o=>o.id===local.id);
  const standard=openLocal.items[0];
  const current=state.products.find(p=>p.id==='102').items.find(i=>i.id==='102-default');
  const printResult=await page.request.post('http://127.0.0.1:8099/api/order-print',{
   data:{transaction_id:standard.transaction_id,receipt_id:local.id,
    action:'finish-direct',quantity:1,revision:current.revision}
  });
  assert.equal(printResult.status(),200,'finishing the remaining local order position must work');
  await page.reload();
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert.equal(state.orders.find(o=>o.id===local.id).status,'ready');
  const readyCard=page.locator('.order-card').filter({hasText:local.id});
  assert((await readyCard.textContent()).includes('Abholbereit'),'finished local card must show ready');
  assert.equal(await readyCard.locator('[data-local-handover]').count(),1);
  await readyCard.locator('[data-local-handover]').click();
  assert(await page.locator('#local-handover-dialog').isVisible());
  await page.locator('input[name="local-handover-method"][value="third_party"]').check();
  await page.locator('#local-handover-recipient').fill('Nachbarin');
  await page.locator('#local-handover-submit').click();
  await page.locator('#local-handover-dialog').waitFor({state:'hidden'});
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  assert(!state.orders.some(o=>o.id===local.id),'handed over local order must leave active cards');

  await page.locator('#local-history-open').click();
  await page.locator('.local-history-item').filter({hasText:local.id}).waitFor();
  const archived=page.locator('.local-history-item').filter({hasText:local.id});
  assert((await archived.textContent()).includes('Nachbarin'));
  assert.equal(await archived.locator('[data-local-undo-handover]').count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await archived.locator('[data-local-undo-handover]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.status==='ready',local.id);
  await page.locator('#local-history-dialog [data-close="local-history-dialog"]').click();
  await page.locator('#local-history-open').click();
  await page.waitForFunction(()=>document.querySelector('#local-history-list')?.textContent?.includes('Direktverkauf Test'));
  // Workshop services can be mixed in the same local order without catalog products.
  await page.locator('#local-history-dialog [data-close="local-history-dialog"]').click();
  await page.locator('#local-order-new').click();
  await page.locator('#local-customer').fill('Sonderarbeiten Test');
  assert(await page.locator('#local-add-line').evaluate(el=>el.parentElement?.previousElementSibling?.id==='local-order-lines'),
   'Add position must sit immediately after the final order row');
  await page.locator('[data-local-kind="0"]').selectOption('custom_print');
  await page.locator('[data-local-title="0"]').fill('Halterung nach Maß');
  await page.locator('[data-local-description="0"]').fill('55 mm breit, PETG schwarz');
  await page.locator('[data-local-quantity="0"]').fill('2');
  await page.locator('#local-add-line').click();
  await page.locator('[data-local-kind="1"]').selectOption('laser');
  await page.locator('[data-local-title="1"]').fill('Holzschild gravieren');
  await page.locator('[data-local-description="1"]').fill('Birke 3 mm, 10 × 15 cm');
  await page.locator('[data-local-personalization="1"]').fill('Anna & Tom');
  await page.locator('[data-local-color="1"]').fill('Naturholz');
  await Promise.all([
   page.waitForResponse(r=>r.url().endsWith('/api/local-order')&&r.request().method()==='POST'&&r.ok()),
   page.locator('#local-order-save').click()
  ]);
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  const bespoke=state.orders.find(o=>o.customer==='Sonderarbeiten Test');
  assert(bespoke,'Special services order must be saved');
  assert.deepEqual(bespoke.items.map(i=>i.title),['Halterung nach Maß','Holzschild gravieren']);
  assert.deepEqual(bespoke.items.map(i=>i.custom_kind),['custom_print','laser']);
  assert(bespoke.items.every(i=>i.item_id===null&&i.local_custom));
  const specialCard=page.locator('.order-card').filter({hasText:bespoke.id});
  await specialCard.locator('[data-order-position]').nth(1).click();
  assert((await page.locator('#order-position').textContent()).includes('Holzschild gravieren'));
  await page.locator('#order-position [data-focus-action="start"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].printing===1,bespoke.id);
  await page.locator('#order-position [data-focus-action="complete"]').click();
  await page.waitForFunction(id=>model.orders.find(o=>o.id===id)?.items[1].finished===1,bespoke.id);
  await page.locator('#order-position [data-focus-close]').click();

  assert.deepEqual(errors,[]);
  console.log('LOCAL UI PASS: search suggestions, variant rows, personalized production, due date, edit, direct sale, history');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
