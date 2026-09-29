const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
export const BOTTLE_LAUNCH_SECONDS=1.3;
export const BOTTLE_TAP_SLOP=14;

/** One pose is shared by the watercolor bottle and its interactive footprint. */
export function bottlePose(bottle,time=0,{reducedMotion=false}={}){
 const seed=Number(bottle.createdAt)||0;
 return{x:bottle.x,y:bottle.y+(reducedMotion?0:Math.sin(time*1.15+seed%19)*1.1),
  angle:-.42+(reducedMotion?0:Math.sin(time*.82+seed%13)*.065),alpha:clamp(bottle.opacity??1)};
}

/** Runtime-only illustration; logical bottles and their saves never leave water. */
export class BottleLaunchEffects{
 constructor(){this.items=new Map();}
 start(bottle,origin,time=0,{reducedMotion=false}={}){
  if(!bottle?.id||bottle.kind!=='outgoing'||this.items.has(bottle.id))return false;
  this.items.set(bottle.id,{id:bottle.id,origin:{...origin},startedAt:time,reducedMotion});return true;
 }
 has(id,time){const effect=this.items.get(id);return !!effect&&time-effect.startedAt<BOTTLE_LAUNCH_SECONDS;}
 update(time,bottles=[]){const ids=new Set(bottles.map(b=>b.id));for(const [id,effect]of this.items)if(!ids.has(id)||time-effect.startedAt>=BOTTLE_LAUNCH_SECONDS)this.items.delete(id);}
 pose(bottle,time){
  const effect=this.items.get(bottle.id);if(!effect)return null;
  const elapsed=Math.max(0,time-effect.startedAt),duration=effect.reducedMotion?.25:.9;
  const p=clamp(elapsed/duration),target=bottlePose(bottle,time,{reducedMotion:effect.reducedMotion});
  const remaining=Math.max(0,BOTTLE_LAUNCH_SECONDS-duration),splash=elapsed>=duration&&remaining?clamp((elapsed-duration)/remaining):null;
  const arc=effect.reducedMotion?0:Math.sin(p*Math.PI)*Math.min(140,55+Math.hypot(target.x-effect.origin.x,target.y-effect.origin.y)*.2);
  return{...target,x:effect.reducedMotion?target.x:effect.origin.x+(target.x-effect.origin.x)*p,
   y:effect.reducedMotion?target.y:effect.origin.y+(target.y-effect.origin.y)*p-arc,
   angle:target.angle+(effect.reducedMotion?0:(1-p)*Math.PI*1.35),alpha:effect.reducedMotion?p:1,
   airborne:p<1,splash,waterX:target.x,waterY:target.y,reducedMotion:effect.reducedMotion};
 }
 clear(){this.items.clear();}
}

/** Protected bottle taps tolerate small finger drift without starting a sand mark. */
export class BottlePointerInput{
 constructor({hitTest,isInside,isPaused,onTap,capture=()=>{},release=()=>{}}){Object.assign(this,{hitTest,isInside,isPaused,onTap,capture,release});this.gesture=null;}
 get active(){return !!this.gesture;}
 down(event){
  if(this.gesture||event.button!==0||event.isPrimary===false||this.isPaused()||!this.isInside(event.clientX,event.clientY))return false;
  const id=this.hitTest(event.clientX,event.clientY);if(!id)return false;
  this.gesture={pointerId:event.pointerId,id,x:event.clientX,y:event.clientY,moved:false};this.capture(event.pointerId);return true;
 }
 valid(event){const g=this.gesture;if(!g||g.pointerId!==event.pointerId)return false;if(this.isPaused()||!this.isInside(event.clientX,event.clientY)){this.cancel();return false;}return true;}
 move(event){if(!this.valid(event))return false;if(Number.isFinite(event.buttons)&&(event.buttons&1)===0){this.cancel();return false;}this.gesture.moved ||= Math.hypot(event.clientX-this.gesture.x,event.clientY-this.gesture.y)>BOTTLE_TAP_SLOP;return true;}
 up(event){
  if(!this.valid(event))return false;const g=this.gesture;
  const tap=!g.moved&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<=BOTTLE_TAP_SLOP&&this.hitTest(event.clientX,event.clientY)===g.id;
  this.cancel();if(tap)this.onTap(g.id);return tap;
 }
 cancel(pointerId){if(pointerId!==undefined&&this.gesture?.pointerId!==pointerId)return;const g=this.gesture;this.gesture=null;if(g)this.release(g.pointerId);}
}
