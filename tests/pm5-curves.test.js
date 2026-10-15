import test from 'node:test';
import assert from 'node:assert/strict';
import { PM5, uuid } from '../js/pm5.js';
import { frame } from '../js/force-curve.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('completed-stroke fallback reads padded curves, avoids the drive, and cancels on disconnect',async()=>{
  const chars=new Map(),packets=[];let writes=0;
  for(const code of ['31','32','35','21','22']){
    const c=new EventTarget();c.startNotifications=async()=>{};chars.set(uuid(code),c);
  }
  const tx=chars.get(uuid('21')),rx=chars.get(uuid('22'));tx.properties={write:true,writeWithoutResponse:true};
  tx.writeValueWithoutResponse=()=>assert.fail('Use acknowledged writes when available');
  tx.writeValueWithResponse=async()=>{
    writes++;const samples=writes%2?[10,30,50,70,90,100,90,70,50,20]:[];
    const bytes=frame([9,0x1a,0x23,0x6b,0x21,samples.length*2,...samples.flatMap(v=>[v,0]),...Array(32-samples.length*2).fill(0)]);
    for(let i=0;i<bytes.length;i+=20){rx.value=new DataView(bytes.slice(i,i+20).buffer);rx.dispatchEvent(new Event('characteristicvaluechanged'));}
  };
  const device=new EventTarget();device.name='PM5 regression fixture';device.gatt={connected:true,connect:async()=>({getPrimaryService:async()=>({getCharacteristic:async id=>chars.get(id)})}),disconnect(){this.connected=false;}};
  Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});Object.defineProperty(globalThis,'navigator',{value:{bluetooth:{requestDevice:async()=>device}},configurable:true});
  const pm5=new PM5((type,data)=>packets.push([type,data]),()=>{});await pm5.connect();
  const emit=(code,view)=>{const c=chars.get(uuid(code));c.value=view;c.dispatchEvent(new Event('characteristicvaluechanged'));};
  const stroke=n=>{const v=new DataView(new ArrayBuffer(20));v.setUint16(0,n*300,true);v.setUint16(3,n*120,true);v.setUint8(6,120);v.setUint8(7,80);v.setUint16(8,200,true);v.setUint16(12,1000,true);v.setUint16(16,3500,true);v.setUint16(18,n,true);return v;};
  emit('35',stroke(1));await wait(650);assert.equal(packets.filter(([t])=>t==='curve').length,1);assert.equal(writes,2);assert.equal(pm5.curveDiagnostics.lastTrigger,'stroke-data');
  const state=new DataView(new ArrayBuffer(19));state.setUint8(10,2);emit('31',state);emit('35',stroke(2));await wait(1050);assert.equal(writes,2,'No fallback request during the observed drive');
  state.setUint8(10,4);emit('31',state);await wait(30);assert.equal(writes,4);assert.equal(pm5.curveDiagnostics.curves,2);assert.equal(pm5.curveDiagnostics.lastTrigger,'recovery');
  emit('35',stroke(3));pm5.disconnect();await wait(550);assert.equal(writes,4,'Disconnect cancels the delayed fallback');
});
