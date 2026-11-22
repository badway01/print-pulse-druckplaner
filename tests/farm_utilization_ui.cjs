'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {chromium}=require('playwright');

function unit(){
 const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/farm-ui.js'),'utf8');
 const scope={document:{querySelectorAll:()=>[],getElementById:()=>null},setInterval:()=>{}};
 vm.createContext(scope);
 vm.runInContext(source,scope);
 const sample={printer:'X2D',source:'ha',observed_seconds:28.4*3600,printing_seconds:25.7*3600,coverage_percent:1.2,capacity_percent:1.1};
 scope.sample=sample;
 const html=vm.runInContext('farmPrinterCard(sample,{start:0,end:95*86400})',scope);
 assert.match(html,/90,5 %/);
 assert.match(html,/25,7 h Druckzeit/);
 assert.match(html,/2,7 h ohne Druck/);
 assert.match(html,/class="farm-coverage-track" max="100" value="1.2"/);
 assert(!html.includes('style='),'No CSP-blocked inline style');
 assert.match(vm.runInContext('farmUtilization(0,0)',scope),/Noch zu wenig Messdaten/);
 assert.equal(vm.runInContext('farmMeasured(3600,3600)',scope),100);
 assert.equal(vm.runInContext('farmMeasured(0,3600)',scope),0);
 assert.match(source,/api\('farm-stats\?days='\+requested\)/);
 console.log('Druckfarm-Berechnung und Kartenmarkup: PASS');
}
unit();
if(process.argv.includes('--unit'))process.exit(0);

(async()=>{
 const browser=await chromium.launch({headless:true,...(!fs.existsSync(chromium.executablePath())&&fs.existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:1050}});
  const calls=[];
  await page.route('**/api/farm-stats?*',async route=>{
   const params=new URL(route.request().url()).searchParams;
   const days=Number(params.get('days'));
   calls.push(days);
   assert([1,7,30].includes(days));
   assert(!params.has('period'));
   const now=Math.floor(Date.now()/1000),capacity=days*86400,printing=(days===1?21.6:25.7)*3600,observed=(days===1?24:28.4)*3600;
   const sample={printer:'X2D',source:'ha',observed_seconds:observed,printing_seconds:printing,idle_seconds:observed-printing,coverage_percent:100*observed/capacity,capacity_percent:100*printing/capacity,last_sample_at:now};
   await route.fulfill({json:{days,start:now-capacity,end:now,printer_count:2,printing_seconds:printing,observed_seconds:observed,capacity_seconds:2*capacity,coverage_percent:sample.coverage_percent/2,capacity_percent:sample.capacity_percent/2,printers:[sample,{printer:'H2D',source:'ha',observed_seconds:0,printing_seconds:0,coverage_percent:0,capacity_percent:0}]}});
  });
  await page.goto('http://127.0.0.1:8099');
  await page.locator('[data-workspace="farm"]').click();
  const card=page.locator('.farm-card').first();
  await card.waitFor();
  assert.match(await card.locator('.farm-utilization-head strong').innerText(),/90,5/);
  assert.match(await card.locator('.farm-utilization-key').innerText(),/25,7 h Druckzeit/);
  assert.match(await card.locator('.farm-utilization-key').innerText(),/2,7 h ohne Druck/);
  assert.equal(await card.locator('.farm-utilization-track').evaluate(el=>el.value.toFixed(1)),'90.5');
  assert.equal(await card.locator('.farm-utilization-track').getAttribute('style'),null,'No CSP-blocked style attribute');
  assert.equal(await page.locator('.farm-card').nth(1).locator('.farm-utilization-head strong').innerText(),'–');
  assert.equal(await page.locator('.farm-card').nth(1).locator('progress.farm-utilization-track').count(),0);
  await page.locator('[data-farm-days="1"]').click();
  await page.waitForFunction(()=>document.getElementById('farm-status').textContent.includes('24 Stunden'));
  assert.equal(await card.locator('.farm-utilization-track').evaluate(el=>el.value),90);
  await page.locator('[data-farm-days="30"]').click();
  await page.waitForFunction(()=>document.getElementById('farm-status').textContent.includes('30 Tage'));
  assert.deepEqual(calls,[7,1,30]);
  assert.match(await card.locator('.farm-coverage-caption').innerText(),/720,0 h/);
  await page.locator('[data-farm-days="7"]').click();
  await page.waitForFunction(()=>document.getElementById('farm-status').textContent.includes('7 Tage'));
  await card.screenshot({path:'/tmp/lager-farm-utilization.png'});
  await page.setViewportSize({width:390,height:844});
  await card.screenshot({path:'/tmp/lager-farm-utilization-mobile.png'});
  assert(await card.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on mobile');
  console.log('Druckfarm-Auslastung: PASS');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
