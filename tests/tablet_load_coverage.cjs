const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/tablet-monitor.js'),'utf8');
const start=source.indexOf(' const AMP_WARN_A=');
const end=source.indexOf(' function loadBar(d){',start);
assert.ok(start>=0&&end>start);
const nodes=new Map();
const byId=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{},querySelector:()=>({})});return nodes.get(id)};
const ctx=vm.runInNewContext(source.slice(start,end)+';({loadCoverage,status})',{byId});
const devices=[
 {name:'Druckt',entity:'sensor.a',watts:80,amps:.5,amps_source:'shelly'},
 {name:'Aus',entity:'sensor.b',switch_state:'off',watts:0,amps:0,amps_source:'shelly'},
 {name:'H2D',entity:'',watts:null,amps:null}
];
const data={devices,watts:80,amps:.5,level:'normal',faults:[]};
assert.equal(ctx.loadCoverage(data,'amps').complete,true);
assert.equal(ctx.loadCoverage(data,'watts').measured,2);
ctx.status(data);
assert.equal(byId('watt-load-row').dataset.level,'normal');
assert.equal(byId('amps-load-row').dataset.level,'normal');
assert.equal(byId('load-card').dataset.level,'unknown');
assert.match(byId('amp-status-detail').textContent,/Nicht überwacht: H2D/);
devices[1].amps=null;
ctx.status(data);
assert.equal(byId('amps-load-row').dataset.level,'unknown');
assert.equal(byId('watt-load-row').dataset.level,'normal');
assert.match(byId('amp-status-detail').textContent,/Kein Messwert: Aus/);
devices[1].amps=.1;devices[1].amps_source='calculated';
ctx.status(data);
assert.equal(byId('amps-load-row').dataset.level,'unknown');
assert.match(byId('amp-status-detail').textContent,/Nur geschätzt: Aus/);
ctx.status({...data,amps:14.5,level:'warning'});
assert.equal(byId('amps-load-row').dataset.level,'critical');
assert.equal(byId('watt-load-row').dataset.level,'warning');
ctx.status({...data,faults:[{state:'on'}]});
assert.equal(byId('watt-load-row').dataset.level,'critical');
assert.equal(byId('amps-load-row').dataset.level,'critical');
ctx.status({devices:[],watts:null,amps:null});
assert.equal(byId('watt-load-row').dataset.level,'unknown');
assert.equal(byId('amps-load-row').dataset.level,'unknown');
console.log('Tablet load coverage: PASS');
