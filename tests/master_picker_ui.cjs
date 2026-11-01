'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900},userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const spools=[
   {id:1,internal_code:'5',brand:'Bambu Lab',color:'Schwarz',material:'PLA Basic',color_hex:'#000000',manufacturer_code:'10101'},
   {id:2,internal_code:'11',brand:'Bambu Lab',color:'Sakura Pink',material:'PLA Matte',color_hex:'#ff99ee',manufacturer_code:'11201'},
   {id:3,internal_code:'16',brand:'Bambu Lab',color:'Gelb',material:'PLA Basic',color_hex:'#f4ee2a',manufacturer_code:'10102'}
  ];
  let saved=null,uploaded=false,refreshFails=false,uploadName=null,uploadHeaders=null;
  await page.route('**/api/filaments',route=>route.fulfill({json:{filaments:spools}}));
  await page.route('**/api/print-tools*',route=>{
   if(refreshFails)return route.fulfill({status:500,json:{error:'Test: Nachladen vorübergehend nicht möglich'}});
   return route.fulfill({json:{profiles:[],files:[]}});
  });
  await page.route('**/api/print-profile',async route=>{
   saved=route.request().postDataJSON();
   return route.fulfill({json:{profiles:[{...saved,sources:saved.sources,colors:[]}],files:[]}});
  });
  await page.route('**/api/master-upload*',async route=>{
   uploaded=true;refreshFails=true;
   const request=route.request();
   assert.equal(new URL(request.url()).search,'','Upload URL has no filename query params');
   uploadHeaders=request.headers();
   const token=uploadHeaders['x-pp-filename-b64'];
   assert(token,'ASCII-safe filename header is present');
   uploadName=Buffer.from(token.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');
   assert.equal(uploadHeaders['x-pp-printer'],'H2D');
   return route.fulfill({json:{ok:true,id:'abcdef012345abcdef012345',bytes:1234}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-workspace="catalog"]').click();
  await page.locator('#catalog-rows [data-master-open]').first().click();
  await page.locator('#master-colors-details summary').click();
  await page.locator('#master-add').click();
  assert.equal(await page.locator('[data-master-slot-open]').count(),4);
  await page.locator('[data-master-slot-open="0"]').click();
  assert.equal(await page.locator('#master-filament-picker-overlay').isVisible(),true);
  await page.locator('#master-filament-search').fill('11201');
  assert.equal(await page.locator('[data-master-pick="2"]').count(),1);
  assert.equal(await page.locator('[data-master-pick="1"]').count(),0);
  await page.locator('[data-master-pick="2"]').click();
  assert.match(await page.locator('[data-master-slot-open="0"]').innerText(),/Sakura Pink/);
  assert.match(await page.locator('[data-master-slot-open="0"]').innerText(),/Intern 11/);
  assert.match(await page.locator('[data-master-slot-open="0"] .master-slot-color').getAttribute('style'),/#ff99ee/);
  await page.locator('#master-save').click();
  await page.waitForFunction(()=>document.querySelector('#master-profile-status').textContent.includes('gespeichert'));
  assert.equal(saved.sources[0].slots[0],2);
  if(!await page.locator('#master-upload-details').evaluate(el=>el.open)) await page.locator('#master-upload-details summary').click();
  await page.locator('#master-upload-input').setInputFiles({name:'My_Acorn_beide_größen.3mf',mimeType:'model/3mf',buffer:Buffer.from('testdatei')});
  await page.locator('#master-upload').click();
  await page.waitForFunction(()=>document.querySelector('#master-upload-status').textContent.includes('Nur die Aktualisierung'));
  assert(uploaded);
  assert.equal(uploadName,'My_Acorn_beide_größen.3mf');
  assert.match(await page.locator('#master-upload-status').innerText(),/Nur die Aktualisierung/);
  assert.match(await page.locator('#master-files').innerText(),/My_Acorn_beide_größen\.3mf/);
  assert.equal(await page.locator('.master-project-card').count(),1);
  assert.match(await page.locator('.master-project-name strong').innerText(),/My_Acorn_beide_größen\.3mf/);
  assert.equal(await page.locator('#master-file-count').innerText(),'1 Projektdatei');
  assert.equal(await page.locator('[data-master-slicer-file]').count(),2);
  assert.match(await page.locator('[data-master-slicer-file]').first().getAttribute('href'),/^printpulse3mf:\/\/bambu\/[a-f0-9]{24}$/);
  assert.match(await page.locator('[data-master-slicer-file]').last().getAttribute('href'),/^printpulse3mf:\/\/snapmaker\/[a-f0-9]{24}$/);
  assert.equal(await page.locator('.master-slicer-help a[download]').count(),1);
  assert.equal(await page.locator('.master-slicer-help').getAttribute('open'),null);
  assert.doesNotMatch(await page.locator('#master-upload-status').innerText(),/Upload fehlgeschlagen/);
  // Safari used to turn an HTML ingress response into an opaque
  // "The string did not match the expected pattern" JSON error.
  await page.unroute('**/api/master-upload*');
  await page.route('**/api/master-upload*',route=>route.fulfill({
   status:502,contentType:'text/html',body:'<!doctype html><html><body>Bad Gateway</body></html>'
  }));
  await page.locator('#master-upload-input').setInputFiles({
   name:'My_Acorn_beide_groessen.3mf',mimeType:'model/3mf',buffer:Buffer.from('testdatei')
  });
  await page.locator('#master-upload').click();
  await page.waitForFunction(()=>document.querySelector('#master-upload-status').textContent.includes('HTTP 502'));
  assert.match(await page.locator('#master-upload-status').innerText(),/Ingress-.?\/?.?Proxy-Fehler|Ingress-\/Proxy-Fehler/);
  assert.doesNotMatch(await page.locator('#master-upload-status').innerText(),/The string did not match/);
  assert.deepEqual(errors,[],'No JavaScript browser errors');
  await page.setViewportSize({width:390,height:780});
  await page.locator('[data-master-slot-open="1"]').click();
  assert.equal(await page.locator('#master-filament-picker-overlay').isVisible(),true);
  assert.equal(await page.locator('.master-picker-choice').count(),4);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#master-filament-picker-overlay').isVisible(),false);
  let deletes=0,deleteFails=true;
  await page.route('**/api/master-delete',route=>{
   deletes++;
   assert.equal(route.request().postDataJSON().id,'abcdef012345abcdef012345');
   return route.fulfill(deleteFails?{status:400,json:{error:'Test: Löschen fehlgeschlagen'}}:{json:{ok:true}});
  });
  page.once('dialog',dialog=>{assert.match(dialog.message(),/My_Acorn_beide_größen/);dialog.dismiss();});
  await page.locator('[data-master-delete]').click();
  assert.equal(deletes,0);
  assert.equal(await page.locator('[data-master-delete]').count(),1);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-master-delete]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-master-delete]').disabled);
  assert.equal(deletes,1);
  assert.equal(await page.locator('.master-project-card').count(),1);
  deleteFails=false;
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-master-delete]').click();
  await page.waitForFunction(()=>document.querySelector('#master-file-count').textContent==='0 Projektdateien');
  assert.equal(deletes,2);
  assert.equal(await page.locator('.master-project-card').count(),0);
  assert.deepEqual(errors,[],'No JavaScript errors after deletion');
  console.log('MASTER PICKER PASS: swatches, upload, mobile, delete cancellation, failure and success');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1)});
