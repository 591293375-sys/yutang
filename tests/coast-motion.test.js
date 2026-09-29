import test from 'node:test';
import assert from 'node:assert/strict';
import { angleDelta, steerMotion, crabCruiseSpeed } from '../src/themes/coast/motion.js';
import { CoastGame } from '../src/themes/coast/game.js';
import { findHabitat, pathIsHabitatValid, isHabitatValid, habitatAt } from '../src/themes/coast/geometry.js';
const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

test('fish heading and speed approach a reversed target within angular and acceleration limits',()=>{
 const fish={heading:0,phase:0,speed:0};const dt=1/60;
 steerMotion(fish,Math.PI,22,dt);assert.ok(Math.abs(fish.heading)<.04);assert.ok(fish.speed<=26*dt);
 for(let i=0;i<180;i++){const heading=fish.heading,speed=fish.speed;steerMotion(fish,Math.PI,22,dt);assert.ok(Math.abs(angleDelta(heading,fish.heading))<=2.2*dt+1e-9);assert.ok(fish.speed-speed<=26*dt+1e-9);assert.ok(speed-fish.speed<=36*dt+1e-9);}
 assert.ok(Math.abs(angleDelta(fish.heading,Math.PI))<.03);assert.ok(fish.speed>20);
 const previous=fish.speed;steerMotion(fish,Math.PI,0,dt);assert.ok(fish.speed>0&&fish.speed<previous);
});

test('crab gait alternates walking and rest while its body remains sideways to travel',()=>{
 const crab={heading:0,phase:0,speed:0};let moving=0,resting=0;
 for(let i=0;i<240;i++){const speed=crabCruiseSpeed(crab,.05);steerMotion(crab,Math.PI/2,speed,.05,{crab:true});assert.ok(Math.abs(Math.cos(crab.moveAngle-crab.heading))<1e-10);if(crab.motionState==='moving')moving++;else resting++;}
 assert.ok(moving>80);assert.ok(resting>30);
});

test('eased evasion and observe responses retain legal swimming paths without instant heading jumps',()=>{
 const point=findHabitat('fish_silver',0,rng(88)),entity={id:'motion-fish',species:'fish_silver',...point,heading:Math.PI,phase:0,state:'scene',stranded:false,submerged:true,concealmentInitialized:true,revealNeeded:0};
 const game=new CoastGame({version:1,epochMs:0,nextId:2,entities:[entity],catalog:{},shells:0,rescues:0},0,rng(20)),fish=game.entities[0];
 const heading=fish.heading;game.interact(fish.id,'observe',1);assert.equal(fish.heading,heading);game.pointer(fish.x-40,fish.y,true);
 for(let i=1;i<=120;i++){const before={x:fish.x,y:fish.y,heading:fish.heading};game.update(1/60,i*1000/60);assert.ok(Math.abs(angleDelta(before.heading,fish.heading))<=2.2/60+1e-9);assert.ok(pathIsHabitatValid(fish.species,before.x,before.y,fish.x,fish.y,game.tide.level,9));}
});


test('a visible shore crab overtaken by rising water walks back to legal shore without crossing rocks',()=>{
 // This point is exposed beside the new low-water line, then overtaken at .3.
 const entity={id:'shore-recover',species:'hermit',x:1140,y:330,heading:0,phase:0,state:'scene',concealmentInitialized:true,revealNeeded:0};
 assert.ok(isHabitatValid('hermit',entity.x,entity.y,0),'fixture begins on exposed shore beside the middle-right boulder');
 const game=new CoastGame({version:1,epochMs:0,entities:[entity],nextId:2},0,rng(1));const crab=game.entities[0],start={x:crab.x,y:crab.y};
 game.clock.setLevel(.3,0);game.update(0,0);assert.equal(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),false);
 for(let ms=50;ms<=15000;ms+=50){const before={x:crab.x,y:crab.y};game.update(.05,ms);assert.ok(Math.hypot(crab.x-before.x,crab.y-before.y)<=8*.05+1e-6);for(let i=0;i<=4;i++){const h=habitatAt(before.x+(crab.x-before.x)*i/4,before.y+(crab.y-before.y)*i/4,game.tide.level);assert.equal(h.blocked,false);assert.equal(h.pool,false);}}
 assert.ok(Math.hypot(crab.x-start.x,crab.y-start.y)>25);assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level));
});


test('visible crabs anticipate a complete accelerated tide without becoming stranded or crossing rocks',()=>{
 const game=new CoastGame(null,0,rng(1));game.clock.setSpeed(60,0);
 for(let ms=100;ms<=30000;ms+=100){
  const before=new Map(game.entities.map(e=>[e.id,{x:e.x,y:e.y}]));game.update(.1,ms);
  for(const crab of game.entities.filter(e=>e.state==='scene'&&!e.concealment&&game.getSpecies(e.species).kind==='crab')){
   assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),crab.id+' left its legal shore at '+ms);
   const previous=before.get(crab.id);if(!previous)continue;
   const travel=Math.hypot(crab.x-previous.x,crab.y-previous.y);assert.ok(travel<=48+1e-6,crab.id+' teleported');
   const steps=Math.max(1,Math.ceil(travel/4));for(let i=0;i<=steps;i++)assert.equal(habitatAt(previous.x+(crab.x-previous.x)*i/steps,previous.y+(crab.y-previous.y)*i/steps,game.tide.level).blocked,false);
  }
 }
});


test('falling tide planning keeps real sandcrab and hermit samples inside the dry shore body margin',()=>{
 const samples=[{species:'sandcrab',x:1554.7513522967072,y:591.4790728019692,level:.38644},{species:'hermit',x:1201.3409437707917,y:861.5639492556298,level:.23484}];
 for(const sample of samples){
  const epochMs=-(900+Math.acos(2*sample.level-1)/Math.PI*600)*1000;
  const entity={id:'falling-'+sample.species,species:sample.species,x:sample.x,y:sample.y,heading:0,phase:0,state:'scene',concealmentInitialized:true};
  const game=new CoastGame({version:1,epochMs,entities:[entity],nextId:2},0,rng(1)),crab=game.entities[0];game.clock.setSpeed(60,0);
  for(let frame=1;frame<=180;frame++){game.update(1/60,frame*1000/60);assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),sample.species+' left the shore margin at frame '+frame);}
 }
});


test('legacy left-bottom shore crabs migrate to the new beach before a complete tide',()=>{
 const entities=[{id:'left-sandcrab',species:'sandcrab',x:480.521810169321,y:865.7176093714568},{id:'left-hermit',species:'hermit',x:476.5853576743429,y:871.8651584308134}].map(e=>({...e,heading:0,phase:0,state:'scene',concealmentInitialized:true}));
 const game=new CoastGame({version:1,epochMs:0,entities,nextId:3},0,rng(2));
 assert.deepEqual(game.entities.map(e=>e.id),entities.map(e=>e.id),'terrain migration preserves each existing animal');
 assert.ok(entities.every(e=>!isHabitatValid(e.species,e.x,e.y,0)),'the legacy positions genuinely need terrain migration');
 assert.ok(game.entities.every(e=>isHabitatValid(e.species,e.x,e.y,0)));assert.equal(game.rescues,0);assert.equal(game.shells,0);
 game.clock.setSpeed(60,0);
 for(let frame=1;frame<=1800;frame++){const before=new Map(game.entities.map(e=>[e.id,{x:e.x,y:e.y}]));game.update(1/60,frame*1000/60);for(const crab of game.entities.filter(e=>e.id.startsWith('left-'))){assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),crab.id+' invalid at '+frame+' / '+game.tide.level);const old=before.get(crab.id);assert.ok(Math.hypot(crab.x-old.x,crab.y-old.y)<=8+1e-6,'route must walk rather than teleport');for(let step=0;step<=4;step++){const h=habitatAt(old.x+(crab.x-old.x)*step/4,old.y+(crab.y-old.y)*step/4,game.tide.level);assert.equal(h.blocked,false);assert.equal(h.pool,false);}}}
});


test('capturing and releasing a navigating crab discards its old shoreline route',()=>{
 const game=new CoastGame({version:1,epochMs:0,nextId:2,entities:[{id:'route-crab',species:'sandcrab',x:480.521810169321,y:865.7176093714568,heading:0,phase:0,state:'scene',concealmentInitialized:true}]},0,rng(2));
 game.update(1/60,17);const crab=game.entities[0];assert.equal(crab.shoreEscaping,true);assert.ok(Array.isArray(crab.shoreWaypoints));
 assert.equal(game.interact(crab.id,'catch',18).ok,true);assert.equal(crab.state,'bucket');assert.equal(crab.shoreWaypoints,undefined);assert.equal(crab.shoreEscaping,undefined);
 assert.equal(game.release(crab.id,19).ok,true);assert.equal(crab.shoreWaypoints,undefined);assert.equal(crab.shorePlanAt,undefined);
});
