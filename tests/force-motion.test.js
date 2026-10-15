import test from 'node:test';
import assert from 'node:assert/strict';
import { frame,curveRequest,FrameDecoder,forceSamples,ForceCurveReader } from '../js/force-curve.js';
import { RowerMotion } from '../js/rower-motion.js';
const payload = values => [1,0x1a,3+values.length*2,0x6b,1+values.length*2,values.length*2,...values.flatMap(v=>[v&255,v>>8])];
test('force request uses GET_FORCEPLOTDATA with twenty-byte limit',()=>assert.deepEqual([...curveRequest()],[0xf1,0x1a,3,0x6b,1,20,0x67,0xf2]));
test('CSAFE decoder reassembles fragmented frames and escaped checksum/sample bytes',()=>{
  const values=[0xf0,0xf1,0xf2,0xf3,1250],received=[];const decoder=new FrameDecoder(bytes=>received.push(forceSamples(bytes)),e=>{throw e;});
  const bytes=frame(payload(values));for(const byte of bytes)decoder.push(new DataView(Uint8Array.of(byte).buffer));assert.deepEqual(received,[values]);
});
test('corrupt checksum and malformed sample length never produce a curve',()=>{
  const errors=[],frames=[],decoder=new FrameDecoder(b=>frames.push(b),e=>errors.push(e));const bytes=frame(payload([1,2,3]));bytes[3]^=1;decoder.push(new DataView(bytes.buffer));assert.equal(frames.length,0);assert.equal(errors.length,1);
  assert.throws(()=>forceSamples([1,0x1a,4,0x6b,2,3,5]));assert.throws(()=>forceSamples([0x11,0x1a,3,0x6b,1,0]));
});
test('force reader drains chunks serially, ignores overlapping requests, and terminates',async()=>{
  const parts=[[1,2,3,4,5,6,7,8,9,10],[8,5,2,1,0]],curves=[];let writes=0,reader;
  reader=new ForceCurveReader(async()=>{writes++;const bytes=frame(payload(parts.shift()));reader.decoder.push(new DataView(bytes.buffer));},v=>curves.push(v),e=>{throw e;});
  const first=reader.read();await reader.read();await first;assert.equal(writes,2);assert.equal(curves.length,1);assert.equal(curves[0].length,15);
});
test('transport failure backs off without flooding and disconnect cancels pending requests',async()=>{
  let failures=0;const reader=new ForceCurveReader(async()=>{throw new Error('Unsupported');},()=>assert.fail(),()=>failures++);await reader.read();await reader.read();assert.equal(failures,1);assert.equal(reader.busy,false);
  const pending=new ForceCurveReader(async()=>{},()=>assert.fail(),()=>assert.fail());const read=pending.read();pending.close();await read;assert.equal(pending.busy,false);
});
test('rower tracks drive/recovery phases, uses measured duration, and freezes on stale telemetry',()=>{
  const m=new RowerMotion();m.timing({drive:1,recovery:2});m.phase(2,0);assert.equal(m.sample(0).progress,0);assert.equal(m.sample(1000).progress,1);m.phase(4,1000);assert.equal(m.sample(2000).progress,.5);const frozen=m.sample(4000);assert.equal(frozen.progress,.5);assert.equal(frozen.phase,'Waiting for stroke');
});
test('demo animation completes one cycle and waits instead of inventing strokes',()=>{
  const m=new RowerMotion();m.timing({drive:1,recovery:2});m.demo(100);assert.equal(m.sample(600).phase,'Drive');assert.equal(m.sample(1600).phase,'Recovery');assert.equal(m.sample(5000).phase,'Waiting for stroke');m.reset();assert.equal(m.sample(5000).progress,0);
});

// Concept2 PM CSAFE Definition rev 0.25, Fixed Block Size Responses (p57)
// and Get Force Curve example (p89): 32-byte block, 20 valid bytes.
const fixedBlock=(values,pad=0)=>[0x09,0x1a,0x23,0x6b,0x21,values.length*2,...values.flatMap(v=>[v&255,v>>8]),...Array(32-values.length*2).fill(pad)];
test('documented PM5 fixed block accepts 20 valid bytes and ignores padding',()=>{
  const samples=[65,65,121,174,184,185,186,185,185,182];
  assert.deepEqual(forceSamples(fixedBlock(samples)),samples);
  assert.deepEqual(forceSamples(fixedBlock(samples,0xff)),samples);
  assert.deepEqual(forceSamples(fixedBlock([])),[]);
  assert.deepEqual(forceSamples(fixedBlock([105,99,88,76,61,49,49,32])),[105,99,88,76,61,49,49,32]);
});
test('fixed block padding never terminates or adds samples to a multi-chunk curve',async()=>{
  const parts=[[65,65,121,174,184,185,186,185,185,182],[105,99,88,76,61,49,49,32],[]],curves=[],errors=[];let reader,writes=0;
  reader=new ForceCurveReader(async()=>{writes++;const response=frame(fixedBlock(parts.shift()));for(let i=0;i<response.length;i+=7)reader.decoder.push(new DataView(response.slice(i,i+7).buffer));},v=>curves.push(v),e=>errors.push(e));
  await reader.read();assert.equal(writes,3);assert.deepEqual(errors,[]);assert.equal(curves[0].length,18);assert.equal(curves[0].at(-1),32);
});
test('malformed or oversized counts are rejected even in a padded block',()=>{
  const bytes=fixedBlock([20,30]);bytes[5]=34;assert.throws(()=>forceSamples(bytes));bytes[5]=3;assert.throws(()=>forceSamples(bytes));
  const truncated=fixedBlock([20,30]).slice(0,-2);assert.throws(()=>forceSamples(truncated));
});
test('a later stroke recovers after one transient curve transport error',async()=>{
  const realNow=Date.now;let now=10000,writes=0;const curves=[],reports=[];let reader;
  Date.now=()=>now;
  try {
    reader=new ForceCurveReader(async()=>{writes++;if(writes===1)throw new Error('Transient GATT write failure');const response=frame(fixedBlock([20,40,60,80,100,80,60,40,20,10,0]));reader.decoder.push(new DataView(response.buffer));},v=>curves.push(v),()=>{},r=>reports.push(r));
    await reader.read();await reader.read();assert.equal(writes,1);assert.equal(reader.disabled,false);
    now+=2100;await reader.read();assert.equal(writes,2);assert.equal(curves.length,1);assert.equal(reports.at(-1).failures,1);assert.equal(reports.at(-1).curves,1);assert.equal(reports.at(-1).requests,2);
  }finally{Date.now=realNow;reader?.close();}
});
