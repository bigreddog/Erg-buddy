// Run against a local server and Chromium started with --remote-debugging-port=9222.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const baseURL=process.env.TEST_BASE_URL || 'http://127.0.0.1:8080';
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
const ws = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
let seq=0; const pending=new Map(), errors=[];
ws.addEventListener('message',e=>{const data=JSON.parse(e.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p.reject(new Error(JSON.stringify(data.error))):p.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text+' '+(data.params.exceptionDetails.exception?.description||''));});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const value=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
try {
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  const navigation=await call('Page.navigate',{url:baseURL});assert.equal(navigation.errorText,undefined);await sleep(900);
  await evaluate('localStorage.clear()');await call('Page.reload');await sleep(700);
  assert.equal(await evaluate('document.title'),'Erg Buddy · Find your rhythm');
  assert.equal(await evaluate('document.getElementById("rower-error").hidden'),true);
  assert.ok(await evaluate('document.getElementById("rower-canvas").width > 0'));
  const selected=()=>evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').id`);
  assert.equal(await value('cycle-label'),'Pause · 5s');
  await sleep(5100);assert.equal(await selected(),'tab-coach');
  await click('screen-cycle');assert.equal(await value('cycle-label'),'Play · 5s');
  await sleep(5100);assert.equal(await selected(),'tab-coach');
  await click('tab-workout');await click('screen-cycle');
  await sleep(3000);await click('tab-rower');await sleep(2200);assert.equal(await selected(),'tab-rower');
  await sleep(3000);assert.equal(await selected(),'tab-coach');
  await click('tools');await sleep(5100);assert.equal(await selected(),'tab-coach');
  await click('close-tools');await click('screen-cycle');assert.equal(await value('cycle-label'),'Play · 5s');
  await click('tab-rower');
  await click('tools');assert.equal(await evaluate('document.getElementById("settings-dialog").open'),true);
  await click('demo');assert.equal(await evaluate('document.getElementById("settings-dialog").open'),false);
  assert.equal(await value('connection'),'DEMO DATA');
  await sleep(100);assert.equal(await value('animation-phase'),'Drive');
  await evaluate('window.originalSetTimeout=window.setTimeout;window.setTimeout=(fn,delay,...args)=>originalSetTimeout(fn,delay>1000&&delay<4000?25:delay,...args)');
  await sleep(3200);assert.notEqual(await value('score'),'—');assert.equal(await value('curve-source'),'SIMULATED');assert.ok((await evaluate('document.getElementById("force-line").getAttribute("d")')).length>20);
  assert.notEqual(await value('hr-average'),'—');
  await click('record');await sleep(450);const count=Number(await value('strokes'));assert.ok(count>=8);
  await click('record');await sleep(120);assert.equal(Number(await value('strokes')),count);assert.equal(await value('recording-badge'),'Paused');
  await click('record');await sleep(120);assert.ok(Number(await value('strokes'))>count);
  await click('end');const sessions=await evaluate('JSON.parse(localStorage.getItem("erg-buddy-sessions"))');assert.equal(sessions.length,1);assert.equal(sessions[0].source,'demo');assert.ok(sessions[0].forceCurves.length>0);
  await evaluate('window.downloads=[];URL.createObjectURL=blob=>{downloads.push(blob);return "blob:verification"};HTMLAnchorElement.prototype.click=function(){}');
  await click('export');const exported=await evaluate('downloads[0].text().then(JSON.parse)');assert.equal(exported.source,'demo');assert.equal(exported.strokes.length,sessions[0].strokes.length);
  await evaluate('document.querySelector(".saved-session button:last-child").click()');assert.ok((await evaluate('downloads[1].text()')).startsWith('# Erg Buddy demo session'));
  await mkdir('verification-results',{recursive:true});
  const shot=async name=>{await evaluate('document.getElementById("notice").hidden=true');const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(`verification-results/${name}.png`,Buffer.from(r.data,'base64'));};
  for(const [width,height] of [[640,320],[667,375],[740,360],[844,390],[915,412],[932,430]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
    for(const tab of ['rower','coach','workout']) {
      await click(`tab-${tab}`);await sleep(90);
      const layout=await evaluate(`(()=>{const s=document.querySelector('.screen:not([hidden])');return {page:document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight,screen:s.scrollHeight<=s.clientHeight+1 && s.scrollWidth<=s.clientWidth+1,overflow:[...s.querySelectorAll('article')].map(a=>[a.className,a.scrollHeight,a.clientHeight]).filter(a=>a[1]>a[2]+1)}})()`);
      assert.equal(await evaluate(`(()=>{const r=document.getElementById('screen-cycle').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()`),true);
      assert.equal(layout.page,true,`${width}x${height} ${tab} page overflow`);assert.equal(layout.screen,true,`${width}x${height} ${tab} screen overflow`);assert.deepEqual(layout.overflow,[],`${width}x${height} ${tab} content clipping`);
      if(tab==='coach') {
        await evaluate(`(async()=>{const {analyse}=await import('./js/coach.js');const base=Array.from({length:12},(_,i)=>({drive:1,recovery:2,driveLength:1.3,work:450}));window.coachCases=[analyse(base),analyse(base.map(s=>({...s,recovery:1}))),analyse(base.map((s,i)=>({...s,work:i%2?300:600}))),analyse(base.map((s,i)=>({...s,driveLength:i%2?1:1.5}))),analyse(base,{targetRate:28}),analyse(base,{targetRatio:1})];})()`);
        const cueSizes=await evaluate(`coachCases.map(a=>{document.getElementById('cue-title').textContent=a.title;document.getElementById('cue').textContent=a.cue;const c=document.querySelector('.coaching-card');return {title:a.title,height:c.scrollHeight,available:c.clientHeight};})`);
        assert.deepEqual(cueSizes.filter(c=>c.height>c.available+1),[],`${width}x${height} coaching cue clipping`);
        assert.ok(await evaluate('parseFloat(getComputedStyle(document.getElementById("cue")).fontSize)>=13'));
      }
      if(width===844||width===640)await shot(`${width}-${tab}`);
    }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await click('tab-rower');
  const swipe=async(from,to)=>{await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from,y:180}]});for(let i=1;i<=5;i++){await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from+(to-from)*i/5,y:180}]});await sleep(20);}await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await swipe(650,200);assert.equal(await evaluate('document.getElementById("tab-coach").getAttribute("aria-selected")'),'true');
  await swipe(650,200);assert.equal(await evaluate('document.getElementById("tab-workout").getAttribute("aria-selected")'),'true');
  await swipe(200,650);assert.equal(await evaluate('document.getElementById("tab-coach").getAttribute("aria-selected")'),'true');
  await evaluate('document.getElementById("tab-coach").focus()');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight'});assert.equal(await evaluate('document.activeElement.id'),'tab-workout');
  await click('demo');assert.equal(await value('connection'),'OFFLINE');
  await evaluate(`(async()=>{window.mockChars={};window.curveChunks=[[10,80,160,240,320,400,360,300,220,120],[80,50,20,5,0]];window.csafe=await import('./js/force-curve.js');window.mockDevice=new EventTarget();mockDevice.name='PM5 Test';mockDevice.gatt={connected:true,connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async id=>{const c=new EventTarget(),code=id.slice(6,8);c.startNotifications=async()=>{};c.properties={write:true,writeWithoutResponse:true};c.writeValueWithoutResponse=async()=>{throw new Error('Expected acknowledged GATT write')};c.writeValueWithResponse=async data=>{window.lastRequest=[...data];if(window.failCurveOnce){window.failCurveOnce=false;throw new Error('Transient GATT error')};const samples=curveChunks.shift()||[];const payload=[0x09,0x1a,0x23,0x6b,0x21,samples.length*2,...samples.flatMap(v=>[v&255,v>>8]),...Array(32-samples.length*2).fill(0)];const bytes=csafe.frame(payload);const rx=mockChars['22'];for(let i=0;i<bytes.length;i+=12){rx.value=new DataView(bytes.slice(i,i+12).buffer);rx.dispatchEvent(new Event('characteristicvaluechanged'));}};mockChars[code]=c;return c;}})}),disconnect(){this.connected=false;mockDevice.dispatchEvent(new Event('gattserverdisconnected'));}};Object.defineProperty(navigator,'bluetooth',{configurable:true,value:{requestDevice:async()=>mockDevice}});window.failCurveOnce=true;window.emit=(type,buffer)=>{const c=mockChars[type];c.value=new DataView(buffer);c.dispatchEvent(new Event('characteristicvaluechanged'));};})()`);
  await click('connect');await sleep(100);assert.equal(await value('connection'),'PM5 CONNECTED');await click('record');
  await evaluate(`for(let n=1;n<=10;n++){let v=new DataView(new ArrayBuffer(16));v.setUint8(5,20);v.setUint8(6,255);v.setUint16(7,12000,true);emit('32',v.buffer);v=new DataView(new ArrayBuffer(20));v.setUint16(0,n*300,true);v.setUint16(3,n*120,true);v.setUint8(6,130);v.setUint8(7,100);v.setUint16(8,200,true);v.setUint16(10,1200,true);v.setUint16(16,4500,true);v.setUint16(18,n,true);emit('35',v.buffer);}let general=new DataView(new ArrayBuffer(19));general.setUint16(0,3000,true);general.setUint16(3,1200,true);general.setUint8(10,4);emit('31',general.buffer);general.setUint8(10,2);emit('31',general.buffer);window.general=general;`);
  await click('tab-rower');await sleep(100);assert.equal(await value('animation-phase'),'Drive');
  await evaluate(`window.realNow=Date.now;Date.now=()=>realNow()+2100;general.setUint8(10,4);emit('31',general.buffer)`);await sleep(120);assert.equal(await value('animation-phase'),'Recovery');
  assert.equal(await value('strokes'),'10');assert.equal(await value('hr'),'—');assert.equal(await value('score'),'100');assert.equal(await value('curve-source'),'PM5 FORCE');assert.match(await value('curve-status'),/15 measured/);
  assert.equal(await value('monitor-time'),'00:30');assert.equal(await value('monitor-distance'),'120');
  await evaluate('mockDevice.gatt.disconnect()');assert.equal(await value('connection'),'OFFLINE');
  const live=await evaluate('JSON.parse(localStorage.getItem("erg-buddy-sessions"))[0]');assert.equal(live.source,'PM5');assert.equal(live.strokes.length,10);assert.equal(live.forceCurves[0].samples.length,15);assert.equal(live.forceCurveDiagnostics.failures,1);assert.equal(live.forceCurveDiagnostics.writeMode,'with-response');assert.equal(live.forceCurveDiagnostics.curves,1);await evaluate('Date.now=realNow');
  await call('Page.reload');await sleep(500);assert.equal(await evaluate('document.querySelectorAll(".saved-session").length'),2);
  assert.deepEqual(errors,[]);console.log('Browser checks passed: default five-second cycling, pause/play, manual countdown reset, settings suspension, six landscape sizes, no page scrolling or card clipping on all three screens, WebGL rower, native touch swipes and keyboard tabs, demo/live phase animation, measured padded/fragmented CSAFE curve and recovery from transient GATT failure, exported diagnostics, HR, recording/export and saved sessions.');
} finally { ws.close(); }
