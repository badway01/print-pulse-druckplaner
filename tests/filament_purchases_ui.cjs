'use strict';
/* Real Chromium regression: 14-line clipboard import, compact exceptions, manual edit, bulk edit, save. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1000,height:850}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const items=Array.from({length:14},(_,i)=>({
   brand:'Bambu Lab',material:'PLA Basic',color:'UI Testfarbe '+(i+1),
   manufacturer_code:String(119000+i),internal_code:'',color_hex:'',
   filament_id:null,quantity:1,grams:1000,packaging:'spool',
   gross_cents:1000,description:'',accept_changes:[]
  }));
  items[3].color='';items[6].gross_cents=null;items[6].packaging='unknown';
  let pasted=0;
  await page.route('**/api/filament-import-text',async route=>{
   pasted++;
   await route.fulfill({json:{vendor:'Bambu Lab',reference:'UI-14-FARBEN',
    ordered_on:'2026-10-30',total_cents:null,discount_cents:0,credit_cents:0,
    shipping_cents:0,source_type:'text',fingerprint:'',items,warnings:[]}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-workspace="filament"]').click();
  await page.locator('#pp-purchase-add').click();
  await page.locator('#pp-import-text').waitFor();
  await page.evaluate(()=>{
   const data=new DataTransfer();
   data.setData('text/plain','Bambu Lab: 14 Rollen Bestellung');
   const e=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
   document.querySelector('#pp-import-text').dispatchEvent(e);
  });
  await page.locator('.pp-import-summary').waitFor();
  assert.equal(pasted,1,'Pasting text should start parsing without extra click');
  assert.equal(await page.locator('.pp-line-compact').count(),14,'All 14 lines must be available');
  assert.equal(await page.locator('.pp-line-details[open]').count(),2,'Only the two exceptions auto expand');
  assert((await page.locator('.pp-import-summary').textContent()).includes('2 zu prüfen'));

  await page.locator('[data-pp-line="3"][data-pp-field="color"]').fill('UI Korrigiert 4');
  await page.locator('[data-pp-action="recheck"]').click();
  assert.equal(await page.locator('.pp-line-details[open]').count(),1);
  await page.locator('[data-pp-line="6"][data-pp-field="gross_cents"]').fill('10,00');
  await page.locator('select[data-pp-line="6"][data-pp-field="packaging"]').selectOption('refill');
  await page.locator('[data-pp-action="recheck"]').click();
  assert.equal(await page.locator('.pp-line-attention').count(),0);

  await page.locator('[data-pp-select="0"]').check();
  await page.locator('[data-pp-select="1"]').check();
  await page.locator('#pp-bulk-field').selectOption('quantity');
  await page.locator('#pp-bulk-value').fill('3');
  await page.locator('[data-pp-action="bulk"]').click();
  await page.locator('details[data-pp-details="0"] summary').click();
  assert.equal(await page.locator('[data-pp-line="0"][data-pp-field="quantity"]').inputValue(),'3');
  assert.equal(await page.locator('.pp-line-compact').count(),14);

  await page.locator('[data-pp-action="save"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const orders=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const order=orders.orders.find(o=>o.reference==='UI-14-FARBEN');
  assert(order,'One batch order should have been persisted');
  assert.equal(order.lines.length,14,'No imported line is lost');
  assert.equal(order.lines[0].quantity,3,'Bulk changes persisted');
  assert.equal(order.lines[1].quantity,3,'Second bulk selection persisted');
  assert.equal(order.received_count,0,'Import does not move any stock');
  assert.deepEqual(errors,[],'No browser JavaScript errors');
  console.log('FILAMENT BULK UI PASS: clipboard, 14 lines, exceptions, manual edits, batch edit, save');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
