// Decorative canvas scenery. Movement uses reported distance, never a stroke-form model.
export class RiverScene {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.distance = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    new ResizeObserver(() => this.draw()).observe(canvas);
    this.draw();
  }
  setDistance(distance) { this.distance = Number.isFinite(distance) ? distance : 0; this.draw(); }
  draw() {
    const c = this.ctx; if (!c) return;
    const w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 180, dpr = Math.min(devicePixelRatio || 1,2);
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) { this.canvas.width = w*dpr; this.canvas.height = h*dpr; }
    c.setTransform(dpr,0,0,dpr,0,0);
    const sky=c.createLinearGradient(0,0,0,h); sky.addColorStop(0,'#698c88');sky.addColorStop(.45,'#b1c1a6');sky.addColorStop(1,'#184956');c.fillStyle=sky;c.fillRect(0,0,w,h);
    c.fillStyle='#d4d6b2';c.beginPath();c.arc(w*.73,h*.27,18,0,Math.PI*2);c.fill();
    const polygon=(points,color)=>{c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill();};
    polygon([[0,h*.54],[w*.12,h*.24],[w*.29,h*.51],[w*.42,h*.3],[w*.62,h*.54],[w*.78,h*.23],[w,h*.52],[w,h],[0,h]],'#55756d');
    polygon([[0,h*.63],[w*.15,h*.44],[w*.3,h*.58],[w*.47,h*.48],[w*.65,h*.64],[w*.84,h*.4],[w,h*.6],[w,h],[0,h]],'#365950');
    polygon([[w*.52,h*.53],[w*.65,h*.53],[w*1.18,h],[w*.13,h]],'#24606b');
    polygon([[0,h*.66],[w*.49,h*.53],[w*.52,h*.53],[w*.13,h],[0,h]],'#24463b');
    polygon([[w*.65,h*.53],[w*.72,h*.57],[w,h*.71],[w,h],[w*1.18,h]],'#264b3e');
    const travel=this.reduced?0:(this.distance%80)/80;
    for(let i=0;i<28;i++){
      const depth=((i/28+travel)%1)**2,y=h*.55+depth*h*.45;
      const mid=w*(.585+.06*depth),width=w*(.01+.32*depth);
      c.strokeStyle=`rgba(159,203,196,${.12+depth*.16})`;c.lineWidth=1+depth;c.beginPath();c.moveTo(mid-width,y);c.lineTo(mid+width,y);c.stroke();
    }
    for(let i=0;i<20;i++){
      const depth=(i/20)**1.6, x=w*(.49-depth*.53),y=h*(.55+depth*.42),size=5+depth*47;
      polygon([[x,y-size],[x-size*.35,y],[x+size*.35,y]],i%2?'#173b30':'#204637');
    }
    const shade=c.createLinearGradient(0,0,w,0);shade.addColorStop(0,'rgba(6,23,30,.85)');shade.addColorStop(.5,'rgba(6,23,30,.25)');shade.addColorStop(1,'rgba(6,23,30,.05)');c.fillStyle=shade;c.fillRect(0,0,w,h);
  }
}
