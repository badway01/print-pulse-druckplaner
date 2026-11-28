const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/tablet-monitor.js'),'utf8');
const start=source.indexOf(' function deviceSortRank(');
const end=source.indexOf(' function renderDevices(',start);
assert.ok(start>=0&&end>start);
const sort=vm.runInNewContext(source.slice(start,end)+';sortedDevices');
const devices=[
 {name:'H2D',printer_state:'offline',entity:''},
 {name:'P1S Old',printer_state:'printing',entity:'sensor.old',watts:58},
 {name:'P1S New',printer_state:'offline',entity:'sensor.new',watts:0},
 {name:'U1',printer_state:'offline',entity:'sensor.u1',watts:0},
 {name:'X2D',printer_state:'printing',entity:'sensor.x2d',watts:171},
 {name:'A1',printer_state:'printing',switch_state:'off',entity:'sensor.a1',watts:17},
 {name:'H2D No2',printer_state:'printing',entity:'sensor.no2',watts:87},
 {name:'Bereit',printer_state:'idle',entity:'sensor.ready',watts:8},
 {name:'Störung',printer_state:'error',switch_state:'on',entity:'sensor.error',watts:5}
];
assert.equal(Array.from(sort(devices),x=>x.name).join('|'),'P1S Old|X2D|H2D No2|Bereit|A1|H2D|P1S New|U1|Störung');
const before=sort(devices).map(x=>x.name).join('|');
devices[1].printer_state='preparing';
devices[4].printer_state='idle';
devices[7].printer_state='printing';
assert.equal(sort(devices).map(x=>x.name).join('|'),before);
assert.equal(devices[0].name,'H2D');
assert.equal(sort([]).length,0);
console.log('Tablet device sort: PASS');

const phaseStart=source.indexOf(' function displayPhase('),phaseEnd=source.indexOf(' function renderPeakHistory(',phaseStart);
const phase=vm.runInNewContext(source.slice(phaseStart,phaseEnd)+';displayPhase');
assert.equal(phase({maintenance:true,printer_state:'offline',entity:''}).label,'Wartung');
assert.equal(phase({maintenance:true,switch_state:'off'}).label,'Wartung');
assert.equal(phase({maintenance:true,printer_state:'error'}).label,'Störung');
