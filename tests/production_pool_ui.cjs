'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/production-pool-ui.js'),'utf8');
const ctx={
 $:()=>({addEventListener(){}}),renderPriorityUI:()=>{},
 componentLegacyJob:()=>false,
 orderComponentOutstanding:(line,part)=>Math.max(0,part.required-(part.booked||0)-(part.finished||0)-(part.printing||0)),
 shortDate:()=>'',esc:s=>String(s),model:null
};
vm.createContext(ctx);
vm.runInContext(source+'\nthis.build=ppPoolBuild;',ctx);
const build=ctx.build;
function item(id,label,stock=0){return {id,label,allocatable:stock,on_hand:stock};}
function row(id,itemId,color,pending,printing=0,quantity=pending+printing,personalization=''){
 return {transaction_id:id,listing_id:'cat',item_id:itemId,color,variant:'Farbe: '+color,quantity,remaining:pending,printing,personalization};
}
const cat={id:'cat',title:'Katze',image:'',items:[item('white','Weiß'),item('black','Schwarz')]};
const orderA={id:'a',ship_by:100,items:[row('a1','white','Weiß',1),row('a2','black','Schwarz',2)]};
const orderB={id:'b',ship_by:200,items:[row('b1','white','Weiß',3),row('b2','black','Schwarz',3)]};
let result=build({products:[cat],orders:[orderA,orderB]});
assert.equal(result.orders,2);
assert.equal(result.totalOrdered,9);
assert.equal(result.toPrint,9);
assert.equal(result.groups[0].rows.find(r=>r.label.includes('Weiß')).toPrint,4);
assert.equal(result.groups[0].rows.find(r=>r.label.includes('Schwarz')).toPrint,5);
assert.equal(result.groups[0].rows.find(r=>r.label.includes('Weiß')).orders.size,2);
// On-hand stock is reserved no more than once even if same Etsy item ID
// carries different order colours.
cat.items[0].allocatable=2;
result=build({products:[cat],orders:[orderA,orderB]});
assert.equal(result.toPrint,7);
const weird={id:'special',ship_by:100,items:[
 row('c1','white','Weiß',2),row('c2','white','Naturweiß',2)
]};
result=build({products:[cat],orders:[weird]});
assert.equal(result.groups[0].rows.length,2);
assert.equal(result.toPrint,2);
result=build({products:[cat],orders:[{id:'printing',ship_by:100,
 items:[row('p1','white','Weiß',1,2,3)]}]});
assert.equal(result.toPrint,0);
assert.equal(result.inPrint,2);
// Personalized goods are not subtracted from generic shelf inventory.
result=build({products:[cat],orders:[{id:'person',ship_by:100,
 items:[row('personal','white','Weiß',1,0,1,'Anna')]}]});
assert.equal(result.toPrint,1);
// Component stock is shared across multiple order dates.
const component={id:'base',name:'Sockel',kind:'stock',stock:2,printing_stock:1};
const compProduct={id:'cat',title:'Katze',image:'',components_enabled:true,items:[item('white','Weiß')],components:[component]};
const makePart=(id,due,need)=>({id,ship_by:due,items:[{
 transaction_id:id+'line',listing_id:'cat',item_id:'white',quantity:need,
 remaining:need,components_enabled:true,components:[{id:'base',name:'Sockel',
 kind:'stock',required:need,booked:0,printing:0,finished:0}]
}]});
result=build({products:[compProduct],orders:[
 makePart('p1',100,2),makePart('p2',200,3)
]});
assert.equal(result.toPrint,2);
assert.equal(result.groups[0].rows[0].orders.size,2);
console.log('Production pool tests passed');
