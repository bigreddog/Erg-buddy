// CSAFE GET_FORCEPLOTDATA: request up to 20 bytes of little-endian force samples.
export function frame(payload) {
  const checksum = payload.reduce((sum, byte) => sum ^ byte, 0);
  const escaped = [...payload, checksum].flatMap(byte => byte >= 0xf0 && byte <= 0xf3 ? [0xf3, byte - 0xf0] : [byte]);
  return Uint8Array.from([0xf1, ...escaped, 0xf2]);
}
export const curveRequest = () => frame([0x1a, 3, 0x6b, 1, 20]);
export class FrameDecoder {
  reset() { this.bytes = null; this.escaped = false; }
  constructor(onFrame, onError) { this.onFrame = onFrame; this.onError = onError; this.reset(); }
  push(view) {
    for (let i = 0; i < view.byteLength; i++) {
      const b = view.getUint8(i);
      if (this.escaped) {
        this.escaped = false;
        if (b > 3) { this.reset(); this.onError(new Error('Invalid CSAFE escape')); continue; }
        this.bytes?.push(0xf0 + b); continue;
      }
      if (b === 0xf1) { this.bytes = []; continue; }
      if (!this.bytes) continue;
      if (b === 0xf3) { this.escaped = true; continue; }
      if (b === 0xf2) {
        const bytes = this.bytes; this.reset();
        if (bytes.length < 3 || bytes.reduce((a,b) => a ^ b, 0) !== 0) this.onError(new Error('Invalid CSAFE checksum'));
        else this.onFrame(bytes.slice(0,-1));
      } else if (this.bytes.length >= 512) { this.reset(); this.onError(new Error('CSAFE frame too large')); }
      else this.bytes.push(b);
    }
  }
}
export function forceSamples(bytes) {
  // status, command, outer length, detail command, detail length, byte count, samples
  if ((bytes[0] & 0x30) !== 0 || bytes[1] !== 0x1a || bytes[3] !== 0x6b) throw new Error('PM5 did not accept force-curve request');
  const count = bytes[5];
  // Concept2 specifies a fixed 32-byte sample block on some firmware, even
  // when only 20 (or zero) bytes are valid. Ignore padding, not real samples.
  const available=bytes.length-6;
  if (bytes.length < 6 || bytes[2] !== bytes.length-3 || bytes[4] !== bytes.length-5 || count > 32 || count % 2 || count > available || (available !== count && available !== 32)) throw new Error('Invalid force-curve response length');
  const values = [];
  for (let i=6;i<6+count;i+=2) values.push(bytes[i] + bytes[i+1]*256);
  return values;
}
export class ForceCurveReader {
  constructor(write, onCurve, onUnavailable, onDiagnostics = () => {}) {
    this.write = write; this.onCurve = onCurve; this.onUnavailable = onUnavailable;this.onDiagnostics=onDiagnostics;
    this.nextAttemptAt=0;this.failures=0;
    this.stats={requests:0,responses:0,curves:0,emptyReads:0,failures:0,lastError:null,lastResponse:null};
    this.generation = 0; this.disabled = false; this.busy = false;
    this.decoder = new FrameDecoder(bytes => { this.stats.responses++;this.stats.lastResponse=bytes.slice(0,48);try { this.settle(null,forceSamples(bytes)); } catch(e) { this.settle(e); } }, error => this.settle(error));
  }
  settle(error, samples) {
    const pending=this.pending; if (!pending) return;
    this.pending=null; clearTimeout(pending.timer);
    error ? pending.reject(error) : pending.resolve(samples);
  }
  request() {
    this.decoder.reset();
    const generation=this.generation;
    return new Promise((resolve,reject) => {
      this.pending={resolve,reject,timer:setTimeout(()=>this.settle(new Error('PM5 force-curve response timed out')),1200)};
      Promise.resolve().then(()=>{if(generation!==this.generation || this.disabled)throw new Error('Curve request cancelled');this.stats.requests++;return this.write(curveRequest());}).catch(e=>this.settle(e));
    });
  }
  async read() {
    if (this.busy || this.disabled || Date.now()<this.nextAttemptAt) return;
    this.busy=true; const generation=this.generation, started=Date.now(), samples=[];
    try {
      for(let i=0;i<32;i++) {
        const part=await this.request();
        if(generation!==this.generation) return;
        samples.push(...part);
        if (!part.length || (samples.length > 10 && samples.at(-1) === 0)) {
          this.failures=0;this.nextAttemptAt=0;
          if(samples.length>=5 && Math.max(...samples)>0) {this.stats.curves++;this.onCurve(samples);}
          else this.stats.emptyReads++;
          return;
        }
        if(Date.now()-started>2500) throw new Error('Force curve incomplete before next stroke');
      }
      throw new Error('Force curve exceeded sample limit');
    } catch(e) {
      if(generation===this.generation) {
        this.failures++;this.stats.failures++;this.stats.lastError=e.message;this.stats.lastErrorAt=new Date().toISOString();
        this.nextAttemptAt=Date.now()+Math.min(15000,2000*2**Math.min(this.failures-1,3));
        this.onUnavailable(e.message);
      }
    } finally { if(generation===this.generation) {this.busy=false;this.onDiagnostics({...this.stats,retryAfter:this.nextAttemptAt?new Date(this.nextAttemptAt).toISOString():null});} }
  }
  close() { this.generation++;this.disabled=true;this.busy=false;this.settle(new Error('Disconnected'));this.decoder.reset(); }
}
