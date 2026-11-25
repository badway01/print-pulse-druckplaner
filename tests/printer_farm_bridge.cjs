const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../print_pulse_druckplaner/web/printer-farm-frame.js'),'utf8');
const config={type:'custom:print-pulse-farm',printers:[{id:'test',name:'Testdrucker'}]};
const calls=[],messages=[],events=[],timers=[];
let mounted;
class FakeEvent{constructor(type,options){this.type=type;this.detail=options.detail;}}
const HA={
 hass:{states:{'sensor.test':{}},panels:{'dashboard-example':{title:'Druckerfarm',component_name:'lovelace'}},callWS:async request=>{calls.push(request);return {views:[{cards:[config]}]};}},
 ownerDocument:{defaultView:{CustomEvent:FakeEvent}},dispatchEvent:event=>events.push(event)
};
const haWindow={document:{querySelector:()=>HA}};haWindow.parent=haWindow;
const parent={parent:haWindow,document:{querySelector:()=>null,documentElement:{dataset:{theme:'dark'}}},postMessage:(message,origin)=>messages.push({message,origin})};
const mount={append:card=>{mounted=card;},getBoundingClientRect:()=>({height:456})};
const cardEvents={};
const card={setConfig(value){this.config=value;},addEventListener(name,callback){cardEvents[name]=callback;}};
const button={disabled:true,textContent:'',addEventListener(){}};
const reading={textContent:''};
const bar={setAttribute(){},querySelector:selector=>selector==='#a1-shelly-toggle'?button:reading};
const document={getElementById:()=>mount,documentElement:{dataset:{}},
 createElement:tag=>tag==='section'?bar:card};
const registry=new Map();
const context=vm.createContext({
 window:{parent,addEventListener(){}},document,location:{origin:'https://example.invalid'},
 customElements:{get:name=>registry.get(name),define:(name,value)=>registry.set(name,value)},HTMLElement:class{},
 ResizeObserver:class{observe(){} disconnect(){}},setInterval:callback=>{timers.push(callback);return 1;},clearInterval(){},setTimeout
});
// Evaluate the production bridge without its automatic startup; inject
// a fake installed module and HA frontend to avoid external side effects.
vm.runInContext(source.replace('startFarm().catch(()=>report(\'unavailable\'));',''),context);
(async()=>{
 assert.equal(vm.runInContext('findHA()',context),HA);
 assert.equal(vm.runInContext('findFarmCard({views:[{cards:[{type:"custom:print-pulse-farm",demo:true}]}]})',context),null);
 assert.equal(vm.runInContext('findFarmCard([{type:"custom:print-pulse-farm"},{type:"custom:print-pulse-farm"}])',context),null);
 await assert.rejects(vm.runInContext('farmConfig({panels:{}})',context));
 context.load=async url=>{assert.equal(url,'/local/print-pulse-farm/print-pulse-farm.js?v=0.2.2');registry.set('print-pulse-farm',card);};
 await vm.runInContext('startFarm(load)',context);
 assert.equal(calls[0].type,'lovelace/config');
 assert.equal(calls[0].url_path,'dashboard-example');
 assert.equal(mounted,card);
 assert.deepEqual(JSON.parse(JSON.stringify(card.config)),config);
 assert.equal(button.disabled,true);
 assert.equal(card.hass,HA.hass);
 assert.equal(document.documentElement.dataset.theme,'dark');
 assert.equal(messages[0].message.status,'ready');
 assert.equal(messages[0].message.height,456);
 assert.equal(messages[0].origin,'https://example.invalid');
 const newHass={...HA.hass,states:{'sensor.test':{state:'on'}}};
 HA.hass=newHass;timers[0]();
 assert.equal(card.hass,newHass);
 cardEvents['hass-more-info']({detail:{entityId:'sensor.test'}});
 cardEvents['hass-more-info']({detail:{entityId:'sensor.unknown'}});
 assert.equal(events.length,1);
 assert.equal(events[0].type,'hass-more-info');
 assert.equal(events[0].detail.entityId,'sensor.test');
 HA.hass={...newHass,connected:false};timers[0]();
 assert.equal(messages.at(-1).message.status,'unavailable');
 console.log('Druckerfarm bridge: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
