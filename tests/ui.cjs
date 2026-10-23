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
 data.etsy_alert_threshold=3;
 data.etsy_stock_alerts=[
  {listing_id:'101',title:'Geldgeschenk mit Reagenzglas',state:'active',etsy_qty:2,severity:'low',affected_variants:0,variants:[],more_variants:0},
  {listing_id:'102',title:'Kleine Winterdekoration',state:'active',etsy_qty:40,severity:'empty',affected_variants:2,
   variants:[{id:'102-default',label:'Farbe: Beige',etsy_qty:0},{id:'102-black',label:'Farbe: Schwarz',etsy_qty:2}],more_variants:0}
 ];
 const many=data.products.find(p=>p.id==='102');
many.inventory_error='Varianten bitte prüfen.';
many.items=Array.from({length:784},(_,n)=>({...many.items[0],id:'combination-'+n,label:'Katzenfarbe: Farbe '+Math.floor(n/28)+' · Laternenfarbe: Farbe '+(n%28),on_hand:n===2?null:n,need:n===0?2:n===1?3:0}));
 await route.fulfill({response,json:data});
});
await page.route('https://test.etsystatic.com/**',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>'}));
await page.route('**/api/printer-entities',async route=>route.fulfill({json:{connected:true,error:'',entities:[
  {id:'sensor.h2d_print_status',name:'H2D print status',state:'running',unit:''},
  {id:'sensor.h2d_print_progress',name:'H2D print progress',state:'50',unit:'%'},
  {id:'sensor.h2d_remaining_time',name:'H2D remaining time',state:'30',unit:'min'},
  {id:'sensor.h2d_gcode_file',name:'H2D gcode file',state:'test.3mf',unit:''}
]}}));
await page.route('**/api/printers*',async route=>{
 const response=await route.fetch();const data=await response.json();
 data.connected=true;
 data.candidates=[{id:'sensor.h2d_print_status',model:'H2D',label:'H2D · Testdrucker',entities:{
   status:'sensor.h2d_print_status',progress:'sensor.h2d_print_progress',
   remaining:'sensor.h2d_remaining_time',filename:'sensor.h2d_gcode_file'
 }}];
 await route.fulfill({response,json:data});
});
await page.goto('http://127.0.0.1:8099');await page.locator('.product').first().waitFor();assert.equal(await page.locator('.brand-logo').count(),1);await page.waitForFunction(()=>{const image=document.querySelector('.brand-logo');return image&&image.complete&&image.naturalWidth>0;},{timeout:10000});assert.equal(await page.locator('.product').count(),4);

await page.locator('.printer-mini').first().waitFor();
assert.equal((await page.locator('#printer-strip .eyebrow').textContent()).trim(),'PRODUKTION · LIVE');
assert.equal((await page.locator('#orders-shell .eyebrow').textContent()).trim(),'ETSY · DEIN SHOP');
// Last actual Etsy sync time is still displayed independently of the copy changes.
assert((await page.locator('#sync-state').textContent()).includes('Bestellungen:'));
assert((await page.locator('#sync-state').textContent()).includes('alle 15 Minuten'));
assert((await page.locator('#sync-state').textContent()).includes('Produktkatalog:'));
assert.equal(await page.locator('html').getAttribute('lang'),'de');
assert.equal(await page.locator('.printer-mini').count(),4);

// Theme switch: real toggle, sun auto, saved choice, and dynamic release history.
assert.equal(await page.locator('[data-theme-mode]').count(),3);
await page.locator('[data-theme-mode="dark"]').click();
assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
assert.equal(await page.locator('.brand-logo').evaluate(el=>getComputedStyle(el).mixBlendMode),'screen');
assert.equal(await page.evaluate(()=>localStorage.getItem('pp-theme-mode')),'dark');
assert.equal(await page.locator('[data-theme-mode="dark"]').getAttribute('aria-pressed'),'true');
const darkBackground=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage);
assert(darkBackground.includes('gradient'),'dark theme must style the whole page');
await page.reload();await page.locator('.product').first().waitFor();
assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','persist on refresh');
await page.route('**/api/theme',route=>route.fulfill({json:{theme:'light',source:'sun.sun'}}));
await page.locator('[data-theme-mode="auto"]').click();
await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
assert.equal(await page.locator('[data-theme-mode="auto"]').getAttribute('aria-pressed'),'true');
await page.unroute('**/api/theme');
await page.locator('[data-theme-mode="light"]').click();
assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
assert.equal(await page.locator('.brand-logo').evaluate(el=>getComputedStyle(el).mixBlendMode),'multiply');
await page.locator('#settings-open').click();
await page.locator('#release-history summary').click();
await page.waitForFunction(()=>document.querySelector('#release-history-content')?.textContent.includes('0.11.23'));
assert((await page.locator('#release-history-content').textContent()).includes('Theme-Switch'));
assert.equal(await page.locator('#app-version').textContent(),'v0.11.23');
await page.locator('[data-close="settings"]').click();


 // Ungezählte Variante: Bestätigen ist erreichbar, fehlender Anfangsbestand wird im Dialog abgefragt.
 await page.evaluate(()=>{const found=findItem('combination-2');found.i.in_print=2;quantityDialog(found.i.id,'finish');});
 assert.equal(await page.locator('#quantity-initial-stock').isVisible(),true);
 assert.equal(await page.locator('#quantity-confirm').isEnabled(),true);
 await page.locator('#quantity-value').fill('2');
 await page.locator('#quantity-confirm').click();
 assert.equal(await page.locator('#quantity').evaluate(el=>el.open),true);
 assert.equal(await page.locator('#quantity-initial-stock').evaluate(el=>el.validity.valueMissing),true);
 const closeSize=await page.locator('[data-close="quantity"]').boundingBox();
 assert(closeSize.width>=44&&closeSize.height>=44);
 await page.locator('[data-close="quantity"]').click();
 assert.equal(await page.locator('#quantity').evaluate(el=>el.open),false);

assert.equal(await page.locator('#etsy-stock-banner').isVisible(),true);
assert((await page.locator('#etsy-alert-title').textContent()).includes('1 Artikel ausverkauft'));
assert.equal(await page.locator('#etsy-alert-list').isVisible(),false);
await page.locator('#etsy-alert-toggle').click();
assert.equal(await page.locator('.etsy-alert-item').count(),2);
assert((await page.locator('#etsy-alert-list').textContent()).includes('Farbe: Beige'));
await page.locator('[data-etsy-alert-to="101"]').click();
assert.equal(await page.locator('[data-product="101"]').isVisible(),true);
await page.locator('#etsy-alert-toggle').click();
assert.equal(await page.locator('#etsy-alert-list').isVisible(),false);
assert.equal(await page.locator('#printer-strip').isVisible(),true);
assert.equal(await page.locator('[data-printer-focus="A1 mini"]').count(),0);
await page.locator('#printer-strip-more').click();
assert.equal(await page.locator('#printer-strip').isVisible(),false);
assert.equal(await page.locator('#etsy-stock-banner').isVisible(),false);
assert.equal(await page.locator('[data-workspace="printers"]').getAttribute('aria-pressed'),'true');
assert.equal(await page.locator('.printer-panel').count(),4);
await page.locator('[data-printer-config="H2D"]').click();
assert.equal(await page.locator('#printer-config-dialog').isVisible(),true);
assert.equal(await page.locator('[data-printer-field="status"]').count(),1);
assert.equal(await page.locator('#printer-device-choice').isVisible(),true);
await page.waitForFunction(()=>document.querySelector('[data-printer-field="status"]').value==='sensor.h2d_print_status');
assert.equal(await page.locator('[data-printer-field="progress"]').inputValue(),'sensor.h2d_print_progress');
assert.equal(await page.locator('[data-printer-field="remaining"]').inputValue(),'sensor.h2d_remaining_time');
assert.equal(await page.locator('.printer-advanced-fields').isVisible(),false);
assert.equal(await page.locator('#printer-config-fields input:visible').count(),0);
await page.locator('.printer-manual-fields>summary').click();
assert.equal(await page.locator('#printer-config-fields input:visible').count(),4);
await page.locator('.printer-manual-fields>details>summary').click();
assert.equal(await page.locator('.printer-advanced-fields').isVisible(),true);
await page.locator('[data-close="printer-config-dialog"]').click();
await page.locator('[data-workspace="production"]').click();
assert.equal(await page.locator('#printer-strip').isVisible(),true);



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
await page.locator('#filament-brand').fill('Bambu');
assert((await page.locator('#filament-brand-options').textContent()).includes('Bambu Lab'));
await page.locator('#filament-brand-options .filament-suggest-item').first().click();
assert.equal(await page.locator('#filament-brand').inputValue(),'Bambu Lab');
await page.locator('#filament-color').fill('Jade');
assert((await page.locator('#filament-color-options').textContent()).includes('Jade-Weiß'));
await page.locator('#filament-color-options .filament-suggest-item').filter({hasText:'Jade-Weiß'}).first().click();
assert.equal(await page.locator('#filament-color').inputValue(),'Jade-Weiß');
assert.equal(await page.locator('#filament-material').inputValue(),'PLA Basic');
assert.equal(await page.locator('#filament-color-hex').inputValue(),'#ffffff');
assert.equal(await page.locator('#filament-hex-code').textContent(),'#FFFFFF');
await page.locator('#filament-form [name="stock_qty"]').fill('1');
await page.locator('#filament-form [name="price"]').fill('19,90');
await page.locator('#filament-form [name="purchase_url"]').fill('https://example.org/shop/filament');
await page.locator('#filament-form [type="submit"]').click();
await page.locator('.filament-line').first().waitFor();
assert.equal(await page.locator('.filament-line').count(),1);
assert((await page.locator('.filament-line').textContent()).includes('1 Spule'));
await page.locator('#filament-add').click();
await page.locator('#filament-brand').fill('Bambu Lab');
await page.locator('#filament-material').fill('PLA Basic');
await page.locator('#filament-color').fill('Jadeweiß');
assert.equal(await page.locator('#filament-duplicate').isVisible(),true);
assert.equal(await page.locator('#filament-save').isDisabled(),true);
await page.locator('#filament-existing').click();
assert.equal(await page.locator('#filament-color').inputValue(),'Jade-Weiß');
await page.locator('[data-close="filament-editor"]').click();
await page.locator('#filament-add').click();
await page.locator('#filament-brand').fill('SUNLU');
await page.locator('#filament-brand-options .filament-suggest-item').filter({hasText:'SUNLU'}).first().click();
await page.locator('#filament-material').fill('PLA+');
await page.locator('#filament-color').fill('Gelb');
await page.locator('#filament-color-options .filament-suggest-item').filter({hasText:'Gelb'}).first().click();
assert.equal(await page.locator('#filament-color-hex').inputValue(),'#fff13f');
await page.locator('[data-close="filament-editor"]').click();
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
await page.locator('#settings-open').click();await page.locator('#days').fill('10');await page.locator('#etsy-alert-threshold').fill('4');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='POST'),page.locator('#settings-form [type="submit"]').click()]);assert.equal((await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json())).days,10);
assert.equal((await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json())).etsy_alert_threshold,4);
await page.setViewportSize({width:1280,height:800});
await page.waitForTimeout(300);
assert.equal(await page.locator('#products').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:'/tmp/lager-tablet.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
const mobileTabs=await page.locator('.workspace-tabs').evaluate(el=>({
 wrap:getComputedStyle(el).flexWrap,
 x:getComputedStyle(el).overflowX,
 scrollWidth:el.scrollWidth,
 width:el.clientWidth,
 pageWidth:document.documentElement.scrollWidth,
 viewport:innerWidth
}));
assert.equal(mobileTabs.wrap,'nowrap');
assert.equal(mobileTabs.x,'auto');
assert(mobileTabs.scrollWidth>mobileTabs.width,'all navigation tabs should be horizontally scrollable');
assert(mobileTabs.pageWidth<=mobileTabs.viewport,'no whole-page horizontal scrolling');
await page.locator('[data-workspace="printers"]').click();
await page.waitForFunction(()=>document.querySelector('.workspace-tabs').scrollLeft>0);
assert.equal(await page.locator('[data-workspace="printers"]').getAttribute('aria-pressed'),'true');
await page.locator('[data-workspace="production"]').click();
assert.equal(await page.locator('[data-workspace="production"]').getAttribute('aria-pressed'),'true');
await page.screenshot({path:'/tmp/lager-mobile.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));// Exercise real multi-variant stock writes via the new card buttons.
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
assert.equal(await realCard.locator('.running-print .print-finish-large').count(),1);
assert((await realCard.locator('.running-print .print-finish-large').boundingBox()).height>=55);
assert((await realCard.locator('.running-print').textContent()).includes('4 × Schwarz'));
let realState=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
let black=realState.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black');
assert.equal(black.on_hand,null);assert.equal(black.in_print,4);
await realCard.locator('[data-print-action="finish"]').click();
assert.equal(await page.locator('#quantity-confirm').isEnabled(),true);
 assert.equal(await page.locator('#quantity-initial-stock').isVisible(),true);
 assert.equal(await page.locator('#quantity-initial-stock').evaluate(el=>el.required),true);
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
