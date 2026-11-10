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
   json:{files:[file],profiles:[{listing_id:'101',variant_id:'',printer:'H2D',sources:[
     {type:'ams_ht',side:'left',label:'AMS HT 1',slots:[1]},
     {type:'ams',side:'right',label:'AMS 1',slots:[2,3,null,null]}
    ],colors:[
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
  // A polished custom dropdown uses original Etsy names, not inferred HEX.
  assert.equal(await card.locator('.pp-catalog-detail-right .pp-catalog-variant-menu').count(),1);
  assert.equal(await card.locator('.pp-catalog-detail-left .pp-catalog-variant-menu').count(),0);
  assert.equal(await card.locator('.pp-catalog-color-choice').count(),0);
  await card.locator('.pp-catalog-variant-menu>summary').click();
  await card.locator('[data-catalog-variant-choice]').nth(1).click();
  assert.equal(await card.locator('[data-catalog-file]').count(),1,'Shared masters must remain visible for specific colors');
  await card.locator('.pp-catalog-file-extra>[data-catalog-info]').click();
  assert.match(await card.locator('.pp-catalog-file-popover').innerText(),/1[.,]0 MB/);
  assert.equal(await card.locator('[data-catalog-info] svg').count(),1);
  const loading=await card.locator('.pp-catalog-loading-plan').innerText();
  for(const value of ['Düse links','Düse rechts','AMS HT 1','Slot 1','Slot 2','Schwarz','Gold Silk']){
   assert(loading.includes(value),'The saved H2D physical loading plan must show '+value);
  }
  const infoText=await card.locator('.pp-catalog-file-popover').innerText();
  for(const piece of ['12 g','10 g','6 g','Schwarz','Gold Silk','Jade-Weiß']){
   assert(infoText.includes(piece),'The info popover must show '+piece+' per plate, not just 28 g total');
  }
  await card.locator('.pp-catalog-file-open>summary').click();
  assert.equal(await card.locator('.pp-catalog-open-links .pp-slicer-action').count(),4);
  assert.match(await card.locator('.pp-slicer-prusa').getAttribute('href'),/^printpulse3mf:\/\/prusa\/aaaaaaaaaaaaaaaaaaaaaaaa/);
  // Six different Etsy variants stay correctly named in a single elegant menu.
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
  const picker=card.locator('.pp-catalog-variant-menu');
  assert.equal(await picker.count(),1);
  assert.equal(await card.locator('.pp-catalog-detail-left .pp-catalog-variant-menu').count(),0);
  assert.equal(await card.locator('.pp-catalog-color-choice').count(),0);
  assert.equal(await picker.locator('summary').innerText(),'Alle Druckdateien');
  await picker.locator('summary').click();
  assert.equal(await picker.locator('[data-catalog-variant-choice]').count(),7);
  assert.equal(await picker.locator('[data-variant-id="gold"]').innerText(),'Kartenfarbe: Gold Edition');
  assert.equal(await picker.locator('[data-variant-id="black"]').innerText(),'Kartenfarbe: Schwarze Karte');
  await picker.locator('[data-variant-id="black"]').click();
  assert.equal(await picker.locator('summary').innerText(),'Kartenfarbe: Schwarze Karte');
  assert.equal(await card.locator('[data-catalog-file]').count(),1,'Shared 3MF stays visible across colors');
  await picker.locator('summary').click();
  assert.equal(await picker.locator('[data-variant-id="black"]').getAttribute('aria-pressed'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await picker.getAttribute('open'),null,'Escape closes the menu');
  await picker.locator('summary').click();
  await picker.locator('[data-variant-id="blue"]').click();
  assert.equal(await picker.locator('summary').innerText(),'Kartenfarbe: Blau');
  await picker.locator('summary').click();
  await page.locator('.pp-catalog-detail-left h3').click();
  assert.equal(await picker.getAttribute('open'),null,'Outside click closes the menu');
  await picker.locator('summary').click();
  await picker.locator('[data-variant-id=""]').click();
  assert.equal(await picker.locator('summary').innerText(),'Alle Druckdateien');
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
