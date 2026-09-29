import test from 'node:test';
import assert from 'node:assert/strict';
import {CoastGame,FISH_CATCH_RULES} from '../src/themes/coast/game.js';
import {findHabitat,habitatAt,isHabitatValid,pathIsHabitatValid} from '../src/themes/coast/geometry.js';
import {angleDelta} from '../src/themes/coast/motion.js';
const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const saved=entities=>({version:1,epochMs:0,nextId:100,entities,catalog:{},shells:0,rescues:0});
function creature(id,species='fish_silver',extra={}){return{id,species,...findHabitat(species,0,rng(23)),heading:0,phase:1,state:'scene',concealmentInitialized:true,concealment:null,...extra};}
function wetShore(){for(let y=30;y<880;y+=9)for(let x=30;x<1570;x+=9){const h=habitatAt(x,y,.05);if(!h.water&&h.wet&&!h.blocked&&isHabitatValid('fish_silver',x,y,1)&&isHabitatValid('shrimp',x,y,1))return{x,y}}throw Error('No wet shore');}

test('exposed shells only collect in catch mode and never use a bucket slot',()=>{
 const game=new CoastGame(saved([creature('shell','shell'),...Array.from({length:12},(_,i)=>creature('bucket-'+i,'crab',{state:'bucket'}))]),0,rng());
 const seen=game.interact('shell','observe',1000);assert.equal(seen.action,'observe');assert.match(seen.message,/捕捉/);assert.equal(game.shells,0);assert.equal(game.entities[0].state,'scene');assert.equal(game.catalog.shell.observed,1);
 assert.equal(game.interact('shell','observe',1001).ok,false);assert.equal(game.catalog.shell.observed,1);
 const collected=game.interact('shell','catch',1100);assert.equal(collected.action,'collect');assert.equal(game.shells,1);assert.equal(game.bucketCount(),12);assert.equal(game.catalog.shell.collected,1);assert.equal(game.interact('shell','catch',1101).ok,false);
});

test('a swimming fish evades two spaced catches along legal smooth paths and the third captures once',()=>{
 const game=new CoastGame(saved([creature('fish')]),0,rng()),fish=game.entities[0],before={x:fish.x,y:fish.y,heading:fish.heading};
 const first=game.interact(fish.id,'catch',1000);assert.equal(first.action,'escape');assert.equal(first.attempt,1);assert.equal(first.remainingAttempts,2);assert.equal(fish.catchAttempts,1);assert.equal(fish.state,'scene');assert.equal(game.bucketCount(),0);assert.deepEqual(game.catalog,{});assert.deepEqual({x:fish.x,y:fish.y,heading:fish.heading},before);assert.ok(fish.escapeTarget);
 const pending={...fish.escapeTarget};const tooSoon=game.interact(fish.id,'catch',1499);assert.equal(tooSoon.ok,false);assert.equal(tooSoon.action,'catch-wait');assert.equal(fish.catchAttempts,1);assert.deepEqual(fish.escapeTarget,pending);
 for(let ms=1516;ms<=2116;ms+=20){const old={x:fish.x,y:fish.y,heading:fish.heading};game.update(.02,ms);assert.ok(pathIsHabitatValid(fish.species,old.x,old.y,fish.x,fish.y,game.tide.level,13));assert.ok(Math.abs(angleDelta(old.heading,fish.heading))<=FISH_CATCH_RULES.turnRate*.02+1e-9);assert.ok(Math.hypot(fish.x-old.x,fish.y-old.y)<=FISH_CATCH_RULES.speed*.02+1e-9);}
 assert.ok(Math.hypot(fish.x-before.x,fish.y-before.y)>2,'the first escape must move the actual fish');
 const second=game.interact(fish.id,'catch',2200);assert.equal(second.action,'escape');assert.equal(second.attempt,2);assert.equal(second.remainingAttempts,1);assert.equal(game.interact(fish.id,'catch',2201).action,'catch-wait');
 const third=game.interact(fish.id,'catch',2700);assert.equal(third.action,'capture');assert.equal(fish.state,'bucket');assert.equal(fish.catchAttempts,undefined);assert.equal(fish.escapeTarget,undefined);assert.equal(game.bucketCount(),1);assert.equal(game.catalog.fish_silver.caught,1);assert.equal(game.interact(fish.id,'catch',2701).ok,false);assert.equal(game.catalog.fish_silver.caught,1);
});

test('a full bucket neither advances an ongoing chase nor starts a new escape',()=>{
 const game=new CoastGame(saved([creature('fish'),creature('last-crab','crab'),...Array.from({length:11},(_,i)=>creature('bucket-'+i,'crab',{state:'bucket'}))]),0,rng()),fish=game.entities[0];
 assert.equal(game.interact(fish.id,'catch',1000).action,'escape');assert.equal(game.interact('last-crab','catch',1100).action,'capture');const target={...fish.escapeTarget};
 assert.equal(game.interact(fish.id,'catch',1600).ok,false);assert.equal(fish.catchAttempts,1);assert.equal(fish.lastCatchAt,1000);assert.deepEqual(fish.escapeTarget,target);assert.equal(game.bucketCount(),12);
 const untouched=new CoastGame(saved([creature('untouched'),...Array.from({length:12},(_,i)=>creature('full-'+i,'crab',{state:'bucket'}))]),0,rng());
 assert.equal(untouched.interact('untouched','catch',1000).ok,false);assert.equal(untouched.entities[0].catchAttempts,undefined);assert.equal(untouched.entities[0].escapeTarget,undefined);
});

test('a missed catch launches a curved fast burst, then eases back to cruising without sliding or teleporting',()=>{
 const game=new CoastGame(saved([creature('burst','fish_clown',{x:650,y:300,heading:0,phase:1})]),0,rng()),fish=game.entities[0];
 assert.ok(isHabitatValid(fish.species,fish.x,fish.y,game.tide.level,95),'fixture needs room for the full dash');
 Object.assign(fish,{speed:17,moveAngle:0});game.pointer(fish.x,fish.y);
 const start={x:fish.x,y:fish.y};assert.equal(game.interact(fish.id,'catch',1000).action,'escape');
 let peak=0,travelAt600=0,previous={...start,heading:fish.heading},speedAt500=0;
 for(let frame=1;frame<=150;frame++){
  game.update(1/60,1000+frame*1000/60);const travel=Math.hypot(fish.x-previous.x,fish.y-previous.y);peak=Math.max(peak,fish.speed);
  assert.ok(travel<=112/60+1e-6,'even the fast launch must have a bounded distance per frame');
  assert.ok(pathIsHabitatValid(fish.species,previous.x,previous.y,fish.x,fish.y,game.tide.level,13));
  if(fish.escapeTarget&&travel>.01){const angle=Math.atan2(fish.y-previous.y,fish.x-previous.x);assert.ok(Math.abs(angleDelta(fish.heading,angle))<1e-6,'the fish must swim toward its own nose instead of sliding sideways');}
  if(frame===30)speedAt500=fish.speed;if(frame===36)travelAt600=Math.hypot(fish.x-start.x,fish.y-start.y);
  previous={x:fish.x,y:fish.y,heading:fish.heading};
 }
 assert.ok(peak>85,'a failed catch needs a noticeably faster escape than gentle cruising');
 assert.ok(travelAt600>30,'the burst must visibly clear the click during its first 600ms');
 assert.ok(Math.abs(fish.y-start.y)>3,'the tail-led turn should create a curved course');
 assert.ok(speedAt500>55);assert.ok(fish.speed<23,'the burst must settle back to ordinary swimming');
 assert.equal(fish.escapeTarget,undefined);assert.equal(fish.escapeStartedAt,undefined);assert.equal(fish.escapeElapsed,undefined);
 const persisted=game.snapshot().entities.find(e=>e.id===fish.id);assert.equal(persisted.escapeStartedAt,undefined);assert.equal(persisted.escapeElapsed,undefined);
});

test('chase progress expires after fifteen seconds, is not persisted, and release starts a fresh chase',()=>{
 const game=new CoastGame(saved([creature('fish')]),0,rng());assert.equal(game.interact('fish','catch',1000).attempt,1);
 const snapshot=game.snapshot();assert.equal(snapshot.entities[0].catchAttempts,undefined);assert.equal(snapshot.entities[0].escapeTarget,undefined);
 const restored=new CoastGame(snapshot,1100,rng());assert.equal(restored.interact('fish','catch',1200).attempt,1);
 game.update(0,16000);assert.equal(game.entities[0].catchAttempts,undefined);assert.equal(game.interact('fish','catch',16001).attempt,1);assert.equal(game.interact('fish','catch',16501).attempt,2);assert.equal(game.interact('fish','catch',17001).action,'capture');
 assert.equal(game.release('fish',17100).released,1);game.update(0,18000);assert.equal(game.entities[0].state,'scene');assert.equal(game.interact('fish','catch',18001).attempt,1);
 game.update(0,50000);assert.equal(game.entities[0].catchAttempts,undefined);assert.equal(game.entities[0].escapeTarget,undefined);
});

test('stranded fish and shrimp enter the bucket with one catch while observe still rescues',()=>{
 const p=wetShore();for(const species of ['fish_silver','shrimp'])for(const mode of ['catch','observe']){
  const game=new CoastGame(saved([creature('stranded',species,{...p,stranded:true})]),1500000,rng());assert.equal(game.entities[0].stranded,true);
  const result=game.interact('stranded',mode,1500001);assert.equal(result.action,mode==='catch'?'capture':'rescue');assert.equal(game.bucketCount(),mode==='catch'?1:0);assert.equal(game.rescues,mode==='observe'?1:0);assert.equal(game.entities[0].catchAttempts,undefined);
 }
});

test('becoming stranded clears a pending chase before one-click collection and covered recovery',()=>{
 const p=wetShore(),game=new CoastGame(saved([creature('fish','fish_silver',p)]),700000,rng()),fish=game.entities[0];game.clock.setSpeed(60,700000);
 assert.equal(game.interact('fish','catch',700010).attempt,1);game.update(0,712000);assert.equal(fish.stranded,true);assert.equal(fish.catchAttempts,undefined);assert.equal(fish.escapeTarget,undefined);
 game.clock.jump('high',712001);game.update(0,712001);assert.equal(fish.stranded,false);assert.equal(game.interact('fish','catch',712002).attempt,1);
});

test('escape keeps tide migration targets intact and validates routes beside exposed rocks',()=>{
 const game=new CoastGame(saved([creature('fish')]),0,rng()),fish=game.entities[0],crevice=game.findCrevice(fish);assert.ok(crevice);
 Object.assign(fish,{x:crevice.x,y:crevice.y,migration:'retreat',moveTarget:{...crevice.exit}});const route={...fish.moveTarget};
 assert.equal(game.interact('fish','catch',1000).action,'escape');assert.deepEqual(fish.moveTarget,route);assert.equal(fish.migration,'retreat');
 for(let ms=1020;ms<=2200;ms+=20){const old={x:fish.x,y:fish.y};game.update(.02,ms);assert.ok(pathIsHabitatValid(fish.species,old.x,old.y,fish.x,fish.y,game.tide.level,13));}
 assert.deepEqual(fish.moveTarget,route);assert.equal(fish.migration,'retreat');assert.equal(fish.escapeTarget,undefined);
});


test('only fish evade: a swimming shrimp and every ground creature still capture immediately',()=>{
 for(const species of ['shrimp','crab','sandcrab','hermit','starfish','octopus']){
  const game=new CoastGame(saved([creature('direct',species)]),0,rng());assert.equal(game.interact('direct','catch',1000).action,'capture');assert.equal(game.bucketCount(),1);assert.equal(game.entities[0].catchAttempts,undefined);
 }
});

test('reversing the tide during an escape retains the new retreat route and remains legal',()=>{
 const data=saved([creature('migrant','fish_silver',{x:900,y:400,migrant:true,admittedCycle:0,entry:{x:1100,y:24},forageHome:{x:1050,y:380},moveTarget:{x:1050,y:380},migration:'inward'})]);data.shorePreparedCycle=0;
 const game=new CoastGame(data,700000,rng()),fish=game.entities[0];assert.equal(game.interact(fish.id,'catch',700100).action,'escape');
 assert.equal(game.setTideDirection('falling',700200).ok,true);assert.ok(['outward','retreat'].includes(fish.migration));const retreat={...fish.moveTarget};
 for(let ms=700220;ms<=701500;ms+=20){const old={x:fish.x,y:fish.y};game.update(.02,ms);assert.ok(pathIsHabitatValid(fish.species,old.x,old.y,fish.x,fish.y,game.tide.level,13));}
 assert.deepEqual(fish.moveTarget,retreat);assert.equal(fish.escapeTarget,undefined);assert.equal(fish.catchAttempts,1);assert.equal(game.bucketCount(),0);
});


test('a foraging visitor smoothly returns after escaping instead of snapping to its home radius',()=>{
 const data=saved([creature('forager','fish_silver',{x:624,y:300,migrant:true,admittedCycle:0,forageHome:{x:600,y:300},migration:'forage'})]);data.shorePreparedCycle=0;
 const game=new CoastGame(data,700000,rng()),fish=game.entities[0];Object.assign(fish,{heading:0,moveAngle:0,speed:15});game.pointer(619,300);
 assert.equal(game.interact(fish.id,'catch',700000).action,'escape');let farthest=24,previous={x:fish.x,y:fish.y};
 // The stronger dash travels farther; allow the calm return stroke enough
 // time to retrace that longer route instead of snapping back to its circle.
 for(let frame=1;frame<=600;frame++){
  game.update(1/60,700000+frame*1000/60);const travelled=Math.hypot(fish.x-previous.x,fish.y-previous.y);
  assert.ok(travelled<=FISH_CATCH_RULES.speed/60+1e-6,'forager jumped '+travelled+'px at frame '+frame);
  assert.ok(pathIsHabitatValid(fish.species,previous.x,previous.y,fish.x,fish.y,game.tide.level,13));
  farthest=Math.max(farthest,Math.hypot(fish.x-600,fish.y-300));previous={x:fish.x,y:fish.y};
 }
 assert.ok(farthest>40,'fixture must leave the normal forage radius');assert.ok(Math.hypot(fish.x-600,fish.y-300)<=24+1e-6);assert.equal(fish.migration,'forage');assert.equal(fish.moveTarget,null);
 assert.equal(game.interact(fish.id,'catch',710100).attempt,2);assert.ok(fish.escapeReturnPath?.length);assert.equal(game.interact(fish.id,'catch',710600).action,'capture');assert.equal(fish.escapeReturnPath,undefined);
});

test('reloading an escaped forager outside its home radius also returns by bounded swimming',()=>{
 const data=saved([creature('forager','fish_silver',{x:658,y:300,migrant:true,admittedCycle:0,forageHome:{x:600,y:300},migration:'forage'})]);data.shorePreparedCycle=0;
 const game=new CoastGame(data,700000,rng()),fish=game.entities[0];assert.equal(fish.x,658);
 for(let frame=1;frame<=420;frame++){const old={x:fish.x,y:fish.y};game.update(1/60,700000+frame*1000/60);assert.ok(Math.hypot(fish.x-old.x,fish.y-old.y)<=42/60+1e-6);assert.ok(pathIsHabitatValid(fish.species,old.x,old.y,fish.x,fish.y,game.tide.level,13));}
 assert.ok(Math.hypot(fish.x-600,fish.y-300)<=24+1e-6);
});
