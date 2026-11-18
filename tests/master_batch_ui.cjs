'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PP_BROWSER_PATH?{executablePath:process.env.PP_BROWSER_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const spool={id:1,brand:'Bambu Lab',color:'Schwarz',material:'PLA Basic',color_hex:'#111111',internal_code:'5',price_cents:1450,spool_g:1000};
  const file={id:'a'.repeat(24),listing_id:'101',variant_id:'',printer:'H2D',filename:'Karten.3mf',created:100,bytes:45000,insights:{batch_units:1,time_seconds:7200,total_grams:120,material_eur:1.74,production_eur:2.00,production_per_unit_eur:2.00,filaments:[{filament_id:1,grams:120,color_hex:'#111111',name:'Schwarz'}]}};
  await page.route('**/api/print-tools*',r=>r.fulfill({json:{files:[file],profiles:[],filaments_library:[{id:1,name:'Schwarz',hex:'#111111',code:'5'}]}}));
  await page.route('**/api/filaments',r=>r.fulfill({json:{filaments:[spool]}}));
  await page.route('**/api/economics',async r=>{
   const response=await r.fetch(),data=await response.json();
   data.filaments=[spool];await r.fulfill({response,json:data});
  });
  let saved;
  await page.route('**/api/master-insights',r=>{
   saved=r.request().postDataJSON();
   assert.equal(saved.batch_units,3);assert.equal(saved.hours,2);assert.equal(saved.filaments[0].grams,120);
   Object.assign(file.insights,{batch_units:3,grams_per_unit:40,material_per_unit_eur:.58,production_per_unit_eur:.67});
   return r.fulfill({json:{ok:true}});
  });
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-workspace="catalog"]').click();
  await page.locator('[data-master-open="101"]').first().click();
  const form=page.locator('#master-editor [data-master-insight-form]').first();
  await form.locator('[data-insight-units]').waitFor();
  assert.equal(await form.locator('[data-insight-units]').inputValue(),'1');
  await form.locator('[data-insight-units]').fill('3');
  await form.locator('[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#master-editor .master-insight-card')?.textContent.includes('40 g'));
  assert.equal(saved.batch_units,3);
  assert.equal(await form.locator('[data-insight-units]').inputValue(),'3');
  assert.match(await page.locator('#master-editor .pp-insight-stats').first().innerText(),/0,67/);
  await page.locator('#master-editor [data-insight-calculator]').first().click();
  await page.locator('#calculator-shell').waitFor();
  assert.equal(await page.locator('#econ-form [name="batch_units"]').inputValue(),'3');
  assert.equal(await page.locator('#econ-hours').inputValue(),'2');
  assert.equal(await page.locator('#econ-materials [data-econ-mat-field="grams"]').first().inputValue(),'120');
  assert.deepEqual(errors,[]);
  console.log('MASTER BATCH PASS: Stückzahl, Gesamtwerte, Stückkosten und Preisrechner');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
