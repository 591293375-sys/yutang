import test from 'node:test';
import assert from 'node:assert/strict';
import {TideClock,tideAt} from '../src/themes/coast/tide.js';
import {CoastGame} from '../src/themes/coast/game.js';
import {normalizeCoast} from '../src/themes/coast/storage.js';
import {isHabitatValid,habitatAt} from '../src/themes/coast/geometry.js';
const rng=(seed=2)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};

test('manual full tide starts visibly, reaches its endpoint in thirty seconds then holds for five minutes',()=>{
 const clock=new TideClock(0,0);clock.setDirection('rising',0);const start=clock.snapshot(0);assert.equal(start.level,0);assert.equal(start.manual,true);assert.equal(start.remainingSeconds,30);
 assert.ok(clock.snapshot(100).level>.004);assert.ok(clock.snapshot(1000).level>.04);let last=0;
 for(let ms=0;ms<30000;ms+=50){const s=clock.snapshot(ms);assert.ok(s.level>=last&&s.level<1);assert.equal(s.phase,'rising');last=s.level;}
 assert.ok(1-clock.snapshot(29999).level<1e-7);assert.equal(clock.snapshot(30000).level,1);assert.equal(clock.snapshot(30000).manual,false);assert.equal(clock.snapshot(30000).phase,'high');assert.equal(clock.snapshot(30000).remainingSeconds,300);assert.equal(clock.snapshot(329999).phase,'high');assert.equal(clock.snapshot(330000).phase,'falling');
 const auto=new TideClock(0,0);for(const ms of [0,300000,600000,900000,1500000,1800000])assert.equal(auto.snapshot(ms).level,tideAt(0,ms).level);assert.equal(auto.snapshot(1800000).cycle,1);
});

test('manual reversals are continuous, proportional, and same-direction clicks never restart transition or hold',()=>{
 const clock=new TideClock(0,250000),level=clock.snapshot(250000).level;clock.setDirection('falling',250000);assert.equal(clock.snapshot(250000).level,level);assert.ok(Math.abs(clock.manualTide.durationMs-level*30000)<1e-9);
 const manual={...clock.manualTide},epoch=clock.epochMs;clock.setDirection('falling',251000);assert.deepEqual(clock.manualTide,manual);assert.equal(clock.epochMs,epoch);
 const turning=clock.snapshot(251000).level;clock.setDirection('rising',251000);assert.equal(clock.snapshot(251000).level,turning);assert.ok(clock.snapshot(251100).level>turning);const end=clock.manualTide.startMs+clock.manualTide.durationMs;
 const hold=clock.snapshot(end+1000),holdEpoch=clock.epochMs;clock.setDirection('rising',end+1000);assert.equal(clock.epochMs,holdEpoch);assert.equal(clock.snapshot(end+1000).remainingSeconds,hold.remainingSeconds);assert.equal(clock.snapshot(end+1000).manual,false);
});

test('manual production time persists independently of debug and predicts the same visible water',()=>{
 const game=new CoastGame(null,0,rng());game.setTideDirection('rising',0);assert.equal(game.isDebugTime(),false);game.update(.1,100);assert.ok(game.tide.level>.004);assert.equal(game.clock.predict(100,900).level,game.clock.snapshot(1000).level);
 game.clock.setSpeed(60,100);game.update(0,200);assert.equal(game.isDebugTime(),true);const real=game.clock.productionSnapshot(200),saved=game.snapshot();assert.ok(saved.manualTide);assert.equal(saved.manualTide.startMs,0);
 const restored=new CoastGame(saved,200,rng());assert.equal(restored.tide.level,real.level);assert.equal(restored.isDebugTime(),false);assert.equal(restored.tide.manual,true);
 game.clock.reset(200);game.update(0,200);assert.equal(game.tide.level,real.level);game.clock.setLevel(.5,200);game.update(0,200);assert.ok(Math.abs(game.tide.level-.5)<1e-12);game.setTideDirection('falling',200);assert.ok(Math.abs(game.tide.level-.5)<1e-12);assert.equal(game.isDebugTime(),false);
 const broken=normalizeCoast({...saved,manualTide:{...saved.manualTide,durationMs:Infinity}});assert.equal(broken.manualTide,null);assert.equal(normalizeCoast({...saved,manualTide:{...saved.manualTide,fromLevel:.9}}).manualTide,null);assert.ok(normalizeCoast({version:1,epochMs:0,entities:[]}));
});

test('sleep and reload during manual tide reconcile without replaying admissions or rewards',()=>{
 const game=new CoastGame(null,0,rng()),ids=game.entities.map(e=>e.id),next=game.nextId;game.setTideDirection('rising',0);const saved=game.snapshot();
 game.update(0,20000);const reload=new CoastGame(saved,20000,rng());assert.equal(game.tide.level,reload.tide.level);assert.equal(game.tide.manual,true);assert.deepEqual(game.entities.map(e=>e.id),ids);assert.equal(game.nextId,next);assert.equal(reload.nextId,next);assert.equal(game.rescues,0);assert.equal(game.shells,0);
 const late=new CoastGame(saved,100000,rng());assert.equal(late.tide.phase,'high');assert.equal(late.tide.manual,false);assert.equal(late.snapshot().manualTide,null);assert.equal(late.nextId,next);
});

test('real-time manual rise and fall keep migrated legacy left-inlet crabs legal with continuous motion',()=>{
 const entities=[{id:'left-sandcrab',species:'sandcrab',x:480.521810169321,y:865.7176093714568},{id:'left-hermit',species:'hermit',x:476.5853576743429,y:871.8651584308134}].map(e=>({...e,heading:0,phase:0,state:'scene',concealmentInitialized:true}));
 const game=new CoastGame({version:1,epochMs:0,nextId:3,entities},0,rng());
 assert.deepEqual(game.entities.map(e=>e.id),entities.map(e=>e.id));assert.ok(game.entities.every(e=>isHabitatValid(e.species,e.x,e.y,0)));
 game.setTideDirection('rising',0);
 for(let frame=1;frame<=3600;frame++){
  const ms=frame*1000/60;if(frame===1801)game.setTideDirection('falling',30000);const before=new Map(game.entities.map(e=>[e.id,{x:e.x,y:e.y}]));game.update(1/60,ms);
  for(const crab of game.entities.filter(e=>e.id.startsWith('left-'))){const old=before.get(crab.id);assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),crab.id+' invalid at '+frame+' / '+game.tide.level);assert.ok(Math.hypot(crab.x-old.x,crab.y-old.y)<=64/60+1e-6);for(let j=0;j<=4;j++){const h=habitatAt(old.x+(crab.x-old.x)*j/4,old.y+(crab.y-old.y)*j/4,game.tide.level);assert.equal(h.blocked,false);assert.equal(h.pool,false);}}
 }
 assert.equal(game.clock.speed,1);assert.equal(game.tide.level,0);assert.equal(game.tide.phase,'low');assert.equal(game.tide.manual,false);
});

test('repeated manual reversals keep population budgets and unique IDs bounded in real time',()=>{
 const game=new CoastGame(null,0,rng(220229));game.setTideDirection('rising',0);let maximum=0;
 for(let frame=1;frame<=3600;frame++){const ms=frame*1000/60;if(frame%300===0)game.setTideDirection(frame%600?'falling':'rising',ms);game.update(1/60,ms);maximum=Math.max(maximum,game.aquaticCount());assert.equal(new Set(game.entities.map(e=>e.id)).size,game.entities.length);assert.ok(game.liveCount()<=52);assert.ok(game.shellCount()<=24);for(const e of game.entities)if(e.state==='scene'&&!e.concealment&&game.getSpecies(e.species).kind==='crab')assert.ok(isHabitatValid(e.species,e.x,e.y,game.tide.level),e.id+' invalid at '+frame);}
 assert.ok(maximum<=18);assert.equal(game.shells,0);assert.equal(game.rescues,0);assert.equal(game.admissionCycle,0);
});


test('temporary debug level, jump and pause leave the live manual transition untouched until reset',()=>{
 const clock=new TideClock(0,0);clock.setDirection('rising',0);const manual=clock.serializeManual(0),epoch=clock.epochMs;
 clock.setLevel(.8,1000);assert.ok(Math.abs(clock.snapshot(1000).level-.8)<1e-12);assert.equal(clock.snapshot(1000).manual,false);assert.deepEqual(clock.serializeManual(1000),manual);
 clock.jump('low',1000);assert.equal(clock.snapshot(1500).level,0);assert.deepEqual(clock.serializeManual(1500),manual);assert.equal(clock.epochMs,epoch);
 clock.reset(2000);assert.equal(clock.isDebug(2000),false);assert.equal(clock.snapshot(2000).level,clock.productionSnapshot(2000).level);assert.equal(clock.snapshot(2000).manual,true);
 clock.setPaused(true,2000);assert.equal(clock.snapshot(4000).level,clock.snapshot(2000).level);assert.ok(clock.productionSnapshot(4000).level>clock.snapshot(4000).level);assert.deepEqual(clock.serializeManual(4000),manual);
 clock.reset(4000);assert.equal(clock.snapshot(4000).level,clock.productionSnapshot(4000).level);assert.equal(clock.isDebug(4000),false);
});

test('short remaining manual changes stay bounded and malformed continuation anchors are rejected',()=>{
 const clock=new TideClock(0,0);clock.setLevel(.99,0);clock.setDirection('rising',0);assert.equal(clock.manualTide.durationMs,1500);const state={version:1,epochMs:clock.epochMs,manualTide:clock.serializeManual(0),entities:[]};assert.ok(normalizeCoast(state).manualTide);
 assert.equal(normalizeCoast({...state,epochMs:state.epochMs+10}).manualTide,null);
 assert.equal(normalizeCoast({...state,manualTide:{...state.manualTide,fromLevel:0}}).manualTide,null);
 assert.equal(clock.snapshot(1500).phase,'high');assert.equal(clock.snapshot(1500).manual,false);assert.equal(clock.snapshot(1500).remainingSeconds,300);
});

test('manual real-time rise and fall keep visible swimming fish and shrimp in full-body water habitat',()=>{
 for(const seed of [1,23,220229]){const game=new CoastGame(null,0,rng(seed));game.setTideDirection('rising',0);let checks=0;for(let frame=1;frame<=3660;frame++){const ms=frame*1000/60;if(frame===1861)game.setTideDirection('falling',31000);game.update(1/60,ms);for(const e of game.entities){if(e.state!=='scene'||e.concealment||e.stranded||!game.getSpecies(e.species).aquatic||(e.entryProgress??1)<.08)continue;checks++;assert.ok(isHabitatValid(e.species,e.x,e.y,game.tide.level),seed+' / '+e.id+' invalid at '+frame+' / '+game.tide.phase+' / '+e.migration);}}assert.ok(checks>30000);}
});


test('manual tide lets left-beach crabs walk through successive route waypoints without being overtaken',()=>{
 for(const seed of [7,18]){const game=new CoastGame(null,0,rng(seed));game.setTideDirection('rising',0);
 for(let frame=1;frame<=3660;frame++){
  const ms=frame*1000/60;if(frame===1861)game.setTideDirection('falling',31000);
  const before=new Map(game.entities.map(e=>[e.id,{x:e.x,y:e.y}]));game.update(1/60,ms);
  for(const crab of game.entities.filter(e=>e.state==='scene'&&!e.concealment&&game.getSpecies(e.species).kind==='crab')){
   assert.ok(isHabitatValid(crab.species,crab.x,crab.y,game.tide.level),crab.id+' invalid at '+frame+' / '+game.tide.level);
   const old=before.get(crab.id);if(old)assert.ok(Math.hypot(crab.x-old.x,crab.y-old.y)<=64/60+1e-6,'continuous migration may not teleport');
  }
 }
 }
});


test('a manual direction click spreads shore searches over updates while water starts immediately',()=>{
 const game=new CoastGame({version:1,epochMs:-1500000,nextId:1,entities:[]},0,rng(7));game.seed();game.initializeConcealments();
 const visible=game.entities.filter(e=>e.state==='scene'&&!e.concealment&&game.getSpecies(e.species).kind==='crab');
 assert.ok(visible.length>2);game.setTideDirection('rising',0);
 assert.ok(visible.filter(e=>e.shorePlanAt).length<=1,'button frame cannot search all crab routes');
 for(let frame=1;frame<=12;frame++){
  const before=new Map(visible.map(e=>[e.id,e.shorePlanAt]));game.update(1/60,frame*1000/60);
  assert.ok(visible.filter(e=>before.get(e.id)!==e.shorePlanAt).length<=1,'at most one shore search belongs to a real-time update');
 }
 assert.ok(game.tide.level>.005,'water begins moving while the individual routes are being scheduled');
 assert.ok(visible.filter(e=>e.shorePlanAt).length>2);
});
