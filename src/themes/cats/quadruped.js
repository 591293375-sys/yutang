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
// Both direction banks take planted paw skin from the same cat's frontal pose,
// avoiding the pink, upturned soles painted in many original rear poses.
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
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
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
 const c=canvas(80,168),g=c.getContext('2d'),pixels=g.createImageData(c.width,c.height),src=frame.image.getContext('2d',{willReadFrequently:true}).getImageData(0,0,frame.image.width,frame.image.height),[hx,hy,fx,fy]=bone;
 const donor=(qx,qy)=>{
  const p=sourcePixel(frame,{x:qx,y:qy}),x=Math.round(p.x),y=Math.round(p.y);let chosen=-1,best=Infinity;
  for(let r=0;r<=12;r+=2){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const px=x+dx,py=y+dy;if(px<0||py<0||px>=src.width||py>=src.height)continue;const i=(py*src.width+px)*4;if(src.data[i+3]<100)continue;const cost=dx*dx+dy*dy;if(cost<best){chosen=i;best=cost}}if(chosen>=0)break}
  return chosen;
 };
 // Normalize fur onto one complete limb silhouette. Transparent gaps in the
 // original occluded leg cannot become holes, spikes or disconnected scraps.
 for(let y=0;y<c.height;y++){
  const t=y/(c.height-1),center=hx+(fx-hx)*Math.min(1,t/.94),qy=hy+(fy-hy)*Math.min(.98,t/.94),half=t<.83?.37-.09*t:.34*Math.sqrt(Math.max(0,1-((t-.83)/.17)**2));
  for(let x=0;x<c.width;x++){
   const u=(x+.5)/c.width-.5,a=clamp((half-Math.abs(u))/.022)*clamp(t/.055);if(!a)continue;
   const i=donor(center+u*.13,qy),j=(y*c.width+x)*4;if(i<0)continue;
   pixels.data[j]=src.data[i];pixels.data[j+1]=src.data[i+1];pixels.data[j+2]=src.data[i+2];pixels.data[j+3]=Math.round(a*255);
  }
 }
 g.putImageData(pixels,0,0);return {image:c,frame,bone,canonical:true};
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
 const front=extract(source,bones[0]),hind=extract(source,bones[1]);
 const [fhx,fhy,ffx,ffy]=bones[0],[hhx,hhy,hfx,hfy]=bones[1];
 const targets=away?[
  {hip:[.33,.50],paw:[.33,.77]},{hip:[.24,.44],paw:[.15,.63]},
  {hip:[.60,.69],paw:[.64,.98]},{hip:[.51,.64],paw:[.46,.92]},
 ]:[
  {hip:[fhx,fhy],paw:[ffx,ffy]}, {hip:[fhx+.13,fhy-.03],paw:[ffx+.24,ffy-.070]},
  {hip:[hhx,hhy],paw:[hfx,hfy]}, {hip:[hhx+.025,hhy-.045],paw:[hfx+.13,hfy-.045]},
 ];
 entry={body,legs:targets.map((target,i)=>({id:LEG_IDS[i],skin:i<2?front:hind,...target,hip:[target.hip[0],Math.min(target.hip[1],bodyContourAt(contour,target.hip[0])-.035)],far:i%2===1})),revision:frame.materialRevision||0};materialCache.set(frame.image,entry);return entry;
}

const footingCache=new WeakMap();
function local(frame,q,cellWidth,cellHeight){const m=frame.sourceMapping||{x:0,y:0,width:1,height:1},p={x:m.x+q[0]*m.width,y:m.y+q[1]*m.height},target=frame.rigMorph?deformCatPoint(p,frame.rigMorph.landmarks,frame.rigMorph.config):p;return {x:(target.x-frame.anchor.x)*cellWidth,y:(target.y-frame.anchor.y)*cellHeight}}
export function quadrupedBodyDrop(width,stage,progress=0){return stage==='crouch'?width*.024*smooth(progress):stage==='land'?width*.014*Math.sin(clamp(progress)*Math.PI):0}
export function quadrupedContacts(frame,atlas,width,action,options={},prepared=prepareQuadruped(frame,atlas)){
 if(!prepared)return [];
 const cellWidth=width/atlas.referenceWidth*(frame.scale||1),cellHeight=cellWidth*frame.cellHeight/frame.cellWidth,flip=options.flip||1,loc=options.locomotion,scale=options.worldScale||1;
 const anchors=prepared.legs.map(leg=>local(frame,leg.paw,cellWidth,cellHeight)),moving=action.startsWith('walk'),airborne=options.motionStage==='jump';
 let feet;
 if(loc?.key&&Number.isFinite(loc.origin?.x)&&Number.isFinite(loc.origin?.y)){
  let state=footingCache.get(loc.key),bank=`${frame.index}:${flip}`;
  if(!state||state.bank!==bank){state={bank,planner:new QuadrupedFooting(),turnDistance:state?loc.distance:null,epoch:(state?.epoch||0)+1};footingCache.set(loc.key,state)}
  const replant=state.turnDistance!==null&&loc.distance-state.turnDistance<loc.stride*.25;
  const drop=quadrupedBodyDrop(width,options.motionStage,options.stageProgress),hips=prepared.legs.map(leg=>{const h=local(frame,leg.hip,cellWidth,cellHeight);return{x:h.x,y:h.y+drop}}),worldHips=hips.map(h=>({x:h.x*flip/scale,y:h.y/scale})),reach=hips.map((h,i)=>Math.hypot(h.x-anchors[i].x,h.y-anchors[i].y)*1.28/scale);
  feet=state.planner.sample({origin:loc.origin,direction:loc.direction,distance:loc.distance,stride:loc.stride,anchors:anchors.map(a=>({x:a.x*flip/scale,y:a.y/scale})),hips:worldHips,reach,moving,airborne}).map(f=>({...f,cycle:state.epoch+':'+f.cycle,replant:f.replant||replant,planted:f.planted&&!replant,groundX:f.groundX*scale*flip,groundY:f.groundY*scale}));
 }else{
  const away=frame.index===4,direction=options.direction||{x:away?.84:-.84,y:away?-.54:.54},stride=width*.24;
  feet=anchors.map((a,i)=>{const cycle=quadrupedCycle(options.gaitPhase||0,i),travel=moving?cycle.travel*stride:0;return{id:LEG_IDS[i],groundX:a.x+direction.x*travel,groundY:a.y+direction.y*travel,planted:!airborne&&(!moving||cycle.planted),lift:airborne?.07:moving?cycle.lift*.039:0,phase:cycle.phase,cycle:cycle.cycle}});
 }
 return feet.map((foot,i)=>({...foot,x:foot.groundX,y:foot.groundY-foot.lift*width,hip:{...local(frame,prepared.legs[i].hip,cellWidth,cellHeight),y:local(frame,prepared.legs[i].hip,cellWidth,cellHeight).y+quadrupedBodyDrop(width,options.motionStage,options.stageProgress)},far:prepared.legs[i].far}));
}
export function limbKnee(hip,paw,restLength,bendSign=1){
 const dx=paw.x-hip.x,dy=paw.y-hip.y,d=Math.hypot(dx,dy)||.0001,length=restLength*.66,along=d*.5,reach=Math.min(restLength*.18,Math.sqrt(Math.max(0,length*length-along*along)));
 return {x:hip.x+dx*.5-dy/d*reach*bendSign,y:hip.y+dy*.5+dx/d*reach*bendSign};
}
function drawLimb(ctx,leg,foot,frame,width,cellWidth,cellHeight){
 const skin=leg.skin,root=foot.hip,target=local(frame,leg.paw,cellWidth,cellHeight),r=cellWidth*.034*(leg.far?.9:1)*(1+((frame.rigMorph?.config.build||1)-1)*.35);
 const knee=limbKnee(root,foot,Math.hypot(target.x-root.x,target.y-root.y),leg.id.startsWith('front')?-1:1),ankle={x:foot.x,y:foot.y-r*.53};
 const shoulder=r*1.35,shin=r*.78,left=Math.min(root.x-shoulder,knee.x-r,ankle.x-shin),right=Math.max(root.x+shoulder,knee.x+r,ankle.x+shin),top=Math.min(root.y-r*.45,knee.y,ankle.y),bottom=Math.max(root.y,knee.y,ankle.y)+r*.2;
 // The two bone landmarks guide one continuous tapered fur silhouette. Upper
 // shoulders are subsequently occluded by the torso, never pasted over it.
 ctx.save();ctx.beginPath();ctx.moveTo(root.x-shoulder,root.y+r*.65);
 ctx.quadraticCurveTo(knee.x-r,knee.y,ankle.x-shin,ankle.y);
 ctx.quadraticCurveTo(ankle.x,ankle.y+r*.48,ankle.x+shin,ankle.y);
 ctx.quadraticCurveTo(knee.x+r,knee.y,root.x+shoulder,root.y+r*.65);
 ctx.bezierCurveTo(root.x+shoulder,root.y-r*.45,root.x-shoulder,root.y-r*.45,root.x-shoulder,root.y+r*.65);ctx.closePath();ctx.clip();
 ctx.drawImage(skin.image,skin.image.width*.26,skin.image.height*.055,skin.image.width*.48,skin.image.height*.80,left,top,right-left,Math.max(1,bottom-top));ctx.restore();
 ctx.save();ctx.beginPath();ctx.ellipse(foot.x,foot.y-r*.51,r*1.23,r*.55,0,0,Math.PI*2);ctx.clip();ctx.drawImage(skin.image,skin.image.width*.23,skin.image.height*.80,skin.image.width*.54,skin.image.height*.15,foot.x-r*1.24,foot.y-r*1.07,r*2.48,r*1.12);ctx.restore();
}
export function drawQuadruped(ctx,frame,atlas,width,action,time,options={}){
 const prepared=prepareQuadruped(frame,atlas);if(!prepared)return null;
 const cellWidth=width/atlas.referenceWidth*(frame.scale||1),cellHeight=cellWidth*frame.cellHeight/frame.cellWidth,b=frame.bounds,left=(b[0]-frame.anchor.x)*cellWidth,top=(b[1]-frame.anchor.y)*cellHeight,w=b[2]*cellWidth,h=b[3]*cellHeight;
 const contacts=quadrupedContacts(frame,atlas,width,action,options,prepared);
 options.drawContactShadows?.(ctx,contacts);
 for(const i of [3,1,2,0])drawLimb(ctx,prepared.legs[i],contacts[i],frame,width,cellWidth,cellHeight);
 ctx.drawImage(prepared.body,left,top+quadrupedBodyDrop(width,options.motionStage,options.stageProgress),w,h);
 const leftEdge=Math.min(left,...contacts.map(c=>c.x-width*.09)),rightEdge=Math.max(left+w,...contacts.map(c=>c.x+width*.09)),bottom=Math.max(top+h,...contacts.map(c=>c.y+width*.018));
 return {left:leftEdge,top,width:rightEdge-leftEdge,height:bottom-top,contacts,drawnActions:LEG_IDS};
}
