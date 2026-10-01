import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {distance,surfaceAt} from '../src/themes/cats/geometry.js';
import {LEG_WIDTHS,FAR_LIMB_OFFSETS,legRadius,leapPose} from '../src/themes/cats/quadruped.js';
import {mergeWindowRects} from '../src/themes/cats/canopy-windows.js';
const seeded=n=>{let seed=n;return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)};
const presets=['ragdoll','british-shorthair','domestic-orange-white','siamese','domestic-tuxedo','maine-coon','persian','bengal','abyssinian','chinchilla','russian-blue','domestic-calico'];
const garden=(n,seed)=>new CatGame({version:1,cats:presets.slice(0,n).map((p,i)=>({id:'c'+i,presetId:p,name:'猫'+i,personality:['friendly','relaxed','active','playful','curious','shy','independent','sleepy'][i%8],x:.35+(i%4)*.12,y:.4+Math.floor(i/4)*.15,active:true,appearance:{version:1,strokes:[]}})),props:[],environment:{},nextId:50},{random:seeded(seed)});

test('the far fore and hind legs stand up-screen toward the head, never mid-torso',()=>{
 assert.ok(FAR_LIMB_OFFSETS.front.paw[0]<0&&FAR_LIMB_OFFSETS.front.paw[1]<0,'far forepaw shows beneath the cheek');
 assert.ok(FAR_LIMB_OFFSETS.hind.paw[0]<0&&FAR_LIMB_OFFSETS.hind.paw[1]<0,'far hind paw shows beneath the belly');
 assert.ok(Math.abs(FAR_LIMB_OFFSETS.front.paw[0])<.12,'the pair of forelegs stays together under the chest');
});

test('limbs are drawn at each coat\'s measured painted thickness',()=>{
 assert.equal(Object.keys(LEG_WIDTHS).length,16);
 for(const [id,width] of Object.entries(LEG_WIDTHS)){assert.ok(width>.075&&width<.13,id);assert.ok(legRadius(id)*2*.78>width*.8,'shin is not a thin stilt');}
 assert.ok(legRadius('british-shorthair')>legRadius('abyssinian'),'cobby breeds have thicker legs than slender ones');
});

test('a leap gathers, extends the hind legs, tucks then reaches with the forelegs, and lands front-first',()=>{
 const crouch=leapPose('crouch',1,{style:'jump',direction:'up'},100),push=leapPose('jump',.16,{style:'jump',direction:'up'},100),reach=leapPose('jump',.72,{style:'jump',direction:'up'},100),land=leapPose('land',.1,{style:'jump',direction:'up'},100);
 assert.ok(crouch.drop>3&&crouch.sy<1,'the body sinks and loads');assert.ok(push.pitch>.1,'the head rises at take-off');assert.ok(push.legs[2].f<-.05,'hind legs drive back');assert.ok(push.legs[0].u>.05,'forelegs tuck');
 assert.ok(reach.legs[0].f>.04,'forelegs reach for the far edge');assert.ok(reach.legs[2].u>.04,'hind legs tuck up');
 assert.equal(land.legs[0].free,false,'forepaws take the weight first');assert.ok(land.legs[2].free&&land.legs[2].u>0,'hind paws touch down after');
 const down=leapPose('jump',.6,{style:'jump',direction:'down'},100);assert.ok(down.pitch<-.08,'a drop leans the head down toward the landing');
 const hop=leapPose('jump',.16,{style:'hop',direction:'up'},100);assert.ok(Math.abs(hop.pitch)<Math.abs(push.pitch),'a hop is a smaller gesture than a leap');
 assert.equal(leapPose('jump',.5,{style:'stride'},100).airborne,false,'stepping over a low lip keeps walking');
});

test('a cat lingering on the stone step makes way for cats heading to the porch and bed',()=>{
 const game=garden(8,7*7919),c=game.cats;
 for(const [i,f] of [[0,'bed'],[1,'bed'],[2,'rock'],[3,'climbing'],[4,'water'],[5,'step']])assert.ok(game.visitFacility(f,c[i].id).ok);
 let reachedWater=false;for(let t=0;t<110*30;t++){game.update(1/30,{});reachedWater||=distance(c[4],{x:.807,y:.232})<.02;}
 assert.equal(c[0].state,'sleep');assert.equal(c[1].state,'sleep');assert.equal(surfaceAt(c[0]).id,'bed');assert.equal(surfaceAt(c[1]).id,'bed');
 assert.ok(reachedWater,'the water-bowl visitor got through');
});

test('a busy courtyard never leaves a cat frozen with somewhere to go',()=>{
 for(const seed of [11,23]){
  const game=garden(10,seed*7919),random=seeded(seed),still=new Map();let worst=0;
  for(let t=0;t<150*30;t++){
   if(t%(20*30)===0){const cat=game.cats[Math.floor(random()*game.cats.length)];game.visitFacility(['bed','rock','step','water','climbing','sun'][Math.floor(random()*6)],cat.id);}
   game.update(1/30,{night:t>75*30});if(t%15)continue;
   for(const cat of game.cats){const k=still.get(cat.id);if(cat.path.length&&!cat.traverse&&k&&distance(k,cat)<.004){k.n+=.5;worst=Math.max(worst,k.n)}else still.set(cat.id,{x:cat.x,y:cat.y,n:0})}
  }
  assert.ok(worst<12,`seed ${seed}: a cat waited ${worst}s without moving`);
 }
});

test('toys are played with face-on: the cat stands beside the toy and faces it',()=>{
 for(const tool of ['scratch','yarn','mouse']){
  const game=garden(1,5),cat=game.cats[0];Object.assign(cat,{x:.45,y:.6});const toy={x:.6,y:.62};
  const result=game.command(tool,toy,cat.id);assert.ok(result.ok);const prop=game.props.find(p=>p.id===result.propId);
  for(let t=0;t<12*30&&cat.task?.phase!=='interact';t++)game.update(1/30,{});
  assert.equal(cat.task?.phase,'interact',tool);
  for(let t=0;t<20;t++){game.update(1/30,{});if(cat.path.length)continue;const dx=prop.x-cat.x;if(Math.abs(dx)>.003)assert.equal(cat.facing,dx>0?1:-1,`${tool}: the cat faces its toy`);}
  assert.ok(Math.abs(prop.y-cat.y)<.035&&distance(cat,prop)<.06,`${tool}: forepaws can reach the toy`);
 }
});

test('see-through canopy windows merge so no leaf patch is drawn twice',()=>{
 const rects=mergeWindowRects([{cx:10,cy:10,rx:5,ry:5},{cx:16,cy:10,rx:5,ry:5},{cx:60,cy:60,rx:4,ry:4}]);
 assert.equal(rects.length,2);assert.equal(rects[0].windows.length,2);
 for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];assert.ok(!(a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h))}
});
