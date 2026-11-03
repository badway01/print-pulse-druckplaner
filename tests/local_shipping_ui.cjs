'use strict';
/* End-to-end: local order -> finished -> Hermes shipment -> searchable history -> undo. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-product="103"]').waitFor();
  await page.locator('#local-order-new').click();
  await page.locator('#local-customer').fill('Versand Kundin Hermes');
  await page.locator('#local-fulfillment').selectOption('shipping');
  const due=new Date(Date.now()+5*86400000).toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
  await page.locator('#local-due').fill(due);
  await page.locator('[data-local-search="0"]').fill('Buchstaben');
  await page.locator('[data-local-choose="0"]').first().click();
  await page.locator('[data-local-variant="0"]').selectOption('103-default');
  await page.locator('#local-order-save').click();
  await page.locator('#local-order-dialog').waitFor({state:'hidden'});
  let state=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
  const o=state.orders.find(x=>x.source==='local'&&x.customer==='Versand Kundin Hermes');
  assert(o,'local shipping order was not created');
  assert.equal(o.fulfillment,'shipping');
  const item=state.products.find(p=>p.id==='103').items.find(i=>i.id==='103-default');
  const response=await page.request.post('http://127.0.0.1:8099/api/order-print',{
   data:{transaction_id:o.items[0].transaction_id,receipt_id:o.id,
    action:'finish-direct',quantity:1,revision:item.revision}
  });
  assert.equal(response.status(),200,'order must be finishable');
  await page.reload();
  const card=page.locator('.order-card').filter({hasText:o.id});
  await card.locator('[data-local-handover]').click();
  await page.locator('#local-handover-dialog').waitFor({state:'visible'});
  assert.equal(await page.locator('input[name="local-handover-method"][value="shipped"]').isChecked(),true);
  assert.equal(await page.locator('#local-handover-shipping').isVisible(),true);
  await page.locator('#local-handover-carrier').selectOption('Hermes');
  await page.locator('#local-handover-tracking').fill('02307106009073');
  await page.locator('#local-handover-submit').click();
  await page.locator('#local-handover-dialog').waitFor({state:'hidden'});
  const history=await page.request.get('http://127.0.0.1:8099/api/local-orders?search=02307106009073&stage=shipped').then(r=>r.json());
  const saved=history.orders.find(x=>x.id===o.id);
  assert(saved,'shipped order must be found by tracking number');
  assert.equal(saved.shipping_carrier,'Hermes');
  assert.equal(saved.tracking_number,'02307106009073');
  assert.equal(saved.handover_method,'shipped');
  assert.equal(saved.status,'completed');
  assert.equal(saved.items.length,1);

  await page.locator('[data-workspace="orders"]').click();
  await page.locator('#full-orders-history').click();
  await page.locator('#local-history-dialog').waitFor({state:'visible'});
  await page.locator('#local-history-stage').selectOption('shipped');
  await page.locator('#local-history-search').fill('02307106009073');
  const entry=page.locator('.local-history-item').filter({hasText:o.id});
  await entry.waitFor();
  assert((await entry.textContent()).includes('Hermes'));
  assert((await entry.textContent()).includes('02307106009073'));
  assert.equal(await entry.locator('[data-local-copy-tracking]').count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await entry.locator('[data-local-undo-handover]').click();
  await page.waitForFunction(id=>model.orders.find(x=>x.id===id)?.status==='ready',o.id);
  const oldData=await page.request.get('http://127.0.0.1:8099/api/local-orders?search=02307106009073').then(r=>r.json());
  assert.equal(oldData.orders.some(x=>x.id===o.id),false,'reverted order must not retain tracking');
  assert.deepEqual(errors,[]);
  console.log('LOCAL SHIPPING UI PASS: Hermes carrier, tracking, shipment, searchable history, undo on mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
