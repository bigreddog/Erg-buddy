import * as THREE from './vendor/three.module.min.js';
import { RowerMotion } from './rower-motion.js';
export class RowerView {
  constructor(canvas, onPhase, onError) {
    this.motion=new RowerMotion();this.canvas=canvas;this.onPhase=onPhase;this.visible=true;
    try {
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(30,1,.1,50);
      this.camera.position.set(1.5,1.8,4);this.camera.lookAt(-.25,.9,0);
      this.scene.add(new THREE.HemisphereLight(0xe4f7eb,0x32445a,3));
      const sun=new THREE.DirectionalLight(0xffffff,3);sun.position.set(-3,6,5);this.scene.add(sun);
      this.materials={metal:new THREE.MeshStandardMaterial({color:0x314b57,metalness:.65,roughness:.4}),dark:new THREE.MeshStandardMaterial({color:0x101d27,roughness:.7}),lime:new THREE.MeshStandardMaterial({color:0xc6f579,roughness:.6}),skin:new THREE.MeshStandardMaterial({color:0xd9b99a,roughness:.85}),shirt:new THREE.MeshStandardMaterial({color:0x6dc8c3,roughness:.7})};
      this.sphere=new THREE.SphereGeometry(1,12,8);this.cylinder=new THREE.CylinderGeometry(1,1,1,12);
      this.parts=[];
      this.rail=this.box([.1,.18,0],[2.9,.09,.18],'metal');
      this.box([.8,.05,0],[.15,.15,.8],'metal');this.box([-1.3,.05,0],[.15,.15,.85],'metal');
      const fan=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.25,32),this.materials.dark);fan.rotation.x=Math.PI/2;fan.position.set(-1.65,.62,0);this.scene.add(fan);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.37,.022,8,32),this.materials.lime);ring.position.set(-1.65,.62,.14);this.scene.add(ring);
      for(let i=0;i<10;i++){const a=i*Math.PI/5;const spoke=this.bone('metal',.012);this.between(spoke,[-1.65,.62,.15],[-1.65+Math.cos(a)*.34,.62+Math.sin(a)*.34,.15]);}
      this.box([-1.08,.4,0],[.16,.3,.55],'dark');
      const monitor=this.box([-1.52,1.32,0],[.13,.25,.28],'dark');monitor.rotation.z=-.15;
      const pole=this.bone('metal',.025);this.between(pole,[-1.6,.8,0],[-1.5,1.3,0]);
      this.seat=this.box([0,.38,0],[.35,.1,.36],'dark');
      this.torso=this.bone('shirt',.17);this.neck=this.bone('skin',.07);this.head=new THREE.Mesh(this.sphere,this.materials.skin);this.head.scale.set(.13,.17,.13);this.scene.add(this.head);
      this.limbs=[];
      for(const z of [-.14,.14]) {
        const leg={z,thigh:this.bone('dark',.09),shin:this.bone('dark',.07),upper:this.bone('skin',.052),lower:this.bone('skin',.045)};
        this.limbs.push(leg);this.box([-1.12,.43,z],[.27,.12,.14],'lime');
      }
      this.handle=this.bone('dark',.032);this.chain=this.bone('metal',.008);
      const grid=new THREE.GridHelper(12,24,0x36595b,0x1e3c46);grid.position.y=-.04;this.scene.add(grid);
      this.resize=new ResizeObserver(()=>this.size());this.resize.observe(canvas);this.size();
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();onError('3D view paused by the browser. Coaching and workout data remain available.');});
      const draw=now=>{this.frame=requestAnimationFrame(draw);if(!this.visible||document.hidden)return;const pose=this.motion.sample(now);this.onPhase(pose.phase);this.pose(pose);this.renderer.render(this.scene,this.camera);};
      this.frame=requestAnimationFrame(draw);
    } catch(error) { onError('3D rendering is unavailable on this device. Coaching and workout data remain available.'); }
  }
  size(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h||!this.renderer)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;const zoom=Math.max(1,1.6/this.camera.aspect);this.camera.position.set(-.25+1.75*zoom,.9+.9*zoom,4*zoom);this.camera.lookAt(-.25,.9,0);this.camera.updateProjectionMatrix();}
  box(position,size,material){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),this.materials[material]);mesh.position.set(...position);this.scene.add(mesh);return mesh;}
  bone(material,radius){const mesh=new THREE.Mesh(this.cylinder,this.materials[material]);mesh.userData.radius=radius;this.scene.add(mesh);return mesh;}
  between(mesh,a,b){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.scale.set(mesh.userData.radius,delta.length(),mesh.userData.radius);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
  pose(pose){
    const t=this.reduced?.matches?(pose.phase==='Recovery'||pose.phase==='Finish'?1:0):pose.progress;
    const legs=this.reduced?.matches?t:pose.legs,body=this.reduced?.matches?t:pose.body,arms=this.reduced?.matches?t:pose.arms;
    const hip=[-.65+.85*legs,.83,0],shoulder=[hip[0]-.28+.57*body,1.48,0],neck=[shoulder[0]+.025,1.61,0];
    const hand=[-1.23+1.25*arms,.98+.14*arms,0];
    this.seat.position.x=hip[0];this.between(this.torso,hip,shoulder);this.between(this.neck,shoulder,neck);this.head.position.set(neck[0]+.015,1.76,0);
    for(const l of this.limbs){const h=[hip[0],hip[1],l.z],foot=[-1.12,.47,l.z];
      const dx=h[0]-foot[0],dy=h[1]-foot[1],d=Math.hypot(dx,dy),rise=Math.sqrt(Math.max(0,.73**2-(d/2)**2));
      const knee=[(h[0]+foot[0])/2-dy/d*rise,(h[1]+foot[1])/2+dx/d*rise,l.z];
      const sh=[shoulder[0],shoulder[1]-.06,l.z],ha=[hand[0],hand[1],l.z*1.25];
      const elbow=[(sh[0]+ha[0])/2+.22*arms,(sh[1]+ha[1])/2-.12-.12*arms,l.z*1.7];
      this.between(l.thigh,h,knee);this.between(l.shin,knee,foot);this.between(l.upper,sh,elbow);this.between(l.lower,elbow,ha);
    }
    this.between(this.handle,[hand[0],hand[1],-.25],[hand[0],hand[1],.25]);this.between(this.chain,[-1.6,.95,0],hand);
  }
}
