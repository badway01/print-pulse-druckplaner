'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1080,height:860},
   userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const firstId='a'.repeat(24), secondId='b'.repeat(24);
  const files=[
   {id:firstId,listing_id:'101',variant_id:'',printer:'H2D',filename:'Schale.3mf',created:40,bytes:150000},
   {id:secondId,listing_id:'101',variant_id:'',printer:'H2D',filename:'Halter.3mf',created:41,bytes:150000}
  ];
  let saved=null,links=[];
  await page.route('**/api/status',async route=>{
   const response=await route.fetch(),data=await response.json();
   const product=data.products.find(p=>p.id==='101');
   const item=product.items[0];
   const parts=['Schale','Scrunchie-Halter'].map((name,i)=>({
     id:i?'part-halter':'part-schale',name,color:'11. Pink-Pastell',
     kind:'demand',label:'',required:1,available:0,printing:0,finished:0,
     consumed:0,booked:0,stock:0,error:''
   }));
   product.components_enabled=true;
   product.components=parts;
   const now=Math.floor(Date.now()/1000);
   data.orders=[{id:'test-order',customer:'Testkunde',created:now-3600,ship_by:now+86400,
     quantity:1,items:[{listing_id:'101',item_id:item.id,transaction_id:'test-part-line',
       title:'Scrunchie Organizer',variant:'Farbe: Rosa',image:'',
       quantity:1,remaining:1,printing:0,finished:0,allocated:0,assembled:0,
       components_enabled:true,components:parts}]}];
   await route.fulfill({response,json:data});
  });
  await page.route('**/api/print-tools?listing_id=101',route=>route.fulfill({json:{files,profiles:[],component_links:links}}));
  await page.route('**/api/master-component-link',route=>{
   saved=route.request().postDataJSON();
   links=[{component_id:saved.component_id,variant_id:saved.variant_id,printer:saved.printer,
           file_id:saved.file_id,listing_id:'101'}];
   return route.fulfill({json:{files,profiles:[],component_links:links}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-order-position="test-part-line"]').first().click();
  await page.waitForFunction(()=>document.querySelectorAll('#order-position .simple-part-master-open').length===2);
  const rows=page.locator('#order-position .simple-pos-part');
  assert.equal(await rows.count(),2);
  assert.match(await rows.nth(0).locator('.simple-part-master-open').getAttribute('href'),new RegExp('bambu/'+firstId));
  assert.match(await rows.nth(1).locator('.simple-part-master-open').getAttribute('href'),new RegExp('bambu/'+secondId));
  assert.equal(await page.locator('#order-position [data-focus-part-action="start"]').count(),2);
  assert.match(await rows.nth(0).innerText(),/Schale/);
  assert.match(await rows.nth(1).innerText(),/Scrunchie-Halter/);
  await rows.nth(0).locator('.simple-part-master-change summary').click();
  await rows.nth(0).locator('[data-part-master-select]').selectOption(secondId);
  await rows.nth(0).locator('[data-part-master-save]').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('verknüpft'));
  assert.equal(saved.component_id,'part-schale');
  assert.equal(saved.printer,'H2D');
  assert.match(await rows.nth(0).locator('.simple-part-master-open').getAttribute('href'),new RegExp(secondId));
  assert.deepEqual(errors,[]);
  console.log('ORDER PART MASTER PASS: correct 3MF per part, direct links, persistent mapping, print buttons');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
