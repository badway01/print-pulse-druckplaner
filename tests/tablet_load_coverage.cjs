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
const ctx=vm.runInNewContext(source.slice(start,end)+';({loadCoverage,status,groupCardLevel,observedLevel})',{byId});
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
assert.equal(byId('load-card').dataset.level,'normal');
assert.equal(byId('kpi-watts').dataset.cardLevel,'normal');
assert.match(byId('kpi-watts-status').textContent,/Normalbereich/);
assert.equal(byId('kpi-peak').dataset.cardLevel,'unknown');
assert.match(byId('amp-status-detail').textContent,/Nicht überwacht: H2D/);
devices[1].amps=null;
ctx.status(data);
assert.equal(byId('amps-load-row').dataset.level,'normal');
assert.equal(byId('watt-load-row').dataset.level,'normal');
assert.match(byId('amp-status-detail').textContent,/Kein Messwert: Aus/);
devices[1].amps=.1;devices[1].amps_source='calculated';
ctx.status(data);
assert.equal(byId('amps-load-row').dataset.level,'normal');
assert.match(byId('amp-status-detail').textContent,/Nur geschätzt: Aus/);
ctx.status({...data,amps:14.5,level:'warning'});
assert.equal(byId('amps-load-row').dataset.level,'critical');
assert.equal(byId('watt-load-row').dataset.level,'warning');
assert.equal(byId('kpi-watts').dataset.cardLevel,'warning');
assert.equal(byId('kpi-amps').dataset.cardLevel,'critical');
ctx.status({...data,total_amps_peak:{amps:14.1}});
assert.equal(byId('kpi-peak').dataset.cardLevel,'critical');
assert.match(byId('kpi-peak-status').textContent,/Historischer/);
const group={count:2,wattsCount:2,ampsCount:2,estimated:0,watts:100,amps:.5};
const limits={warning_w:2500,critical_w:3200};
assert.equal(ctx.groupCardLevel(group,limits),'normal');
assert.equal(ctx.groupCardLevel({...group,ampsCount:1},limits),'normal');
assert.equal(ctx.groupCardLevel({...group,ampsCount:1,amps:14},limits),'critical');
ctx.status({...data,faults:[{state:'on'}]});
assert.equal(byId('watt-load-row').dataset.level,'critical');
assert.equal(byId('amps-load-row').dataset.level,'critical');
ctx.status({devices:[],watts:null,amps:null});
assert.equal(byId('watt-load-row').dataset.level,'unknown');
assert.equal(byId('amps-load-row').dataset.level,'unknown');
ctx.status({devices:[{name:'Nur Ersatz',entity:'sensor.c',watts:100,amps:.4,amps_source:'calculated'}],watts:100,amps:.4,level:'normal'});
assert.equal(byId('amps-load-row').dataset.level,'unknown');
assert.equal(byId('watt-load-row').dataset.level,'normal');
console.log('Tablet load coverage: PASS');

// Keep the main monitor hierarchy stable and keep reset/export IDs unique.
const html=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/tablet-monitor.html'),'utf8');
const order=['id="kpi-watts"','id="kpi-amps"','id="kpi-group-printer"','id="kpi-group-other"','id="load-card"','id="kpi-peak"','id="reset-amps-peaks"','class="panel devices-panel"','class="panel faults-panel"','class="panel chart-panel"','id="kpi-more"','id="peak-reset-log"','id="history-export-link"'];
for(let i=0;i<order.length;i++){assert.ok(html.includes(order[i]),order[i]);if(i)assert.ok(html.indexOf(order[i])>html.indexOf(order[i-1]),order[i]);}
for(const id of ['total-amps-peak','reset-amps-peaks','peak-reset-feedback','history-export-link'])assert.equal(html.split('id="'+id+'"').length,2);
