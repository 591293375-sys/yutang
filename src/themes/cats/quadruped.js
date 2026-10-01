import {deformCatPoint,inverseCatPoint} from './morphology.js';
import {CAT_BODY_CONTOURS} from './quadruped-contours.js';
// One four-limb locomotion model, shared by every coat. Feet are planted in
// physical scene coordinates; no timer or speed multiplier can slide a stance.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n)};
export const LEG_IDS=Object.freeze(['front-near','front-far','hind-near','hind-far']);
export const SUPPORT_DUTY=.72;
const PHASES=[0,.5,.25,.75];
export function quadrupedCycle(distanceCycles,index){
 const full=distanceCycles+PHASES[index],cycle=Math.floor(full),phase=full-cycle;
 if(phase<SUPPORT_DUTY)return {phase,cycle,planted:true,travel:SUPPORT_DUTY*.5-phase,lift:0};
 const t=(phase-SUPPORT_DUTY)/(1-SUPPORT_DUTY);
 return {phase,cycle,planted:false,travel:SUPPORT_DUTY*(smooth(t)-.5),lift:Math.sin(t*Math.PI)**1.4};
}
export class QuadrupedFooting{
 constructor(){this.feet=[];this.origin=null;this.distance=null}
 reset(){this.feet=[];this.origin=null;this.distance=null}
 sample({origin,direction,distance=0,stride,anchors,hips=null,reach=null,moving=true,airborne=false}){
  const length=Math.hypot(direction.x,direction.y)||1,dir={x:direction.x/length,y:direction.y/length};
  stride=Math.max(.001,stride);
  if(this.origin&&Math.hypot(origin.x-this.origin.x,origin.y-this.origin.y)>stride*2||this.distance!==null&&distance<this.distance-.001)this.reset();
  const result=anchors.map((anchor,index)=>{
   const phase=quadrupedCycle(distance/stride,index),prior=this.feet[index];
   let worldX=origin.x+anchor.x+dir.x*phase.travel*stride,worldY=origin.y+anchor.y+dir.y*phase.travel*stride;
   if((phase.planted||!moving)&&prior?.planted&&prior.cycle===phase.cycle&&!airborne){worldX=prior.worldX;worldY=prior.worldY}
   if(!moving&&!prior){worldX=origin.x+anchor.x;worldY=origin.y+anchor.y}
   let replant=false;
   if(hips&&reach){const h={x:origin.x+hips[index].x,y:origin.y+hips[index].y},dx=worldX-h.x,dy=worldY-h.y,d=Math.hypot(dx,dy),max=reach[index];if(d>max){worldX=h.x+dx/d*max;worldY=h.y+dy/d*max;replant=true}}
   const foot={id:LEG_IDS[index],worldX,worldY,groundX:worldX-origin.x,groundY:worldY-origin.y,cycle:phase.cycle,phase:phase.phase,planted:!airborne&&!replant&&(phase.planted||!moving),replant,lift:airborne?.07:Math.max(replant?.028:0,phase.lift*(moving?.039:0))};
   return foot;
  });
  this.feet=result;this.origin={...origin};this.distance=distance;return result;
 }
}

// Checked source anatomy in each pose's authored source-rectangle coordinates.
// Lower limbs are removed from the body, then all FOUR are drawn independently.
// Use each coat's original alpha silhouettes. Rear thighs come from the rear
// portrait so their hocks retain the painted anatomy rather than a generic tube.
const ANATOMY={
 ragdoll:[[.40,.76,.28,.98],[.71,.53,.70,.77]],
 'british-shorthair':[[.43,.75,.32,.98],[.78,.48,.78,.73]],
 chinchilla:[[.40,.74,.25,.97],[.73,.51,.73,.77]],
 'american-shorthair':[[.42,.75,.30,.97],[.75,.50,.75,.78]],
 siamese:[[.40,.70,.29,.97],[.78,.52,.78,.75]],
 'domestic-orange-white':[[.40,.74,.27,.97],[.76,.47,.76,.70]],
 'maine-coon':[[.37,.75,.24,.97],[.65,.50,.66,.73]],
 'domestic-tabby':[[.36,.76,.26,.97],[.65,.49,.65,.74]],
 'russian-blue':[[.41,.72,.30,.97],[.75,.44,.75,.68]],
 'norwegian-forest':[[.31,.73,.17,.96],[.80,.50,.80,.73]],
 'domestic-tuxedo':[[.40,.74,.24,.97],[.74,.47,.74,.72]],
 'domestic-calico':[[.36,.72,.22,.97],[.73,.46,.73,.71]],
 persian:[[.29,.76,.19,.97],[.67,.57,.67,.81]],
 'exotic-shorthair':[[.41,.75,.29,.97],[.69,.47,.70,.72]],
 bengal:[[.44,.70,.35,.96],[.74,.45,.74,.69]],
 abyssinian:[[.41,.72,.30,.96],[.74,.50,.74,.76]],
};
// Painted lower-foreleg width (fraction of the common atlas cell), measured
// perpendicular to the checked foreleg bone at 55–85% of its length. Drawing
// limbs at the coat's own thickness keeps cobby breeds from walking on stilts.
export const LEG_WIDTHS=Object.freeze({
 ragdoll:.097,'british-shorthair':.123,chinchilla:.113,'american-shorthair':.102,siamese:.099,'domestic-orange-white':.115,
 'maine-coon':.109,'domestic-tabby':.094,'russian-blue':.085,'norwegian-forest':.092,'domestic-tuxedo':.08,'domestic-calico':.092,
 persian:.122,'exotic-shorthair':.123,bengal:.097,abyssinian:.084,
});
export function legRadius(presetId){return clamp((LEG_WIDTHS[presetId]??.1)*.545,.04,.07)}
// In a three-quarter view the far (off-side) limbs sit up-screen of the near
// ones, toward the head for a cat walking at the viewer: the far foreleg shows
// beneath the cheek, the far hind leg beneath the belly, never mid-torso.
export const FAR_LIMB_OFFSETS=Object.freeze({front:Object.freeze({hip:[-.045,-.055],paw:[-.075,-.095]}),hind:Object.freeze({hip:[-.05,-.05],paw:[-.07,-.065]})});
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function shadeSkin(skin,amount=.82){
 // The off-side limbs are in the body's shadow; bake that once per material.
 const c=canvas(skin.image.width,skin.image.height),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(skin.image,0,0);
 const pixels=g.getImageData(0,0,c.width,c.height);for(let i=0;i<pixels.data.length;i+=4){pixels.data[i]*=amount;pixels.data[i+1]*=amount;pixels.data[i+2]*=amount*1.02}
 g.putImageData(pixels,0,0);return {...skin,image:c,shaded:amount};
}
const materialCache=new WeakMap();
function sourcePixel(frame,q){const m=frame.sourceMapping||{x:0,y:0,width:1,height:1};return{x:(m.x+q.x*m.width-frame.bounds[0])*frame.cellWidth,y:(m.y+q.y*m.height-frame.bounds[1])*frame.cellHeight}}
function sourceUV(frame,x,y){const m=frame.sourceMapping||{x:0,y:0,width:1,height:1},p={x:frame.bounds[0]+x/frame.cellWidth,y:frame.bounds[1]+y/frame.cellHeight},q=frame.rigMorph?inverseCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;return{x:(q.x-m.x)/m.width,y:(q.y-m.y)/m.height}}
export function bodyContourAt(points,x){
 if(x<=points[0][0])return points[0][1];if(x>=points.at(-1)[0])return points.at(-1)[1];
 const i=points.findIndex((p,j)=>j&&x<=p[0])-1,a=points[i],b=points[i+1],before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+2)],span=b[0]-a[0],t=(x-a[0])/span,t2=t*t,t3=t2*t;
 const ma=(b[1]-before[1])/(b[0]-before[0]),mb=(after[1]-a[1])/(after[0]-a[0]);
 return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*ma*span+(-2*t3+3*t2)*b[1]+(t3-t2)*mb*span;
}
function extract(frame,bone){
 // Keep the actual painted alpha, fur edge, ankle and paw. The old material
 // sampled RGB into an opaque capsule, which made every cat walk on tubes.
 const [hx,hy,fx,fy]=bone,pad=.085;
 const rect={x:Math.max(0,Math.min(hx,fx)-pad),y:hy-.035,
  width:Math.abs(fx-hx)+pad*2,height:fy-hy+.065};
 const m=frame.sourceMapping||{x:0,y:0,width:1,height:1};
 const c=canvas(Math.ceil(rect.width*m.width*frame.cellWidth),Math.ceil(rect.height*m.height*frame.cellHeight));
 const g=c.getContext('2d',{willReadFrequently:true}),origin=sourcePixel(frame,rect);
 g.drawImage(frame.image,-origin.x,-origin.y);
 const pixels=g.getImageData(0,0,c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  const qx=rect.x+x/(m.width*frame.cellWidth),qy=rect.y+y/(m.height*frame.cellHeight);
  const t=clamp((qy-hy)/(fy-hy)),center=hx+(fx-hx)*t;
  // Soft isolation only removes neighbouring anatomy, never fills transparent
  // pixels or draws an invented paw. The hidden upper overlap joins the torso.
  const mask=clamp((pad-Math.abs(qx-center))/.018)*clamp((qy-rect.y)/.018);
  pixels.data[(y*c.width+x)*4+3]*=mask;
 }
 g.putImageData(pixels,0,0);return {image:c,frame,bone,rect};
}
function rearPaw(frame){
 const {data,width,height}=frame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.image.width,frame.image.height);
 let sum=0,xsum=0,bottom=.95;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const alpha=data[(y*width+x)*4+3],q=sourceUV(frame,x+.5,y+.5);
  if(alpha<90||q.y<.88||q.y>1.02||q.x<.35||q.x>.86)continue;
  sum+=alpha;xsum+=q.x*alpha;bottom=Math.max(bottom,q.y);
 }
 return {x:sum?xsum/sum:.64,y:Math.min(.99,bottom)};
}
export function prepareQuadruped(frame,atlas){
 let entry=materialCache.get(frame.image);if(entry?.revision===(frame.materialRevision||0))return entry;
 if(!frame.image.getContext||typeof document==='undefined')return null;
 const source=(atlas.frames?.[0]||frame).rigSource||atlas.frames?.[0]||frame,bones=ANATOMY[atlas.presetId]||ANATOMY.ragdoll,away=frame.index===4;
 const contour=(CAT_BODY_CONTOURS[atlas.presetId]||CAT_BODY_CONTOURS.ragdoll)[away?4:0];
 const body=canvas(frame.image.width,frame.image.height),g=body.getContext('2d',{willReadFrequently:true});g.drawImage(frame.image,0,0);const pixels=g.getImageData(0,0,body.width,body.height);
 for(let y=0;y<body.height;y++)for(let x=0;x<body.width;x++){
  if(!pixels.data[(y*body.width+x)*4+3])continue;
  const q=sourceUV(frame,x+.5,y+.5),edge=bodyContourAt(contour,q.x),fur=(Math.sin(q.x*173)+Math.sin(q.x*317))*.0015;
  // A single natural underside contour, with a fur-width alpha feather. There
  // are no independent x/y cuts that could leave rectangular holes at a hip.
  pixels.data[(y*body.width+x)*4+3]*=clamp((edge+fur+.009-q.y)/.018);
 }
 g.putImageData(pixels,0,0);
 const back=frame.rigSource||frame,paw=away?rearPaw(back):null;
 const rearBone=away?[paw.x-.055,paw.y-.29,paw.x,paw.y]:bones[1];
 const front=extract(source,bones[0]),hind={...extract(away?back:source,rearBone),rear:away},skins=[front,shadeSkin(front),hind,shadeSkin(hind)];
 const [fhx,fhy,ffx,ffy]=bones[0],[hhx,hhy,hfx,hfy]=bones[1],far=FAR_LIMB_OFFSETS;
 const targets=away?[
  {hip:[.32,.50],paw:[.28,.70]},{hip:[.23,.43],paw:[.19,.61]},
  {hip:[rearBone[0],rearBone[1]],paw:[paw.x,paw.y]},{hip:[rearBone[0]-.09,rearBone[1]-.045],paw:[paw.x-.13,paw.y-.075]},
 ]:[
  {hip:[fhx,fhy],paw:[ffx,ffy]}, {hip:[fhx+far.front.hip[0],fhy+far.front.hip[1]],paw:[ffx+far.front.paw[0],ffy+far.front.paw[1]]},
  {hip:[hhx,hhy],paw:[hfx,hfy]}, {hip:[hhx+far.hind.hip[0],hhy+far.hind.hip[1]],paw:[hfx+far.hind.paw[0],hfy+far.hind.paw[1]]},
 ];
 entry={body,radius:legRadius(atlas.presetId),legs:targets.map((target,i)=>({id:LEG_IDS[i],skin:skins[i],...target,hip:[target.hip[0],Math.min(target.hip[1],bodyContourAt(contour,target.hip[0])-.035)],far:i%2===1})),revision:frame.materialRevision||0};materialCache.set(frame.image,entry);return entry;
}

const footingCache=new WeakMap();
function local(frame,q,cellWidth,cellHeight){const m=frame.sourceMapping||{x:0,y:0,width:1,height:1},p={x:m.x+q[0]*m.width,y:m.y+q[1]*m.height},target=frame.rigMorph?deformCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;return {x:(target.x-frame.anchor.x)*cellWidth,y:(target.y-frame.anchor.y)*cellHeight}}
const lerp=(a,b,t)=>a+(b-a)*t;
// A gathered leap on the shared four-limb rig, keyed through the flight:
// [progress, pitch (+ raises the head), body sx, body sy, fore {forward, lift},
//  hind {forward, lift}]. Distances are fractions of the drawn cat width.
// Up: haunches drive, forelegs tuck, then reach for the higher lip.
// Down: forelegs reach for the lower surface while the hind legs trail.
export const LEAP_KEYS=Object.freeze({
 up:Object.freeze([[0,.06,1.02,.96,0,0,0,0],[.16,.2,.96,1.06,-.01,.11,-.11,0],[.42,.12,1.04,.98,.06,.07,-.08,.05],[.72,0,1.03,.99,.07,.015,-.02,.08],[1,-.05,1,1,.015,0,.02,.06]]),
 down:Object.freeze([[0,-.05,1.02,.96,0,0,0,0],[.16,-.02,.97,1.04,-.01,.09,-.09,0],[.42,-.12,1.04,.98,.08,.02,-.07,.07],[.72,-.15,1.03,.99,.06,-.01,-.03,.08],[1,-.1,1,1,.015,0,0,.07]]),
});
function leapKey(direction,p){const keys=LEAP_KEYS[direction==='down'?'down':'up'];let i=0;while(i<keys.length-2&&p>keys[i+1][0])i++;const a=keys[i],b=keys[i+1],t=smooth((p-a[0])/(b[0]-a[0]));return a.map((v,k)=>lerp(v,b[k],t))}
export function leapPose(stage,progress=0,traverse=null,width=100){
 const pose={drop:0,pitch:0,sx:1,sy:1,airborne:false,legs:LEG_IDS.map(()=>({f:0,u:0,free:false}))};
 if(!['crouch','jump','land'].includes(stage)||traverse?.style==='stride')return pose;
 const p=clamp(progress),style=traverse?.style||(traverse?.kind==='climb'?'climb':'jump'),k=style==='hop'?.55:style==='climb'?1.2:1,down=traverse?.direction==='down';
 if(stage==='crouch'){
  // Load the haunches: the body sinks and squashes over planted paws.
  const e=smooth(p);Object.assign(pose,{drop:width*.05*k*e,pitch:(down?-.05:.045)*k*e,sx:1+.035*k*e,sy:1-.06*k*e});return pose;
 }
 if(stage==='jump'){
  const [,pitch,sx,sy,ff,fu,hf,hu]=leapKey(down?'down':'up',p);
  // The first sixth of the flight is the push-off: the loaded body unfolds
  // from the crouch instead of popping straight to full height.
  Object.assign(pose,{airborne:true,drop:width*.05*k*(1-smooth(p/.16)),pitch:pitch*k,sx:1+(sx-1)*k,sy:1+(sy-1)*k});
  // The off-side pair follows slightly behind, so the limbs never move as one block.
  pose.legs=LEG_IDS.map((_,i)=>{const front=i<2,lag=i%2?.88:1;return {f:(front?ff:hf)*k*lag,u:(front?fu:hu)*k*lag,free:true}});
  return pose;
 }
 // Landing: forepaws take the weight first, the body absorbs, hind paws follow.
 const bounce=Math.sin(p*Math.PI),settle=1-smooth(p),hind=1-smooth(p/.5);
 Object.assign(pose,{drop:width*.042*k*bounce,pitch:(down?-.1:-.05)*k*settle,sx:1+.03*k*bounce,sy:1-.05*k*bounce});
 pose.legs=LEG_IDS.map((_,i)=>i<2?{f:0,u:0,free:false}:{f:.02*k*hind,u:(down?.07:.06)*k*hind,free:hind>.02});
 return pose;
}
// Reduced motion keeps the same story (gather, leap, land) with half the gesture.
function framePose(options,width){const pose=leapPose(options.motionStage,options.stageProgress,options.traverse,width);if(!options.reducedMotion)return pose;
 return {...pose,drop:pose.drop*.5,pitch:pose.pitch*.5,sx:1+(pose.sx-1)*.5,sy:1+(pose.sy-1)*.5,legs:pose.legs.map(l=>({...l,f:l.f*.6,u:l.u*.6}))};}
export function quadrupedBodyDrop(width,stage,progress=0){return ['crouch','jump','land'].includes(stage)?leapPose(stage,progress,null,width).drop:0}
// Forward axis of each painted direction bank, in left-facing sprite space.
function leapAxes(away){return away?{x:-.55,y:-.83}:{x:-.93,y:.36}}
export function bodyTransform(frame,prepared,pose,cellWidth,cellHeight){
 const a=local(frame,prepared.legs[0].hip,cellWidth,cellHeight),b=local(frame,prepared.legs[2].hip,cellWidth,cellHeight);
 const pivot={x:(a.x+b.x)/2,y:(a.y+b.y)/2},pitch=pose.pitch*(frame.index===4?.5:1),cos=Math.cos(pitch),sin=Math.sin(pitch),sx=pose.sx,sy=pose.sy,drop=pose.drop;
 return {pivot,pitch,sx,sy,drop,
  apply(p){const x=(p.x-pivot.x)*sx,y=(p.y-pivot.y)*sy;return {x:pivot.x+x*cos-y*sin,y:pivot.y+x*sin+y*cos+drop}},
  canvas(ctx){ctx.translate(pivot.x,pivot.y+drop);ctx.rotate(pitch);ctx.scale(sx,sy);ctx.translate(-pivot.x,-pivot.y)}};
}
export function quadrupedContacts(frame,atlas,width,action,options={},prepared=prepareQuadruped(frame,atlas)){
 if(!prepared)return [];
 const cellWidth=width/atlas.referenceWidth*(frame.scale||1),cellHeight=cellWidth*frame.cellHeight/frame.cellWidth,flip=options.flip||1,loc=options.locomotion,scale=options.worldScale||1;
 const pose=framePose(options,width),body=bodyTransform(frame,prepared,pose,cellWidth,cellHeight),forward=leapAxes(frame.index===4);
 const anchors=prepared.legs.map(leg=>local(frame,leg.paw,cellWidth,cellHeight)),moving=action.startsWith('walk'),airborne=pose.airborne||options.motionStage==='jump';
 const hips=prepared.legs.map(leg=>body.apply(local(frame,leg.hip,cellWidth,cellHeight)));
 let feet;
 if(loc?.key&&Number.isFinite(loc.origin?.x)&&Number.isFinite(loc.origin?.y)){
  let state=footingCache.get(loc.key),bank=`${frame.index}:${flip}`;
  if(!state||state.bank!==bank){state={bank,planner:new QuadrupedFooting(),turnDistance:state?loc.distance:null,epoch:(state?.epoch||0)+1};footingCache.set(loc.key,state)}
  const replant=state.turnDistance!==null&&loc.distance-state.turnDistance<loc.stride*.25;
  const worldHips=hips.map(h=>({x:h.x*flip/scale,y:h.y/scale})),reach=hips.map((h,i)=>Math.hypot(h.x-anchors[i].x,h.y-anchors[i].y)*1.28/scale);
  feet=state.planner.sample({origin:loc.origin,direction:loc.direction,distance:loc.distance,stride:loc.stride,anchors:anchors.map(a=>({x:a.x*flip/scale,y:a.y/scale})),hips:worldHips,reach,moving,airborne}).map(f=>({...f,cycle:state.epoch+':'+f.cycle,replant:f.replant||replant,planted:f.planted&&!replant,groundX:f.groundX*scale*flip,groundY:f.groundY*scale}));
 }else{
  const away=frame.index===4,direction=options.direction||{x:away?.84:-.84,y:away?-.54:.54},stride=width*.22;
  feet=anchors.map((a,i)=>{const cycle=quadrupedCycle(options.gaitPhase||0,i),travel=moving?cycle.travel*stride:0;return{id:LEG_IDS[i],groundX:a.x+direction.x*travel,groundY:a.y+direction.y*travel,planted:!airborne&&(!moving||cycle.planted),lift:airborne?.07:moving?cycle.lift*.039:0,phase:cycle.phase,cycle:cycle.cycle}});
 }
 return feet.map((foot,i)=>{
  const leg=pose.legs[i],far=prepared.legs[i].far;
  if(!leg.free)return {...foot,x:foot.groundX,y:foot.groundY-foot.lift*width,hip:hips[i],far};
  // Airborne paws follow the body; a landing hind paw keeps its ground spot.
  const base=airborne?body.apply(anchors[i]):{x:foot.groundX,y:foot.groundY},x=base.x+forward.x*leg.f*width,y=base.y+forward.y*leg.f*width;
  return {...foot,planted:false,lift:leg.u,groundX:x,groundY:airborne?anchors[i].y:foot.groundY,x,y:y-leg.u*width,hip:hips[i],far};
 });
}
export function limbKnee(hip,paw,restLength,bendSign=1){
 const dx=paw.x-hip.x,dy=paw.y-hip.y,d=Math.hypot(dx,dy)||.0001,length=restLength*.66,along=d*.5,reach=Math.min(restLength*.18,Math.sqrt(Math.max(0,length*length-along*along)));
 return {x:hip.x+dx*.5-dy/d*reach*bendSign,y:hip.y+dy*.5+dx/d*reach*bendSign};
}
function drawLimb(ctx,leg,foot,frame,width,cellWidth,cellHeight){
 const skin=leg.skin,root=foot.hip,rest=local(frame,leg.hip,cellWidth,cellHeight),target=local(frame,leg.paw,cellWidth,cellHeight);
 const [hx,hy,fx,fy]=skin.bone,r=skin.rect,span=fy-hy,m=frame.sourceMapping||{width:1,height:1};
 const knee=limbKnee(root,foot,Math.hypot(target.x-rest.x,target.y-rest.y),leg.id.startsWith('front')?-1:1);

 const targetLength=Math.hypot(target.x-rest.x,target.y-rest.y);
 const sourceLength=Math.hypot((fx-hx)*m.width*cellWidth,(fy-hy)*m.height*cellHeight);
 // Fur width is tied to the original anatomy, not the changing bounding box of
 // a bent leg. The paw itself stays rigid and only the long segments articulate.
 const breadth=Math.min(1.1,Math.max(.75,targetLength/sourceLength))*(leg.far?.93:1);
 const path=t=>{
  let u=clamp(t);
  // A raised rear sole rolls down as it takes weight: foreshorten only the
  // lower paw, leaving the ankle and fur silhouette intact. On swing it opens.
  if(skin.rear&&u>.5){const weight=foot.planted?1:clamp(1-foot.lift/.039);u+=.13*Math.sin((u-.5)*Math.PI*2)*weight}
  const e=smooth(u),base={x:rest.x+(target.x-rest.x)*u,y:rest.y+(target.y-rest.y)*u};
  const bow=Math.sin(Math.PI*u)**2;
  return {x:base.x+(root.x-rest.x)*(1-e)+(foot.x-target.x)*e+(knee.x-(root.x+foot.x)/2)*bow*.65,
   y:base.y+(root.y-rest.y)*(1-e)+(foot.y-target.y)*e+(knee.y-(root.y+foot.y)/2)*bow*.65};
 };
 const bands=14;
 for(let i=0;i<bands;i++){
  const sy=i*skin.image.height/bands,sh=skin.image.height/bands;
  const t0=(r.y+sy/skin.image.height*r.height-hy)/span,t1=(r.y+(sy+sh)/skin.image.height*r.height-hy)/span;
  const a=path(t0),b=path(t1),center0=hx+(fx-hx)*clamp(t0),center1=hx+(fx-hx)*clamp(t1);
  // Extrapolate the small paw tip beyond its contact landmark without scaling
  // the paw on every step. Source strips carry the unmodified transparent edge.
  if(t0<0)a.y+=t0*targetLength;if(t1<0)b.y+=t1*targetLength;
  if(t0>1)a.y+=(t0-1)*targetLength;if(t1>1)b.y+=(t1-1)*targetLength;
  const w=r.width*m.width*cellWidth*breadth,ax=a.x+(r.x-center0)*m.width*cellWidth*breadth,bx=b.x+(r.x-center1)*m.width*cellWidth*breadth;
  const h=Math.max(.15,b.y-a.y);
  ctx.save();ctx.transform(w/skin.image.width,0,(bx-ax)/sh,h/sh,ax,a.y);
  ctx.drawImage(skin.image,0,sy,skin.image.width,Math.min(sh+.5,skin.image.height-sy),0,0,skin.image.width,Math.min(sh+.5,skin.image.height-sy));ctx.restore();
 }
}
export function drawQuadruped(ctx,frame,atlas,width,action,time,options={}){
 const prepared=prepareQuadruped(frame,atlas);if(!prepared)return null;
 const cellWidth=width/atlas.referenceWidth*(frame.scale||1),cellHeight=cellWidth*frame.cellHeight/frame.cellWidth,b=frame.bounds,left=(b[0]-frame.anchor.x)*cellWidth,top=(b[1]-frame.anchor.y)*cellHeight,w=b[2]*cellWidth,h=b[3]*cellHeight;
 const pose=framePose(options,width),body=bodyTransform(frame,prepared,pose,cellWidth,cellHeight);
 const contacts=quadrupedContacts(frame,atlas,width,action,options,prepared);
 options.drawContactShadows?.(ctx,contacts);
 for(const i of [3,1,2,0])drawLimb(ctx,prepared.legs[i],contacts[i],frame,width,cellWidth,cellHeight,prepared.radius);
 ctx.save();body.canvas(ctx);ctx.drawImage(prepared.body,left,top,w,h);ctx.restore();
 const corners=[[left,top],[left+w,top],[left,top+h],[left+w,top+h]].map(([x,y])=>body.apply({x,y}));
 const leftEdge=Math.min(...corners.map(c=>c.x),...contacts.map(c=>c.x-width*.09)),rightEdge=Math.max(...corners.map(c=>c.x),...contacts.map(c=>c.x+width*.09)),topEdge=Math.min(...corners.map(c=>c.y)),bottom=Math.max(...corners.map(c=>c.y),...contacts.map(c=>c.y+width*.018));
 return {left:leftEdge,top:topEdge,width:rightEdge-leftEdge,height:bottom-topEdge,contacts,drawnActions:LEG_IDS,pose:{pitch:body.pitch,drop:body.drop,airborne:pose.airborne}};
}
