import {deformCatPoint,inverseCatPoint} from './morphology.js';
import {quadrupedContacts,leapPose,bodyTransform,LEG_IDS} from './quadruped.js';
import {needsExtraRearLeg,rearLegTargets} from './hind-leg.js';

// Keep the complete painted silhouette. The away artwork has only the two
// near-side legs: its two off-side legs reuse this same coat's painted limbs,
// drawn behind the intact torso. They never become opaque procedural tubes.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const rigs=new WeakMap(),meshes=new WeakMap(),settling=new WeakMap(),limbs=new WeakMap();
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
function uv(frame,p){
 const m=frame.sourceMapping||{x:0,y:0,width:1,height:1};
 const q=frame.rigMorph?inverseCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;
 return {x:(q.x-m.x)/m.width,y:(q.y-m.y)/m.height};
}
function local(frame,q,cw,ch){
 const m=frame.sourceMapping||{x:0,y:0,width:1,height:1},p={x:m.x+q[0]*m.width,y:m.y+q[1]*m.height};
 const d=frame.rigMorph?deformCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;
 return {x:(d.x-frame.anchor.x)*cw,y:(d.y-frame.anchor.y)*ch};
}
export function paintedRig(frame,presetId){
 let rig=rigs.get(frame.image);if(rig)return rig;
 const away=frame.index===4,source=frame.rigSource||frame;
 const g=source.image.getContext('2d',{willReadFrequently:true}),{data,width,height}=g.getImageData(0,0,source.image.width,source.image.height);
 let mass=0,sum=0,bottom=0;
 // Measure the actual lowest painted paw in its own source coordinates.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const a=data[(y*width+x)*4+3];if(a<90)continue;
  const q=uv(source,{x:source.bounds[0]+x/source.cellWidth,y:source.bounds[1]+y/source.cellHeight});
  if(q.y<.9||q.x<(away?.35:.12)||q.x>(away?.9:.65))continue;
  sum+=q.x*a;mass+=a;bottom=Math.max(bottom,q.y);
 }
 const px=mass?sum/mass:away?.65:.34,py=bottom||.97;
 const points=away?[
  [[.28,.43],[.25,.65]],[[.38,.42],[.37,.63]],
  [[px-.075,py-.30],[px,py]],[[px+.015,py-.34],[px+.095,py-.065]],
 ]:[
  [[px+.085,py-.205],[px,py]],[[px-.035,py-.255],[px-.07,py-.13]],
  [[.75,.55],[.74,.73]],[[.67,.52],[.64,.68]],
 ];
 const missingFar=away&&needsExtraRearLeg(presetId);
 if(missingFar)points[1]=[[.20,.42],[.14,.60]];
 if(away&&!missingFar){const far=rearLegTargets({x:px,y:py},presetId).far;points[3]=[far.hip,far.paw];}
 rig={legs:points.map(([hip,paw],i)=>({id:LEG_IDS[i],hip,paw,far:i%2===1,extra:missingFar&&i%2===1,hidden:!away&&i===3}))};
 rigs.set(frame.image,rig);return rig;
}
export function paintedLimbWeight(q,leg){
 if(leg.hidden||leg.extra)return 0;
 const [hx,hy]=leg.hip,[px,py]=leg.paw;
 const u=clamp((q.y-hy)/(py-hy)),center=hx+(px-hx)*u;
 // The paw stays a single painted shape; weight is flat across its width.
 const side=1-smooth((Math.abs(q.x-center)-.037)/.055);
 return smooth((q.y-hy)/(py-hy)*1.15)*side;
}
function farLimbLayers(frame,rig,atlas){
 let layers=limbs.get(frame.image);if(layers)return layers;
 layers=rig.legs.map((leg,index)=>{
  if(!leg.extra)return null;
  const sourceFrame=index===1?atlas.frames[0]:frame,sourceRig=index===1?paintedRig(sourceFrame,atlas.presetId):rig;
  const near=sourceRig.legs[index===1?0:2],surface=document.createElement('canvas');surface.width=sourceFrame.image.width;surface.height=sourceFrame.image.height;
  const g=surface.getContext('2d',{willReadFrequently:true}),pixels=sourceFrame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,surface.width,surface.height);
  const [hx,hy]=near.hip,[px,py]=near.paw;
  for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++){
   const q=uv(sourceFrame,{x:sourceFrame.bounds[0]+(x+.5)/sourceFrame.cellWidth,y:sourceFrame.bounds[1]+(y+.5)/sourceFrame.cellHeight});
   const t=clamp((q.y-hy)/(py-hy)),center=hx+(px-hx)*t,half=index===3?.082:.075;
   const mask=clamp((half-Math.abs(q.x-center))/.012)*smooth((q.y-hy+.07)/.045)*clamp((py+.04-q.y)/.015);
   const i=(y*surface.width+x)*4;pixels.data[i+3]*=mask;
   // The far pair stays in the body's soft shade, including custom pigment.
   pixels.data[i]*=.88;pixels.data[i+1]*=.88;pixels.data[i+2]*=.9;
  }
  g.putImageData(pixels,0,0);return {image:surface,source:near,frame:sourceFrame};
 });limbs.set(frame.image,layers);return layers;
}
function drawFarLimbs(ctx,frame,rig,body,feet,cw,ch,atlas,width){
 for(const [i,layer]of farLimbLayers(frame,rig,atlas).entries()){
  if(!layer)continue;
  const sf=layer.frame,scw=width/atlas.referenceWidth*(sf.scale||1),sch=scw*sf.cellHeight/sf.cellWidth;
  const sourceHip=local(sf,layer.source.hip,scw,sch),sourcePaw=local(sf,layer.source.paw,scw,sch);
  const hip=body.apply(local(frame,rig.legs[i].hip,cw,ch)),paw=feet[i];
  const sourceAngle=Math.atan2(sourcePaw.y-sourceHip.y,sourcePaw.x-sourceHip.x),angle=Math.atan2(paw.y-hip.y,paw.x-hip.x)-sourceAngle;
  // Rotate the whole original painted limb; don't stretch a sliced paw.
  const restHip=local(frame,rig.legs[i].hip,cw,ch),restPaw=local(frame,rig.legs[i].paw,cw,ch),scale=Math.hypot(restPaw.x-restHip.x,restPaw.y-restHip.y)/Math.hypot(sourcePaw.x-sourceHip.x,sourcePaw.y-sourceHip.y);
  ctx.save();ctx.translate(hip.x,hip.y);ctx.rotate(clamp(angle,-.6,.6));ctx.scale(scale,scale);ctx.translate(-sourceHip.x,-sourceHip.y);ctx.drawImage(layer.image,(sf.bounds[0]-sf.anchor.x)*scw,(sf.bounds[1]-sf.anchor.y)*sch,sf.bounds[2]*scw,sf.bounds[3]*sch);ctx.restore();
 }
}
function meshFor(frame,rig){
 let mesh=meshes.get(frame.image);if(mesh)return mesh;
 const columns=16,rows=20,vertices=[],b=frame.bounds;
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
  const p={x:b[0]+x/columns*b[2],y:b[1]+y/rows*b[3]},q=uv(frame,p);
  const weights=rig.legs.map(l=>paintedLimbWeight(q,l)),sum=weights.reduce((a,b)=>a+b,0);
  if(sum>1)for(let i=0;i<4;i++)weights[i]/=sum;
  vertices.push({source:{x:x/columns*frame.image.width,y:y/rows*frame.image.height},u:x/columns,v:y/rows,q,weights});
 }
 const {data,width,height}=frame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.image.width,frame.image.height),occupied=new Set();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>1)occupied.add(Math.floor(y/height*rows)*columns+Math.floor(x/width*columns));
 const cells=[];for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(occupied.has(y*columns+x))cells.push([x,y]);
 mesh={columns,vertices,cells};meshes.set(frame.image,mesh);return mesh;
}
export function constrainPaintedStep(delta,width,airborne=false){
 const max=width*(airborne?.105:.065),length=Math.hypot(delta.x,delta.y),k=length>max?max/length:1;
 return {x:delta.x*k,y:delta.y*k};
}
export function drawPaintedGait(ctx,frame,atlas,width,action,time,options,triangle){
 const rig=paintedRig(frame,atlas.presetId),cw=width/atlas.referenceWidth*(frame.scale||1),ch=cw*frame.cellHeight/frame.cellWidth,b=frame.bounds;
 const left=(b[0]-frame.anchor.x)*cw,top=(b[1]-frame.anchor.y)*ch,w=b[2]*cw,h=b[3]*ch;
 const pose=leapPose(options.motionStage,options.stageProgress,options.traverse,width);
 if(options.reducedMotion){pose.pitch*=.5;pose.drop*=.5;pose.sx=1+(pose.sx-1)*.5;pose.sy=1+(pose.sy-1)*.5}
 const body=bodyTransform(frame,rig,pose,cw,ch),anchors=rig.legs.map(l=>local(frame,l.paw,cw,ch));
 const contacts=quadrupedContacts(frame,atlas,width,action,options,rig);
 let deltas=contacts.map((f,i)=>{
  if(action==='idle'&&!options.motionStage)return {x:0,y:0};
  const a=body.apply(anchors[i]);return constrainPaintedStep({x:f.x-a.x,y:f.y-a.y},width,pose.airborne);
 });
 // Ease back to the original standing paws rather than snapping when arriving.
 const key=options.locomotion?.key;
 if(key){const prev=settling.get(key),dt=prev?Math.max(0,Math.min(.1,time-prev.time)):.1;
  if(prev?.bank===frame.index&&action==='idle')deltas=deltas.map((d,i)=>({x:prev.deltas[i].x*Math.exp(-dt*14),y:prev.deltas[i].y*Math.exp(-dt*14)}));
  settling.set(key,{bank:frame.index,time,deltas});
 }
 const feet=contacts.map((f,i)=>{const a=body.apply(anchors[i]),d=deltas[i];return {...f,x:a.x+d.x,y:a.y+d.y,groundX:a.x+d.x,groundY:a.y+d.y+(f.planted?0:f.lift*width)}});
 options.drawContactShadows?.(ctx,feet.filter((_,i)=>!rig.legs[i].hidden));
 if(frame.index===4)drawFarLimbs(ctx,frame,rig,body,feet,cw,ch,atlas,width);
 if(action==='idle'&&!options.motionStage&&deltas.every(d=>Math.hypot(d.x,d.y)<.02)){
  ctx.drawImage(frame.image,left,top,w,h);return {left,top,width:w,height:h,contacts:feet};
 }
 const {columns,vertices,cells}=meshFor(frame,rig),points=vertices.map(v=>{
  const target=body.apply({x:left+v.u*w,y:top+v.v*h});
  for(let i=0;i<4;i++){target.x+=deltas[i].x*v.weights[i];target.y+=deltas[i].y*v.weights[i]}
  return {source:v.source,target};
 });
 for(const [x,y] of cells){const a=y*(columns+1)+x;for(const ids of [[a,a+1,a+columns+1],[a+1,a+columns+2,a+columns+1]])triangle(ctx,frame.image,ids.map(i=>points[i].source),ids.map(i=>points[i].target))}
 const xs=points.map(p=>p.target.x),ys=points.map(p=>p.target.y),minX=Math.min(...xs),minY=Math.min(...ys);
 return {left:minX,top:minY,width:Math.max(...xs)-minX,height:Math.max(...ys)-minY,contacts:feet};
}
