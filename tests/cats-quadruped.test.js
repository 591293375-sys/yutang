import test from 'node:test';
import assert from 'node:assert/strict';
import {QuadrupedFooting,quadrupedCycle,LEG_IDS} from '../src/themes/cats/quadruped.js';
import {animationSample,CatAnimationState} from '../src/themes/cats/animation.js';
const anchors=[{x:-.02,y:0},{x:-.01,y:-.004},{x:.015,y:-.01},{x:.025,y:-.014}];
test('four independent feet use a four-beat walk with at least two grounded supports',()=>{assert.equal(new Set(LEG_IDS).size,4);for(let i=0;i<400;i++){const steps=LEG_IDS.map((_,k)=>quadrupedCycle(i/400,k));assert.ok(steps.filter(s=>s.planted).length>=2);for(const step of steps)if(step.planted)assert.equal(step.lift,0)}});
test('stance positions remain fixed in world coordinates through acceleration and curved steering',()=>{const plan=new QuadrupedFooting();let x=0,y=0,distance=0,previous;let checks=0;for(let i=0;i<400;i++){const speed=.00012+.0001*Math.sin(i/30),angle=1+i*.001; x+=Math.cos(angle)*speed;y+=Math.sin(angle)*speed;distance+=speed;const feet=plan.sample({origin:{x,y},direction:{x:Math.cos(angle),y:Math.sin(angle)},distance,stride:.03,anchors,moving:true});for(let k=0;k<4;k++){if(previous?.[k].planted&&feet[k].planted&&previous[k].cycle===feet[k].cycle){assert.ok(Math.hypot(feet[k].worldX-previous[k].worldX,feet[k].worldY-previous[k].worldY)<1e-10);checks++}}previous=feet}assert.ok(checks>500)});
test('a stationary cat cannot keep stepping when only its wall clock changes',()=>{const plan=new QuadrupedFooting(),args={origin:{x:.5,y:.3},direction:{x:-1,y:0},distance:.012,stride:.03,anchors,moving:false};assert.deepEqual(plan.sample(args),plan.sample(args));const s=animationSample({state:'walk',speed:.03,x:.5,y:.6,heading:2,strideDistance:.01},{scale:.07},0);assert.equal(s.jump,0);for(let t=0;t<15;t+=.1)assert.equal(animationSample({state:'interact',task:{tool:'mouse',elapsed:t}},{scale:.07},t).jump,0)});
test('real traversals release ground contacts while other actions never create a body jump',()=>{const plan=new QuadrupedFooting(),feet=plan.sample({origin:{x:.5,y:.3},direction:{x:1,y:0},distance:0,stride:.03,anchors,moving:false,airborne:true});assert.equal(feet.filter(f=>f.planted).length,0);const states=new CatAnimationState(),cat={id:'one',x:.5,y:.3,state:'walk',speed:.03,heading:2,facing:-1,strideDistance:0};const a=states.sample(cat,{scale:.07},0),b=states.sample({...cat,x:.51,strideDistance:.01},{scale:.07},.1);assert.equal(a.locomotion.key,b.locomotion.key);assert.ok(Number.isFinite(b.locomotion.stride));assert.equal(b.locomotion.origin.y,.3*9/16)});

test('front/back bank swaps release old foot contacts and replant inside the new limb reach',async()=>{
 const {quadrupedContacts}=await import('../src/themes/cats/quadruped.js');
 const frame={index:0,scale:1,cellWidth:300,cellHeight:300,bounds:[0,0,1,1],anchor:{x:.5,y:1},sourceMapping:{x:0,y:0,width:1,height:1}},atlas={referenceWidth:1},prepared={legs:anchors.map((a,i)=>({id:LEG_IDS[i],hip:[.3+i*.1,.6],paw:[.3+i*.1,.9-i*.03],far:i%2===1}))};
 const locomotion={key:{},origin:{x:.5,y:.3},direction:{x:-1,y:0},distance:.01,stride:.03};
 const before=quadrupedContacts(frame,atlas,90,'walkToward',{worldScale:1500,flip:1,locomotion},prepared);
 const after=quadrupedContacts({...frame,index:4},atlas,90,'walkAway',{worldScale:1500,flip:-1,locomotion:{...locomotion,origin:{x:.5001,y:.3},direction:{x:1,y:0},distance:.0101}},prepared);
 for(let i=0;i<4;i++){assert.ok(after[i].replant);assert.equal(after[i].planted,false);assert.notEqual(before[i].cycle,after[i].cycle);const hip=after[i].hip;assert.ok(Math.hypot(after[i].groundX-hip.x,after[i].groundY-hip.y)<65,'old opposite-side contact cannot drag a leg across the face')}
});
test('four-limb materials and dispatch do not depend on the old single-hind-leg patch',async()=>{
 const fs=await import('node:fs/promises'),code=await fs.readFile(new URL('../src/themes/cats/animation.js',import.meta.url),'utf8');
 assert.ok(code.includes('drawQuadruped'));assert.ok(!code.includes("from './hind-leg.js'"));
 const {limbKnee}=await import('../src/themes/cats/quadruped.js');for(const x of [-30,-10,0,10,30]){const knee=limbKnee({x:0,y:0},{x,y:35},38,1);assert.ok(Number.isFinite(knee.x)&&Number.isFinite(knee.y));assert.ok(Math.hypot(knee.x,knee.y)<60)}
});
test('paused clocks never invent strides and resetting a safe restored position never stretches legs across the garden',()=>{
 const plan=new QuadrupedFooting(),args={origin:{x:.5,y:.3},direction:{x:-1,y:0},distance:.03,stride:.03,anchors,moving:true};const first=plan.sample(args);for(let i=0;i<200;i++)assert.deepEqual(plan.sample(args),first);
 const restored=plan.sample({...args,origin:{x:.8,y:.1},distance:.03});for(const f of restored)assert.ok(Math.abs(f.worldX-.8)<.07&&Math.abs(f.worldY-.1)<.07);
});

test('an unreachable planted point triggers a bounded replacement step instead of lengthening the skeleton',()=>{
 const plan=new QuadrupedFooting(),base={origin:{x:0,y:0},direction:{x:1,y:0},distance:0,stride:.024,anchors,hips:anchors.map(a=>({x:a.x,y:a.y-.02})),reach:[.026,.026,.026,.026],moving:true};plan.sample(base);
 const next=plan.sample({...base,origin:{x:-.018,y:0},distance:.001});assert.ok(next.some(f=>f.replant));for(let i=0;i<4;i++){const hip={x:-.018+base.hips[i].x,y:base.hips[i].y};assert.ok(Math.hypot(next[i].worldX-hip.x,next[i].worldY-hip.y)<=.02600001);if(next[i].replant)assert.equal(next[i].planted,false)}
});

test('short steps keep knee bends restrained instead of right-angle zigzags',async()=>{
 const {limbKnee}=await import('../src/themes/cats/quadruped.js');for(const sign of [-1,1])for(const paw of [{x:-16,y:20},{x:0,y:12},{x:16,y:32}]){const knee=limbKnee({x:0,y:0},paw,30,sign);assert.ok(Math.hypot(knee.x-paw.x*.5,knee.y-paw.y*.5)<=30*.18+1e-9)}
});

test('only real step takeoff/landing compress the body; every flat-ground action keeps zero body bob',async()=>{
 const {quadrupedBodyDrop}=await import('../src/themes/cats/quadruped.js');for(let i=0;i<=100;i++){const p=i/100;for(const stage of [null,undefined,'walk','idle','jump'])assert.equal(quadrupedBodyDrop(100,stage,p),0);assert.ok(quadrupedBodyDrop(100,'crouch',p)>=0&&quadrupedBodyDrop(100,'crouch',p)<=2.4);assert.ok(quadrupedBodyDrop(100,'land',p)<=1.4+1e-10)}assert.equal(quadrupedBodyDrop(100,'crouch',0),0);assert.equal(quadrupedBodyDrop(100,'land',0),0);assert.ok(quadrupedBodyDrop(100,'land',1)<1e-12);
});

test('all sixteen coats use smooth individually authored body undersides, with no rectangular cut masks',async()=>{
 const {CAT_PRESETS}=await import('../src/themes/cats/catalog.js'),{CAT_BODY_CONTOURS}=await import('../src/themes/cats/quadruped-contours.js'),{bodyContourAt}=await import('../src/themes/cats/quadruped.js');
 assert.equal(Object.keys(CAT_BODY_CONTOURS).length,16);for(const p of CAT_PRESETS)for(const bank of [0,4]){const contour=CAT_BODY_CONTOURS[p.id][bank];assert.ok(contour.length>=6);assert.equal(contour[0][0],0);assert.equal(contour.at(-1)[0],1);for(const [x,y] of contour)assert.ok(Math.abs(bodyContourAt(contour,x)-y)<1e-10);for(let i=1;i<1000;i++){const a=bodyContourAt(contour,(i-1)/1000),b=bodyContourAt(contour,i/1000);assert.ok(Number.isFinite(b)&&b>.2&&b<1.05);assert.ok(Math.abs(b-a)<.012,'natural body silhouette has no rectangular x discontinuity')}}
});
