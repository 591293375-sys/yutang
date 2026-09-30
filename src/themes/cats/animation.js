import {renderCatAppearance,drawStroke,validateAppearance} from './appearance.js';
import {normalizeCustomization} from './customization.js';
import {CAT_ACTION_ATLASES} from './actions-manifest.js';
import {rigVertexWeights,rigControls,applyRigWeights} from './continuous-rig.js';
import {drawQuadruped} from './quadruped.js';

export const CAT_ACTION_CLIPS=Object.freeze({walkToward:[0,1,2,3],walkAway:[4,5,6,7],rest:[8],sleep:[9],eat:[10,11],groom:[12,13],scratch:[14],pounce:[15]});
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=v=>{const t=clamp(v,0,1);return t*t*(3-2*t)};
export const GAIT_STRIDE_RATIO=.24;
const baseAtlases=new Map(),paintedAtlases=new Map();
const PART_ORDER=['head','tail','frontLeft','frontRight','backLeft','backRight','legs','body'];

export function selectCatAction(cat){
  if(['crouch','jump'].includes(cat.state)||['crouch','jump','land'].includes(cat.traverse?.phase))return 'pounce';
  const moving=['walk','approach'].includes(cat.state)&&(cat.speed>.0003||Math.hypot(cat.motionDx||0,cat.motionDy||0)>.000001);
  if(moving)return Math.sin(cat.heading??Math.atan2(cat.motionDy||0,cat.motionDx||1))<-.2?'walkAway':'walkToward';
  if(cat.state==='sleep')return 'sleep';
  if(cat.state==='rest')return 'rest';
  if(cat.state==='groom')return 'groom';
  if(cat.state==='eat'||cat.task?.tool==='food'&&cat.state==='observe'&&cat.task.phase==='interact')return 'eat';
  if(cat.task?.tool==='scratch'&&cat.state==='interact')return 'scratch';
  if(cat.task?.tool==='pet'&&cat.state==='interact')return 'rest';
  if(['yarn','mouse','wand'].includes(cat.task?.tool)&&['interact','observe'].includes(cat.state))return 'pounce';
  return 'idle';
}

export function gaitProgress(cat,preset){
  // Distance-driven feet stop when the body stops; a paused timer cannot moonwalk.
  const stride=Math.max(.015,(preset.scale||.068)*normalizeCustomization(cat.customization).size*GAIT_STRIDE_RATIO);
  return (((cat.strideDistance||0)/stride)%1+1)%1;
}
export function animationSample(cat,preset,time,lowMotion=false){
  const action=selectCatAction(cat),walking=action.startsWith('walk'),phase=walking?gaitProgress(cat,preset):0;
  // Independent painted cells are not in-between drawings. Keep a stable coat
  // and use articulated geometry, including for idle, instead of dissolving
  // four whole cats (or alternating the high/low feeding silhouettes).
  const index=action==='pounce'&&cat.traverse?(Math.sin(cat.heading||0)<-.2?4:0):({idle:0,walkToward:0,walkAway:4,rest:8,sleep:9,eat:10,groom:12,scratch:14,pounce:15})[action]??0;
  const strideStrength=walking?clamp((cat.speed||0)/Math.max(.014,preset.speed||.03),0,1):0;
  const jump=0; // Whole-body lift belongs exclusively to a real surface traversal.
  const length=Math.hypot(cat.motionDx||0,(cat.motionDy||0)*9/16),heading=cat.heading||0;
  const locomotion={origin:{x:cat.x||0,y:(cat.y||0)*9/16},direction:length>1e-9?{x:cat.motionDx/length,y:cat.motionDy*9/16/length}:{x:Math.cos(heading),y:Math.sin(heading)},distance:cat.strideDistance||0,stride:Math.max(.015,(preset.scale||.068)*normalizeCustomization(cat.customization).size*GAIT_STRIDE_RATIO),moving:walking};
  return {action,index,next:index,mix:0,bob:0,lean:0,jump,locomotion,gaitPhase:phase,strideStrength,singlePose:true,motionStage:cat.traverse?.phase||null,stageProgress:cat.traverse?.progress||0,actionTime:cat.stateTime??time};
}

export function partUV(point,sourceRect,targetRect){
  if(!sourceRect||!targetRect||targetRect[2]<=0||targetRect[3]<=0)return null;
  return {x:sourceRect[0]+(point.x-targetRect[0])/targetRect[2]*sourceRect[2],y:sourceRect[1]+(point.y-targetRect[1])/targetRect[3]*sourceRect[3]};
}
function contains(p,r){return r&&p.x>=r[0]&&p.y>=r[1]&&p.x<=r[0]+r[2]&&p.y<=r[1]+r[3]}
function insideEllipse(p,a){return ((p.x-a.x)/a.rx)**2+((p.y-a.y)/a.ry)**2<=1}
export function partsForPose(index){
  if(index>=4&&index<=7)return {head:[.03,.01,.47,.39],body:[.15,.24,.66,.57],tail:[.53,.11,.46,.49],legs:[.16,.66,.52,.34]};
  if(index===8)return {head:[.04,.22,.44,.52],body:[.31,.22,.58,.54],tail:[.59,.47,.39,.33],legs:[.08,.61,.50,.22]};
  if(index===9)return {head:[.03,.37,.48,.40],body:[.25,.19,.68,.53],tail:[.10,.64,.84,.26],legs:[.10,.60,.5,.24]};
  if(index===10)return {head:[.04,.47,.45,.39],body:[.31,.13,.61,.58],tail:[.75,.24,.22,.43],legs:[.40,.62,.37,.22]};
  if([11,12,13].includes(index))return {head:[.08,.04,.56,.47],body:[.20,.32,.63,.56],tail:[.68,.43,.30,.40],legs:[.22,.66,.50,.29]};
  if(index===14)return {head:[.10,.38,.52,.34],body:[.35,.32,.44,.42],tail:[.70,.03,.28,.42],legs:[.0,.60,.72,.35]};
  if(index===15)return {head:[.05,.42,.50,.36],body:[.36,.28,.51,.48],tail:[.58,.03,.40,.43],legs:[.10,.66,.69,.30]};
  return {head:[.10,.40,.40,.40],body:[.35,.26,.48,.48],tail:[.68,.03,.28,.40],legs:[.23,.69,.54,.28]};
}
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function image(source){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error(`动作素材没有载入：${source}`));i.src=source})}
export function alphaBounds(data,width,height,threshold=22){
  let left=width,top=height,right=-1,bottom=-1,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>threshold){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);count++}
  if(right<left)return null;
  return {x:Math.max(0,left-1),y:Math.max(0,top-1),width:Math.min(width,right+2)-Math.max(0,left-1),height:Math.min(height,bottom+2)-Math.max(0,top-1),coverage:count/(width*height)};
}
export function cleanCellAlpha(data,width,height){
  // Generated sheets can put a neighboring cell's ear/tail tip across a grid
  // edge. Keep the connected cat, with a two-pixel halo for translucent fur.
  // This cannot reconstruct a tail that the source itself clipped.
  const count=width*height,labels=new Int32Array(count),queue=new Int32Array(count);let label=0,largest=0,largestCount=0;
  for(let start=0;start<count;start++){
    if(labels[start]||data[start*4+3]<16)continue;let head=0,tail=1;queue[0]=start;labels[start]=++label;
    while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;const next=ny*width+nx;
      if(!labels[next]&&data[next*4+3]>=16){labels[next]=label;queue[tail++]=next}
    }}
    if(tail>largestCount){largestCount=tail;largest=label}
  }
  const keep=new Uint8Array(count);
  for(let p=0;p<count;p++)if(labels[p]===largest&&largest){const x=p%width,y=Math.floor(p/width);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)keep[(y+dy)*width+x+dx]=1}
  for(let p=0;p<count;p++)if(!keep[p]||data[p*4+3]<8)data[p*4+3]=0;
  return {components:label,mainPixels:largestCount};
}
function normalizedBounds(bounds,w,h){return [bounds.x/w,bounds.y/h,bounds.width/w,bounds.height/h]}
function ellipseForFace(parts,index){const h=parts.head;return [{x:h[0]+h[2]*.39,y:h[1]+h[3]*(index>=4&&index<=7?.38:.58),rx:h[2]*.26,ry:h[3]*.21}]}
const REFERENCE_POSE_BOUNDS=[[.048,.022,.946,.978],[.048,.019,.936,.981],[.035,.016,.952,.984],[.038,.019,.946,.981],[.054,.051,.936,.933],[.048,.051,.949,.924],[.045,.048,.933,.943],[.048,.048,.914,.939],[.022,.163,.978,.636],[.073,.150,.892,.671],[.048,.058,.952,.773],[.083,0,.898,.888],[.125,0,.869,.889],[.057,0,.828,.885],[0,0,.990,.917],[.073,0,.895,.911]];
function fittedPoseParts(index,bounds){
  const from=REFERENCE_POSE_BOUNDS[index];return Object.fromEntries(Object.entries(partsForPose(index)).map(([key,r])=>[key,[bounds[0]+(r[0]-from[0])/from[2]*bounds[2],bounds[1]+(r[1]-from[1])/from[3]*bounds[3],r[2]/from[2]*bounds[2],r[3]/from[3]*bounds[3]]]));
}
export function atlasSourceRects(spec,width,height){
  const sourceSize=spec.sourceSize||[width,height],scaleX=width/sourceSize[0],scaleY=height/sourceSize[1];
  return Array.from({length:16},(_,index)=>{
    const rect=spec.frames?.[index]?.sourceRect||spec.sourceRects?.[index];
    if(rect){if(rect.length!==4||!rect.every(Number.isFinite)||rect[2]<=0||rect[3]<=0)throw new Error('猫咪动作来源区域无效');const x=Math.max(0,Math.floor(rect[0]*scaleX)),y=Math.max(0,Math.floor(rect[1]*scaleY));return [x,y,Math.min(width-x,Math.ceil(rect[2]*scaleX)),Math.min(height-y,Math.ceil(rect[3]*scaleY))]}
    const x=Math.floor((index%4)*width/4),y=Math.floor(Math.floor(index/4)*height/4),right=Math.floor((index%4+1)*width/4),bottom=Math.floor((Math.floor(index/4)+1)*height/4);return [x,y,right-x,bottom-y];
  });
}

export function torsoLandmark(data,width,height,bounds){
  const [bx,by,bw,bh]=bounds,x0=Math.max(0,Math.floor((bx+bw*.25)*width)),x1=Math.min(width,Math.ceil((bx+bw*.78)*width)),y0=Math.max(0,Math.floor((by+bh*.30)*height)),y1=Math.min(height,Math.ceil((by+bh*.70)*height));
  let mass=0,xsum=0,ysum=0,x2=0,y2=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const alpha=data[(y*width+x)*4+3]/255;if(alpha<.35)continue;mass+=alpha;xsum+=(x+.5)*alpha;ysum+=(y+.5)*alpha;x2+=(x+.5)**2*alpha;y2+=(y+.5)**2*alpha}
  if(!mass)return{x:bx+bw*.5,y:by+bh*.5,spread:Math.hypot(bw*.2,bh*.15)};
  const x=xsum/mass,y=ysum/mass;return{x:x/width,y:y/height,spread:Math.sqrt(Math.max(0,x2/mass-x*x)/width**2+Math.max(0,y2/mass-y*y)/height**2)};
}
export function registerWalkingFrames(frames){
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  for(const group of [[0,1,2,3],[4,5,6,7]]){
    const chosen=group.map(i=>frames[i]);if(chosen.some(f=>!f?.torso))continue;
    const spread=median(chosen.map(f=>f.torso.spread));
    // Correct only accidental art-sheet variation, never independently fit a
    // raised tail or a curled body to the entire previous silhouette.
    for(const f of chosen)if(!f.explicitScale)f.scale*=clamp(spread/f.torso.spread,.96,1.04);
    const x=median(chosen.map(f=>(f.torso.x-f.anchor.x)*f.scale)),y=median(chosen.map(f=>(f.torso.y-f.anchor.y)*f.scale));
    for(const f of chosen){
      if(f.explicitAnchor)continue;const old={...f.anchor};
      f.anchor={x:old.x+clamp(f.torso.x-x/f.scale-old.x,-.027,.027),y:old.y+clamp(f.torso.y-y/f.scale-old.y,-.024,.024)};
      f.registration={dx:f.anchor.x-old.x,dy:f.anchor.y-old.y};
    }
  }
  return frames;
}

async function decodeAtlas(preset,spec){
  const img=await image(`${import.meta.env.BASE_URL}${spec.image}`),columns=spec.columns||4,rows=spec.rows||4;
  if(columns!==4||rows!==4)throw new Error('猫咪动作图需为 4 × 4 布局');
  const rects=atlasSourceRects(spec,img.naturalWidth,img.naturalHeight),precise=!!spec.sourceRects||!!spec.frames?.some(f=>f?.sourceRect);
  // All source rectangles share one pixel scale. Fitting each cutout separately
  // would make curled cats larger and cause visible size changes at every step.
  const commonSide=precise?Math.max(...rects.flatMap(r=>[r[2],r[3]]))+8:img.naturalWidth/columns;
  const cellWidth=Math.min(512,Math.floor(commonSide)),cellHeight=precise?cellWidth:Math.round(cellWidth*img.naturalHeight/img.naturalWidth),ratio=cellWidth/commonSide,frames=[];
  for(let index=0;index<16;index++){
    const [sx,sy,sw,sh]=rects[index];
    const surface=canvas(cellWidth,cellHeight),context=surface.getContext('2d',{willReadFrequently:true});
    if(precise)context.drawImage(img,sx,sy,sw,sh,(cellWidth-sw*ratio)/2,cellHeight-sh*ratio-3*ratio,sw*ratio,sh*ratio);
    else context.drawImage(img,sx,sy,sw,sh,0,0,cellWidth,cellHeight);
    const pixels=context.getImageData(0,0,cellWidth,cellHeight);cleanCellAlpha(pixels.data,cellWidth,cellHeight);context.putImageData(pixels,0,0);
    const auto=alphaBounds(pixels.data,cellWidth,cellHeight),override=spec.frames?.[index]||{};
    if(!auto||auto.coverage>.98)throw new Error(`第 ${index+1} 格缺少透明猫咪轮廓`);
    const bounds=override.bounds||normalizedBounds(auto,cellWidth,cellHeight),bx=Math.max(0,Math.floor(bounds[0]*cellWidth)),by=Math.max(0,Math.floor(bounds[1]*cellHeight)),bw=Math.min(cellWidth-bx,Math.ceil(bounds[2]*cellWidth)),bh=Math.min(cellHeight-by,Math.ceil(bounds[3]*cellHeight));
    const cropped=canvas(bw,bh);cropped.getContext('2d').drawImage(surface,bx,by,bw,bh,0,0,bw,bh);
    const parts=override.parts||(precise?fittedPoseParts(index,bounds):partsForPose(index)),anchor=override.anchor||{x:bounds[0]+bounds[2]*.5,y:bounds[1]+bounds[3]-.012};
    const poseScale=override.scale??({8:.78,9:.70,10:.90,11:.86,12:.87,13:.87}[index]??1);
    // Facial landmarks are authored in each source rectangle. Keep its mapping
    // through alpha cropping and torso registration instead of guessing from
    // the portrait's head proportions (which differ between action poses).
    const sourceMapping=precise?{x:(cellWidth-sw*ratio)/2/cellWidth,y:(cellHeight-sh*ratio-3*ratio)/cellHeight,width:sw*ratio/cellWidth,height:sh*ratio/cellHeight}:{x:0,y:0,width:1,height:1};
    frames.push({rigKey:{},torso:torsoLandmark(pixels.data,cellWidth,cellHeight,bounds),explicitAnchor:!!override.anchor,explicitScale:override.scale!=null,index,image:cropped,bounds:[bx/cellWidth,by/cellHeight,bw/cellWidth,bh/cellHeight],anchor,parts,scale:poseScale,protectedAreas:override.protectedAreas||(index>=4&&index<=7?[]:ellipseForFace(parts,index)),sourceMapping,cellWidth,cellHeight});
  }
  // All poses retain the atlas' common cell scale. Use median locomotion width,
  // not each pose's bounding box, to preserve body size through lying/sleeping.
  registerWalkingFrames(frames);
  const widths=frames.slice(0,8).map(f=>f.bounds[2]).sort((a,b)=>a-b);
  return {presetId:preset.id,version:spec.version||1,frames,referenceWidth:spec.referenceWidth||widths[4],sourceLayout:precise?'alpha-rects':'grid-fallback',status:'ready'};
}
export function getActionSpec(presetId){return CAT_ACTION_ATLASES[presetId]||null}
function baseAtlas(preset,spec){const key=`${preset.id}:${spec.image}:${spec.version||1}:${JSON.stringify(spec.sourceRects||[])}`;if(!baseAtlases.has(key)){const job=decodeAtlas(preset,spec);baseAtlases.set(key,job);job.catch(()=>baseAtlases.delete(key))}return baseAtlases.get(key)}
async function paintAtlas(preset,appearance,atlas){
  if(!appearance?.strokes?.length)return atlas;
  const size=512,normalized=validateAppearance(appearance),base=await renderCatAppearance(preset,{version:1,strokes:[]},{size});
  const material=canvas(base.width,base.height),paint=material.getContext('2d',{willReadFrequently:true});normalized.strokes.forEach(stroke=>drawStroke(paint,stroke,preset,base.width,base.height));
  const a=base.getContext('2d').getImageData(0,0,base.width,base.height).data,b=paint.getImageData(0,0,base.width,base.height).data;
  const width=base.width,height=base.height;
  const frames=atlas.frames.map(frame=>{
    const c=canvas(frame.image.width,frame.image.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(frame.image,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const i=(y*c.width+x)*4;if(pixels.data[i+3]<2)continue;
      const p={x:frame.bounds[0]+(x+.5)/frame.cellWidth,y:frame.bounds[1]+(y+.5)/frame.cellHeight};
      if(frame.protectedAreas.some(area=>insideEllipse(p,area)))continue;
      const part=PART_ORDER.find(key=>contains(p,frame.parts[key]));if(!part)continue;
      const source=preset.regions[part]||preset.regions[part.startsWith('front')||part.startsWith('back')?'legs':part];
      const q=partUV(p,source,frame.parts[part]);if(!q||q.x<0||q.y<0||q.x>=1||q.y>=1)continue;
      const si=(Math.min(height-1,Math.floor(q.y*height))*width+Math.min(width-1,Math.floor(q.x*width)))*4;if(a[si+3]<15||!b[si+3]||preset.protectedAreas?.some(area=>insideEllipse(q,area)))continue;
      // Transfer paint pigment and coverage, never RGB differences: subtracting
      // orange original fur from a white pose can otherwise turn brown blue.
      // Each pose supplies its own fur lighting and retains the original alpha.
      const rgb=shadeCatPaint([pixels.data[i],pixels.data[i+1],pixels.data[i+2]],[b[si],b[si+1],b[si+2]],b[si+3]/255);
      for(let channel=0;channel<3;channel++)pixels.data[i+channel]=rgb[channel];
    }
    ctx.putImageData(pixels,0,0);return {...frame,image:c};
  });return {...atlas,frames};
}
export function shadeCatPaint(original,pigment,alpha){
  const lum=(.2126*original[0]+.7152*original[1]+.0722*original[2])/255,coverage=clamp(alpha,0,1)*.88*(lum<.13?.45:1),shade=.32+.78*lum;
  return original.map((value,channel)=>Math.round(value*(1-coverage)+Math.min(255,pigment[channel]*shade)*coverage));
}
export async function loadActionAtlas(preset,appearance,configuration={}){
  const spec=getActionSpec(preset.id);if(!spec)return null;
  const key=`${preset.id}:${spec.version||1}:${JSON.stringify(spec.sourceRects||[])}:${JSON.stringify(appearance||{})}:${configuration.key||''}`;
  if(paintedAtlases.has(key)){const value=paintedAtlases.get(key);paintedAtlases.delete(key);paintedAtlases.set(key,value);return value}
  const job=baseAtlas(preset,spec).then(atlas=>paintAtlas(preset,appearance,atlas)).then(async atlas=>typeof configuration.transformFrame==='function'?{...atlas,frames:await Promise.all(atlas.frames.map(frame=>configuration.transformFrame(frame,preset)))}:atlas);paintedAtlases.set(key,job);while(paintedAtlases.size>12)paintedAtlases.delete(paintedAtlases.keys().next().value);job.catch(()=>paintedAtlases.delete(key));return job;
}

// Crossfades are a normalized sum of complete poses. Drawing translucent
// frames directly with source-over would make an opaque torso 75% opaque at
// the midpoint and let paving show through the cat.
export function poseLayers(sample,hasAtlas=true){
  if(sample.singlePose)return [{...sample,index:sample.renderIndex??sample.index,action:sample.renderAction??sample.action,flip:sample.renderFlip??sample.flip,weight:1}];
  const layers=[];
  const append=(pose,weight)=>{
    if(weight<=0)return;
    const mix=hasAtlas&&pose.index>=0&&pose.next!==pose.index?clamp(pose.mix||0,0,1):0;
    if(mix<1)layers.push({...pose,weight:weight*(1-mix)});
    if(mix>0)layers.push({...pose,index:pose.next,weight:weight*mix});
  };
  if(sample.previous&&hasAtlas){append(sample.previous,1-sample.transition);append(sample,sample.transition)}else append(sample,1);
  return layers;
}
export function drawBlendedPoses(ctx,layers,drawPose,width,scale,buffers){
  if(layers.length===1)return drawPose(ctx,layers[0]);
  const needed=Math.ceil(width*2.2*scale/64)*64;
  if(!buffers.pose){buffers.pose=canvas(needed,needed);buffers.blend=canvas(needed,needed)}
  if(buffers.pose.width<needed){for(const image of [buffers.pose,buffers.blend])image.width=image.height=needed}
  const side=buffers.pose.width,originX=side*.5,originY=Math.round(side*.825),p=buffers.pose.getContext('2d'),b=buffers.blend.getContext('2d');
  b.setTransform(1,0,0,1,0,0);b.clearRect(0,0,side,side);b.globalCompositeOperation='lighter';
  let bounds;
  for(const layer of layers){
    p.setTransform(1,0,0,1,0,0);p.clearRect(0,0,side,side);p.setTransform(scale,0,0,scale,originX,originY);
    // Mesh triangles overlap slightly to close seams; paint them at full
    // opacity first, and apply each pose's weight only once to its bitmap.
    bounds=drawPose(p,layer);b.globalAlpha=layer.weight;b.drawImage(buffers.pose,0,0);
  }
  b.globalCompositeOperation='source-over';b.globalAlpha=1;
  ctx.drawImage(buffers.blend,-originX/scale,-originY/scale,side/scale,side/scale);
  return bounds;
}

export class CatAnimationState {
  constructor(){this.cats=new Map()}
  sample(cat,preset,time,reducedMotion=false){
    let current=animationSample(cat,preset,time,reducedMotion),flip=cat.facing===1?-1:1;
    let state=this.cats.get(cat.id);
    if(!state){state={footingKey:{},action:current.action,flip,previous:null,changedAt:time,duration:.36,candidate:null,bank:current.index===4?4:0};this.cats.set(cat.id,state)}
    const walking=current.action.startsWith('walk'),turning=state.action.startsWith('walk')&&walking;
    if(turning){
      // A broad dead band and a sustained heading prevent tiny steering changes
      // from swapping face/back or flipping the entire painted body repeatedly.
      const sy=Math.sin(cat.heading||0),sx=Math.cos(cat.heading||0);
      if((state.action==='walkToward'&&sy>-.42)||(state.action==='walkAway'&&sy<.25))current={...current,action:state.action,index:state.action==='walkAway'?4:0,next:state.action==='walkAway'?4:0};
      if(Math.abs(sx)<.30)flip=state.flip;
    }
    if(current.action==='idle'){const orient=cat.task?.tool==='food'&&cat.task.phase==='orient';current={...current,index:orient?0:state.bank,next:orient?0:state.bank};if(!orient)flip=state.flip}
    if(turning&&(state.action!==current.action||state.flip!==flip)){
      const candidate=`${current.action}:${flip}`;
      if(state.candidate!==candidate){state.candidate=candidate;state.candidateAt=time}
      if(time-state.candidateAt<.20){current={...current,action:state.action,index:state.action==='walkAway'?4:0,next:state.action==='walkAway'?4:0};flip=state.flip}
    }else state.candidate=null;
    if(state.action!==current.action||state.flip!==flip){
      state.previous=state.last?{...state.last,flip:state.flip}:null;
      state.duration=turning?.32:['sleep','rest'].includes(current.action)?.48:.34;
      state.action=current.action;state.flip=flip;state.changedAt=time;state.candidate=null;
    }
    if(walking)state.bank=current.index;
    const progress=clamp((time-state.changedAt)/(reducedMotion?.16:state.duration),0,1),transition=smooth(progress);
    // One textured pose at a time: a small preparatory settle hides no limbs and
    // never stacks translucent silhouettes or flattens the cat into a flip.
    const previous=state.previous&&transition<1?state.previous:null,old=previous&&progress<.5;
    const settle=previous?Math.sin(progress*Math.PI):0;
    const rendered=old?previous:current;
    if(transition>=1)state.previous=null;
    state.last=current;
    return {...current,locomotion:{...current.locomotion,key:state.footingKey},flip,previous:null,transition,renderIndex:rendered.index,renderAction:rendered.action,renderFlip:old?previous.flip:flip,settle:reducedMotion?0:settle,transitioning:!!previous,singlePose:true};
  }
  retain(ids){for(const key of this.cats.keys())if(!ids.has(key))this.cats.delete(key)}
  clear(){this.cats.clear()}
}

// Static joint influence weights are cached on each atlas pose; only a handful
// of joint positions and triangle transforms change at render time.
const meshCache=new WeakMap();
function actionMesh(frame,action){
 const key=frame.image,signature=`${action}:${frame.bounds.join(',')}:${frame.image.width}:${frame.image.height}`;
 let entries=meshCache.get(key);if(!entries){entries=new Map();meshCache.set(key,entries)}
 if(entries.has(signature))return entries.get(signature);
 const restful=['idle','sleep','rest'].includes(action),walking=action.startsWith('walk');
 const columns=restful?4:walking?8:6,rows=restful?5:walking?10:8,b=frame.bounds,vertices=[];
 for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
  const sx=x/columns*frame.image.width,sy=y/rows*frame.image.height,p={x:b[0]+sx/frame.cellWidth,y:b[1]+sy/frame.cellHeight};
  vertices.push({source:{x:sx,y:sy},u:x/columns,v:y/rows,weights:rigVertexWeights(p,frame,action)});
 }
 const occupied=new Set(),pixels=frame.image.getContext?.('2d',{willReadFrequently:true})?.getImageData(0,0,frame.image.width,frame.image.height).data;
 if(pixels)for(let y=0;y<frame.image.height;y++)for(let x=0;x<frame.image.width;x++)if(pixels[(y*frame.image.width+x)*4+3]>1)occupied.add(Math.floor(y/frame.image.height*rows)*columns+Math.floor(x/frame.image.width*columns));
 const cells=[];for(let y=0;y<rows;y++)for(let x=0;x<columns;x++)if(!pixels||occupied.has(y*columns+x))cells.push([x,y]);
 const result={columns,rows,vertices,cells};entries.set(signature,result);return result;
}

function triangle(ctx,image,source,target){
  const [s0,s1,s2]=source,[d0,d1,d2]=target,det=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);if(Math.abs(det)<.0001)return;
  const a=(d0.x*(s1.y-s2.y)+d1.x*(s2.y-s0.y)+d2.x*(s0.y-s1.y))/det,b=(d0.y*(s1.y-s2.y)+d1.y*(s2.y-s0.y)+d2.y*(s0.y-s1.y))/det,c=(d0.x*(s2.x-s1.x)+d1.x*(s0.x-s2.x)+d2.x*(s1.x-s0.x))/det,d=(d0.y*(s2.x-s1.x)+d1.y*(s0.x-s2.x)+d2.y*(s1.x-s0.x))/det,e=d0.x-a*s0.x-c*s0.y,f=d0.y-b*s0.x-d*s0.y;
  const center={x:(d0.x+d1.x+d2.x)/3,y:(d0.y+d1.y+d2.y)/3},edge=[d0,d1,d2].map(p=>{const length=Math.hypot(p.x-center.x,p.y-center.y)||1;return {x:p.x+(p.x-center.x)/length*.5,y:p.y+(p.y-center.y)/length*.5}});
  ctx.save();ctx.beginPath();ctx.moveTo(edge[0].x,edge[0].y);ctx.lineTo(edge[1].x,edge[1].y);ctx.lineTo(edge[2].x,edge[2].y);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(image,0,0);ctx.restore();
}
export function drawActionFrame(ctx,frame,atlas,width,action,time,options={}){
  const {reducedMotion=false,mesh=true,gaitPhase=0,strideStrength=1,motionStage,stageProgress=0,settle=0}=options;
  const cellWidth=width/atlas.referenceWidth*(frame.scale||1),cellHeight=cellWidth*frame.cellHeight/frame.cellWidth,b=frame.bounds;
  const left=(b[0]-frame.anchor.x)*cellWidth,top=(b[1]-frame.anchor.y)*cellHeight,w=b[2]*cellWidth,h=b[3]*cellHeight;
  if(!mesh){ctx.drawImage(frame.image,left,top,w,h);return {left,top,width:w,height:h}}
  if([0,4].includes(frame.index)&&(['idle','pounce'].includes(action)||action.startsWith('walk'))){const result=drawQuadruped(ctx,frame,atlas,width,action,time,options);if(result)return result}
  const {columns,rows,vertices,cells}=actionMesh(frame,action),controls=rigControls(action,time,{gaitPhase,strideStrength,motionStage,stageProgress,reducedMotion}),points=[];
  for(const vertex of vertices){
    const offset=applyRigWeights(vertex.weights,controls),y=top+vertex.v*h;
    points.push({source:vertex.source,target:{x:left+vertex.u*w+offset.x*cellWidth,y:y*(1-settle*.018)+offset.y*cellHeight}});
  }
  for(const[x,y]of cells){const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;for(const indices of [[a,b,c],[b,d,c]])triangle(ctx,frame.image,indices.map(i=>points[i].source),indices.map(i=>points[i].target))}
  return {left,top,width:w,height:h};
}
