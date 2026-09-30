import test from 'node:test';
import assert from 'node:assert/strict';
import {pawCycle,rigControls,rigVertexWeights,applyRigWeights} from '../src/themes/cats/continuous-rig.js';
import {rearLegFoot,rearLegTargets,rearLegMotion,needsExtraRearLeg,prepareRearLeg} from '../src/themes/cats/hind-leg.js';
import {selectCatAction,animationSample,drawActionFrame,gaitProgress,partUV,alphaBounds,cleanCellAlpha,atlasSourceRects,shadeCatPaint,poseLayers,torsoLandmark,registerWalkingFrames,GAIT_STRIDE_RATIO,CatAnimationState,CAT_ACTION_CLIPS} from '../src/themes/cats/animation.js';
const preset={scale:.07},walk={id:'walker',state:'walk',speed:.03,heading:2.2,facing:-1,strideDistance:0};
test('gait articulates one stable directional texture using traveled distance',()=>{
  assert.equal(selectCatAction(walk),'walkToward');assert.equal(selectCatAction({...walk,heading:-2.2}),'walkAway');
  const frames=[];for(let i=0;i<4;i++)frames.push(animationSample({...walk,strideDistance:(i+.1)*preset.scale*GAIT_STRIDE_RATIO/4},preset,100).index);
  assert.deepEqual(frames,[0,0,0,0]);assert.equal(gaitProgress(walk,preset),gaitProgress({...walk,stateTime:800},preset));
  assert.equal(animationSample({...walk,speed:0},preset,100).index,0,'stopping retains the same coat texture');assert.equal(animationSample({...walk,speed:0},preset,100).strideStrength,0);
});
test('sleep/rest/eating/grooming and tools select dedicated resources',()=>{
  for(const [cat,expected] of [[{state:'sleep'},'sleep'],[{state:'rest'},'rest'],[{state:'eat'},'eat'],[{state:'groom'},'groom'],[{state:'interact',task:{tool:'scratch'}},'scratch'],[{state:'interact',task:{tool:'pet'}},'rest'],[{state:'interact',task:{tool:'mouse'}},'pounce']])assert.equal(selectCatAction(cat),expected);
  assert.deepEqual(CAT_ACTION_CLIPS.sleep,[9]);assert.equal(animationSample({state:'sleep'},preset,0).index,9);
});
test('direction transitions use one pose with finite settling and reject brief steering jitter',()=>{
  const state=new CatAnimationState();state.sample(walk,preset,0);
  const hesitate=state.sample({...walk,heading:-2.2},preset,.05);assert.equal(hesitate.action,'walkToward');
  const turn=state.sample({...walk,heading:-2.2},preset,.30);assert.equal(turn.action,'walkAway');assert.equal(turn.renderIndex,0);assert.equal(turn.transition,0);assert.equal(poseLayers(turn).length,1);
  const settled=state.sample({...walk,heading:-2.2},preset,.70);assert.equal(settled.renderIndex,4);assert.equal(settled.transition,1);
  for(const sample of [hesitate,turn,settled]){assert.ok(Number.isFinite(sample.transition));assert.ok(Number.isFinite(sample.settle));assert.equal(sample.previous,null)}
  const idle=state.sample({...walk,state:'idle',speed:0},preset,.8);assert.equal(idle.index,4,'idling must not suddenly turn toward the camera');
  state.retain(new Set());assert.equal(state.cats.size,0);
});
test('paint coordinates transfer through corresponding body regions, independent of pose/frame crop',()=>{
  const source=[.3,.2,.5,.4],target=[.1,.4,.7,.2];assert.deepEqual(partUV({x:.45,y:.5},source,target),{x:.55,y:.39999999999999997});
  assert.equal(partUV({x:.5,y:.5},source,[0,0,0,0]),null);
});
test('alpha trim ignores empty cells and preserves independent bounds without stretching poses',()=>{
  const data=new Uint8ClampedArray(10*10*4);assert.equal(alphaBounds(data,10,10),null);
  for(let y=3;y<7;y++)for(let x=2;x<8;x++)data[(y*10+x)*4+3]=255;
  assert.deepEqual(alphaBounds(data,10,10),{x:1,y:2,width:8,height:6,coverage:.24});
});
test('atlas cleanup removes neighboring-cell fragments while preserving fine fur near the cat',()=>{
  const data=new Uint8ClampedArray(24*24*4),alpha=(x,y,a=255)=>{data[(y*24+x)*4+3]=a};
  for(let y=7;y<18;y++)for(let x=6;x<17;x++)alpha(x,y);
  alpha(4,8,10);alpha(20,0);alpha(21,0);alpha(21,1);
  const result=cleanCellAlpha(data,24,24);assert.equal(result.components,2);assert.equal(data[(0*24+21)*4+3],0);assert.equal(data[(8*24+4)*4+3],10);assert.equal(data[(10*24+10)*4+3],255);
});
test('climbing uses the authored crouch/pounce pose',()=>{
  assert.equal(selectCatAction({state:'crouch'}),'pounce');assert.equal(selectCatAction({state:'jump',traverse:{phase:'jump'}}),'pounce');
});
test('uneven atlas source rectangles preserve complete poses and fractional grid fallback has no gaps',()=>{
  const frames=Array.from({length:16},(_,i)=>[20+i,17+i*40,190,380-i]);const result=atlasSourceRects({sourceRects:frames,sourceSize:[1254,1254]},1254,1254);assert.deepEqual(result[2],frames[2]);
  const fallback=atlasSourceRects({},1254,1254);assert.equal(fallback[0][0]+fallback[0][2],fallback[1][0]);assert.equal(fallback[3][0]+fallback[3][2],1254);
  assert.deepEqual(atlasSourceRects({sourceRects:frames,sourceSize:[1254,1254]},2508,2508)[0],[40,34,380,760]);
});
test('paint transfers pigment, preserving brown hue on white and orange fur and retaining pose shadows',()=>{
  const pigment=[151,88,73],white=shadeCatPaint([235,235,231],pigment,1),orange=shadeCatPaint([224,142,39],pigment,1),shadow=shadeCatPaint([105,95,90],pigment,1);
  for(const rgb of [white,orange,shadow])assert.ok(rgb[0]>rgb[1]&&rgb[1]>rgb[2],'brown paint must never turn blue');
  assert.ok(shadow[0]<white[0]);assert.deepEqual(shadeCatPaint([235,235,231],pigment,0),[235,235,231]);
});

test('combined action and gait crossfades retain normalized opaque coverage',()=>{
  const layers=poseLayers({index:2,next:3,mix:.5,flip:-1,transition:.4,previous:{index:5,next:6,mix:.3,flip:1}});
  assert.equal(layers.length,4);assert.ok(Math.abs(layers.reduce((sum,layer)=>sum+layer.weight,0)-1)<1e-10);
  assert.deepEqual(layers.map(l=>l.index),[5,6,2,3]);
  assert.equal(poseLayers({index:0,next:1,mix:.5},false).length,1);
});

test('all gait phases use a continuous rig, never a whole-cat alpha dissolve',()=>{
 const stride=preset.scale*GAIT_STRIDE_RATIO;for(const fraction of [.1,.25,.5,.75,.9]){const pose=animationSample({...walk,strideDistance:stride*fraction},preset,0);assert.equal(pose.mix,0);assert.equal(pose.index,pose.next);assert.equal(poseLayers(pose).length,1);assert.ok(Math.abs(pose.gaitPhase-fraction)<1e-12);}
 assert.equal(gaitProgress({...walk,strideDistance:stride*.35,customization:{size:1.2}},preset),gaitProgress({...walk,strideDistance:stride*.35/1.2},preset));
});
test('torso registration removes accidental sheet drift without fitting raised tails or changing non-walk poses',()=>{
 const frames=Array.from({length:16},(_,i)=>({scale:1,anchor:{x:.5,y:.98},torso:{x:.51+(i%4-1)*.005,y:.52+(i%3-1)*.004,spread:.2}}));
 const before=JSON.stringify(frames[9]);registerWalkingFrames(frames);assert.equal(JSON.stringify(frames[9]),before);
 for(let start=0;start<8;start+=4){const points=frames.slice(start,start+4).map(f=>({x:f.torso.x-f.anchor.x,y:f.torso.y-f.anchor.y}));assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))<1e-10);assert.ok(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))<1e-10);}
 const data=new Uint8ClampedArray(100*100*4);for(let y=30;y<70;y++)for(let x=25;x<78;x++)data[(y*100+x)*4+3]=255;const landmark=torsoLandmark(data,100,100,[0,0,1,1]);assert.ok(Math.abs(landmark.x-.515)<.001);assert.ok(Math.abs(landmark.y-.5)<.001);
});

test('four paws alternate support and swing, with continuous wrap and zero footfall lift during stance',()=>{
 for(let i=0;i<=100;i++){const p=pawCycle(i/100);assert.ok(Number.isFinite(p.travel)&&Number.isFinite(p.lift));assert.ok(p.lift>=0&&p.lift<=1);if(p.planted)assert.equal(p.lift,0)}
 const end=pawCycle(1-1e-6),start=pawCycle(0);assert.ok(Math.abs(end.travel-start.travel)<1e-6);assert.ok(Math.abs(end.lift-start.lift)<1e-5);
 const a=rigControls('walkToward',0,{gaitPhase:.12,strideStrength:1}),b=rigControls('walkToward',0,{gaitPhase:.62,strideStrength:1});assert.notDeepEqual(a.legs,b.legs);assert.ok(new Set(a.legs.map(p=>p.y.toFixed(5))).size>=3,'four feet have distinct support phases');
 const stopped=rigControls('walkToward',0,{gaitPhase:.12,strideStrength:0});assert.ok(stopped.legs.every(p=>p.x===0&&p.y===0));
});
test('joint influence moves a paw without turning the whole face or torso into a wave',()=>{
 const frame={index:0,sourceMapping:{x:0,y:0,width:1,height:1},parts:{head:[.1,.4,.4,.4],body:[.35,.26,.48,.48],legs:[.2,.65,.6,.32],tail:[.68,.03,.28,.4]}},controls=rigControls('walkToward',0,{gaitPhase:.8,strideStrength:1});
 const paw=applyRigWeights(rigVertexWeights({x:.27,y:.95},frame,'walkToward'),controls),chest=applyRigWeights(rigVertexWeights({x:.52,y:.44},frame,'walkToward'),controls);assert.ok(Math.hypot(paw.x,paw.y)>.008);assert.ok(Math.hypot(chest.x,chest.y)<Math.hypot(paw.x,paw.y));
});
test('surface jumps retain their approach direction for crouch, flight and landing',()=>{
 for(const phase of ['crouch','jump','land']){const a=animationSample({...walk,state:phase==='land'?'rest':phase,heading:-2.2,traverse:{phase,progress:.5}},preset,0),b=animationSample({...walk,state:phase,heading:2.2,traverse:{phase,progress:.5}},preset,0);assert.equal(a.action,'pounce');assert.equal(a.index,4);assert.equal(b.index,0);assert.equal(a.motionStage,phase)}
 assert.equal(animationSample({state:'interact',task:{tool:'mouse'}},preset,0).index,15,'playful pouncing retains its authored pose');
});
test('feeding and grooming articulate their own joints without alternating incompatible painted silhouettes',()=>{
 for(const [state,index]of[['eat',10],['groom',12]])for(const time of [0,.4,1,3,20]){const pose=animationSample({state,stateTime:time},preset,time);assert.equal(pose.index,index);assert.equal(pose.next,index);assert.equal(pose.mix,0)}
 assert.notDeepEqual(rigControls('eat',0),rigControls('eat',.3));assert.notDeepEqual(rigControls('groom',0),rigControls('groom',.3));
});

test('mesh occupancy belongs to each customized image, not the shared original pose key',()=>{
 const bitmap=(left,right)=>{const data=new Uint8ClampedArray(100*100*4);for(let y=20;y<98;y++)for(let x=left;x<right;x++)data[(y*100+x)*4+3]=255;return {width:100,height:100,getContext:()=>({getImageData:()=>({data})})}};
 const rigKey={},template={rigKey,index:0,bounds:[0,0,1,1],anchor:{x:.5,y:.98},cellWidth:100,cellHeight:100,sourceMapping:{x:0,y:0,width:1,height:1},parts:{head:[.1,.4,.4,.4],body:[.35,.26,.48,.48],legs:[.2,.65,.6,.32],tail:[.68,.03,.28,.4]}};
 const count=frame=>{let n=0;const noop=()=>{},ctx={save:noop,restore:noop,beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,clip:noop,transform:noop,drawImage:()=>n++};drawActionFrame(ctx,frame,{referenceWidth:1},100,'walkToward',0,{gaitPhase:.3,strideStrength:1});return n};
 const thin=count({...template,image:bitmap(44,56)}),wide=count({...template,image:bitmap(20,80)}),fresh=count({...template,rigKey:{},image:bitmap(20,80)});assert.ok(wide>thin,'larger body has additional visible mesh cells');assert.equal(wide,fresh,'loading a thin cat first must not clip a later wide cat');
});

test('back-facing paws alternate a half cycle apart with a continuous far-leg swing',()=>{
 let nearLifted=0,farLifted=0;
 for(let i=0;i<200;i++){const phase=i/200,near=pawCycle(phase+.25),far=rearLegMotion(phase);if(near.lift>0)nearLifted++;if(far.lift>0)farLifted++;assert.ok(near.planted||far.planted,'at least one rear paw supports the cat');if(far.planted)assert.equal(far.lift,0);for(const key of ['x','y'])assert.ok(Math.abs(far[key]-rearLegMotion(phase+1e-6)[key])<.00001)}
 assert.ok(nearLifted>50&&farLifted>50);assert.deepEqual(rearLegMotion(.4,0),{x:0,y:-0,lift:pawCycle(1.15).lift,planted:pawCycle(1.15).planted});
 const a=rearLegMotion(1-1e-7),b=rearLegMotion(0);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-6);
});
test('hind-paw landmarks use actual opaque foot pixels through crop and source mapping',()=>{
 const width=80,height=100,data=new Uint8ClampedArray(width*height*4),bounds=[.1,0,.8,1],mapping={x:0,y:0,width:1,height:1};
 for(let y=91;y<99;y++)for(let x=46;x<54;x++)data[(y*width+x)*4+3]=255;
 const foot=rearLegFoot(data,width,height,bounds,mapping);assert.ok(Math.abs(foot.x-.6)<1e-10);assert.ok(foot.y>.97);
 const {near,far}=rearLegTargets(foot);assert.ok(far.paw[0]<near.paw[0]-.15);assert.ok(far.paw[1]<near.paw[1]);
 for(const id of ['domestic-calico','domestic-tuxedo','norwegian-forest','siamese','bengal'])assert.equal(needsExtraRearLeg(id),false,'original two-leg cats must not receive a third leg');assert.equal(needsExtraRearLeg('ragdoll'),true);
 assert.deepEqual(rearLegTargets(foot,'domestic-tuxedo').far.paw,[.90,.78],'the opposite-side raised paw must not be guessed from the near foot');
});
test('rear-leg material cache refreshes mutable night lighting and isolates custom images',()=>{
 const prior=globalThis.document,makeImage=(red=200)=>{const data=new Uint8ClampedArray(40*40*4);for(let y=20;y<40;y++)for(let x=18;x<28;x++){const i=(y*40+x)*4;data[i]=red;data[i+3]=255}return {width:40,height:40,data,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(data)})})}};
 globalThis.document={createElement:()=>({width:0,height:0,getContext(){return {putImageData:value=>{this.data=value.data}}}})};
 try{const image=makeImage(),frame={image,bounds:[0,0,1,1],cellWidth:40,cellHeight:40,sourceMapping:{x:0,y:0,width:1,height:1}},first=prepareRearLeg(frame,'ragdoll');assert.equal(prepareRearLeg(frame,'ragdoll'),first);const night=prepareRearLeg({...frame,materialRevision:10},'ragdoll');assert.notEqual(night,first);assert.equal(night.revision,10);assert.notEqual(prepareRearLeg({...frame,image:makeImage(80)},'ragdoll'),first)}finally{globalThis.document=prior}
});
