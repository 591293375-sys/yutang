import {SURFACES,distance,surfaceAt,segmentWalkable} from './geometry.js';

const heights=new Map(SURFACES.map(surface=>[surface.id,surface.height]));
const edges=SURFACES.flatMap(surface=>surface.polygon.map((b,i,points)=>({a:points[(i+points.length-1)%points.length],b})));
const prepared=new WeakSet();
const pointAt=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});

// Find exact painted surface crossings once per route, not on every frame.
// The route itself must already satisfy geometry's footprint/obstacle checks.
function surfaceSpans(a,b){
 const dx=b.x-a.x,dy=b.y-a.y,cuts=[0,1];
 for(const edge of edges){const ex=edge.b.x-edge.a.x,ey=edge.b.y-edge.a.y,den=dx*ey-dy*ex;if(Math.abs(den)<1e-12)continue;
  const ax=edge.a.x-a.x,ay=edge.a.y-a.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;
  if(t>1e-8&&t<1-1e-8&&u>=0&&u<=1)cuts.push(t);
 }
 cuts.sort((x,y)=>x-y);const spans=[];
 for(let i=1;i<cuts.length;i++){const start=cuts[i-1],end=cuts[i];if(end-start<1e-8)continue;
  const id=surfaceAt(pointAt(a,b,(start+end)/2))?.id,last=spans.at(-1);
  if(last?.id===id)last.end=end;else spans.push({start,end,id});
 }
 // A click or graph waypoint can lie exactly on a polygon edge. Its actual
 // supported surface is authoritative even when the interior interval differs.
 const first=surfaceAt(a)?.id,last=surfaceAt(b)?.id;
 if(spans.length&&spans[0].id!==first)spans.unshift({start:0,end:0,id:first});
 if(spans.length&&spans.at(-1).id!==last)spans.push({start:1,end:1,id:last});
 return spans;
}

// The painted height between two surfaces chooses the gait over their edge:
// a low lip is simply stepped over, a small rise is a light hop, and only a
// real step (or the cat tree) gets a gathered, airborne jump.
export const TRAVERSAL_TIMING=Object.freeze({
 stride:Object.freeze({crouch:0,jump:.3,land:0}),
 hop:Object.freeze({crouch:.13,jump:.3,land:.16}),
 jump:Object.freeze({crouch:.22,jump:.42,land:.22}),
 climb:Object.freeze({crouch:.34,jump:.66,land:.3}),
});
export function traversalStyle(rise){const r=Math.abs(Number(rise)||0);return r<.005?'stride':r<.011?'hop':'jump';}
export function traversalArc(rise,style=traversalStyle(rise)){
 const r=Math.abs(Number(rise)||0);if(style==='stride')return .0015;
 const arc=style==='hop'?.006+r*.45:.011+r*.45;return Math.min(.022,rise<0?arc*.75:arc);
}
// Ballistic height above the straight takeoff→landing line. Upward leaps peak
// late (they must clear the higher lip); downward drops peak soon after takeoff.
export function flightHeight(progress,arc,direction='up',style='jump'){
 const p=Math.max(0,Math.min(1,Number(progress)||0));if(style==='stride')return Math.sin(p*Math.PI)*arc;
 return Math.sin(Math.PI*p**(direction==='down'?.65:1.25))*arc;
}
// Mostly constant horizontal speed with a little ease: no hovering at either end.
export function flightTravel(progress,style='jump'){const p=Math.max(0,Math.min(1,Number(progress)||0));return style==='stride'?p:p*.82+p*p*(3-2*p)*.18;}

// A single painted standing pose cannot convincingly articulate a vertical
// jump. Render a brief departure/arrival dissolve at supported endpoints while
// the existing traversal continues to own routing, reservations and persistence.
// Flat paths and low lips never fade.
export function traversalPresentation(cat){
 const move=cat.traverse;
 if(!move||move.style==='stride')return {point:cat,opacity:1,transition:false};
 const p=Math.max(0,Math.min(1,Number(move.progress)||0)),ease=p*p*(3-2*p);
 if(move.phase==='crouch')return {point:move.from,opacity:1-ease,transition:true};
 if(move.phase==='land')return {point:move.to,opacity:ease,transition:true};
 return {point:move.jumpProgress>=.5?move.to:move.from,opacity:0,transition:true};
}

export function prepareSurfacePath(from,path){
 if(prepared.has(path))return path;
 const result=[];let a=from;
 for(const b of path){
  const length=distance(a,b),spans=length>.00001?surfaceSpans(a,b):[];
  for(let i=1;i<spans.length;i++){
   const before=spans[i-1],after=spans[i];
   if(!before.id||!after.id||before.id===after.id||before.id==='lower-platform'||after.id==='lower-platform')continue;
   const edge=before.end,lead=Math.min(.011/length,(edge-before.start)*.42),trail=Math.min(.014/length,(after.end-edge)*.42);
   const takeoff=pointAt(a,b,edge-lead),landing=pointAt(a,b,edge+trail);
   if(!segmentWalkable(takeoff,landing))continue;
   const rise=(heights.get(after.id)||0)-(heights.get(before.id)||0),style=traversalStyle(rise);
   result.push({...takeoff,jump:{to:landing,fromSurface:before.id,toSurface:after.id,direction:rise>=0?'up':'down',style,arc:traversalArc(rise,style)}});
  }
  result.push({x:b.x,y:b.y});a=b;
 }
 prepared.add(result);return result;
}

export function sameSurface(a,b){return surfaceAt(a)?.id===surfaceAt(b)?.id;}

// Persistence never stores an in-flight pose. A step jump resumes from the
// nearer supported endpoint; platform descent retains its established policy.
export function supportedTraversalPoint(cat){
 const move=cat.traverse;if(!move)return {x:cat.x,y:cat.y};
 if(move.kind==='surface')return move.phase==='land'||move.jumpProgress>=.5?move.to:move.from;
 return move.direction==='up'?move.from:move.to;
}
