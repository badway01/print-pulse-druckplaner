'use strict';
/* Backdrop, Escape and unsaved-edit protection on desktop and touch-sized UI. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('#settings-open').click();
  const settings=page.locator('#settings');
  assert.equal(await settings.isVisible(),true);
  // Clicking INSIDE dialog content does not close it.
  await page.locator('#days').click();
  assert.equal(await settings.isVisible(),true);
  // A backdrop click does close an unchanged settings dialog.
  await page.mouse.click(8,8);
  await settings.waitFor({state:'hidden'});

  // Escape closes an unchanged dialog; it is no longer browser-only behavior.
  await page.locator('#settings-open').click();
  await page.keyboard.press('Escape');
  await settings.waitFor({state:'hidden'});

  // An unsaved local order is protected on backdrop, X and Escape.
  await page.locator('#local-order-new').click();
  const local=page.locator('#local-order-dialog');
  await page.locator('#local-customer').fill('Nur ein Testentwurf');
  let confirmation=0;
  page.once('dialog',async d=>{confirmation++;assert.equal(d.type(),'confirm');await d.dismiss();});
  await page.mouse.click(8,8);
  assert.equal(confirmation,1,'Backdrop should request confirmation for edits');
  assert.equal(await local.isVisible(),true,'Dismissed confirmation retains the draft');
  assert.equal(await page.locator('#local-customer').inputValue(),'Nur ein Testentwurf');

  page.once('dialog',async d=>{confirmation++;await d.dismiss();});
  await page.keyboard.press('Escape');
  assert.equal(await local.isVisible(),true,'Escape must not discard edits without approval');

  page.once('dialog',async d=>{confirmation++;await d.accept();});
  await page.locator('#local-order-dialog [data-close="local-order-dialog"]').click();
  await local.waitFor({state:'hidden'});
  assert.equal(confirmation,3,'Close X also honors the edit guard');

  // A clean local order closes immediately on backdrop.
  await page.locator('#local-order-new').click();
  await page.mouse.click(8,8);
  await local.waitFor({state:'hidden'});

  // The same backdrop behavior works at compact tablet viewport.
  await page.setViewportSize({width:720,height:900});
  await page.locator('#settings-open').click();
  await page.mouse.click(4,4);
  await settings.waitFor({state:'hidden'});
  assert.deepEqual(errors,[],'No browser errors');
  console.log('DIALOG UI PASS: backdrop, inside, Escape, X, unsaved edits, tablet');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
