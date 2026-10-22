// Regression: Safari (WebKit) should display profiles and explain HTML/ingress errors,
// never replace a valid snapshot or call a browser SyntaxError a profile-data error.
const {webkit}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await webkit.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 try {
  await page.goto('http://127.0.0.1:8099');
  await page.locator('.product').first().waitFor();
  const saved=await page.request.post('http://127.0.0.1:8099/api/print-profile',{
   data:{listing_id:'101',variant_id:'',printer:'H2D',sources:[]}
  });
  assert.equal(saved.status(),200,'test setup must create a real master profile');
  await page.locator('[data-workspace="catalog"]').click();
  const first=page.locator('[data-catalog-item="101"]');
  await page.waitForFunction(()=>document.querySelector('[data-catalog-item="101"]')?.textContent.includes('1 Druckprofil(e)'));
  assert((await first.textContent()).includes('1 Druckprofil(e)'));
  assert(!((await page.locator('#toast').textContent()).includes('The string did not match')));

  await page.route('**/api/print-tools',async route=>route.fulfill({
   status:502,contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body>Ingress Fehler</body></html>'
  }));
  await page.locator('[data-workspace="production"]').click();
  await page.locator('[data-workspace="catalog"]').click();
  await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('statt JSON eine Webseite'));
  assert((await first.textContent()).includes('1 Druckprofil(e)'),'existing valid snapshot must remain visible');
  assert(!((await page.locator('#toast').textContent()).includes('The string did not match')));

  await page.unroute('**/api/print-tools');
  await page.locator('[data-workspace="production"]').click();
  await Promise.all([
   page.waitForResponse(res=>res.url().includes('/api/print-tools') && res.ok()),
   page.locator('[data-workspace="catalog"]').click()
  ]);
  assert((await first.textContent()).includes('1 Druckprofil(e)'));
  assert.deepEqual(errors,[],'Safari must not report JS errors');
  console.log('SAFARI PASS: real printer profiles, informative HTML proxy errors and recovery without losing saved profile.');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
