const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/status',async route=>{
 const response=await route.fetch();const data=await response.json();

 const now=Math.floor(Date.now()/1000);
 const item=(title,quantity)=>({title,quantity,variant:'Farbe: Schwarz',listing_id:'101',image:'https://test.etsystatic.com/product.svg'});
 data.orders=[
  {id:'501',customer:'Musterkunde A',created:now-86400,ship_by:now+86400,quantity:2,items:[item('Geldgeschenk',2)]},
  {id:'502',customer:'Musterkunde B',created:now-3600,ship_by:now+2*86400,quantity:1,items:[item('Geldgeschenk',1)]},
  {id:'503',customer:'Musterkunde C',created:now-60,ship_by:now+5*86400,quantity:3,items:[item('Geldgeschenk',3)]}
 ];
 data.products.find(p=>p.id==='101').image='https://test.etsystatic.com/product.svg';
 data.products.push({...data.products[0],id:'inactive-cat',title:'Inaktive Katze',state:'inactive',need:999,uninitialized:999});
 const many=data.products.find(p=>p.id==='102');
many.inventory_error='Varianten bitte prüfen.';
many.items=Array.from({length:784},(_,n)=>({...many.items[0],id:'combination-'+n,label:'Katzenfarbe: Farbe '+Math.floor(n/28)+' · Laternenfarbe: Farbe '+(n%28),on_hand:n===2?null:n,need:n===0?2:n===1?3:0}));
 await route.fulfill({response,json:data});
});
await page.route('https://test.etsystatic.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>'}));
await page.goto('http://127.0.0.1:8099');await page.locator('.product').first().waitFor();assert.equal(await page.locator('.brand-logo').count(),1);await page.waitForFunction(()=>{const image=document.querySelector('.brand-logo');return image&&image.complete&&image.naturalWidth>0;},{timeout:10000});assert.equal(await page.locator('.product').count(),4);


assert.equal((await page.locator('#order-count').textContent()).trim(),'3 offen');
assert.equal((await page.locator('.summary-urgent b').textContent()).trim(),'2 Aufträge');
assert.equal(await page.locator('.order-card').count(),3);
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'501');
assert((await page.locator('[data-order-card="501"] .order-ship-date').textContent()).includes('Versand bis '));
assert(await page.locator('[data-order-card="501"] .order-countdown').count()===1);
// Check countdown colors, singular/plural, today and overdue using Berlin calendar days.
const countdownCases=await page.evaluate(()=>{
 const today=berlinDay(Date.now());
 return [-2,-1,0,1,2,3,4].map(offset=>shipInfo({ship_by:(today+offset)*86400+12*3600}));
});
assert.deepEqual(countdownCases.map(c=>c.countdown),['2 Tage überfällig','1 Tag überfällig','Heute versenden','Noch 1 Tag','Noch 2 Tage','Noch 3 Tage','Noch 4 Tage']);
assert.deepEqual(countdownCases.map(c=>c.level),['red','red','red','red','red','yellow','green']);
const unknownShipping=await page.evaluate(()=>shipInfo({ship_by:null}));
assert.equal(unknownShipping.countdown,'');
assert.equal(unknownShipping.date,'Versandfrist unbekannt');
// Simulate a Berlin day change: badges refresh even without an Etsy API call.
const dayChange=await page.evaluate(()=>{
 const selector='[data-order-card="501"] .order-countdown';
 const before=document.querySelector(selector).textContent;
 const realNow=Date.now;
 try {
  Date.now=()=>realNow()+2*86400000;
  refreshShippingDay();
  return {before,after:document.querySelector(selector).textContent};
 } finally {
  Date.now=realNow;
  refreshShippingDay();
 }
});
assert.notEqual(dayChange.before,dayChange.after);
await page.locator('[data-workspace="filament"]').click();
await page.locator('#filament-add').click();
await page.locator('#filament-form [name="brand"]').fill('Bambu Lab');
await page.locator('#filament-form [name="color"]').fill('Weiß');
await page.locator('#filament-form [name="stock_qty"]').fill('1');
await page.locator('#filament-form [name="price"]').fill('19,90');
await page.locator('#filament-form [name="purchase_url"]').fill('https://example.org/shop/filament');
await page.locator('#filament-form [type="submit"]').click();
await page.locator('.filament-line').first().waitFor();
assert.equal(await page.locator('.filament-line').count(),1);
assert((await page.locator('.filament-line').textContent()).includes('1 Spule'));
await page.locator('[data-filament-cart]').click();
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='1');
await page.locator('[data-filament-view="cart"]').click();
assert.equal(await page.locator('.filament-line').count(),1);
assert((await page.locator('#filament-cart-summary').textContent()).includes('19,90'));
await page.locator('[data-filament-delta="1"]').click();
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='2');
await page.locator('[data-filament-delta="-1"]').click();
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='1');
await page.locator('[data-workspace="production"]').click();
assert.equal(await page.locator('.product').count(),4);
await page.locator('[data-order-sort="new"]').click();
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'503');
await page.locator('[data-order-card="503"] [data-order-open]').click();
assert((await page.locator('#order-details-title').textContent()).includes('#503'));
assert((await page.locator('#order-details-content').textContent()).includes('Farbe: Schwarz'));
assert.equal(await page.locator('#order-details-content .order-countdown').count(),1);
await page.locator('[data-close="order-details"]').click();
await page.locator('[data-order-sort="ship"]').click();
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'501');
await page.setViewportSize({width:700,height:844});
await page.locator('#orders-next').click();
await page.waitForTimeout(600);
assert(await page.locator('#orders').evaluate(el=>el.scrollLeft>0));
await page.setViewportSize({width:1440,height:1100});

assert.equal(await page.locator('[data-product="inactive-cat"]').count(),0);
assert.equal(await page.locator('#summary b').first().textContent(),'4');
await page.locator('#search').fill('Inaktive Katze');
assert.equal(await page.locator('.product').count(),0);
await page.locator('#search').fill('');
async function equalRows(){
 const boxes=await page.locator('.product').evaluateAll(cards=>cards.map(c=>{const r=c.getBoundingClientRect();return {y:r.y,h:r.height};}));
 for(const a of boxes)for(const b of boxes)if(Math.abs(a.y-b.y)<1)assert(Math.abs(a.h-b.h)<1,'card heights must match within each row');
}
await equalRows();
// The primary action works without expanding a card, even with 784 combinations.
await page.locator('[data-product="102"] [data-print-action="printing"]').click();
assert.equal(await page.locator('#quantity-variants select').count(),2);
await page.locator('#quantity-variants [data-dimension="0"]').selectOption({label:'Farbe 27'});
await page.locator('#quantity-variants [data-dimension="1"]').selectOption({label:'Farbe 26'});
assert((await page.locator('#quantity-label').textContent()).includes('Laternenfarbe: Farbe 26'));
await page.locator('#quantity-value').fill('5');
await page.waitForTimeout(5500);
assert.equal(await page.locator('#quantity-value').inputValue(),'5');
assert.equal(await page.locator('[data-product="102"] .variant').count(),0);
await page.locator('[data-close="quantity"]').click();
const overview=page.locator('[data-product="102"] .print-overview');
assert.equal(await overview.locator('.print-need').count(),2);
assert((await overview.textContent()).includes('2 ×'));
assert((await overview.textContent()).includes('3 ×'));
assert((await overview.textContent()).includes('noch nicht gezählt'));
assert.equal(await page.locator('[data-product="102"] .variant').count(),0);
await overview.locator('[data-show-variant="combination-1"]').click();
assert.equal(await page.locator('[data-product="102"] .variant').getAttribute('data-variant'),'combination-1');
assert.equal(await overview.locator('.print-need').count(),2);
await page.locator('[data-product="102"] [data-expand]').click();
const note=page.locator('[data-product="102"] details.notices');
assert.equal(await note.getAttribute('open'),null);
await note.locator('summary').click();
await page.evaluate(()=>{
 window.stableCard=document.querySelector('[data-product="101"]');
 window.stableImage=window.stableCard.querySelector('img');
 window.stableStock=window.stableCard.querySelector('.stock-number');
 window.removedCards=0;
 window.cardObserver=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===window.stableCard||node===window.stableImage)window.removedCards++;});
 window.cardObserver.observe(document.querySelector('#products'),{childList:true,subtree:true});
});
await page.waitForTimeout(5500);
assert(await page.evaluate(()=>window.stableCard===document.querySelector('[data-product="101"]')&&window.stableImage===window.stableCard.querySelector('img')&&window.removedCards===0));
const stockResponse=await page.request.post('http://127.0.0.1:8099/api/stock',{data:{id:'101-default',action:'adjust',delta:1}});
assert(stockResponse.ok());
await page.waitForFunction(()=>document.querySelector('[data-product="101"] .stock-number').textContent==='2');
assert(await page.evaluate(()=>window.stableStock===document.querySelector('[data-product="101"] .stock-number')&&window.stableImage===document.querySelector('[data-product="101"] img')&&window.removedCards===0));
await page.request.post('http://127.0.0.1:8099/api/stock',{data:{id:'101-default',action:'adjust',delta:-1}});
await page.waitForFunction(()=>document.querySelector('[data-product="101"] .stock-number').textContent==='1');
await page.evaluate(()=>window.cardObserver.disconnect());
assert.notEqual(await note.getAttribute('open'),null);
await note.locator('summary').click();
await equalRows();
await page.screenshot({path:'/tmp/lager-desktop.png',fullPage:true});
let card=page.locator('[data-product="101"]');const badges=card.locator('.badges .badge');assert.equal(await badges.count(),2);const b1=await badges.nth(0).boundingBox(),b2=await badges.nth(1).boundingBox();assert(b2.y>b1.y+b1.height);
await card.locator('[data-action="adjust"][data-delta="1"]').click();await page.waitForFunction(()=>document.querySelector('[data-product="101"] .stock-number').textContent==='2');
await page.locator('#undo').click();await page.waitForFunction(()=>document.querySelector('[data-product="101"] .stock-number').textContent==='1');
await card.locator('[data-print-action="printing"]').click();await page.locator('#quantity-value').fill('4');await page.locator('#quantity-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-product="101"] [data-action="finish"]'));
await card.locator('[data-print-action="finish"]').click();await page.locator('#quantity-value').fill('3');await page.locator('#quantity-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('[data-product="101"] .stock-number').textContent==='4');
await card.locator('[data-print-action="cancel"]').click();await page.locator('#quantity-form [type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('[data-product="101"] [data-action="finish"]'));
await page.locator('[data-product="102"] [data-expand]').click();assert.equal(await page.locator('[data-product="102"] .variant').count(),1);
const manyCard=page.locator('[data-product="102"]');
await manyCard.locator('[data-dimension="0"]').selectOption({label:'Farbe 27'});
await manyCard.locator('[data-dimension="1"]').selectOption({label:'Farbe 26'});
assert.equal(await manyCard.locator('.stock-number').textContent(),'782');
assert.equal(await manyCard.locator('[data-action="set"]').getAttribute('data-id'),'combination-782');
await page.waitForTimeout(5500);
assert.equal(await manyCard.locator('.stock-number').textContent(),'782');
assert.equal(await manyCard.locator('.variant').count(),1);
assert((await manyCard.boundingBox()).height<1750);
await equalRows();
await page.locator('#search').fill('Wunschfarbe');assert.equal(await page.locator('.product').count(),1);await page.locator('[data-action="set"]').click();await page.locator('#quantity-value').fill('8');await page.locator('#quantity-form [type="submit"]').click();await page.waitForFunction(()=>document.querySelector('.stock-number').textContent==='8');
await page.reload();await page.locator('.product').first().waitFor();assert.equal(await page.locator('[data-product="104"] .stock-number').textContent(),'8');
await page.locator('#settings-open').click();await page.locator('#days').fill('10');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='POST'),page.locator('#settings-form [type="submit"]').click()]);assert.equal((await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json())).days,10);
await page.setViewportSize({width:1280,height:800});
await page.waitForTimeout(300);
assert.equal(await page.locator('#products').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:'/tmp/lager-tablet.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/lager-mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));// Exercise real multi-variant stock writes via the new card buttons.
await page.unroute('**/api/status');
await page.reload();await page.locator('[data-product="102"]').waitFor();
const realCard=page.locator('[data-product="102"]');
assert.equal(await realCard.locator('.stock-variant').count(),2);
assert((await realCard.locator('.stock-overview').textContent()).includes('0 ×Beige'));
assert((await realCard.locator('.stock-overview').textContent()).includes('Schwarz · noch nicht gezählt'));
await realCard.locator('.stock-variant[data-show-variant="102-black"]').click();
assert.equal(await realCard.locator('.variant').getAttribute('data-variant'),'102-black');
await realCard.locator('[data-expand]').click();
await realCard.locator('[data-print-action="printing"]').click();
await page.locator('#quantity-variants select').selectOption('102-black');
await page.locator('#quantity-value').fill('4');
await page.locator('#quantity-confirm').click();
await realCard.locator('.running-print').waitFor();
assert((await realCard.locator('.running-print').textContent()).includes('4 × Schwarz'));
let realState=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
let black=realState.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black');
assert.equal(black.on_hand,null);assert.equal(black.in_print,4);
await realCard.locator('[data-print-action="finish"]').click();
assert(await page.locator('#quantity-confirm').isDisabled());
await page.locator('[data-close="quantity"]').click();
await page.request.post('http://127.0.0.1:8099/api/stock',{data:{id:black.id,action:'set',quantity:2,revision:black.revision}});
await page.reload();await realCard.locator('[data-print-action="finish"]').click();
await page.locator('#quantity-value').fill('3');await page.locator('#quantity-confirm').click();
await page.waitForFunction(()=>document.querySelector('[data-product="102"] .running-print').textContent.includes('1 ×'));
realState=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
black=realState.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black');
assert.equal(black.on_hand,5);assert.equal(black.in_print,1);
await realCard.locator('[data-print-action="cancel"]').click();await page.locator('#quantity-confirm').click();
await realCard.locator('.running-print').waitFor({state:'detached'});
assert.deepEqual(errors,[]);console.log('UI PASS: badges stacked; +/undo; printing/partial finish/cancel; variants; search; count; persistence; settings; mobile width; no JS errors.');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
