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
// The primary board shares the detail view's variant parser, including local customer notes.
const helper=source.slice(source.indexOf(' function orderCustomerOptions(line)'),source.indexOf(' // The order board uses'));
const board=fs.readFileSync(root+'stock-orders-ui.js','utf8');
const boardCard=board.slice(board.indexOf(' function orderCardFull(order)'),board.indexOf(' function renderFullOrders()'));
const boardScope={window:{},esc:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),
 count:v=>Number(v)||0,shipInfo:()=>({date:'23.11.2026'}),status:()=>['Offen','pending'],
 orderPrintProgress:()=>({total:1,finished:0}),picture:()=>'<img>',orderShortProductTitle:v=>v,orderBulkButton:()=>'<button>Bestellung fertig</button>'};
vm.runInNewContext(helper+'\nwindow.orderCustomerOptionsMarkup=orderCustomerOptionsMarkup;\n'+boardCard,boardScope);
const rendered=boardScope.orderCardFull({id:'test',customer:'Test',items:[{transaction_id:'a',title:'Lesender Engel',quantity:1,variant:'Buchfarbe: 10. Eisblau-Pastell · Setgröße: 2er-Set',color:'Eisblau',personalization:'<Gruß>'}]});
assert(rendered.includes('<small>Buchfarbe</small><strong>10. Eisblau-Pastell</strong>'));
assert(rendered.includes('<small>Setgröße</small><strong>2er-Set</strong>'));
assert(rendered.includes('<small>Personalisierung</small><strong>&lt;Gruß&gt;</strong>'));
assert(rendered.includes('Bestellung fertig'));
const boardCss=fs.readFileSync(root+'style.css','utf8');
assert(boardCss.includes('.board-order-grid.as-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'));
assert(boardCss.includes('.board-order .pp-order-option>strong{font-size:18px;'));
console.log('Dashboard order cards PASS: equal height styles and 1/2/3/4+ item expansion.');
