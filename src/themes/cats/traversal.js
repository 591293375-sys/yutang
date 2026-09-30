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
   const rise=(heights.get(after.id)||0)-(heights.get(before.id)||0);
   result.push({...takeoff,jump:{to:landing,fromSurface:before.id,toSurface:after.id,direction:rise>=0?'up':'down',arc:Math.min(.035,.019+Math.abs(rise)*.6)}});
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
