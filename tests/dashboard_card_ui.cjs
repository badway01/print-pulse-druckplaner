'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=__dirname+'/../print_pulse_druckplaner/web/';
const source=fs.readFileSync(root+'order-zoom-ui.js','utf8');
const start=source.indexOf(' orderCard=function(o){');
const end=source.indexOf('\n };',start);
assert(start>=0&&end>start,'dashboard card function exists');
const scope={
 orderCard:null,
 shipInfo:()=>({level:'green'}),
 orderPrintProgress:()=>({complete:false}),
 shortDate:()=> '05.11.26',
 esc:v=>String(v),
 orderPrintMarker:()=> '',
 shippingMarkup:()=> 'Versand bis 11.11.2026',
 tile:line=>'<button class="simple-order-tile" data-line="'+line.id+'"></button>',
 localPdfLink:()=> '',
 zoomIcon:'ZOOM'
};
vm.runInNewContext('const expandedOrders=new Set();\n'+source.slice(start,end+4)+'\nthis.testOrders={orderCard,expandedOrders};',scope);
const {orderCard,expandedOrders}=scope.testOrders;
const order=(n,id='r-1')=>({id,customer:'Testkunde',created:0,source:'etsy',items:Array.from({length:n},(_,i)=>({id:i}))});
const count=html=>(html.match(/class="simple-order-tile"/g)||[]).length;
assert.equal(count(orderCard(order(1))),1);
assert.equal(count(orderCard(order(2))),2);
assert(!orderCard(order(2)).includes('data-order-toggle-items'),'no toggle for two positions');
for(const n of [3,4,7]){
 const html=orderCard(order(n));
 assert.equal(count(html),2,'only first two items visible for '+n);
 assert(html.includes('data-order-toggle-items'),'toggle for '+n+' items');
 assert(html.includes('aria-expanded="false"'));
}
expandedOrders.add('r-1');
let html=orderCard(order(4));
assert.equal(count(html),4);
assert(html.includes('aria-expanded="true"'));
assert(html.includes('Weniger anzeigen'));
assert.equal(count(orderCard(order(1,'another'))),1,'expanding one card does not affect others');
expandedOrders.delete('r-1');
assert.equal(count(orderCard(order(4))),2);
const css=fs.readFileSync(root+'dashboard-order-cards.css','utf8');
assert(css.includes('height:440px')&&css.includes('.order-card.is-expanded'));
const index=fs.readFileSync(root+'index.html','utf8');
assert(index.includes('dashboard-order-cards.css?v=0.13.46'));

assert(/order-zoom-ui\.js\?v=0\.13\.\d+/.test(index),'The current versioned order-detail script must be loaded');
console.log('Dashboard order cards PASS: equal height styles and 1/2/3/4+ item expansion.');
