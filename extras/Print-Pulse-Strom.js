// Print & Pulse Strom — Scriptable, mittleres Widget.
// Beim ersten Start HA-Adresse und Zugangstoken direkt am iPhone eingeben.
const KEY="pp.strom.widget.v1";
const ENTITY="sensor.print_pulse_strom_widget";
const bg=new Color("#17251f"),white=new Color("#f1f7f3"),muted=new Color("#a6bcb0");
const green=new Color("#55db88"),yellow=new Color("#f5ce51"),red=new Color("#ff7777");
const valid=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const fmt=(v,n)=>valid(v)?v.toLocaleString("de-DE",{minimumFractionDigits:n,maximumFractionDigits:n}):"–";
// Widget 1.2: avoid null input values when iOS dismisses the dialog.
async function settings(){
 if(Keychain.contains(KEY))return JSON.parse(Keychain.get(KEY));
 if(config.runsInWidget)throw Error("Einrichtung fehlt – Skript öffnen");
 const a=new Alert();
 a.title="P&P Strom einrichten";
 a.message="Token vorher in HA kopieren. Jetzt in Scriptable bleiben. HA-Adresse über Tailscale oder im Heimnetz eingeben.";
 const urlField=a.addTextField("http://HA-Adresse:8123","");
 urlField.setURLKeyboard();
 const tokenField=a.addSecureTextField("HA-Zugriffstoken hier einfügen","");
 a.addAction("Speichern");a.addCancelAction("Abbrechen");
 const choice=await a.presentAlert();
 if(choice!==0)throw Error("Einrichtung abgebrochen – erneut starten");
 const base=String(a.textFieldValue(0)??urlField.text??"").trim().replace(/\/+$/,"");
 const token=String(a.textFieldValue(1)??tokenField.text??"").trim();
 if(!base||!token)throw Error("Eingaben fehlen – Token vorher kopieren und Skript erneut starten");
 if(!/^https?:\/\/[^\s]+$/i.test(base))throw Error("HA-Adresse mit http:// oder https:// eingeben");
 const req=new Request(base+"/api/");
 req.headers={Authorization:"Bearer "+token,Accept:"application/json"};
 req.timeoutInterval=8;
 await req.loadString();
 if(req.response.statusCode!==200)throw Error("HA-Zugang abgelehnt: HTTP "+req.response.statusCode);
 const s={base,token};Keychain.set(KEY,JSON.stringify(s));return s;
}
function line(stack,value,size,color,bold=false){
 const t=stack.addText(String(value));t.font=bold?Font.boldSystemFont(size):Font.systemFont(size);
 t.textColor=color;t.lineLimit=1;t.minimumScaleFactor=.65;return t;
}
// Widget layout 1.1: independent Watt and Ampere scales.
function bar(value,warn,critical,max,rated=null){
 const ctx=new DrawContext();ctx.size=new Size(600,18);ctx.opaque=false;ctx.respectScreenScale=true;
 const xFor=v=>Math.min(600,Math.max(0,v/max*600));
 const b1=xFor(warn),b2=xFor(critical);
 for(const [x,w,c] of [[0,b1,"#31b95d"],[b1,b2-b1,"#e9c747"],[b2,600-b2,"#d63e4c"]]){
  ctx.setFillColor(new Color(c));ctx.fillRect(new Rect(x,3,w,12));
 }
 if(valid(rated)){ctx.setFillColor(new Color("#17251f"));ctx.fillRect(new Rect(xFor(rated)-1,3,2,12));}
 if(valid(value)){const x=Math.min(596,Math.max(4,xFor(value)));ctx.setFillColor(white);ctx.fillRect(new Rect(x-3,0,6,18));}
 return ctx.getImage();
}
function metricRow(w,label,valueText,value,warn,critical,max,rated,limits){
 const row=w.addStack();row.centerAlignContent();
 line(row,label,11,muted,true);row.addSpacer();line(row,valueText,21,white,true);
 const image=w.addImage(bar(value,warn,critical,max,rated));
 image.imageSize=new Size(285,9);image.resizable=true;
 const ticks=w.addStack();line(ticks,"0",8,muted);ticks.addSpacer();line(ticks,limits,8,muted);
}
async function main(){
 const w=new ListWidget();w.backgroundColor=bg;w.setPadding(12,14,11,14);
 w.refreshAfterDate=new Date(Date.now()+5*60000);
 try{
  const s=await settings();
  w.url=s.base;
  const req=new Request(s.base+"/api/states/"+ENTITY);
  req.headers={Authorization:"Bearer "+s.token,Accept:"application/json"};req.timeoutInterval=8;
  const result=await req.loadJSON();
  if(req.response.statusCode!==200||!result.attributes)throw Error("HA-Sensor nicht erreichbar");
  const d=result.attributes,age=Date.now()/1000-Number(d.sampled_at);
  const fresh=result.state!=="unavailable"&&Number.isFinite(age)&&age>=-30&&age<=120;
  const complete=d.devices>0&&d.watts_measured===d.devices&&d.amps_measured===d.devices;
  const estimated=Array.isArray(d.estimated_amps)&&d.estimated_amps.length>0;
  const critical=d.faults>0||(valid(d.amps)&&d.amps>=14)||(valid(d.watts)&&valid(d.critical_w)&&d.watts>=d.critical_w);
  const warning=(valid(d.amps)&&d.amps>=12)||(valid(d.watts)&&valid(d.warning_w)&&d.watts>=d.warning_w);
  const tone=!fresh?muted:critical?red:warning||!complete?yellow:green;
  const top=w.addStack();top.centerAlignContent();line(top,"⚡ PRINT & PULSE",12,green,true);top.addSpacer();
  line(top,!fresh?"Veraltet":critical?"Hohe Last / Fehler":warning?"Warnung":complete?"Erfasst":"Teilmessung",10,tone,true);
  const warningW=valid(d.warning_w)&&d.warning_w>0?d.warning_w:2500;
  const criticalW=valid(d.critical_w)&&d.critical_w>warningW?d.critical_w:Math.max(3200,warningW+100);
  w.addSpacer(4);
  metricRow(w,"Gesamtleistung",fmt(d.watts,1)+" W",fresh?d.watts:null,
   warningW,criticalW,criticalW*1.18,null,
   fmt(warningW,0)+" W Warnung · "+fmt(criticalW,0)+" W kritisch");
  w.addSpacer(3);
  metricRow(w,"Stromsumme",(estimated?"≈ ":"")+fmt(d.amps,2)+" A",fresh?d.amps:null,
   12,14,18,16,"12 A · 14 A · 16 A Nennstrom");
  w.addSpacer(4);const info=w.addStack();line(info,(!fresh?"Letzter Stand: ":"")+String(d.printing??"–")+" Drucker aktiv",10,tone,true);info.addSpacer();
  line(info,"W "+(d.watts_measured??"–")+"/"+(d.devices??"–")+" · A "+(d.amps_measured??"–")+"/"+(d.devices??"–"),10,muted);
  const missing=[...new Set([...(d.missing_watts||[]),...(d.missing_amps||[])])];
  if(missing.length){w.addSpacer(3);line(w,"Fehlt/geschätzt: "+missing.join(", "),9,yellow);}
  w.addSpacer(3);line(w,"Stand: "+(Number.isFinite(Number(d.sampled_at))&&d.sampled_at?new Date(d.sampled_at*1000).toLocaleString("de-DE",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"–"),9,muted);
 }catch(e){
  line(w,"⚡ PRINT & PULSE",14,green,true);w.addSpacer(8);line(w,"Keine aktuellen Daten",19,white,true);
  w.addSpacer(5);line(w,String(e.message||"HA nicht erreichbar").slice(0,85),11,yellow);
  w.addSpacer();line(w,"HA / VPN / Einrichtung prüfen",10,muted);
 }
 Script.setWidget(w);if(!config.runsInWidget)await w.presentMedium();Script.complete();
}
if(!config.runsInWidget&&Keychain.contains(KEY)){
 const a=new Alert();a.title="P&P Strom";a.addAction("Widget anzeigen");a.addAction("Zugang neu einrichten");a.addCancelAction("Abbrechen");
 const choice=await a.presentAlert();if(choice===1)Keychain.remove(KEY);if(choice!==-1)await main();else Script.complete();
}else await main();
