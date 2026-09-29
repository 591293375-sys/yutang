const EVENTS=['pointerdown','pointerup','mousedown','mouseup','click','dblclick'];
let cancelPrevious=null;

// Closing a dialog on the first click must not retarget a double-click's second
// press to the scene or controls beneath it. Only the same pointer location is
// briefly guarded; a different location and keyboard activation stay usable.
export function guardDismissedClick(point,{target=globalThis.document,duration=550,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!target)return()=>{};
 cancelPrevious?.();
 let timer=null,closed=false;
 const cleanup=()=>{
  if(closed)return;closed=true;
  for(const type of EVENTS)target.removeEventListener(type,intercept,true);
  if(timer!==null)clearTimer(timer);
  if(cancelPrevious===cleanup)cancelPrevious=null;
 };
 const intercept=event=>{
  if(event.button!==0||((event.type==='click'||event.type==='dblclick')&&event.detail===0))return;
  if(!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY)||Math.hypot(event.clientX-point.x,event.clientY-point.y)>24)return;
  event.preventDefault();event.stopImmediatePropagation();
 };
 for(const type of EVENTS)target.addEventListener(type,intercept,true);
 cancelPrevious=cleanup;timer=setTimer(cleanup,duration);return cleanup;
}
