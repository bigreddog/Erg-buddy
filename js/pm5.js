import { ForceCurveReader } from './force-curve.js';
// Concept2's non-multiplexed rowing service. All multi-byte values are little endian.
export const uuid = code => `ce0600${code}-43e5-11e4-916c-0800200c9a66`;
const u24 = (v, i) => v.getUint8(i) + v.getUint8(i + 1) * 256 + v.getUint8(i + 2) * 65536;
export function parsePacket(type, v) {
  const sizes = { '31': 19, '32': 16, '35': 20 };
  if (!sizes[type] || v.byteLength < sizes[type]) throw new Error(`Incomplete PM5 ${type} packet`);
  const elapsed = u24(v, 0) / 100;
  if (type === '31') return { elapsed, distance: u24(v, 3) / 10, workoutState: v.getUint8(8), rowingState: v.getUint8(9), strokeState: v.getUint8(10), drag: v.getUint8(18) };
  if (type === '32') {
    const hr = v.getUint8(6), pace = v.getUint16(7, true) / 100;
    return { elapsed, rate: v.getUint8(5), hr: hr === 255 || hr === 0 ? null : hr, pace: pace > 0 ? pace : null, power: pace > 0 ? 2.8 / (pace / 500) ** 3 : null };
  }
  return { elapsed, distance: u24(v, 3) / 10, driveLength: v.getUint8(6) / 100, drive: v.getUint8(7) / 100, recovery: v.getUint16(8, true) / 100, strokeDistance: v.getUint16(10, true) / 100, peakForceLbs: v.getUint16(12, true) / 10, averageForceLbs: v.getUint16(14, true) / 10, work: v.getUint16(16, true) / 10, count: v.getUint16(18, true) };
}
export class PM5 {
  constructor(onPacket, onDisconnect) { this.onPacket = onPacket; this.onDisconnect = onDisconnect; this.listeners = []; }
  reportCurveDiagnostics(update) {
    this.curveDiagnostics={...this.curveDiagnostics,...update};
    this.onPacket('curve-diagnostics',structuredClone(this.curveDiagnostics));
  }
  requestCurve(trigger) {
    const now=Date.now();
    if(trigger==='stroke-data' && this.strokeState===2 && now-(this.statusReceivedAt??0)<1000)return;
    if(!this.curves || this.curves.busy || this.curves.disabled || now<this.curves.nextAttemptAt || now-(this.curveTriggerAt??-Infinity)<1000)return;
    this.curveTriggerAt=now;this.curveDiagnostics.lastTrigger=trigger;
    this.curves.read();
  }
  async connect() {
    if (!globalThis.isSecureContext) throw new Error('Bluetooth requires HTTPS or localhost.');
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is unavailable. Use Chrome on Android or desktop Chrome/Edge. Safari and Firefox do not support it. Demo mode works here.');
    this.curveDiagnostics={};
    this.reportCurveDiagnostics({readerVersion:2,state:'connecting',notifications:0,requests:0,responses:0,curves:0,failures:0,lastError:null});
    this.device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'PM5' }], optionalServices: [uuid('30'), uuid('20')] });
    this.disconnected = () => { this.cleanup(); this.onDisconnect(); };
    this.device.addEventListener('gattserverdisconnected', this.disconnected);
    try {
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(uuid('30'));
      for (const type of ['31', '32', '35']) {
        const characteristic = await service.getCharacteristic(uuid(type));
        const listener = e => {
          try {
            const data = parsePacket(type, e.target.value);
            this.onPacket(type, data);
            if (type === '31') {
              this.statusReceivedAt=Date.now();
              if (data.strokeState === 4 && this.strokeState !== 4) {clearTimeout(this.curveFallback);this.requestCurve('recovery');}
              this.strokeState = data.strokeState;
            }
            if(type==='35' && data.count!==this.curveStrokeCount) {
              this.curveStrokeCount=data.count;
              if(data.work>10 && data.peakForceLbs>0){clearTimeout(this.curveFallback);this.curveFallback=setTimeout(()=>this.requestCurve('stroke-data'),500);}
            }
          }
          catch (error) { this.onPacket('error', { message: error.message }); }
        };
        characteristic.addEventListener('characteristicvaluechanged', listener);
        this.listeners.push([characteristic, listener]);
        await characteristic.startNotifications();
      }
      try {
        const control = await server.getPrimaryService(uuid('20'));
        const tx = await control.getCharacteristic(uuid('21'));
        const rx = await control.getCharacteristic(uuid('22'));
        const acknowledged=Boolean(tx.properties?.write && tx.writeValueWithResponse);
        const write=data=>acknowledged?tx.writeValueWithResponse(data):tx.writeValueWithoutResponse?tx.writeValueWithoutResponse(data):tx.writeValue(data);
        const reader = new ForceCurveReader(write, samples => {
          this.onPacket('curve', { samples });
          this.reportCurveDiagnostics({state:'receiving'});
        }, message => {
          this.reportCurveDiagnostics({state:'retrying',lastError:message});
          this.onPacket('curve-status', { message:'Curve delayed — retrying on a later stroke.' });
        }, stats=>this.reportCurveDiagnostics(stats));
        const listener = event => {this.curveDiagnostics.notifications++;reader.decoder.push(event.target.value);};
        rx.addEventListener('characteristicvaluechanged', listener);
        this.listeners.push([rx, listener]);
        await rx.startNotifications();
        this.curves = reader;
        this.reportCurveDiagnostics({state:'ready',writeMode:acknowledged?'with-response':'without-response'});
        this.onPacket('curve-status', { message: 'Waiting for the next completed drive' });
      } catch(error) {
        this.reportCurveDiagnostics({state:'unavailable',lastError:error.message});
        this.curves?.close(); this.curves = null;
        this.onPacket('curve-status', { message: 'Force curve unavailable on this connection. Workout metrics remain live.' });
      }
      if (!this.device.gatt.connected) throw new Error('PM5 disconnected during connection setup. Try reconnecting.');
      return this.device.name;
    } catch (error) { this.disconnect(); throw error; }
  }
  cleanup() {
    clearTimeout(this.curveFallback);this.statusReceivedAt=null;
    this.curves?.close(); this.curves = null; this.strokeState = null;this.curveStrokeCount=null;this.curveTriggerAt=null;
    for (const [c, fn] of this.listeners) c.removeEventListener('characteristicvaluechanged', fn);
    this.listeners = [];
    this.device?.removeEventListener('gattserverdisconnected', this.disconnected);
  }
  disconnect() { this.cleanup(); if (this.device?.gatt.connected) this.device.gatt.disconnect(); }
}
