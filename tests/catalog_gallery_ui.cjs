'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage({
   viewport:{width:1280,height:900},
   userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
  });
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const file={id:'aaaaaaaaaaaaaaaaaaaaaaaa',listing_id:'101',variant_id:'',
    printer:'H2D',filename:'Gemeinsamer_Geist.3mf',
    bytes:1048576,created:Math.floor(Date.now()/1000),
    insights:{total_grams:28,time_seconds:5400,filaments:[
     {filament_id:1,name:'Schwarz',color_hex:'#111111',grams:12,code:'5'},
     {filament_id:2,name:'Gold Silk',color_hex:'#d7ae42',grams:10,code:'27'},
     {filament_id:3,name:'Jade-Weiß',color_hex:'#ffffff',grams:6,code:'1'}
    ]}};
  await page.route('**/api/print-tools*',route=>route.fulfill({
   json:{files:[file],profiles:[{listing_id:'101',variant_id:'',printer:'H2D',sources:[],colors:[
    {id:1,code:'5',color:'Schwarz',hex:'#111111',slot:'Düse links'},
    {id:2,code:'27',color:'Gold Silk',hex:'#d7ae42',slot:'Düse links'},
    {id:3,code:'1',color:'Jade-Weiß',hex:'#ffffff',slot:'Düse rechts'}
   ]}],component_links:[],order_master_defaults:[],filaments_library:[]}
  }));
  await page.route('**/api/master-thumbnail*',route=>route.fulfill({
   status:404,json:{error:'No embedded thumbnail'}
  }));
  await page.route('**/api/master-share-inbox',route=>route.fulfill({
   json:{files:[],folder:'/share/print-pulse/3mf-eingang'}
  }));
  await page.route('**/api/filaments',route=>route.fulfill({json:{filaments:[]}}));
  await page.goto('http://127.0.0.1:8099/');
  await page.locator('[data-workspace="catalog"]').click();
  await page.evaluate(()=>{const p=model.products.find(p=>p.id==='101');p.items.push({...p.items[0],id:'101-color-two',label:'Farbe: Schwarz'});renderCatalog();});
  await page.locator('[data-catalog-item="101"] [data-catalog-expand]').click();
  const card=page.locator('[data-catalog-item="101"]');
  await card.locator('[data-catalog-file="'+file.id+'"]').waitFor();
  assert.equal(await card.locator('[data-catalog-file]').count(),1);
  assert.match(await card.innerText(),/Alle Farbvarianten/);
  assert.match(await card.innerText(),/1 h 30 min/);
  assert.match(await card.innerText(),/28 g/);
  // Always show the exact Etsy color variant text in a select.
  assert.equal(await card.locator('.pp-catalog-detail-right [data-catalog-variant]').count(),1);
  assert.equal(await card.locator('.pp-catalog-detail-left [data-catalog-variant]').count(),0);
  assert.equal(await card.locator('.pp-catalog-color-choice').count(),0);
  await card.locator('[data-catalog-variant]').selectOption({index:1});
  assert.equal(await card.locator('[data-catalog-file]').count(),1,'Shared masters must remain visible for specific colors');
  await card.locator('.pp-catalog-file-extra>[data-catalog-info]').click();
  assert.match(await card.locator('.pp-catalog-file-popover').innerText(),/1[.,]0 MB/);
  const infoText=await card.locator('.pp-catalog-file-popover').innerText();
  for(const piece of ['12 g','10 g','6 g','Schwarz','Gold Silk','Jade-Weiß']){
   assert(infoText.includes(piece),'The info popover must show '+piece+' per plate, not just 28 g total');
  }
  await card.locator('.pp-catalog-file-open>summary').click();
  assert.equal(await card.locator('.pp-catalog-open-links .pp-slicer-action').count(),4);
  assert.match(await card.locator('.pp-slicer-prusa').getAttribute('href'),/^printpulse3mf:\/\/prusa\/aaaaaaaaaaaaaaaaaaaaaaaa/);
  // The dropdown is placed beside the 3MF files, with no inferred colors.
  await page.evaluate(()=>{
   const p=model.products.find(p=>p.id==='101');
   p.items=[
    {id:'white',label:'Kartenfarbe: Weiße Karte'},
    {id:'beige',label:'Kartenfarbe: Beige Karte'},
    {id:'black',label:'Kartenfarbe: Schwarze Karte'},
    {id:'gold',label:'Kartenfarbe: Gold Edition'},
    {id:'red',label:'Kartenfarbe: Rot'},
    {id:'blue',label:'Kartenfarbe: Blau'}
   ];
   renderCatalog();
  });
  const drop=card.locator('.pp-catalog-detail-right [data-catalog-variant]');
  assert.equal(await drop.count(),1);
  assert.equal(await card.locator('.pp-catalog-detail-left [data-catalog-variant]').count(),0);
  assert.equal(await card.locator('.pp-catalog-color-choice').count(),0);
  assert.equal(await drop.locator('option').count(),7);
  assert.equal(await drop.locator('option[value="gold"]').textContent(),'Kartenfarbe: Gold Edition');
  assert.match(await card.locator('.pp-catalog-variantbar').innerText(),/Kartenfarbe/);
  await drop.selectOption('black');
  assert.equal(await drop.inputValue(),'black');
  assert.equal(await card.locator('[data-catalog-file]').count(),1,'Shared masters remain visible across colors');
  await drop.selectOption('blue');
  assert.equal(await drop.inputValue(),'blue');
  await drop.selectOption('');
  assert.equal(await card.locator('[data-catalog-file]').count(),1);
  await page.locator('[data-catalog-view="list"]').click();
  assert.equal(await page.locator('#catalog-rows').evaluate(el=>el.classList.contains('pp-catalog-list')),true);
  assert.equal(await page.locator('[data-catalog-item="101"] [data-catalog-file]').count(),1);
  await card.locator('[data-master-open]').first().click();
  assert.equal(await page.locator('#master-variant').inputValue(),'','The default must be shared across color variants');
  await page.locator('[data-close="master-editor"]').click();
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('MakerWorld-inspired catalog shared-master checks passed.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
