const names=['rower','coach','workout'];
export function sessionScreens(onChange) {
  let current=0,start=null,playing=true,timer=null;
  const surface=document.getElementById('screens'),tabs=names.map(name=>document.getElementById(`tab-${name}`));
  const cycle=document.getElementById('screen-cycle'),dialog=document.getElementById('settings-dialog');
  function schedule() {
    clearTimeout(timer);timer=null;
    if(playing && !document.hidden && !dialog.open && !start)timer=setTimeout(()=>select(current+1),5000);
  }
  cycle.addEventListener('click',()=>{
    playing=!playing;
    document.getElementById('cycle-icon').textContent=playing?'Ⅱ':'▶';
    document.getElementById('cycle-label').textContent=playing?'Pause · 5s':'Play · 5s';
    cycle.setAttribute('aria-label',playing?'Pause automatic screen cycling':'Play automatic screen cycling');
    cycle.title=playing?'Screens advance every 5 seconds':'Screen cycling paused';
    schedule();
  });
  document.addEventListener('visibilitychange',schedule);
  new MutationObserver(schedule).observe(dialog,{attributes:true,attributeFilter:['open']});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.addEventListener('pageshow',schedule);
  function select(index,focus=false) {
    current=(index+names.length)%names.length;
    names.forEach((name,i)=>{document.getElementById(`screen-${name}`).hidden=i!==current;tabs[i].setAttribute('aria-selected',String(i===current));tabs[i].tabIndex=i===current?0:-1;});
    if(focus)tabs[current].focus();
    onChange(names[current]);
    schedule();
  }
  tabs.forEach((tab,i)=>tab.addEventListener('click',()=>select(i)));
  const keys=event=>{if(event.target.closest('input,dialog')||event.altKey||event.ctrlKey||event.metaKey)return;let next;if(event.key==='ArrowRight')next=current+1;else if(event.key==='ArrowLeft')next=current-1;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();select(next,true);};
  document.querySelector('.tab-buttons').addEventListener('keydown',keys);surface.addEventListener('keydown',keys);
  surface.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.target.closest('button,input,a'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId};surface.setPointerCapture(event.pointerId);schedule();});
  surface.addEventListener('pointerup',event=>{if(!start||event.pointerId!==start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)select(current+(dx<0?1:-1));else schedule();});
  surface.addEventListener('pointercancel',()=>{start=null;schedule();});
  select(0);
}
