import {habitatAt} from './geometry.js';

export const SAND_DRAWING_LIMITS=Object.freeze({segments:1200,step:4,width:3.2,holdMs:180,movePx:7});
const point=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/** Ephemeral world-space marks. Once touched by water, a mark only fades. */
export class SandDrawing {
  constructor({maxSegments=SAND_DRAWING_LIMITS.segments,coverageAt=()=>0}={}){
    this.maxSegments=Math.max(1,Math.min(SAND_DRAWING_LIMITS.segments,Math.floor(maxSegments)||1));
    this.coverageAt=coverageAt;this.coverageCursor=0;this.segments=[];this.nextId=1;this.lastInput=null;this.inkPoint=null;this.active=false;
  }
  canDraw(point,level){
    if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return false;
    const h=habitatAt(point.x,point.y,level);
    return !h.blocked&&!h.water&&!h.pool&&(h.tidal||h.distance<240);
  }
  begin(value,level,time=0){
    this.end();const p=point(value);if(!this.canDraw(p,level))return false;
    this.active=true;this.lastInput=p;this.inkPoint=p;return true;
  }
  add(value,level,time=0){
    const p=point(value);if(!this.active||!p)return false;
    const from=this.lastInput;this.lastInput=p;if(!from)return false;
    const span=distance(from,p),steps=Math.min(512,Math.max(1,Math.ceil(span/SAND_DRAWING_LIMITS.step)));let added=false;
    for(let i=1;i<=steps;i++){
      const t=i/steps,next={x:from.x+(p.x-from.x)*t,y:from.y+(p.y-from.y)*t};
      if(!this.canDraw(next,level)){this.inkPoint=null;continue;}
      if(this.inkPoint&&distance(this.inkPoint,next)>.35){
        const mid={x:(this.inkPoint.x+next.x)/2,y:(this.inkPoint.y+next.y)/2};
        if(this.canDraw(mid,level)){
          this.segments.push({id:this.nextId++,x1:this.inkPoint.x,y1:this.inkPoint.y,x2:next.x,y2:next.y,width:SAND_DRAWING_LIMITS.width,alpha:1,eroding:false,createdAt:time});added=true;
        }
      }
      this.inkPoint=next;
    }
    if(this.segments.length>this.maxSegments)this.segments.splice(0,this.segments.length-this.maxSegments);
    return added;
  }
  end(){this.active=false;this.lastInput=null;this.inkPoint=null;}
  clear(){this.end();this.segments.length=0;}
  update(dt,level,time=0,{reducedMotion=false}={}){
    dt=Math.max(0,Math.min(.25,Number(dt)||0));if(!this.segments.length)return;
    // Round-robin shoreline queries keep a full page of handwriting affordable.
    // Every mark is checked about eight times per second; fading remains per frame.
    const count=this.segments.length,checks=Math.min(count,Math.max(16,Math.ceil(count*dt*8)));
    for(let i=0;i<checks;i++){
      const segment=this.segments[this.coverageCursor++%count];
      if(segment.eroding)continue;
      for(const t of [0,.5,1]){
        const x=segment.x1+(segment.x2-segment.x1)*t,y=segment.y1+(segment.y2-segment.y1)*t;
        if(habitatAt(x,y,level).water||this.coverageAt(x,y,level,time,reducedMotion)>.04){segment.eroding=true;break;}
      }
    }
    for(const segment of this.segments)if(segment.eroding)segment.alpha=Math.max(0,segment.alpha-dt*1.65);
    this.segments=this.segments.filter(segment=>segment.alpha>0);
  }
}

/** Canvas gesture routing stays independent from rendering and animal rewards. */
export class SandDrawingInput {
  constructor({drawing,toWorld,getLevel,getTime,getMode,isPaused,isInside,hasTarget,onTap,capture=()=>{},release=()=>{}}){
    Object.assign(this,{drawing,toWorld,getLevel,getTime,getMode,isPaused,isInside,hasTarget,onTap,capture,release});this.gesture=null;
  }
  get active(){return !!this.gesture;}
  down(event){
    if(this.gesture||event.button!==0||event.isPrimary===false||this.isPaused()||!this.isInside(event.clientX,event.clientY))return false;
    const world=this.toWorld(event.clientX,event.clientY),mode=this.getMode();
    this.gesture={id:event.pointerId,x:event.clientX,y:event.clientY,at:event.timeStamp,mode,moved:false,drawing:false,trail:[world],
      allowed:mode==='observe'&&!this.hasTarget(event.clientX,event.clientY)&&this.drawing.canDraw(world,this.getLevel())};
    this.capture(event.pointerId);return true;
  }
  valid(event){
    const g=this.gesture;if(!g||g.id!==event.pointerId)return false;
    if(this.isPaused()||this.getMode()!==g.mode||!this.isInside(event.clientX,event.clientY)){this.cancel();return false;}
    return true;
  }
  move(event){
    if(!this.valid(event))return false;
    if(Number.isFinite(event.buttons)&&(event.buttons&1)===0){this.cancel();return false;}
    const g=this.gesture,world=this.toWorld(event.clientX,event.clientY);
    g.moved ||= Math.hypot(event.clientX-g.x,event.clientY-g.y)>=SAND_DRAWING_LIMITS.movePx;
    if(g.drawing)return this.drawing.add(world,this.getLevel(),this.getTime());
    g.trail.push(world);if(g.trail.length>64)g.trail.splice(1,1);
    if(!g.allowed||!g.moved||event.timeStamp-g.at<SAND_DRAWING_LIMITS.holdMs)return false;
    g.drawing=this.drawing.begin(g.trail[0],this.getLevel(),this.getTime());
    if(g.drawing)for(const p of g.trail.slice(1))this.drawing.add(p,this.getLevel(),this.getTime());
    g.trail=[];return g.drawing;
  }
  up(event){
    if(!this.valid(event))return false;
    const g=this.gesture;g.moved ||= Math.hypot(event.clientX-g.x,event.clientY-g.y)>=SAND_DRAWING_LIMITS.movePx;
    if(g.drawing)this.drawing.add(this.toWorld(event.clientX,event.clientY),this.getLevel(),this.getTime());
    const tap=!g.drawing&&!g.moved;this.cancel();
    if(tap)this.onTap(event.clientX,event.clientY);return tap;
  }
  cancel(pointerId){
    if(pointerId!==undefined&&this.gesture?.id!==pointerId)return;
    const g=this.gesture;this.gesture=null;this.drawing.end();
    if(g)this.release(g.id);
  }
}
