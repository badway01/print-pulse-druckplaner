'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:860},
   userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const first='a'.repeat(24),second='b'.repeat(24);
  const files=[{id:first,listing_id:'101',variant_id:'',printer:'H2D',
    filename:'MagSafe_P1S_Master.3mf',created:100,bytes:45000}];
  let defaults=[],saved=null,requests=0;
  await page.route('**/api/status',async route=>{
   const response=await route.fetch(),data=await response.json();
   const item=data.products.find(p=>p.id==='101').items[0];
   const created=Math.floor(Date.now()/1000)-86400*14; // existing order predates project upload
   data.orders=[{id:'test-old-order',customer:'Bestandskunde',created,ship_by:created+86400*20,
    quantity:1,items:[{listing_id:'101',item_id:item.id,transaction_id:'old-order-line',
     title:'MagSafe Halterung',variant:'Farbe: Weiß',quantity:1,remaining:1,
     printing:0,finished:0,allocated:0,assembled:0,components_enabled:false,
     image:'',color:'',components:[]}]}];
   await route.fulfill({response,json:data});
  });
  await page.route('**/api/print-tools?listing_id=101',route=>{
   requests++;
   return route.fulfill({json:{files,profiles:[],component_links:[],order_master_defaults:defaults}});
  });
  await page.route('**/api/order-master-default',route=>{
   saved=route.request().postDataJSON();
   defaults=[{listing_id:'101',variant_id:saved.variant_id,file_id:saved.file_id}];
   return route.fulfill({json:{files,profiles:[],component_links:[],order_master_defaults:defaults}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-order-position="old-order-line"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#order-position .simple-pos-master-product .simple-part-master-open')!==null);
  const dialog=page.locator('#order-position');
  let link=dialog.locator('.simple-pos-master-product .simple-part-master-open');
  assert.match(await link.getAttribute('href'),new RegExp('bambu/'+first));
  assert.match(await dialog.innerText(),/MagSafe_P1S_Master\.3mf/);
  assert.equal(await dialog.locator('[data-focus-action="start"]').count(),1);
  await dialog.locator('[data-focus-close]').click();
  // Dashboard and separate Bestellungen tab must share this same position workflow.
  await page.locator('[data-workspace="orders"]').click();
  await page.locator('#full-orders-grid [data-order-position="old-order-line"]').first().click();
  assert.match(await link.getAttribute('href'),new RegExp('bambu/'+first));
  await dialog.locator('[data-focus-close]').click();
  // Another master added later: the already existing order immediately offers selection.
  files.push({id:second,listing_id:'101',variant_id:'',printer:'P1S Old',
   filename:'MagSafe_andere_Variante.3mf',created:200,bytes:45000});
  await page.locator('#full-orders-grid [data-order-position="old-order-line"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#order-position [data-order-master-select]')!==null);
  assert.equal(await dialog.locator('.simple-pos-master-product .simple-part-master-open').count(),0);
  await dialog.locator('[data-order-master-select]').selectOption(first);
  await dialog.locator('[data-order-master-save]').click();
  await page.waitForFunction(()=>document.querySelector('#order-position .simple-pos-master-product .simple-part-master-open')!==null);
  assert.equal(saved.listing_id,'101');
  assert.equal(saved.file_id,first);
  assert.match(await link.getAttribute('href'),new RegExp('bambu/'+first));
  assert(requests>=3,'Fetch current masters on each order open');
  assert.deepEqual(errors,[]);
  console.log('EXISTING ORDER MASTER PASS: old order in Dashboard + Bestellungen, latest 3MF, saved default');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
