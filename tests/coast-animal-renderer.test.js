import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceHeading,animalDepth,animationPhase,advanceAnimationPhase,concealmentPoint,concealed} from '../src/themes/coast/animal-renderer.js';
import {SPECIES_BY_ID as species} from '../src/themes/coast/catalog.js';

test('dorsal fish point right while unchanged swimming artwork keeps its measured upper-left axis',()=>{
  const dorsalIds=['fish_silver','fish_turquoise','fish_yellow','fish_blue'];
  for(const id of dorsalIds){
    const fish=species[id],[hx,hy,tx,ty]=fish.headAxis;
    assert.equal(sourceHeading(fish),0,`${id}: dorsal replacement is already aligned head-right`);
    assert.ok(hx>tx&&hy===ty,`${id}: right-facing dorsal anatomy uses a horizontal head-tail axis`);
    assert.ok(fish.asset.endsWith(`/${id}-dorsal.png`),`${id}: preserve the original illustration and use its separate dorsal replacement`);
  }
  const original=Object.values(species).filter(s=>s.aquatic&&!dorsalIds.includes(s.id));
  const angles=original.map(sourceHeading);
  assert.deepEqual(original.map(s=>s.id).sort(),['shrimp','fish_clown','fish_band','fish_puffer'].sort());
  assert.ok(angles.every(a=>a< -2&&a> -3),'unchanged source illustrations still face upper left and need their original rotation');
  assert.equal(new Set(angles.map(a=>a.toFixed(3))).size,original.length,'unchanged artwork retains its individually measured head-tail axes');
  for(const animal of original)assert.ok(animal.asset.endsWith(`/${animal.id}.png`),`${animal.id}: unchanged artwork keeps its original asset`);
  assert.equal(sourceHeading(species.crab),Math.PI/2,'crab eyes and claws face down in the original');
});
test('underwater depth reduces scale and contrast continuously; exposed fish stay full size',()=>{
  const e={phase:1},s=species.fish_clown;
  const shallow=animalDepth(e,s,{water:true,depth:.1}),deep=animalDepth(e,s,{water:true,depth:.9});
  assert.ok(deep.scale<shallow.scale&&deep.alpha<shallow.alpha&&deep.tint>shallow.tint);
  assert.equal(animalDepth({...e,stranded:true},s,{water:true,depth:1}).scale,1);
  const shell=animalDepth(e,species.shell,{water:true,depth:.15});
  assert.ok(shell.alpha>0&&shell.alpha<1,'shallow covered shells remain visible');
  assert.equal(animalDepth(e,species.shell,{water:true,depth:.7}).alpha,0);
});
test('resting crab legs are stationary and concealment clue keeps its anchor',()=>{
  const e={phase:1,motionState:'resting',speed:0};
  assert.equal(animationPhase(e,species.crab,2),animationPhase(e,species.crab,4));
  assert.notEqual(animationPhase({...e,motionState:'moving',speed:10},species.crab,2),animationPhase({...e,motionState:'moving',speed:10},species.crab,4));
  const hidden={state:'scene',concealment:'crevice',x:100,y:100,concealmentAnchor:{x:80,y:80}};
  assert.deepEqual(concealmentPoint(hidden),{x:80,y:80});assert.equal(concealed(hidden),true);
  assert.equal(concealed({...hidden,concealment:null}),false);
});
test('speed changes integrate a continuous tail phase and repeated hit reads do not advance it',()=>{
  const fish=species.fish_clown,e={phase:1,speed:4,motionState:'moving'};
  let state=advanceAnimationPhase(null,e,fish,1000);
  for(let i=1;i<=30;i++)state=advanceAnimationPhase(state,e,fish,1000+i/60);
  const fast=advanceAnimationPhase(state,{...e,speed:60},fish,state.at+1/60);
  const delta=(fast.phase-state.phase+1)%1;
  assert.ok(delta>0&&delta<.015,`abrupt speed change jumped phase by ${delta}`);
  const sameTime=advanceAnimationPhase(fast,{...e,speed:60},fish,fast.at);
  assert.equal(sameTime.phase,fast.phase);
  const paused=advanceAnimationPhase(null,{...e,speed:0,motionState:'resting'},species.crab,2);
  assert.equal(advanceAnimationPhase(paused,{...e,speed:0,motionState:'resting'},species.crab,5).phase,paused.phase);
});

test('a fast fish burst beats its tail visibly faster and smoothly settles after the escape',()=>{
 const fish=species.fish_clown,e={phase:1,speed:17,motionState:'moving'};
 let state=advanceAnimationPhase(null,e,fish,0);
 const ordinary=state.rate;let previous=state.phase;
 for(let frame=1;frame<=36;frame++){
  state=advanceAnimationPhase(state,{...e,speed:100},fish,frame/60);
  assert.ok((state.phase-previous+1)%1<.071,'a faster stroke must still advance phase continuously');previous=state.phase;
 }
 assert.ok(state.rate>ordinary*2.8,'the escape needs clearly faster propulsion than ordinary swimming');
 const fast=state.rate;
 for(let frame=37;frame<=126;frame++){state=advanceAnimationPhase(state,e,fish,frame/60);assert.ok((state.phase-previous+1)%1<.071);previous=state.phase;}
 assert.ok(state.rate<fast*.4);assert.ok(Math.abs(state.rate-ordinary)<.001,'tail cadence returns to cruising without resetting its phase');
});


test('visible swimming deformation bends the tail and fins without moving the head as a rigid sticker', async()=>{
 const {deformAnimalPoint}=await import('../src/themes/coast/animal-renderer.js');
 for(const id of ['fish_silver','fish_clown','fish_puffer','shrimp']){const s=species[id],aspect=.45;let tailMin=Infinity,tailMax=-Infinity,headMotion=0;for(let i=0;i<64;i++){const p=i/64,tail=deformAnimalPoint(s,.08,.5,p,aspect),head=deformAnimalPoint(s,.96,.5,p,aspect);tailMin=Math.min(tailMin,tail.y);tailMax=Math.max(tailMax,tail.y);headMotion=Math.max(headMotion,Math.hypot(head.x-.96,head.y-.5));}assert.ok((tailMax-tailMin)*aspect*s.size>1.8,id+' tail must visibly move at native scene size');assert.ok(headMotion<.001,id+' head must stay anchored');}
 const top=deformAnimalPoint(species.fish_clown,.68,.12,.25,.5),bottom=deformAnimalPoint(species.fish_clown,.68,.88,.25,.5);assert.ok(Math.abs((top.y-.12)-(bottom.y-.88))>.015,'pectoral fins spread separately from the spine');
});

test('crab carapaces and hermit shells stay fixed while opposite leg groups take distinct steps',async()=>{
 const {deformAnimalPoint}=await import('../src/themes/coast/animal-renderer.js');
 for(const id of ['crab','sandcrab','crab_rock','crab_pale','hermit']){const s=species[id],u=id==='hermit'?.73:.35,aspect=id==='hermit'?1:1.6;for(let i=0;i<32;i++){const p=i/32,body=deformAnimalPoint(s,id==='hermit'?.3:.45,.5,p,aspect);assert.deepEqual(body,{x:id==='hermit'?.3:.45,y:.5});}const a=deformAnimalPoint(s,u,.08,.25,aspect),b=deformAnimalPoint(s,u,.08,.75,aspect);assert.ok(Math.hypot(a.x-b.x,(a.y-b.y)*aspect)*s.size/Math.max(1,aspect)>1.3,id+' legs must visibly step');const opposite=deformAnimalPoint(s,u,.92,.25,aspect);assert.ok(Math.abs((a.x-u)-(opposite.x-u))>.02,id+' opposite legs alternate');}
});

test('stopping crabs finish a step and fold back to neutral while pause and reduced motion stay still',async()=>{
 const {spriteFrame}=await import('../src/themes/coast/animal-renderer.js');const e={phase:1,speed:6,motionState:'moving'};let state=advanceAnimationPhase(null,e,species.crab,0);for(let i=1;i<25;i++)state=advanceAnimationPhase(state,e,species.crab,i/60);let before=state.phase;e.speed=0;e.motionState='resting';for(let i=25;i<145;i++){const next=advanceAnimationPhase(state,e,species.crab,i/60);assert.ok((next.phase-state.phase+1)%1<.06);state=next;}assert.ok(Math.min(state.phase,Math.abs(state.phase-.5),1-state.phase)<.001,'feet settle at a neutral half cycle');assert.equal(advanceAnimationPhase(state,e,species.crab,state.at).phase,state.phase);const neutral={neutral:true},sprite={neutralFrame:neutral,frames:Array.from({length:32},(_,i)=>({i}))};assert.equal(spriteFrame(sprite,e,species.crab,100,true,.32),neutral,'explicit reduced motion overrides a cached nonzero phase');assert.notEqual(spriteFrame(sprite,{speed:17,motionState:'moving'},species.fish_clown,1,undefined,.32),neutral,'unset reduced motion keeps animation enabled');
});


test('cached deformation keeps a continuous opaque spine and watercolor alpha without strip seams',async()=>{
 const {deformSpritePixels}=await import('../src/themes/coast/animal-renderer.js');const width=96,height=56,pad=12,artWidth=72,artHeight=32,pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const u=(x-pad)/artWidth,v=(y-pad)/artHeight;if(u>.04&&u<.97&&Math.abs(v-.5)<.15){const i=(y*width+x)*4;pixels[i]=183;pixels[i+1]=135;pixels[i+2]=72;pixels[i+3]=255;}}
 let changed=0;for(const phase of [0,.125,.25,.5,.75]){const frame=deformSpritePixels(pixels,width,height,artWidth,artHeight,pad,species.fish_silver,phase);for(let x=pad+6;x<pad+artWidth-5;x++){let opaque=0;for(let y=0;y<height;y++)if(frame[(y*width+x)*4+3]>240)opaque++;assert.ok(opaque>=3,'each body cross section stays joined after bending');}for(let i=0;i<frame.length;i+=4)if(frame[i+3]>0){assert.ok(Math.abs(frame[i]-183)<=1);assert.ok(Math.abs(frame[i+1]-135)<=1);assert.ok(Math.abs(frame[i+2]-72)<=1,'transparent edge samples do not darken watercolor');if(frame[i+3]!==pixels[i+3])changed++;}}assert.ok(changed>300,'cached pixels actually deform rather than return the same image');
});
