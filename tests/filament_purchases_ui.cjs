'use strict';
/* iPhone regression: 14 compact rows, one focused editor, auto-paste, oversize feedback, bulk edits. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  const items=Array.from({length:14},(_,i)=>({
   brand:'Bambu Lab',material:'PLA Basic',color:'UI Testfarbe '+(i+1),
   manufacturer_code:String(119000+i),internal_code:'',color_hex:'',
   filament_id:null,quantity:1,grams:1000,packaging:'spool',
   gross_cents:1000,description:'',accept_changes:[]
  }));
  items[3].color='';
  items[6].gross_cents=null;items[6].packaging='unknown';
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
  await page.locator('#pp-file').setInputFiles({
   name:'zu-grosse-rechnung.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(13*1024*1024)
  });
  await page.locator('#pp-purchase-error').waitFor({state:'visible'});
  assert((await page.locator('#pp-purchase-error').textContent()).includes('12 MB'));
  assert.equal(await page.locator('#pp-purchase-error').evaluate(el=>el.previousElementSibling?.classList.contains('dialog-heading')),true,
   'Error must be immediately after title, not at the bottom of a long form');
  // iOS paste-menu fallback: inputType insertFromPaste triggers import without a second tap.
  await page.locator('#pp-import-text').evaluate(el=>{
   el.value='Bambu Lab: 14 Rollen Bestellung';
   el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));
  });
  await page.locator('.pp-review-list').waitFor();
  assert.equal(pasted,1);
  assert.equal(await page.locator('.pp-review-row').count(),14);
  assert.equal(await page.locator('.pp-line-compact').count(),1,
   'Only the focused exception may render the large editor');
  assert((await page.locator('.pp-import-summary').textContent()).includes('2 zu prüfen'));
  assert.equal(await page.locator('#pp-purchase-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2),true,
   'mobile dialog should not require horizontal scrolling');
  assert((await page.locator('.pp-review-focus-heading').textContent()).includes('Position 4'));

  await page.locator('[data-pp-line="3"][data-pp-field="color"]').fill('UI Korrigiert 4');
  await page.locator('[data-pp-action="reviewed"]').click();
  assert((await page.locator('.pp-review-focus-heading').textContent()).includes('Position 7'),
   'after confirming first exception, focus next remaining error automatically');
  await page.locator('[data-pp-line="6"][data-pp-field="gross_cents"]').fill('10,00');
  await page.locator('select[data-pp-line="6"][data-pp-field="packaging"]').selectOption('refill');
  await page.locator('[data-pp-action="reviewed"]').click();
  assert.equal(await page.locator('.pp-review-focus').count(),0);
  assert((await page.locator('.pp-review-progress').textContent()).includes('0 von 14'));
  assert.equal(await page.locator('.pp-review-row').count(),14);

  await page.locator('[data-pp-select="0"]').check();
  await page.locator('[data-pp-select="1"]').check();
  await page.locator('.pp-bulk-details summary').click();
  await page.locator('#pp-bulk-field').selectOption('quantity');
  await page.locator('#pp-bulk-value').fill('3');
  await page.locator('[data-pp-action="bulk"]').click();
  await page.locator('[data-pp-action="focus"][data-pp-index="0"]').click();
  assert.equal(await page.locator('[data-pp-line="0"][data-pp-field="quantity"]').inputValue(),'3');

  await page.locator('[data-pp-action="save"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const orders=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const order=orders.orders.find(o=>o.reference==='UI-14-FARBEN');
  assert(order,'The whole batch must be saved in a single order');
  assert.equal(order.lines.length,14);
  assert.equal(order.lines[0].quantity,3);
  assert.equal(order.lines[1].quantity,3);
  assert.equal(order.received_count,0,'Saving a batch must not book stock');
  assert.deepEqual(errors,[],'No browser JavaScript errors');
  console.log('FILAMENT BULK UI PASS: iPhone, top warning, auto paste, one editor, next issue, batch save');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
