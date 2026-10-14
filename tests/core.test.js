import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePacket, PM5, uuid } from '../js/pm5.js';
import { analyse } from '../js/coach.js';
import { Recording, csv } from '../js/session.js';
const stroke = (count=1, extra={}) => ({ elapsed:count*3,distance:count*12,count,drive:1,recovery:2,driveLength:1.3,strokeDistance:12,work:450,...extra });
const put24 = (v,i,n) => { v.setUint8(i,n&255);v.setUint8(i+1,(n>>8)&255);v.setUint8(i+2,(n>>16)&255); };
test('decodes PM5 status and stroke units, including uint24 and little endian',()=>{
  const v=new DataView(new ArrayBuffer(20));put24(v,0,12345);put24(v,3,54321);v.setUint8(6,132);v.setUint8(7,85);v.setUint16(8,187,true);v.setUint16(10,1234,true);v.setUint16(12,1015,true);v.setUint16(14,635,true);v.setUint16(16,4567,true);v.setUint16(18,513,true);
  const s=parsePacket('35',v);
  assert.deepEqual(s,{elapsed:123.45,distance:5432.1,driveLength:1.32,drive:.85,recovery:1.87,strokeDistance:12.34,peakForceLbs:101.5,averageForceLbs:63.5,work:456.7,count:513});
  const status=new DataView(new ArrayBuffer(19));put24(status,0,12345);put24(status,3,54321);status.setUint8(18,120);
  assert.equal(parsePacket('31',status).drag,120);assert.equal(parsePacket('31',status).distance,5432.1);
});
test('unknown HR is absent and Concept2 split yields calculated power',()=>{
  const v=new DataView(new ArrayBuffer(16));v.setUint8(5,22);v.setUint8(6,255);v.setUint16(7,12000,true);
  const s=parsePacket('32',v);assert.equal(s.pace,120);assert.equal(s.hr,null);assert.equal(s.rate,22);assert.ok(Math.abs(s.power-202.546296)<.001);
  v.setUint16(7,0,true);assert.equal(parsePacket('32',v).power,null);
});
test('short or unknown packets are rejected',()=>{
  for(const type of ['31','32','35','80'])assert.throws(()=>parsePacket(type,new DataView(new ArrayBuffer(2))));
});
test('coaching waits for eight complete strokes and does not score invalid data',()=>{
  assert.equal(analyse(Array.from({length:7},(_,i)=>stroke(i+1))).score,null);
  assert.equal(analyse(Array.from({length:12},(_,i)=>stroke(i+1,{drive:0}))).score,null);
});
test('consistent rhythm gets a high rating; a rushed recovery produces a relevant cue',()=>{
  const stable=Array.from({length:12},(_,i)=>stroke(i+1));assert.equal(analyse(stable,{targetRate:20}).score,100);
  const rushed=stable.map(s=>({...s,recovery:1}));const a=analyse(rushed);assert.ok(a.score<100);assert.equal(a.title,'Give the recovery time');
});
test('variable work lowers consistency and cues repeatable pressure',()=>{
  const varied=Array.from({length:12},(_,i)=>stroke(i+1,{work:i%2?300:600}));const a=analyse(varied);assert.ok(a.consistency<70);assert.equal(a.title,'Make each drive repeatable');
});
test('recording deduplicates strokes and rejects a reset',()=>{
  const r=new Recording('PM5',{});assert.equal(r.add(stroke(1)),true);assert.equal(r.add(stroke(1)),false);assert.equal(r.add(stroke(2)),true);assert.equal(r.add(stroke(1)), 'reset');assert.equal(r.strokes.length,2);
});
test('received-stroke totals exclude pauses and telemetry gaps; CSV leaves missing HR empty',()=>{
  const r=new Recording('PM5',{});r.add(stroke(1,{hr:null}));r.add(stroke(20,{hr:null}));const s=r.finish();assert.equal(s.duration,6);assert.equal(s.distance,24);assert.equal(s.monitorElapsedSpan,57);assert.match(csv(s),/^# Erg Buddy PM5 session/);assert.ok(!csv(s).includes('null'));
});
test('Bluetooth subscribes to real characteristic UUIDs and cleans up on disconnect',async()=>{
  const subscribed=[],listeners=new Map();
  const characteristics={};for(const code of ['31','32','35']) characteristics[uuid(code)]={addEventListener:(name,fn)=>listeners.set(code,fn),removeEventListener:()=>listeners.delete(code),startNotifications:async()=>subscribed.push(code)};
  let disconnected=false;
  const device={name:'PM5 123',addEventListener(){},removeEventListener(){},gatt:{connected:true,connect:async()=>({getPrimaryService:async id=>{assert.equal(id,uuid('30'));return {getCharacteristic:async id=>characteristics[id]};}}),disconnect:()=>{disconnected=true;}}};
  Object.defineProperty(globalThis,'isSecureContext',{value:true,configurable:true});
  Object.defineProperty(globalThis,'navigator',{value:{bluetooth:{requestDevice:async options=>{assert.equal(options.filters[0].namePrefix,'PM5');return device;}}},configurable:true});
  const packets=[],pm=new PM5((...args)=>packets.push(args),()=>{});assert.equal(await pm.connect(),'PM5 123');assert.deepEqual(subscribed,['31','32','35']);
  listeners.get('32')({target:{value:new DataView(new ArrayBuffer(16))}});assert.equal(packets[0][0],'32');pm.disconnect();assert.equal(listeners.size,0);assert.ok(disconnected);
});
