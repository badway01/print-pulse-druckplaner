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
 data.etsy_alert_percent=25;
 data.etsy_stock_alerts=[
  {listing_id:'101',title:'Geldgeschenk mit Reagenzglas',state:'active',etsy_qty:2,etsy_reference_qty:8,warning_at:2,severity:'low',affected_variants:0,variants:[],more_variants:0},
  {listing_id:'102',title:'Kleine Winterdekoration',state:'active',etsy_qty:40,etsy_reference_qty:80,warning_at:20,severity:'empty',affected_variants:2,
   variants:[{id:'102-default',label:'Farbe: Beige',etsy_qty:0,etsy_reference_qty:8,warning_at:2},{id:'102-black',label:'Farbe: Schwarz',etsy_qty:2,etsy_reference_qty:8,warning_at:2}],more_variants:0}
 ];
 const many=data.products.find(p=>p.id==='102');
many.inventory_error='Varianten bitte prüfen.';
many.items=Array.from({length:784},(_,n)=>({...many.items[0],id:'combination-'+n,label:'Katzenfarbe: Farbe '+Math.floor(n/28)+' · Laternenfarbe: Farbe '+(n%28),on_hand:n===2?null:n,need:n===0?2:n===1?3:0,reserved:n===0?2:n===2?1:0}));
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
const logoPixels=await page.locator('.brand-logo').evaluate(img=>{
 const canvas=document.createElement('canvas');canvas.width=440;canvas.height=228;
 const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(img,0,0,440,228);
 const rgba=context.getImageData(0,0,440,228).data;
 let opaque=0,transparent=0;
 for(let i=3;i<rgba.length;i+=4){if(rgba[i]>200)opaque++;if(rgba[i]<40)transparent++;}
 return {corner:rgba[3],corner2:rgba[(10*440+430)*4+3],opaque,transparent};
});
assert(logoPixels.corner<40&&logoPixels.corner2<40,'logo background must be transparent, not a white rectangle');
assert(logoPixels.opaque>1000,'logo artwork must stay opaque');
assert(logoPixels.transparent>12000,'most of the photo background must disappear');

// Product print bookmarks take their colour straight from the product card,
 // not from an independent threshold or a duplicate status calculation.
const postitChecks=await page.evaluate(()=>{
 const original=model.products.find(p=>p.items?.length&&(!p.components_enabled));
 const markup=productPrintBadge({...original,need:14,components_enabled:false});
 const noNeed=productPrintBadge({...original,need:0,components_enabled:false});
 const fixture=document.createElement('template');
 fixture.innerHTML=card({...original,level:'red',need:14});
 const realMarkupMatches=fixture.content.querySelector('.product-need-postit strong')?.textContent==='14';
 const host=document.querySelector('#products');
 const rows=[];
 for(const status of ['red','yellow','green']){
  const card=document.createElement('article');
  card.className='product '+status;
  card.dataset.product='colour-test-'+status;
  card.innerHTML=markup+'<div class="product-photo"></div>';
  host.appendChild(card);
  const badge=card.querySelector('.product-need-postit');
  const border=getComputedStyle(card).borderTopColor;
  const background=getComputedStyle(badge).backgroundColor;
  const c=card.getBoundingClientRect(),b=badge.getBoundingClientRect(),photo=card.querySelector('.product-photo').getBoundingClientRect();
  rows.push({status,border,background,colourMatches:border===background,
   top:getComputedStyle(badge).top,position:getComputedStyle(badge).position,
   photoClipped:getComputedStyle(card.querySelector('.product-photo')).overflow==='hidden',
   pointerEvents:getComputedStyle(badge).pointerEvents});
  card.remove();
 }
 const component=document.createElement('article');
 component.className='product component-product';
 component.innerHTML=markup+'<div class="product-photo"></div>';
 host.appendChild(component);
 const greenComponent=getComputedStyle(component).borderTopColor===
  getComputedStyle(component.querySelector('.product-need-postit')).backgroundColor;
 component.remove();
 const example={id:'sample-component',components_enabled:true,
  components:[{id:'white',kind:'stock',stock:1}],need:999};
 model.orders.push({items:[{listing_id:'sample-component',components_enabled:true,
  components:[{id:'white',kind:'stock',required:4,booked:0}]}]});
 const componentMarkup=productPrintBadge(example);
 model.orders.pop();
 return {realMarkupMatches,noNeed,rows,greenComponent,
  componentAmount:(componentMarkup.match(/<strong>(\d+)<\/strong>/)||[])[1]};
});
assert(postitChecks.realMarkupMatches,'ordinary product bookmark must show the sum of print needs');
assert.equal(postitChecks.noNeed,'','zero print need must not have a post-it');
assert.equal(postitChecks.componentAmount,'3',
 'component product post-it must count real component shortage, not legacy variant need');
assert(postitChecks.greenComponent,'component post-it must use component card accent');
for(const row of postitChecks.rows){
 assert(row.colourMatches,'post-it must share card accent colour for '+row.status);
 assert.equal(row.position,'absolute','post-it must float without changing card height');
 assert.equal(row.top,'-25px','post-it must attach above the product top border');
 assert(row.photoClipped,'product images keep their own clipped container');
 assert.equal(row.pointerEvents,'none','post-it must not block click targets');
}
assert.equal(await page.locator('#product-toolbar [data-filter]').count(),4);
assert.equal(await page.locator('#product-toolbar [data-filter="all"] .product-filter-count').textContent(),'4');
assert.equal(await page.locator('#product-toolbar [data-filter="all"]').getAttribute('aria-pressed'),'true');
assert.equal(await page.locator('#product-toolbar [data-filter="need"]').getAttribute('aria-pressed'),'false');
await page.locator('#product-toolbar [data-filter="need"]').click();
assert.equal(await page.locator('#product-toolbar [data-filter="need"]').getAttribute('aria-pressed'),'true');
assert.equal(await page.locator('#product-toolbar [data-filter="all"]').getAttribute('aria-pressed'),'false');
await page.locator('#product-toolbar [data-filter="all"]').click();

// The product photo stays free of large stock overlays; the details open below it.
const imageBadges=page.locator('[data-product="102"] .product-photo');
const cardMany=page.locator('[data-product="102"]');
assert.equal(await imageBadges.locator('.etsy-total').count(),1);
assert.equal(await imageBadges.locator('.photo-stock-badge').count(),0);
assert.equal(await imageBadges.locator('.photo-stock-toggle').count(),1);
assert.equal(await cardMany.locator('.stock-overview').count(),0);
assert((await cardMany.locator('.stock-quick-toggle').textContent()).includes('Noch zählen'));
assert((await cardMany.locator('.stock-quick-toggle').textContent()).includes('0 ×'));
const previewExamples=await page.evaluate(()=>{
 const mk=(label,on_hand,reserved)=>({label,on_hand,reserved});
 const raw=stockQuickView({id:'example',title:'Beispiel',items:[
  mk('Farbe: Weiß',2,2),mk('Farbe: Schwarz',null,1),mk('Farbe: Beige',0,0)
 ]});
 const node=document.createElement('div');node.innerHTML=raw;return node.textContent;
});
assert(previewExamples.includes('2 ×'),'must show physical counted stock');
assert(previewExamples.includes('Noch zählen'),'unknown stock must not be presented as zero');
assert(!previewExamples.includes('Beige'),'unordered variants should not clutter the summary');
await cardMany.locator('.photo-stock-toggle').click();
assert.equal(await cardMany.locator('.stock-variant').count(),784);
assert((await cardMany.locator('.stock-overview').textContent()).includes('Noch zählen'));
assert((await cardMany.locator('.stock-overview .stock-variants').evaluate(el=>getComputedStyle(el).maxHeight))==='250px');
await cardMany.locator('.stock-quick-toggle').click();
assert.equal(await cardMany.locator('.stock-overview').count(),0);
// Made-to-order listings must not ask for counting before a customer orders.
// Manual entry and all variant stock details still remain available.
const onDemandPreview=await page.evaluate(()=>{
 const p={...model.products.find(item=>item.id==='102'),made_to_order:true};
 return {card:card(p),details:stockOverview(p),variant:variant(p,p.items.find(item=>item.on_hand===null))};
});
assert(onDemandPreview.card.includes('Lager optional'));
assert(!onDemandPreview.card.includes('Noch zählen'));
assert(!onDemandPreview.card.includes('Nachdruckbedarf'));
assert(onDemandPreview.card.includes('Bestände bearbeiten'));
assert(onDemandPreview.details.includes('Bestandseinträge · freiwillig'));
assert(!onDemandPreview.details.includes('noch zählen'));
assert(onDemandPreview.details.includes('—'));
assert(onDemandPreview.variant.includes('Eintragen'),'manual stock entry must remain available');
assert(onDemandPreview.variant.includes('Bestand optional'));
const ordersAccent=await page.locator('#orders-shell').evaluate(el=>{
 const css=getComputedStyle(el);
 return {left:parseFloat(css.borderLeftWidth),shadow:css.boxShadow};
});
assert(ordersAccent.left>=5,'whole orders area needs an accent border');
assert(ordersAccent.shadow!=='none','whole orders area needs subtle elevation');
const dashboardStructure=await page.evaluate(()=>{
 const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();
  return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}};
 return {
  hero:rect('.dashboard-hero'),summary:rect('#summary'),title:rect('.dashboard-hero-copy'),
  alert:rect('#alert'),tabs:rect('.workspace-tabs'),
  alertPrecedesTabs:!!(document.querySelector('#alert').compareDocumentPosition(document.querySelector('.workspace-tabs'))&Node.DOCUMENT_POSITION_FOLLOWING),
  tabsPrecedePrinters:!!(document.querySelector('.workspace-tabs').compareDocumentPosition(document.querySelector('#printer-strip'))&Node.DOCUMENT_POSITION_FOLLOWING),
  printersPrecedeOrders:!!(document.querySelector('#printer-strip').compareDocumentPosition(document.querySelector('#orders-shell'))&Node.DOCUMENT_POSITION_FOLLOWING),
  printers:rect('#printer-strip'),
  orders:rect('#orders-shell'),
  labels:[...document.querySelectorAll('#summary .dashboard-kpi-copy>span')].map(el=>el.textContent),
  tabs:[...document.querySelectorAll('.workspace-tabs button')].map(b=>({
   name:b.textContent.trim(),icon:!!b.querySelector('svg'),height:b.getBoundingClientRect().height}))
 };
});
assert.deepEqual(dashboardStructure.labels,['Nachdrucken','Versand kritisch'],
 'top summary must only show actionable production/shipping figures');
assert(dashboardStructure.summary.x>dashboardStructure.title.x,
 'actionable figures belong to the right of the title on desktop');
assert(dashboardStructure.alertPrecedesTabs,
 'warning container must precede the navigation independently of viewport scroll');
assert(dashboardStructure.tabsPrecedePrinters,
 'printer live status must be directly after the navigation in document order');
assert(dashboardStructure.printersPrecedeOrders,
 'open orders must follow compact live printer status in document order');
assert(dashboardStructure.tabs.every(t=>t.icon&&t.height>=48),
 'all six navigation tabs need clear icons and touch-friendly height');
const navCheck=await page.locator('.workspace-tabs').evaluate(nav=>{
 const buttons=[...nav.querySelectorAll('button[data-workspace]')];
 return {labels:buttons.map(b=>b.querySelector('span:not(.workspace-count)').textContent.trim()),
  tops:buttons.map(b=>Math.round(b.getBoundingClientRect().top)),
  wrap:getComputedStyle(nav).flexWrap,
  scrollWidth:nav.scrollWidth,clientWidth:nav.clientWidth};
});
assert.deepEqual(navCheck.labels,
 ['Dashboard','Bestellungen','Lagerbestand','Produktkatalog','Filament','Drucker'],
 'six short labels stay readable');
assert.equal(navCheck.wrap,'nowrap','navigation never wraps to a second row');
assert.equal(new Set(navCheck.tops).size,1,'all tabs are in one horizontal row');
assert(navCheck.scrollWidth<=navCheck.clientWidth+3,'all six tabs fit the desktop width');
assert.equal(await page.locator('#summary button').count(),2);
await page.locator('.printer-mini').first().waitFor();
assert.equal((await page.locator('#printer-strip .eyebrow').textContent()).trim(),'PRODUKTION · LIVE');
assert.equal((await page.locator('#orders-shell .eyebrow').textContent()).trim(),'ETSY & LOKAL · DEINE AUFTRÄGE');
// Last actual Etsy sync time is still displayed independently of the copy changes.
assert((await page.locator('#sync-state').textContent()).includes('Bestellungen:'));
assert((await page.locator('#sync-state').textContent()).includes('alle 15 Minuten'));
assert((await page.locator('#sync-state').textContent()).includes('Produktkatalog:'));
assert.equal(await page.locator('html').getAttribute('lang'),'de');
assert.equal(await page.locator('.printer-mini').count(),4);
assert.equal(await page.locator('#priority-shell').isVisible(),true,'priority board belongs to production');
await page.locator('[data-dashboard-jump="need"]').click();
assert.equal(await page.locator('[data-filter="need"]').getAttribute('class').then(x=>x.includes('selected')),true,
 'nachdrucken KPI should open actual print-needs filter');
await page.locator('[data-filter="all"]').click();
await page.locator('[data-dashboard-jump="critical"]').click();
assert.equal(await page.locator('[data-order-sort="ship"]').getAttribute('aria-pressed'),'true',
 'critical shipments KPI should focus earliest shipments');

const priorityChecks=await page.evaluate(()=>{
 const data={products:[
  {id:'g',title:'Lesender Geist',state:'active',components_enabled:1,sold7:4,sold30:9,
   components:[{id:'white',name:'Geist Weiß',kind:'stock',stock:4,target_stock:8,printing_stock:2}],
   items:[{id:'gv',need:99}]},
  {id:'c',title:'Geldkarte',state:'active',components_enabled:0,sold7:4,sold30:8,
   items:[{id:'gold',label:'Gold Edition',on_hand:1,allocatable:1,enabled:1,need:4,sold7:4,sold30:8}]}],
 orders:[
  {id:'a',ship_by:Date.UTC(2026,8,21)/1000,created:Date.UTC(2026,8,21)/1000,items:[
   {listing_id:'g',item_id:'gv',transaction_id:'a1',remaining:3,
    components_enabled:true,components:[{id:'white',kind:'stock',name:'Geist Weiß',required:3,booked:0}]}]},
  {id:'b',ship_by:Date.UTC(2026,9,3)/1000,created:Date.UTC(2026,8,21)/1000,items:[
   {listing_id:'c',item_id:'gold',transaction_id:'b1',remaining:2,components_enabled:false,variant:'Gold Edition'}]}
 ]};
 const items=priorityCandidates(data);
 return {
  customer:items.find(x=>x.tier===1&&x.title==='Geldkarte')?.qty,
  reserve:items.find(x=>x.tier===2&&x.title==='Geist Weiß')?.qty,
  duplicate:items.some(x=>x.tier===1&&x.title==='Geist Weiß'),
  orderFirst:items[0]?.tier,
  oldVariant:items.some(x=>x.tier===3&&x.title==='Geldkarte')
 };
});
assert.equal(priorityChecks.customer,1,'available finished stock is used before a print suggestion');
assert.equal(priorityChecks.reserve,5,'shared part refill subtracts orders and active printing');
assert.equal(priorityChecks.duplicate,false,'in-progress part batches are not recommended again');
assert.equal(priorityChecks.orderFirst,1,'customer work sorts before warehouse refills');
assert.equal(priorityChecks.oldVariant,false,'same variant is never proposed twice');


// Theme switch: real toggle, sun auto, saved choice, and dynamic release history.
assert.equal(await page.locator('[data-theme-mode]').count(),3);
await page.locator('[data-theme-mode="dark"]').click();
assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
assert.equal(await page.locator('.brand-logo').evaluate(el=>getComputedStyle(el).mixBlendMode),'normal');
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
assert.equal(await page.locator('.brand-logo').evaluate(el=>getComputedStyle(el).mixBlendMode),'normal');
await page.locator('#settings-open').click();
await page.locator('#release-history summary').click();
await page.locator('#release-history-content .release-entry').first().waitFor();
const installedVersion=(await page.locator('#app-version').textContent()).trim();
const latestRelease=await page.locator('#release-history-content .release-entry').first().textContent();
assert.match(installedVersion,/^v\d+\.\d+\.\d+$/);
assert(latestRelease.includes(installedVersion.slice(1)),'latest packaged release matches app version');
assert(latestRelease.includes('Dashboard'),'current release documents the renamed dashboard');
await page.locator('#etsy-import-panel summary').click();
await page.locator('#etsy-import-rows').getByText('Keine neuen aktiven Artikel', {exact:false}).waitFor();
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
 page.once('dialog',async prompt=>{assert.equal(prompt.type(),'confirm');await prompt.accept();});
 await page.locator('[data-close="quantity"]').click();
 assert.equal(await page.locator('#quantity').evaluate(el=>el.open),false);

assert.equal(await page.locator('#etsy-stock-banner').isVisible(),true);
assert((await page.locator('#etsy-alert-title').textContent()).includes('1 Artikel ausverkauft'));
assert.equal(await page.locator('#etsy-alert-list').isVisible(),false);
await page.locator('#etsy-alert-toggle').click();
assert.equal(await page.locator('.etsy-alert-item').count(),2);
assert((await page.locator('#etsy-alert-list').textContent()).includes('Farbe: Beige'));
assert((await page.locator('#etsy-alert-list').textContent()).includes('Warnung bis 2'));
assert((await page.locator('#etsy-alert-subtitle').textContent()).includes('Etsy-Verfügbarkeit'));
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
// Optional component switches exist for every active catalog listing and
// stay off until the owner enables a particular product.
await page.locator('[data-workspace="catalog"]').click();
assert.equal(await page.locator('[data-components-toggle]').count(),4);
// Searching or clearing a search must preserve enhanced catalog UI. The
// original renderCatalog is overridden by components-ui.js after app.js loads.
await page.locator('#catalog-search').fill('Geldgeschenk');
assert.equal(await page.locator('[data-catalog-item]').count(),1);
assert.equal(await page.locator('[data-components-toggle]').count(),1,
 'search result retains the preproduction switch');
await page.locator('#catalog-search').fill('');
assert.equal(await page.locator('[data-catalog-item]').count(),4);
assert.equal(await page.locator('[data-components-toggle]').count(),4,
 'clearing search restores every preproduction switch');
await page.locator('#catalog-search').fill('Wunschfarbe');
assert.equal(await page.locator('[data-catalog-item]').count(),1);
assert.equal(await page.locator('[data-components-toggle]').count(),1,
 'a second search continues to use the enhanced catalog renderer');
await page.locator('#catalog-search').fill('');

assert.equal(await page.locator('[data-components-open]').count(),0);
await page.evaluate(()=>{
 const p=model.products.find(item=>item.id==='101');
 p.components_enabled=1;
 p.components=[{id:'ghost-white',listing_id:'101',name:'Geist Weiß',kind:'stock',
   units:1,stock:8,property_name:'',quantity_property:'Setgröße'}];
 renderCatalog();
});
const enabledCatalog=page.locator('[data-catalog-item="101"]');
assert.equal(await enabledCatalog.locator('[data-components-open]').count(),1);
await enabledCatalog.locator('[data-components-open]').click();
assert.equal(await page.locator('#components-editor').isVisible(),true);
assert((await page.locator('#components-list').textContent()).includes('Geist Weiß'));
assert.equal(await page.locator('#components-list [data-component-count]').inputValue(),'8');
await page.locator('[data-close="components-editor"]').click();
await page.evaluate(()=>{
 const p=model.products.find(item=>item.id==='101');
 p.components_enabled=0;p.components=[];
 renderCatalog();
});
await page.locator('[data-workspace="production"]').click();
assert.equal(await page.locator('#printer-strip').isVisible(),true);
// With component mode enabled, even a product with 784 variant combinations
// shows only physical components and never 784 "Noch zählen" entries.
const variantNeedsBefore=await page.evaluate(()=>{
 const p=model.products.find(product=>product.id==='102');
 return p.need;
});
await page.evaluate(()=>{
 const p=model.products.find(product=>product.id==='102');
 p.components_enabled=1;
 p.components=[
  {id:'ghost-stock',listing_id:'102',name:'Geist Weiß',kind:'stock',units:1,stock:8,property_name:'',quantity_property:'Setgröße'},
  {id:'book-demand',listing_id:'102',name:'Buch',kind:'demand',units:1,stock:0,property_name:'Buchfarbe',quantity_property:'Setgröße'}
 ];
 render();
});
const componentCard=page.locator('[data-product="102"]');
assert.equal(await componentCard.locator('.component-card-part').count(),2);
assert((await componentCard.locator('.component-card-panel').textContent()).includes('Geist Weiß'));
assert((await componentCard.locator('.component-card-panel').textContent()).includes('8 ×'));
assert((await componentCard.locator('.component-card-panel').textContent()).includes('Buchfarbe'));
assert((await componentCard.locator('.component-card-panel').textContent()).includes('Nach Auftrag'));
assert.equal(await componentCard.locator('.stock-overview,.stock-quick-toggle,.variant-picker,.print-overview,.product-print-actions').count(),0);
assert.equal(await componentCard.locator('.photo-stock-toggle').count(),0);
assert.equal(await componentCard.locator('.component-legacy .variant-toggle').count(),1,'historical complete variants stay accessible only if requested');
assert.equal(await componentCard.locator('.component-legacy .variant').count(),0,'do not render hundreds of variations by default');
assert.equal(await componentCard.locator('.product-photo').count(),1,'product photo area remains visible with or without preview images');
const afterCompSum=await page.locator('[data-summary="need"] .dashboard-kpi-value').textContent();
const expectedCompDue=await page.evaluate(()=>model.products
 .filter(p=>p.state==='active'&&!p.components_enabled).reduce((n,p)=>n+p.need,0));
assert.equal(Number.parseInt(afterCompSum,10),expectedCompDue,'variant-level demand from component products is excluded');
assert(variantNeedsBefore>=0);
await componentCard.locator('[data-product-components-open]').click();
assert.equal(await page.locator('#components-editor').isVisible(),true);
assert((await page.locator('#components-list').textContent()).includes('Geist Weiß'));
await page.locator('[data-close="components-editor"]').click();
await page.evaluate(()=>{
 const p=model.products.find(product=>product.id==='102');
 p.components_enabled=0;p.components=[];render();
});
assert.equal(await componentCard.locator('.stock-quick-toggle').count(),1,'normal variant inventory returns when switch off');

assert.equal((await page.locator('#order-count').textContent()).trim(),'3 offen');
assert.equal((await page.locator('[data-summary="critical"] .dashboard-kpi-value').textContent()).trim(),'2 Aufträge');
assert.equal(await page.locator('.order-card').count(),3);
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'501');
assert((await page.locator('[data-order-card="501"] .order-ship-date').textContent()).includes('Versand bis '));
assert(await page.locator('[data-order-card="501"] .order-countdown').count()===1);
// Confirmed prints, not "in Druck" starts, earn the large green completion banner.
const printProgressChecks=await page.evaluate(()=>{
 const line=(quantity,finished,printing,remaining,item_id='101-default')=>({quantity,finished,printing,remaining,item_id});
 return {
  missing:orderPrintProgress({items:[]}),
  started:orderPrintProgress({items:[line(2,0,2,0)]}),
  partial:orderPrintProgress({items:[line(2,1,1,0),line(1,0,0,1)]}),
  finishedOneOfTwo:orderPrintProgress({items:[line(2,2,0,0),line(1,0,0,1)]}),
  complete:orderPrintProgress({items:[line(2,2,0,0),line(1,1,0,0)]}),
  unassigned:orderPrintProgress({items:[line(2,2,0,0,null)]}),
  overscheduled:orderPrintProgress({items:[line(2,2,1,0)]})
 };
});
assert.deepEqual(printProgressChecks.missing,{total:0,finished:0,complete:false});
assert.deepEqual(printProgressChecks.started,{total:2,finished:0,complete:false});
assert.deepEqual(printProgressChecks.partial,{total:3,finished:1,complete:false});
assert.deepEqual(printProgressChecks.finishedOneOfTwo,{total:3,finished:2,complete:false});
assert.deepEqual(printProgressChecks.complete,{total:3,finished:3,complete:true});
assert.equal(printProgressChecks.unassigned.complete,false);
assert.equal(printProgressChecks.overscheduled.complete,false);
assert.equal(await page.locator('[data-order-card="501"] .order-print-complete').count(),0);
const baseOrderGeometry=await page.locator('[data-order-card="501"]').evaluate(card=>({
 cardHeight:card.getBoundingClientRect().height,
 imageTop:card.querySelector('.order-card-main img').getBoundingClientRect().top,
 imageHeight:card.querySelector('.order-card-main img').getBoundingClientRect().height
}));
await page.evaluate(()=>{
 const example=model.orders.find(order=>order.id==='501');
 window.beforePrintMarker=example.items;
 example.items=[{...example.items[0],item_id:'101-default',transaction_id:'print-test',finished:2,printing:0,remaining:0}];
 renderOrders();
});
const doneCard=page.locator('[data-order-card="501"]');
assert.equal(await doneCard.locator('.order-print-complete').count(),1);
assert.equal((await doneCard.locator('.order-print-complete').textContent()).trim(),'✓FERTIG');
assert.equal(await doneCard.locator('.order-print-check').textContent(),'✓');
const bookmark=await doneCard.locator('.order-print-complete').evaluate(el=>{
 const r=el.getBoundingClientRect(),card=el.closest('.order-card').getBoundingClientRect();
 const image=el.closest('.order-card').querySelector('.order-card-main img').getBoundingClientRect();
 const scroller=el.closest('.orders-carousel').getBoundingClientRect();
 const css=getComputedStyle(el);
 return {tag:el.tagName,height:r.height,width:r.width,top:r.top,bottom:r.bottom,right:r.right,
   cardTop:card.top,cardRight:card.right,cardHeight:card.height,imageTop:image.top,imageHeight:image.height,
   scrollTop:scroller.top,position:css.position,pointerEvents:css.pointerEvents};
});
assert.equal(bookmark.tag,'DIV','bookmark is a non-interactive status, not a button');
assert.equal(bookmark.position,'absolute','bookmark should not consume card height');
assert.equal(bookmark.pointerEvents,'none','bookmark must not be clickable');
assert(bookmark.height<=28&&bookmark.width<115,'bookmark stays compact even on tablet');
assert(bookmark.top>=bookmark.scrollTop-1,'bookmark cannot be clipped by the carousel');
assert(bookmark.bottom<=bookmark.cardTop+13,'bookmark should overlap only the uppermost card edge');
assert(bookmark.bottom+5<bookmark.imageTop,'bookmark cannot cover the product photo');
assert(bookmark.right<=bookmark.cardRight+1,'bookmark must attach to the top-right corner');
assert.equal(bookmark.imageHeight,baseOrderGeometry.imageHeight,'product image size is unchanged');
assert(Math.abs(bookmark.imageTop-baseOrderGeometry.imageTop)<=1,'bookmark does not push product image down');
assert(Math.abs(bookmark.cardHeight-baseOrderGeometry.cardHeight)<=1,'finished card height is unchanged');
const orderHeights=await page.locator('.order-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().height));
assert(orderHeights.every(h=>Math.abs(h-orderHeights[0])<=1),'all cards must have equal height');

assert.equal(await doneCard.locator('[data-order-quick]').count(),0,'a completed order has no redundant action');
await doneCard.locator('[data-order-open]').click();
assert.equal(await page.locator('#order-details-content .order-print-complete').count(),1);
await page.locator('[data-close="order-details"]').click();
await page.evaluate(()=>{
 const example=model.orders.find(order=>order.id==='501');
 example.items=[{...example.items[0],quantity:2,finished:1,printing:1,remaining:0}];
 renderOrders();
});
assert.equal(await doneCard.locator('.order-print-complete').count(),0);
assert((await doneCard.locator('.order-print-partial').textContent()).includes('1/2 fertig'));
const partialHeights=await page.locator('.order-card').evaluateAll(cards=>cards.map(c=>c.getBoundingClientRect().height));
assert(partialHeights.every(h=>Math.abs(h-partialHeights[0])<=1),'partially finished cards must not grow');
await page.evaluate(()=>{
 model.orders.find(order=>order.id==='501').items=window.beforePrintMarker;
 delete window.beforePrintMarker;
 renderOrders();
});
assert.equal(await doneCard.locator('.order-print-complete').count(),0);
// A counted, matching variant is assigned directly to an Etsy order, without printing.
await page.evaluate(()=>{
 const order=model.orders.find(o=>o.id==='502');
 window.stockCardBefore=order.items;
 order.items=[{...order.items[0],item_id:'101-default',transaction_id:'stock-demo',quantity:1,
  finished:0,allocated:0,printing:0,remaining:1,variant:'Farbe: Weiß'}];
 renderOrders();
});
const allocationCard=page.locator('[data-order-card="502"]');
assert.equal(await allocationCard.locator('[data-quick-action="allocate"]').count(),1);
assert((await allocationCard.locator('.order-print').textContent()).includes('Aus Lager'));
assert.equal(await allocationCard.locator('[data-quick-qty]').getAttribute('data-quick-qty'),'1');
assert.equal(await allocationCard.locator('[data-quick-action="allocate"]').count(),1,'one-click allocation is offered');
await allocationCard.locator('[data-order-open]').click();
assert.equal(await page.locator('#order-details-content [data-quick-action="allocate"]').count(),1);
assert.equal(await page.locator('#order-details-content [data-job-action="printing"]').count(),1);
await page.locator('[data-close="order-details"]').click();
await page.evaluate(()=>{
 const order=model.orders.find(o=>o.id==='502');
 order.items=[{...order.items[0],allocated:1,printing:0,remaining:0}];
 renderOrders();
});
assert.equal(await allocationCard.locator('.order-print-complete').count(),1);
assert.equal(await allocationCard.locator('[data-order-quick]').count(),0,'fully allocated order has no extra action');
await allocationCard.locator('[data-order-open]').click();
assert.equal(await page.locator('#order-details-content [data-job-action="release"]').count(),1);
await page.locator('[data-close="order-details"]').click();
await page.evaluate(()=>{
 const order=model.orders.find(o=>o.id==='502');
 order.items=window.stockCardBefore;
 delete window.stockCardBefore;
 renderOrders();
});
assert.equal(await allocationCard.locator('.order-print-complete').count(),0);
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
assert.equal(await page.locator('#filament-stock-summary').isVisible(),true);
assert.equal(await page.locator('#filament-stock-spools').textContent(),'0 volle Spulen · 0 angebrochen');
assert((await page.locator('#filament-stock-value').textContent()).includes('0,00'));
await page.locator('#filament-add').click();
assert.equal(await page.locator('#filament-form [name="stock_qty"]').getAttribute('inputmode'),'numeric');
assert.equal(await page.locator('#filament-form [name="open_qty"]').getAttribute('inputmode'),'numeric');
assert.equal(await page.locator('#filament-form [name="price"]').getAttribute('inputmode'),'numeric');
const priceField=page.locator('#filament-form [name="price"]');
await priceField.pressSequentially('1990');
assert.equal(await priceField.inputValue(),'19,90');
await priceField.fill('');
await priceField.pressSequentially('459');
assert.equal(await priceField.inputValue(),'4,59');
await priceField.press('Backspace');
assert.equal(await priceField.inputValue(),'0,45');
await priceField.press('Backspace');
assert.equal(await priceField.inputValue(),'0,04');
await priceField.press('Backspace');
assert.equal(await priceField.inputValue(),'');
await priceField.fill('');
await priceField.fill('19,90');
assert.equal(await priceField.inputValue(),'19,90');
assert.equal(await page.locator('#filament-internal-code').getAttribute('inputmode'),'decimal');
assert.equal(await page.locator('#filament-internal-code').getAttribute('pattern'),'[0-9]+([.,][0-9]+)?');
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
await page.locator('#filament-form [name="price"]').fill('');
await page.locator('#filament-form [name="price"]').pressSequentially('1990');
assert.equal(await page.locator('#filament-form [name="price"]').inputValue(),'19,90');
await page.locator('#filament-form [name="purchase_url"]').fill('https://example.org/shop/filament');
await page.locator('#filament-internal-code').fill('2,10');
assert.equal(await page.locator('#filament-internal-preview').textContent(),'2,10');
await page.locator('#filament-form [type="submit"]').click();
await page.locator('.filament-line').first().waitFor();
assert.equal(await page.locator('.filament-line').count(),1);
await page.waitForFunction(()=>filamentData?.filaments?.[0]?.internal_code==='2.10');
assert((await page.locator('.filament-line').first().textContent()).includes('Intern 2.10'));
assert.deepEqual(await page.locator('.filament-line-actions').first().locator(':scope > *').evaluateAll(nodes=>nodes.map(el=>el.classList[0])),
 ['filament-shop','filament-cart-button','filament-roll-button','filament-edit'], 'Shop must be the first action in Meine Farben');
// Simulate a Mac Split View / Home Assistant panel independent of viewport width.
// Two matching rows, one with a Shop link and one without it, must use the
// exact same four action slots without wrapping or horizontal overflow.
await page.evaluate(()=>{
 window.__filamentLayoutOriginal=filamentData.filaments;
 filamentData.filaments=[...filamentData.filaments,{
  ...filamentData.filaments[0],id:987654,purchase_url:''
 }];
 renderFilaments();
});
assert.equal(await page.locator('.filament-line').count(),2);
assert.equal(await page.locator('.filament-shop-placeholder').count(),1);
assert.equal(await page.locator('.filament-shop[href]').count(),1);
const actionGeometry=async width=>page.evaluate(width=>{
 const panel=document.querySelector('#filament-shell');
 panel.style.width=width+'px';panel.style.maxWidth='none';
 const rows=[...document.querySelectorAll('.filament-line')];
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
 return rows.map(row=>({
  card:rect(row),actions:rect(row.querySelector('.filament-line-actions')),
  cells:[...row.querySelector('.filament-line-actions').children].map(rect)
 }));
},width);
for(const width of [1020,935,805,740,585,450,390,330]){
 const measurements=await actionGeometry(width);
 assert.equal(measurements.length,2,'both filament rows must remain visible');
 const [withShop,withoutShop]=measurements;
 assert(Math.abs(withShop.card.height-withoutShop.card.height)<1,'matching rows keep identical heights at '+width);
 for(const [i,row] of measurements.entries()){
  assert.equal(row.cells.length,4,'four fixed action cells: '+width+' row '+i);
  assert(row.actions.right<=row.card.right+1,'buttons must stay inside the right card edge at '+width);
  assert(row.actions.bottom<=row.card.bottom+1,'buttons must stay inside card height at '+width);
  assert(row.cells.every(cell=>cell.x>=row.card.x-1&&cell.right<=row.card.right+1),'no side overflow '+width);
  assert(row.cells.every(cell=>cell.bottom<=row.card.bottom+1),'no vertical overflow '+width);
  assert(row.cells.every(cell=>cell.height>=40),'all touch targets sized for tablet '+width);
 }
 for(let i=0;i<4;i++){
  assert(Math.abs(withShop.cells[i].x-withoutShop.cells[i].x)<1,'same horizontal button slot '+width+' index '+i);
  assert(Math.abs(withShop.cells[i].width-withoutShop.cells[i].width)<1,'same slot width '+width+' index '+i);
 }
 if(width>450){
  assert(withShop.cells.every(cell=>Math.abs(cell.y-withShop.cells[0].y)<1),'single-row action grid at '+width);
  assert(withShop.cells.every((cell,i)=>i===0||cell.x>withShop.cells[i-1].right),'buttons never overlap '+width);
 }else{
  assert(Math.abs(withShop.cells[0].y-withShop.cells[1].y)<1,'first row Shop/List aligned '+width);
  assert(Math.abs(withShop.cells[2].y-withShop.cells[3].y)<1,'second row Rolls/Edit aligned '+width);
  assert(withShop.cells[2].y>withShop.cells[0].bottom,'button rows do not overlap '+width);
 }
}
await page.evaluate(()=>{
 const panel=document.querySelector('#filament-shell');
 panel.style.removeProperty('width');panel.style.removeProperty('max-width');
 filamentData.filaments=window.__filamentLayoutOriginal;
 delete window.__filamentLayoutOriginal;
 renderFilaments();
});
assert.equal(await page.locator('.filament-line').count(),1);
const sortedVariants=await page.evaluate(()=>({
  most:sortFilamentRows([{id:'low',stock_qty:1,brand:'A',color:'Rot'},{id:'high',stock_qty:6,brand:'A',color:'Weiß'},{id:'empty',stock_qty:0,brand:'B',color:'Kupfer'}],'stock-desc').map(x=>x.id),
  least:sortFilamentRows([{id:'low',stock_qty:1,brand:'A',color:'Rot'},{id:'high',stock_qty:6,brand:'A',color:'Weiß'},{id:'empty',stock_qty:0,brand:'B',color:'Kupfer'}],'stock-asc').map(x=>x.id)
}));
assert.deepEqual(sortedVariants,{most:['high','low','empty'],least:['empty','low','high']});
const shadeCodes=await page.evaluate(()=>sortFilamentRows(
 ['3','2.10','2.2','2.1','2','2.11',''].map((internal_code,i)=>({
  id:String(i),internal_code,brand:'Bambu Lab',color:'Weiß '+i
 })),'internal-code').map(x=>x.internal_code));
assert.deepEqual(shadeCodes,['2','2.1','2.2','2.10','2.11','3',''],
 'codes sort as hierarchical integers, not decimal floating-point numbers');
await page.locator('#filament-sort').selectOption('internal-code');
assert.equal(await page.evaluate(()=>localStorage.getItem('pp-filament-sort')),'internal-code');
await page.locator('#filament-sort').selectOption('default');
await page.locator('#filament-sort').selectOption('stock-desc');
assert.equal(await page.locator('#filament-sort').inputValue(),'stock-desc');
assert.equal(await page.evaluate(()=>localStorage.getItem('pp-filament-sort')),'stock-desc');
await page.locator('#filament-sort').selectOption('stock-asc');
assert.equal(await page.locator('#filament-sort').inputValue(),'stock-asc');
await page.locator('#filament-sort').selectOption('default');
assert((await page.locator('.filament-line .filament-meta').textContent()).includes('1 voll · 0 angebrochen'));
assert.equal(await page.locator('#filament-stock-spools').textContent(),'1 volle Spule · 0 angebrochen');
assert((await page.locator('#filament-stock-value').textContent()).includes('19,90'));
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
page.once('dialog',async prompt=>{assert.equal(prompt.type(),'confirm');await prompt.accept();});
await page.locator('[data-close="filament-editor"]').click();
await page.route('**/api/filament',async route=>{
 await new Promise(resolve=>setTimeout(resolve,450));
 await route.continue();
});
await page.locator('[data-filament-cart]').click();
await page.locator('#filament-action-status').waitFor({state:'visible'});
assert((await page.locator('#filament-action-status').textContent()).includes('Einkaufsliste'));
assert.equal(await page.locator('[data-filament-cart]').isDisabled(),true);
assert((await page.locator('[data-filament-cart]').getAttribute('class')).includes('filament-waiting'));
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='1');
await page.locator('#filament-action-status').waitFor({state:'hidden'});
await page.unroute('**/api/filament');
await page.locator('[data-filament-view="cart"]').click();
assert.equal(await page.locator('#filament-stock-summary').isVisible(),false);
assert.equal(await page.locator('.filament-line').count(),1);
assert((await page.locator('#filament-cart-summary').textContent()).includes('19,90'));
assert.equal(await page.locator('#filament-sort-wrap').isVisible(),false);
assert.deepEqual(await page.locator('.filament-line-actions').first().locator(':scope > *').evaluateAll(nodes=>nodes.map(el=>el.classList[0])),
 ['filament-shop','filament-step','filament-cart-qty','filament-step','secondary'], 'Shop first in the shopping list');
await page.locator('[data-filament-delta="1"]').click();
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='2');
await page.locator('[data-filament-delta="-1"]').click();
await page.waitForFunction(()=>document.querySelector('#filament-cart-count').textContent==='1');
const valuation=await page.evaluate(()=>filamentStockValue([
 {stock_qty:3,price_cents:1990,cart_qty:11},
 {stock_qty:2,price_cents:null,cart_qty:9},
 {stock_qty:0,price_cents:null,cart_qty:1},
 {stock_qty:1,price_cents:0,cart_qty:0}
]));
assert.deepEqual(valuation,{spools:6,known_total_cents:5970,missing_qty:2});
await page.locator('[data-filament-view="colors"]').click();
assert.equal(await page.locator('.filament-roll-button').count(),1);
await page.locator('.filament-roll-button').click();
assert.equal(await page.locator('#filament-rolls').isVisible(),true);
assert.equal(await page.locator('#filament-rolls-full').textContent(),'1');
assert.equal(await page.locator('#filament-rolls-open').textContent(),'0');
assert.equal(await page.locator('#filament-roll-empty').isDisabled(),true);
await page.locator('#filament-roll-open').click();
await page.waitForFunction(()=>document.querySelector('#filament-rolls-full').textContent==='0');
assert.equal(await page.locator('#filament-rolls-open').textContent(),'1');
assert.equal(await page.locator('#filament-cart-count').textContent(),'1',
 'Already-listed filament must not be added a second time when opening its last roll');
assert.equal(await page.locator('#filament-roll-open').isDisabled(),true);
assert((await page.locator('.filament-line .filament-meta').textContent()).includes('0 voll · 1 angebrochen'));
assert.equal(await page.locator('#filament-stock-spools').textContent(),'0 volle Spulen · 1 angebrochen');
assert((await page.locator('#filament-stock-value').textContent()).includes('0,00'));
await page.locator('#filament-roll-empty').click();
await page.waitForFunction(()=>document.querySelector('#filament-rolls-open').textContent==='0');
assert.equal(await page.locator('#filament-rolls-full').textContent(),'0');
assert.equal(await page.locator('#filament-roll-empty').isDisabled(),true);
await page.locator('#filament-roll-edit').click();
assert.equal(await page.locator('#filament-form [name="open_qty"]').inputValue(),'0');
await page.locator('#filament-form [name="open_qty"]').fill('2');
await page.locator('#filament-form [name="stock_qty"]').fill('1');
await page.locator('#filament-form [type="submit"]').click();
await page.waitForFunction(()=>document.querySelector('#filament-stock-spools').textContent==='1 volle Spule · 2 angebrochen');
assert((await page.locator('#filament-stock-value').textContent()).includes('19,90'));

await page.locator('[data-workspace="production"]').click();
assert.equal(await page.locator('.product').count(),4);
await page.locator('[data-order-sort="new"]').click();
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'503');
assert.equal(await page.locator('[data-order-card="503"] [data-order-expand]').count(),1,'every card has an enlarge control');
await page.locator('[data-order-card="503"] [data-order-expand]').click();
assert.equal(await page.locator('#order-details').isVisible(),true);
assert.equal(await page.locator('#order-details .order-zoom-stats>div').count(),4);
assert.equal(await page.locator('#order-details .order-work-items.is-single .order-work-item').count(),1);
const zoomWidth=await page.locator('#order-details').evaluate(el=>el.getBoundingClientRect().width);
assert(zoomWidth>1000,'large view uses the tablet/desktop width');
await page.locator('[data-close="order-details"]').click();
await page.locator('[data-order-card="503"] [data-order-open]').click();
assert((await page.locator('#order-details-title').textContent()).includes('#503'));
assert((await page.locator('#order-details-content').textContent()).includes('Farbe: Schwarz'));
assert.equal(await page.locator('#order-details-content .order-work-item').count(),1);
assert.equal((await page.locator('#order-details-content .order-work-variant b').first().textContent()).trim(),'Schwarz');
const variantFont=await page.locator('#order-details-content .order-work-variant b').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
assert(variantFont>=17,'ordered color must be prominent and legible');
assert.equal(await page.locator('#order-details-content .order-countdown').count(),1);
await page.locator('[data-close="order-details"]').click();
await page.locator('[data-order-sort="ship"]').click();
assert.equal(await page.locator('.order-card').first().getAttribute('data-order-card'),'501');
await page.setViewportSize({width:700,height:844});
await page.locator('[data-order-card="503"] [data-order-expand]').click();
const mobileZoom=await page.locator('#order-details .order-work-items').evaluate(el=>({
 cols:getComputedStyle(el).gridTemplateColumns.split(' ').length,
 width:document.getElementById('order-details').getBoundingClientRect().width
}));
assert.equal(mobileZoom.cols,1,'narrow view stacks order lines');
assert(mobileZoom.width>630&&mobileZoom.width<=700,'mobile zoom almost fills available width');
await page.locator('[data-close="order-details"]').click();
await page.locator('#orders-next').click();
await page.waitForTimeout(600);
assert(await page.locator('#orders').evaluate(el=>el.scrollLeft>0));
await page.setViewportSize({width:1440,height:1100});

assert.equal(await page.locator('[data-product="inactive-cat"]').count(),0);
assert.equal(await page.locator('#summary .dashboard-kpi').count(),2);
assert.equal(await page.locator('.product').count(),4);
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
page.once('dialog',async prompt=>{assert.equal(prompt.type(),'confirm');await prompt.accept();});
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
await page.locator('#settings-open').click();await page.locator('#days').fill('10');await page.locator('#etsy-alert-percent').fill('50');await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/settings')&&r.request().method()==='POST'),page.locator('#settings-form [type="submit"]').click()]);assert.equal((await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json())).days,10);
assert.equal((await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json())).etsy_alert_percent,50);
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
// The small inventory button must stay inside the photo and outside Etsy's badge.
const badgeGeometry=await page.locator('[data-product="102"] .product-photo').evaluate(photo=>{
 const a=photo.querySelector('.etsy-total').getBoundingClientRect();
 const b=photo.querySelector('.photo-stock-toggle').getBoundingClientRect();
 const image=photo.getBoundingClientRect();
 return {noOverlap:a.right<=b.left+1,within:b.right<=image.right+1,height:b.height,width:b.width};
});
assert(badgeGeometry.noOverlap,'Etsy and Lager buttons must not collide');
assert(badgeGeometry.within,'stock button must remain within the product photo');
assert(badgeGeometry.height>=44,'stock button must be touch-friendly');
assert(badgeGeometry.width<160,'stock control must remain visually compact');
await page.screenshot({path:'/tmp/lager-mobile.png',fullPage:true});
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));// Exercise real multi-variant stock writes via the new card buttons.
await page.unroute('**/api/status');
await page.reload();await page.locator('[data-product="102"]').waitFor();
const realCard=page.locator('[data-product="102"]');
assert.equal(await realCard.locator('.stock-overview').count(),0);
await realCard.locator('.photo-stock-toggle').click();
assert.equal(await realCard.locator('.stock-variant').count(),2);
assert((await realCard.locator('.stock-overview').textContent()).includes('0 ×Beige'));
assert((await realCard.locator('.stock-overview').textContent()).includes('Noch zählenSchwarz'));
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
await page.reload();
await realCard.locator('.photo-stock-toggle').click();
assert((await realCard.locator('.stock-overview').textContent()).includes('2 ×Schwarz'));
await realCard.locator('[data-print-action="finish"]').click();
await page.locator('#quantity-value').fill('3');await page.locator('#quantity-confirm').click();
await page.waitForFunction(()=>document.querySelector('[data-product="102"] .running-print').textContent.includes('1 ×'));
realState=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
black=realState.products.find(p=>p.id==='102').items.find(i=>i.id==='102-black');
assert.equal(black.on_hand,5);assert.equal(black.in_print,1);
assert((await realCard.locator('.stock-overview').textContent()).includes('5 ×Schwarz'),
 'open stock panel must update immediately when confirmed print increases actual stock');
await realCard.locator('[data-print-action="cancel"]').click();await page.locator('#quantity-confirm').click();
await realCard.locator('.running-print').waitFor({state:'detached'});
// Performance regression: identical snapshots must not repaint the grid.
const unchanged=await page.evaluate(()=>{
 const original=render;let calls=0;
 render=function(){calls++;return original()};
 try{setModel(structuredClone(model));}
 finally{render=original;}
 return calls;
});
assert.equal(unchanged,0,'identical background status snapshots must skip repaint');

// DOM matching must reuse buttons and images in large variant inventories.
const stablePatch=await page.evaluate(()=>{
 const host=document.createElement('div');
 const html='<button data-action="adjust" data-id="first" data-delta="1">1</button>'+
            '<button data-action="adjust" data-id="second" data-delta="1">2</button>';
 updateHTML(host,html);
 const first=host.firstElementChild,second=host.lastElementChild;
 updateHTML(host,html);
 const unchanged=host.firstElementChild===first&&host.lastElementChild===second;
 updateHTML(host,'<button data-action="adjust" data-id="second" data-delta="1">2</button>'+
             '<button data-action="adjust" data-id="first" data-delta="1">1</button>');
 return {unchanged,reverse:host.firstElementChild===second&&host.lastElementChild===first};
});
assert(stablePatch.unchanged&&stablePatch.reverse,'DOM patch must preserve existing controls when unchanged or reordered');

// Deliberately slow down a real stock POST. The other cards must remain active
// and a visible saving notice must remain until confirmation is returned.
await page.route('**/api/stock',async route=>{
 await new Promise(resolve=>setTimeout(resolve,900));
 const response=await route.fetch();
 await route.fulfill({response});
});
const initial=Number(await page.locator('[data-product="101"] .stock-number').textContent());
await page.locator('[data-product="101"] [data-action="adjust"][data-delta="1"]').click();
await page.waitForFunction(()=>busy,null,{timeout:3000});
assert.equal(await page.locator('[data-product="102"] .stock-quick-toggle').isEnabled(),true,
 'another product must not be disabled during a stock request');
assert((await page.locator('#toast').textContent()).includes('wird gespeichert'));
await page.waitForFunction(expected=>!busy&&
 Number(document.querySelector('[data-product="101"] .stock-number').textContent)===expected,
 initial+1,{timeout:10000});
await page.unroute('**/api/stock');
// Real Home Assistant preview backend: changes made on the production card
// and in the components editor must use the same persisted physical stock.
const componentRequest=async data=>{
 const response=await page.request.post('http://127.0.0.1:8099/api/components',{data});
 assert.equal(response.status(),200,await response.text());
};
await componentRequest({action:'toggle',listing_id:'104',enabled:true});
for(const name of ['Grundplatte','Figur'])
 await componentRequest({action:'save',listing_id:'104',name,kind:'stock',units:1,
  property_name:'',quantity_property:''});
await page.reload();
const partsCard=page.locator('[data-product="104"]');
await partsCard.locator('.component-card-stock-value').first().waitFor();
assert.equal(await partsCard.locator('[data-component-stock-open]').count(),2);
await partsCard.locator('[data-component-stock-delta="1"]').first().click();
await page.waitForFunction(()=>document.querySelector('[data-product="104"] .component-card-stock-value')?.textContent?.trim()==='1 ×');
await partsCard.locator('[data-component-stock-open]').first().click();
let stockInput=partsCard.locator('[data-component-stock-input]');
assert.equal(await stockInput.count(),1,'clicking a quantity reveals inline editing');
await stockInput.fill('4');
await stockInput.press('Enter');
await page.waitForFunction(()=>[...document.querySelectorAll('[data-product="104"] .component-card-stock-value')]
 .some(x=>x.textContent.trim()==='4 ×'));
await partsCard.locator('[data-component-stock-open]').nth(1).click();
stockInput=partsCard.locator('[data-component-stock-input]');
await stockInput.fill('2');
// Leaving the field for the edit dialog must persist the change.
await partsCard.locator('[data-product-components-open]').click();
await page.waitForFunction(async()=>{
 const res=await fetch('api/status');const state=await res.json();
 const p=state.products.find(x=>x.id==='104');
 return p?.components?.some(x=>x.stock===2);
},null,{timeout:10000});
const editor=page.locator('#components-editor');
assert.equal(await editor.locator('[data-component-count]').count(),2);
let savedBefore=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
const mapBefore=Object.fromEntries(savedBefore.products.find(x=>x.id==='104').components.map(x=>[x.id,x]));
for(const field of await editor.locator('[data-component-count]').all()){
 const id=await field.getAttribute('data-component-count');
 await field.fill(String(mapBefore[id].stock+1));
}
await editor.locator('#components-stock-bulk').click();
await page.waitForFunction(()=>!busy);
let savedAfter=await page.request.get('http://127.0.0.1:8099/api/status').then(r=>r.json());
const mapAfter=Object.fromEntries(savedAfter.products.find(x=>x.id==='104').components.map(x=>[x.id,x]));
for(const id of Object.keys(mapBefore))
 assert.equal(mapAfter[id].stock,mapBefore[id].stock+1,'bulk edit and production card have one consistent stock');
page.once('dialog',async prompt=>{assert.equal(prompt.type(),'confirm');await prompt.accept();});
await editor.locator('[data-close="components-editor"]').click();
const partsText=await partsCard.locator('.component-card-panel').textContent();
assert(partsText.includes('5 ×')&&partsText.includes('3 ×'),
 'production card shows both saved component quantities without opening editor again');

assert.deepEqual(errors,[]);console.log('UI PASS: compact stock drawer; responsive stock edits; unchanged snapshot cache; stable DOM; orders; backup; mobile widths; no JS errors.');await browser.close();})().catch(e=>{console.error(e);process.exit(1)});
