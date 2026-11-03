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
  items[3].brand='';
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
  await page.locator('#pp-purchase-import').click();
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
  assert((await page.locator('.pp-required-errors').textContent()).includes('Farbe fehlt'),
   'Missing compulsory field must be explicitly named in red');
  assert((await page.locator('.pp-required-errors').textContent()).includes('Hersteller fehlt'));
  assert.equal(await page.locator('[data-pp-line="3"][data-pp-field="brand"]').getAttribute('aria-invalid'),'true');
  await page.locator('[data-pp-line="3"][data-pp-field="brand"]').fill('bAmBu');
  await page.locator('.pp-auto-list:visible [data-pp-auto-value="Bambu Lab"]').first().click();
  assert.equal(await page.locator('[data-pp-line="3"][data-pp-field="brand"]').inputValue(),'Bambu Lab');
  assert.equal(await page.locator('[data-pp-line="3"][data-pp-field="brand"]').getAttribute('aria-invalid'),null,
   'Red error must clear immediately without re-opening the editor');
  await page.locator('[data-pp-line="3"][data-pp-field="color"]').fill('UI Korrigiert 4');
  assert.equal(await page.locator('.pp-required-errors').count(),0,'All errors clear while typing');
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
  assert((await page.locator('[data-pp-price-hint="0"]').textContent()).includes('3,33'),
   'Cost must be split by the entered three rolls');

  await page.locator('[data-pp-action="save"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const orders=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const order=orders.orders.find(o=>o.reference==='UI-14-FARBEN');
  assert(order,'The whole batch must be saved in a single order');
  assert.equal(order.lines.length,14);
  assert.equal(order.lines[0].quantity,3);
  assert.equal(order.lines[1].quantity,3);
  assert.equal(order.received_count,0,'Saving a batch must not book stock');

  // New primary workflow: manually capture a batch using saved catalog data
  // and add another color to the catalog in the same action.
  await page.locator('#pp-purchase-add').click();
  assert.equal(await page.locator('#pp-purchase-title').textContent(),'Filamentbestellung erfassen');
  assert.equal(await page.locator('#pp-m-nonexistent').count(),0);
  await page.locator('[data-pp-m-header="reference"]').fill('MANUAL-2-COLORS');
  await page.locator('[data-pp-m-search="0"]').fill('119000');
  await page.locator('[data-pp-m-results="0"] [data-pp-m-action="pick"]').first().waitFor();
  await page.locator('[data-pp-m-results="0"] [data-pp-m-action="pick"]').first().click();
  assert((await page.locator('[data-pp-m-row="0"]').textContent()).includes('UI Testfarbe 1'),
    'Library selection should reuse the stored color');
  await page.locator('[data-pp-m-field="quantity"][data-pp-m-index="0"]').fill('3');
  await page.locator('[data-pp-m-field="_priceInput"][data-pp-m-index="0"]').fill('31,78');
  const unitHint=await page.locator('[data-pp-m-price-hint="0"]').textContent();
  assert(unitHint.includes('10,59')&&unitHint.includes('10,60'),
   '31.78 divided by three must show exact-cent split: two 10.59 and one 10.60');
  await page.locator('[data-pp-m-field="quantity"][data-pp-m-index="0"]').fill('2');
  await page.locator('[data-pp-m-field="packaging"][data-pp-m-index="0"]').selectOption('spool');
  await page.locator('[data-pp-m-field="_priceInput"][data-pp-m-index="0"]').fill('19,90');
  await page.locator('[data-pp-m-action="add"]').click();
  assert.equal(await page.locator('.pp-m-row').count(),2,'Two compact rows');
  await page.locator('[data-pp-m-action="new"][data-pp-m-index="1"]').click();
  await page.locator('[data-pp-m-field="brand"][data-pp-m-index="1"]').fill('BAMBU');
  await page.locator('.pp-auto-list:visible [data-pp-auto-value="Bambu Lab"]').first().click();
  assert.equal(await page.locator('[data-pp-m-field="brand"][data-pp-m-index="1"]').inputValue(),'Bambu Lab');
  await page.locator('[data-pp-m-field="color"][data-pp-m-index="1"]').fill('Neue Testfarbe 2026');
  await page.locator('[data-pp-m-field="material"][data-pp-m-index="1"]').selectOption('PLA Matte');
  await page.locator('[data-pp-m-field="manufacturer_code"][data-pp-m-index="1"]').fill('129991');
  await page.locator('[data-pp-m-field="packaging"][data-pp-m-index="1"]').selectOption('refill');
  await page.locator('[data-pp-m-field="_priceInput"][data-pp-m-index="1"]').fill('9,00');
  await page.locator('[data-pp-m-header="_totalInput"]').fill('28,90');
  await page.locator('[data-pp-m-action="save"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const manualOrders=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const manualOrder=manualOrders.orders.find(o=>o.reference==='MANUAL-2-COLORS');
  assert(manualOrder,'Manual purchase should persist');
  assert.equal(manualOrder.lines.length,2);
  assert.equal(manualOrder.received_count,0,'No inventory change before receipt');
  assert.equal(manualOrder.ordered_count,3);
  assert.equal(manualOrder.total_cents,2890);
  const newLine=manualOrder.lines.find(l=>l.color==='Neue Testfarbe 2026');
  assert(newLine&&newLine.manufacturer_code==='129991',
   'Inline new color should be added to catalog with its manufacturer code');
  // Existing erroneous one-/two-roll entry must be correctable before any stock booking.
  await page.locator('.pp-purchase-card').filter({hasText:'MANUAL-2-COLORS'}).locator('[data-pp-open]').click();
  const firstLine=manualOrder.lines[0],firstId=firstLine.id;
  assert.equal(await page.locator('[data-pp-correct-quantity="'+firstId+'"]').inputValue(),'2');
  assert((await page.locator('.pp-receive-counts').first().textContent()).includes('Bestellt: 2'));
  await page.locator('.pp-receive-correction').first().locator('summary').click();
  await page.locator('[data-pp-correct-quantity="'+firstId+'"]').fill('3');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-pp-action="correct-quantity"][data-pp-line="'+firstId+'"]').click();
  await page.waitForFunction(id=>document.querySelector('[data-pp-correct-quantity="'+id+'"]')?.value==='3',firstId);
  assert((await page.locator('.pp-receive-summary').textContent()).includes('4 bestellt'));
  assert((await page.locator('.pp-receive-row').first().textContent()).includes('19,90'));
  assert((await page.locator('.pp-receive-row').first().textContent()).includes('6,63'));
  const corrected=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const correctedOrder=corrected.orders.find(o=>o.reference==='MANUAL-2-COLORS');
  assert.equal(correctedOrder.lines[0].quantity,3);
  assert.equal(correctedOrder.lines[0].remaining,3);
  assert.equal(correctedOrder.received_count,0);
  // A partial arrival books only two rolls; the third remains open.
  await page.locator('[data-pp-receive="'+firstId+'"]').fill('2');
  await page.locator('[data-pp-receive="'+newLine.id+'"]').fill('0');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-pp-action="receive"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const partiallyBooked=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const partial=partiallyBooked.orders.find(o=>o.reference==='MANUAL-2-COLORS');
  assert.equal(partial.received_count,2);
  assert.equal(partial.lines[0].remaining,1);
  await page.locator('.pp-purchase-card').filter({hasText:'MANUAL-2-COLORS'}).locator('[data-pp-open]').click();
  assert.equal(await page.locator('[data-pp-correct-quantity="'+firstId+'"]').count(),0,
   'Quantity must be immutable after first receipt');
  assert.equal(await page.locator('[data-pp-receive="'+firstId+'"]').inputValue(),'1');
  await page.locator('[data-pp-receive="'+newLine.id+'"]').fill('0');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-pp-action="receive"]').click();
  await page.locator('#pp-purchase-dialog').waitFor({state:'hidden'});
  const finalResult=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  const finalOrder=finalResult.orders.find(o=>o.reference==='MANUAL-2-COLORS');
  assert.equal(finalOrder.received_count,3);
  assert.equal(finalOrder.lines[0].remaining,0);
  assert.equal(finalOrder.lines.find(l=>l.id===newLine.id).remaining,1);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.pp-purchase-card').filter({hasText:'MANUAL-2-COLORS'}).locator('[data-pp-delete]').click();
  await page.locator('.pp-purchase-card').filter({hasText:'MANUAL-2-COLORS'}).waitFor({state:'detached'});
  const afterDelete=await page.request.get('http://127.0.0.1:8099/api/filament-orders').then(r=>r.json());
  assert(!afterDelete.orders.some(o=>o.reference==='MANUAL-2-COLORS'),
   'Trash button must delete the saved order after confirmation');


  assert.deepEqual(errors,[],'No browser JavaScript errors');
  console.log('FILAMENT BULK UI PASS: iPhone, top warning, auto paste, one editor, next issue, batch save');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
