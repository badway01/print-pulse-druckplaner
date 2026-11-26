const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/tablet-monitor.js'),'utf8');
const start=source.indexOf(' function deviceSortRank(');
const end=source.indexOf(' function renderGroupTotals(',start);
const ctx=vm.runInNewContext(source.slice(start,end)+';({groupDevices,groupTotals})');
const rows=[{name:'Aus',kind:'printer',switch_state:'off',watts:0,amps:0,amps_source:'shelly'},
 {name:'PC',kind:'other',switch_state:'on',watts:40,amps:.3,amps_source:'calculated'},
 {name:'H2D',kind:'printer',printer_state:'printing',watts:100,amps:.5,amps_source:'shelly'},
 {name:'Kühlschrank',kind:'other',watts:null,amps:null}];
const groups=ctx.groupDevices(rows);
assert.equal(Array.from(groups[0].items,x=>x.name).join(','),'H2D,Aus');
assert.equal(Array.from(groups[1].items,x=>x.name).join(','),'PC,Kühlschrank');
const p=ctx.groupTotals(groups[0].items),o=ctx.groupTotals(groups[1].items);
assert.equal(p.watts,100);assert.equal(p.amps,.5);assert.equal(p.ampsCount,2);
assert.equal(o.watts,40);assert.equal(o.amps,.3);assert.equal(o.estimated,1);
assert.equal(o.wattsCount,1);assert.equal(o.count,2);
assert.equal(ctx.groupTotals([]).amps,null);
assert.equal(ctx.groupTotals([{watts:0,amps:0,amps_source:'shelly'}]).watts,0);
console.log('Tablet device groups: PASS');
