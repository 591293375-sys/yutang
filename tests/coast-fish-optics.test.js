import test from 'node:test';
import assert from 'node:assert/strict';
import { animalDepth,animationFrameSample,deformAnimalPoint,spriteFrame } from '../src/themes/coast/animal-renderer.js';
import { submergeAnimalPixels } from '../src/themes/coast/art-materials.js';
import { SPECIES_BY_ID as species } from '../src/themes/coast/catalog.js';

const luma=(data,offset=0)=>data[offset]*.2126+data[offset+1]*.7152+data[offset+2]*.0722;
test('fish water transmission lowers bright-scale contrast while retaining eyes and alpha edges',()=>{
 const pixels=new Uint8ClampedArray([240,237,217,255,9,15,22,255,191,145,30,96,244,239,232,0]);
 const saved=pixels.slice(),old=submergeAnimalPixels(pixels),wet=submergeAnimalPixels(pixels,species.fish_silver);
 assert.ok(luma(wet)<luma(old)-20,'white fish scales must stop reading like dry paper on the surface');
 assert.ok(luma(wet)-luma(wet,4)>90,'body and dark eye remain legible under water');
 assert.ok(wet[0]<wet[1]&&wet[1]<wet[2],'the water absorbs warm wavelengths rather than desaturating to gray');
 for(let i=3;i<pixels.length;i+=4)assert.equal(wet[i],pixels[i]);
 assert.deepEqual(pixels,saved);assert.deepEqual(wet.slice(12),pixels.slice(12),'transparent RGB remains untouched');
 assert.deepEqual(submergeAnimalPixels(pixels,species.crab),old,'shore animals keep their previous material');
 const orange=new Uint8ClampedArray([244,129,18,255]),clownWet=submergeAnimalPixels(orange,species.fish_clown);
 const tint=animalDepth({phase:1,swimDepth:.55},species.fish_clown,{water:true,depth:.8}).tint;
 const mixed=Array.from({length:3},(_,i)=>orange[i]*(1-tint)+clownWet[i]*tint);
 assert.ok(mixed[0]>mixed[1]+10&&mixed[1]>mixed[2]+35,'clownfish keeps a distinct warm orange-gold body, not uniform blue');
});

test('underwater fish stay visible without changing projected size or stranded presentation',()=>{
 const fish=species.fish_silver,entity={phase:1,swimDepth:.55};
 for(let h=0;h<=1;h+=.01){
  const pose=animalDepth(entity,fish,{water:true,depth:h});
  const depth=h*(.38+.55*.62);
  assert.ok(Math.abs(pose.scale-(1-depth*.17))<1e-12,'existing size and hit envelope remain exact');
  assert.ok(pose.alpha>.73&&pose.tint>=.68&&pose.tint<=.92,'optical coloring carries depth rather than hiding the animal');
 }
 assert.deepEqual(animalDepth({...entity,stranded:true},fish,{water:true,depth:1}),{depth:0,scale:1,alpha:1,tint:0});
 assert.deepEqual(animalDepth(entity,fish,{water:false,depth:0}),{depth:0,scale:1,alpha:1,tint:0});
});

test('continuous tail sampling wraps seamlessly and removes nearest-frame hold/jump cadence',()=>{
 const count=32,fish=species.fish_silver,tail=phase=>deformAnimalPoint(fish,.06,.5,phase,.35).y;
 const continuous=phase=>{const f=animationFrameSample(phase,count);return tail(f.from/count)*(1-f.mix)+tail(f.to/count)*f.mix;};
 const samples=Array.from({length:240},(_,i)=>i/240),old=samples.map(p=>tail(Math.round(p*count)%count/count)),next=samples.map(continuous);
 const changes=values=>values.slice(1).map((v,i)=>Math.abs(v-values[i]));
 const previousSteps=changes(old),newSteps=changes(next);
 assert.ok(previousSteps.filter(v=>v===0).length>150,'fixture reproduces 32-frame stepped motion');
 assert.equal(newSteps.filter(v=>v<1e-8).length,0,'tail advances on every sampled frame');
 assert.ok(Math.max(...newSteps)<Math.max(...previousSteps)*.18,'a single frame no longer carries the whole pose jump');
 assert.ok(Math.abs(continuous(1-1e-7)-continuous(1+1e-7))<.00001,'no loop reset');
 assert.deepEqual(animationFrameSample(-.125,32),animationFrameSample(.875,32));
});

test('fractional poses use premultiplied additive mixing and preserve the original nearest hit mask',()=>{
 const oldDocument=globalThis.document,draws=[];
 globalThis.document={createElement:()=>{const target={width:0,height:0};const ctx={globalAlpha:1,globalCompositeOperation:'source-over',clearRect(){},drawImage(image){draws.push({image,alpha:this.globalAlpha,mode:this.globalCompositeOperation})}};target.getContext=()=>ctx;return target;}};
 try{
  const frames=Array.from({length:32},(_,i)=>({canvas:{id:'dry'+i},water:{id:'wet'+i},alpha:new Uint8Array([i]),alphaStride:1}));
  const sprite={width:96,height:48,frames,neutralFrame:{neutral:true}},phase=4.25/32;
  const result=spriteFrame(sprite,{phase:1},species.fish_silver,2,false,phase);
  assert.equal(result.alpha,frames[4].alpha);assert.equal(draws.length,4);
  assert.ok(draws.every(d=>d.mode==='lighter'));assert.deepEqual(draws.map(d=>d.alpha),[.75,.25,.75,.25]);
  assert.equal(spriteFrame(sprite,{},species.fish_silver,2,false,phase),result,'same phase reuses the blended surface');assert.equal(draws.length,4);
  assert.equal(spriteFrame(sprite,{},species.fish_silver,2,true,phase),sprite.neutralFrame);
  assert.equal(spriteFrame(sprite,{},species.crab,2,false,phase),frames[4],'crab gait and frame path are unchanged');
 }finally{globalThis.document=oldDocument;}
});
