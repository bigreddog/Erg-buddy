const names=['rower','coach','workout'];
export function sessionScreens(onChange) {
  let current=0,start=null;
  const surface=document.getElementById('screens'),tabs=names.map(name=>document.getElementById(`tab-${name}`));
  function select(index,focus=false) {
    current=(index+names.length)%names.length;
    names.forEach((name,i)=>{document.getElementById(`screen-${name}`).hidden=i!==current;tabs[i].setAttribute('aria-selected',String(i===current));tabs[i].tabIndex=i===current?0:-1;});
    if(focus)tabs[current].focus();
    onChange(names[current]);
  }
  tabs.forEach((tab,i)=>tab.addEventListener('click',()=>select(i)));
  const keys=event=>{if(event.target.closest('input,dialog')||event.altKey||event.ctrlKey||event.metaKey)return;let next;if(event.key==='ArrowRight')next=current+1;else if(event.key==='ArrowLeft')next=current-1;else if(event.key==='Home')next=0;else if(event.key==='End')next=2;else return;event.preventDefault();select(next,true);};
  document.querySelector('.screen-tabs').addEventListener('keydown',keys);surface.addEventListener('keydown',keys);
  surface.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.target.closest('button,input,a'))return;start={x:event.clientX,y:event.clientY,id:event.pointerId};surface.setPointerCapture(event.pointerId);});
  surface.addEventListener('pointerup',event=>{if(!start||event.pointerId!==start.id)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start=null;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.5)select(current+(dx<0?1:-1));});
  surface.addEventListener('pointercancel',()=>{start=null;});
  select(0);
}
