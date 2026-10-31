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
  await page.route('**/api/print-tools?listing_id=101',route=>route.fulfill({json:{files,profiles:[],component_links:links}}));
  await page.route('**/api/master-component-link',route=>{
   saved=route.request().postDataJSON();
   links=[{component_id:saved.component_id,variant_id:saved.variant_id,printer:saved.printer,
           file_id:saved.file_id,listing_id:'101'}];
   return route.fulfill({json:{files,profiles:[],component_links:links}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.waitForFunction(()=>typeof model!=='undefined'&&model?.orders?.length>0);
  await page.evaluate(()=>{
   const order=model.orders.find(o=>(o.items||[]).some(l=>String(l.listing_id)==='101'));
   if(!order)throw Error('Preview order missing');
   const line=order.items.find(l=>String(l.listing_id)==='101');
   const qty=Math.max(1,Number(line.quantity)||1);
   line.components_enabled=true;
   line.remaining=qty;
   line.components=['Schale','Scrunchie-Halter'].map((name,i)=>({
     id:i?'part-halter':'part-schale',name,color:'11. Pink-Pastell',kind:'demand',
     label:'',required:qty,available:0,printing:0,finished:0,consumed:0,booked:0,stock:0,error:''
   }));
  });
  // The last injected statement is intentionally not used as app state.
  await page.evaluate(()=>{
   const order=model.orders.find(o=>(o.items||[]).some(l=>String(l.listing_id)==='101'));
   const line=order.items.find(l=>String(l.listing_id)==='101');
   if(!line.components?.length)throw Error('Component fixture missing');
   printTools.files=[];
   printTools.component_links=[];
   render();
  });
  const tid=await page.evaluate(()=>model.orders.find(o=>(o.items||[]).some(l=>String(l.listing_id)==='101')).items.find(l=>String(l.listing_id)==='101').transaction_id);
  await page.locator('[data-order-position="'+tid+'"]').first().click();
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
