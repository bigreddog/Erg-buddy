const clamp = x => Math.max(0,Math.min(1,x));
const smooth = x => { const t=clamp(x);return t*t*(3-2*t); };
export class RowerMotion {
  constructor() { this.reset(); }
  reset() { this.state=0;this.phaseAt=0;this.seenAt=-Infinity;this.drive=.85;this.recovery=1.85;this.demoAt=null;this.lastProgress=0; }
  timing({drive,recovery}) { if(drive>0 && recovery>0){this.drive=drive;this.recovery=recovery;} }
  phase(state, now) { this.demoAt=null;this.seenAt=now;if(state!==this.state){this.state=state;this.phaseAt=now;} }
  demo(now) { this.demoAt=now;this.seenAt=now; }
  sample(now) {
    let phase='Waiting for stroke', progress=this.lastProgress;
    if(this.demoAt!==null) {
      const elapsed=Math.max(0,(now-this.demoAt)/1000),cycle=this.drive+this.recovery;
      if(elapsed<=cycle+.15) { const drive=elapsed<this.drive;progress=drive?smooth(elapsed/this.drive):1-smooth((elapsed-this.drive)/this.recovery);phase=drive?'Drive':'Recovery'; }
      else phase='Waiting for stroke';
    } else if(now-this.seenAt<=2500) {
      const elapsed=Math.max(0,(now-this.phaseAt)/1000);
      if(this.state===1) {progress=0;phase='Catch';}
      else if(this.state===2) {progress=smooth(elapsed/this.drive);phase='Drive';}
      else if(this.state===3) {progress=1;phase='Finish';}
      else if(this.state===4) {progress=1-smooth(elapsed/this.recovery);phase='Recovery';}
    }
    this.lastProgress=progress;
    return {progress,phase,legs:smooth(progress/.72),body:smooth((progress-.15)/.7),arms:smooth((progress-.7)/.3)};
  }
}
