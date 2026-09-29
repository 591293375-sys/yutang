import test from 'node:test';
import assert from 'node:assert/strict';
import { CoastGame } from '../src/themes/coast/game.js';
import { SPECIES_BY_ID } from '../src/themes/coast/catalog.js';
import { habitatAt, findHabitat, isHabitatValid, pathIsHabitatValid } from '../src/themes/coast/geometry.js';
import { normalizeCoast, loadCoast, saveCoast, COAST_STORAGE_KEY } from '../src/themes/coast/storage.js';
const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function data(entities=[],extra={}){return {version:1,epochMs:0,nextId:100,entities,catalog:{},shells:0,rescues:0,...extra};}
function entity(id,species='fish_silver',level=0,state='scene'){
 const point=findHabitat(species,level,rng(Number(id.replace(/\D/g,''))||1));
 return {id,species,...point,heading:0,phase:0,state,stranded:false,concealmentInitialized:true,concealment:null,revealSteps:0,revealNeeded:0,submerged:habitatAt(point.x,point.y,level).water};
}

test('capture is atomic, bucket has 12 slots, and full bucket leaves target alone',()=>{
 const game=new CoastGame(data(Array.from({length:13},(_,i)=>entity('e-'+i,'shrimp'))),0,rng());
 for(let i=0;i<12;i++)assert.equal(game.interact('e-'+i,'catch',i+1).ok,true);
 assert.equal(game.view().bucket.length,12);assert.equal(game.catalog.shrimp.caught,12);
 assert.equal(game.interact('e-0','catch',20).ok,false);assert.equal(game.interact('e-12','catch',20).ok,false);
 assert.equal(game.entities[12].state,'scene');assert.equal(game.catalog.shrimp.caught,12);
 assert.equal(game.liveCount(),13);
});

test('exposed shells can be collected only once and their IDs never return after reload',()=>{
 const shell=entity('shell-99','shell');const game=new CoastGame(data([shell]),0,rng());
 assert.equal(game.interact(shell.id,'catch',10).ok,true);assert.equal(game.interact(shell.id,'catch',11).ok,false);
 assert.equal(game.shells,1);assert.equal(game.catalog.shell.collected,1);
 const saved=game.snapshot();assert.equal(saved.entities.length,0);
 const restored=new CoastGame(saved,100,rng());assert.equal(restored.entities.length,0);assert.equal(restored.shells,1);
 restored.update(0,1800001);assert.ok(!restored.entities.some(e=>e.id===shell.id));assert.equal(restored.shells,1);
});

test('single, species and all releases commit legal destinations and never duplicate animals',()=>{
 const game=new CoastGame(data([entity('e-1'),entity('e-2'),entity('e-3','crab'),entity('e-4','octopus')].map(e=>({...e,state:'bucket'}))),0,rng());
 assert.equal(game.release('e-1',20).released,1);assert.equal(game.release('e-1',21).ok,false);
 assert.equal(game.release('species:fish_silver',30).released,1);assert.equal(game.release('all',40).released,2);
 assert.equal(game.bucketCount(),0);assert.equal(game.entities.length,4);
 for(const e of game.entities)assert.ok(isHabitatValid(e.species,e.target.x,e.target.y,game.tide.level));
 const saved=game.snapshot();assert.ok(saved.entities.every(e=>e.state==='scene'));assert.equal(saved.entities.length,4);
 const restored=new CoastGame(saved,50,rng());for(const e of restored.entities)assert.ok(isHabitatValid(e.species,e.x,e.y,restored.tide.level));
});

function exposedPoint(){
 for(let y=30;y<880;y+=9)for(let x=30;x<1570;x+=9){const low=habitatAt(x,y,.05);if(isHabitatValid('fish_silver',x,y,1)&&!low.water&&low.wet&&!low.blocked)return{x,y};}
 throw new Error('No exposed shore point');
}

test('falling tide strands at most three existing animals, rescue is atomic, covering water auto recovers',()=>{
 const point=exposedPoint(), entities=Array.from({length:6},(_,i)=>({...entity('e-'+i,'fish_silver',1),...point,submerged:true}));
 const game=new CoastGame(data(entities),700000,rng());
 game.update(0,1420000);assert.equal(game.entities.filter(e=>e.stranded).length,3);assert.equal(game.strandedThisCycle,3);
 const target=game.entities.find(e=>e.stranded);assert.equal(game.interact(target.id,'observe',1420010).ok,true);assert.equal(game.interact(target.id,'observe',1420011).ok,false);assert.equal(game.rescues,1);
 const saved=game.snapshot();assert.ok(saved.entities.every(e=>!['rescuing','releasing'].includes(e.state)));
 game.clock.jump('high',1420020);game.update(0,1420020);assert.equal(game.entities.filter(e=>e.stranded).length,0);assert.equal(game.rescues,1);
});

test('offline return reconciles current water without population growth, rewards or replay',()=>{
 const point=exposedPoint();const saved=data([{...entity('e-1','fish_silver',1),...point,stranded:true},{...entity('e-2','crab'),state:'bucket'}],{shells:9,rescues:2,fallingCycle:0,strandedThisCycle:3});
 const game=new CoastGame(saved,100*1800000+1500000,rng());
 assert.equal(game.entities.length,2);assert.equal(game.shells,9);assert.equal(game.rescues,2);assert.equal(game.transitions.length,0);assert.equal(game.bucketCount(),1);
 const fish=game.entities[0];assert.equal(fish.stranded,true);assert.equal(fish.x,point.x);assert.equal(fish.y,point.y);assert.equal(habitatAt(fish.x,fish.y,game.tide.level).wet,true);
 const covered=new CoastGame(saved,100*1800000+700000,rng());assert.equal(covered.entities[0].stranded,false);assert.equal(covered.rescues,2);
 game.update(.016,100*1800000+1500016);assert.equal(game.entities.length,2);
});

test('cycle replenishment has unique IDs, global caps and no automatic rewards',()=>{
 const game=new CoastGame(null,0,rng());
 for(let cycle=1;cycle<18;cycle++)game.update(0,cycle*1800000);
 assert.ok(game.liveCount()<=52);assert.ok(game.shellCount()<=24);assert.equal(new Set(game.entities.map(e=>e.id)).size,game.entities.length);assert.equal(game.shells,0);assert.equal(game.rescues,0);
 const count=game.entities.length;for(let i=0;i<30;i++)game.update(.016,17*1800000+i*16);assert.equal(game.entities.length,count);
});

test('coast storage is isolated, rejects corrupt payloads and resolves presentation states',()=>{
 const map=new Map([['fusheng-fish','old koi'],['fusheng-settings','old settings']]);const storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 assert.equal(loadCoast(storage),null);map.set(COAST_STORAGE_KEY,'broken');assert.equal(loadCoast(storage),null);
 const fish={...entity('coast-104'),state:'rescuing',target:findHabitat('fish_silver',0,rng(22))};
 assert.equal(saveCoast(data([fish,fish]),storage),true);const saved=loadCoast(storage);assert.equal(saved.hadValidState,true);assert.equal(saved.entities.length,1);assert.equal(saved.entities[0].state,'scene');assert.equal(saved.nextId,105);
 assert.equal(map.get('fusheng-fish'),'old koi');assert.equal(map.get('fusheng-settings'),'old settings');
 assert.equal(normalizeCoast({version:2,epochMs:0,entities:[]}),null);
 assert.equal(saveCoast(data(),{setItem(){throw Error('full')}}),false);
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked')}});assert.equal(loadCoast(),null);assert.equal(saveCoast(data()),false);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage;}
});


test('one complete sixtyfold cycle is chronological and backward debug jumps do not replenish twice',()=>{
 const game=new CoastGame(null,0,rng(23));game.clock.setSpeed(60,0);const phases=new Set();
 for(let ms=0;ms<=30000;ms+=250){game.update(.12,ms);phases.add(game.tide.phase);assert.ok(game.tide.level>=0&&game.tide.level<=1);assert.ok(game.strandedThisCycle<=3);assert.ok(game.liveCount()<=52);assert.ok(game.shellCount()<=24);}
 assert.deepEqual([...phases],['rising','high','falling','low']);assert.equal(game.tide.cycle,1);assert.equal(game.rescues,0);assert.equal(game.shells,0);
 const total=game.entities.length;game.clock.reset(30000);game.update(0,30000);game.clock.setSpeed(60,30000);game.update(0,60000);assert.equal(game.entities.length,total);
});

test('prototype keys are not accepted as creature species in local saves',()=>{
 for(const species of ['__proto__','constructor','toString']) assert.equal(normalizeCoast(data([{...entity('e-1'),species}])).entities.length,0);
});


test('rising visitors enter through permanent water edges in two persisted stages',()=>{
 const game=new CoastGame(null,0,rng(9));const initial=new Set(game.entities.map(e=>e.id));assert.equal(game.aquaticCount(),8);
 game.update(0,250000);const visitors=game.entities.filter(e=>!initial.has(e.id)&&SPECIES_BY_ID[e.species].aquatic);
 assert.equal(visitors.length,5);for(const e of visitors){assert.equal(e.y,24);assert.ok(isHabitatValid(e.species,e.x,e.y,0));assert.ok(e.moveTarget);assert.equal(e.migration,'inward');}
 const restored=new CoastGame(game.snapshot(),250001,rng(9));restored.update(0,250002);assert.equal(restored.aquaticCount(),13);
 for(let ms=270000;ms<=710000;ms+=20000)restored.update(0,ms);assert.equal(restored.aquaticCount(),18);assert.equal(restored.admissionStage,2);
 const again=new CoastGame(restored.snapshot(),700001,rng(9));for(let i=0;i<20;i++)again.update(0,700002+i);assert.equal(again.aquaticCount(),18);
});

test('a physical full tide cycle has more high-water fish, organic stranding and legal edge departures',()=>{
 const game=new CoastGame(null,0,rng(23));game.clock.setSpeed(60,0);let high=0,low=0,maxStranded=0;let previous=new Map();
 for(let ms=0;ms<=29900;ms+=100){
   game.update(.1,ms);
   for(const e of game.entities){const old=previous.get(e.id);if(old&&e.state==='scene'&&old.state==='scene')assert.ok(Math.hypot(e.x-old.x,e.y-old.y)<=229,'living animals move continuously');}
   previous=new Map(game.entities.map(e=>[e.id,{...e}]));
   if(game.tide.phase==='high')high=Math.max(high,game.aquaticCount());if(game.tide.phase==='low')low=game.aquaticCount();maxStranded=Math.max(maxStranded,game.view().strandedCount);
 }
 assert.ok(high>=16&&high<=20);assert.ok(low>=6&&low<=8);assert.ok(high>low);assert.ok(maxStranded>=1&&maxStranded<=3);assert.equal(game.rescues,0);assert.equal(game.entities.filter(e=>e.migrant).length,0);
});

test('missed cycles never replay admissions and offline visitors reconcile without awards',()=>{
 const game=new CoastGame(null,0,rng(11));game.update(0,1800000*100+700000);assert.ok(game.aquaticCount()<=18);assert.ok(game.liveCount()<=52);assert.equal(game.admissionCycle,100);assert.equal(game.admissionStage,2);
 const restored=new CoastGame(game.snapshot(),1800000*101+1500000,rng(11));assert.equal(restored.aquaticCount(),8);assert.equal(restored.rescues,0);assert.equal(restored.shells,0);assert.ok(restored.entities.filter(e=>SPECIES_BY_ID[e.species].aquatic).every(e=>isHabitatValid(e.species,e.x,e.y,restored.tide.level)));
});

test('pointer movement turns nearby free-swimming fish away without moving their position directly',()=>{
 const game=new CoastGame(data([entity('pointer-1')]),0,rng(4)),fish=game.entities[0];const x=fish.x,y=fish.y;game.pointer(x-30,y,true);assert.equal(fish.x,x);assert.equal(fish.y,y);game.update(.01,1);assert.ok(Math.cos(fish.heading)>.9);game.pointer(0,0,false);assert.equal(game.pointerState,null);
});


test('sleeping update and reopening the same save reconcile identically without offline arrivals',()=>{
 const game=new CoastGame(null,0,rng(41));game.update(0,700000);assert.equal(game.aquaticCount(),18);assert.equal(game.entities.filter(e=>e.migrant).length,10);
 const saved=game.snapshot(),now=5*86400000+1500000;const reopened=new CoastGame(saved,now,rng(41));
 game.update(0,now);assert.equal(game.aquaticCount(),8);assert.equal(game.entities.filter(e=>e.migrant).length,0);
 assert.deepEqual(game.entities.map(e=>e.id).sort(),reopened.entities.map(e=>e.id).sort());assert.equal(game.entities.length,saved.entities.length-10);
 assert.equal(game.nextId,saved.nextId);assert.equal(game.shells,saved.shells);assert.equal(game.rescues,saved.rescues);assert.equal(game.admissionCycle,reopened.admissionCycle);assert.equal(game.admissionStage,reopened.admissionStage);
});

test('sixtyfold debug snapshots cannot persist future lifecycle ledgers or reuse entity IDs',()=>{
 const game=new CoastGame(null,0,rng(43));const ids=new Set(game.entities.map(e=>e.id));game.clock.setSpeed(60,0);game.update(0,300000);assert.equal(game.tide.cycle,10);
 const saved=game.snapshot();assert.equal(saved.admissionCycle,0);assert.ok(saved.shorePreparedCycle<=0);assert.ok(saved.retreatCycle<=0);assert.ok(saved.fallingCycle<=0);
 const restored=new CoastGame(saved,300001,rng(43));const next=restored.nextId;restored.update(0,700000);assert.equal(restored.admissionCycle,0);assert.ok(restored.aquaticCount()>8);
 const entrants=restored.entities.filter(e=>e.migrant);assert.ok(entrants.length>0);assert.ok(entrants.every(e=>Number(e.id.split('-').at(-1))>=next&&!ids.has(e.id)));assert.equal(new Set(restored.entities.map(e=>e.id)).size,restored.entities.length);
 const legacyFuture={...saved,admissionCycle:10,admissionStage:2,shorePreparedCycle:10,retreatCycle:10,fallingCycle:10};
 const repaired=new CoastGame(legacyFuture,300001,rng(43));repaired.update(0,700000);assert.equal(repaired.admissionCycle,0);assert.ok(repaired.aquaticCount()>8);
});

test('same-cycle debug phase jumps do not consume the real admission ledger',()=>{
 const game=new CoastGame(null,0,rng(47));game.clock.jump('high',0);game.update(0,0);assert.equal(game.aquaticCount(),18);
 const saved=game.snapshot();assert.equal(saved.admissionStage,0);const restored=new CoastGame(saved,1,rng(47));assert.equal(restored.aquaticCount(),8);
 for(let ms=10000;ms<=700000;ms+=10000)restored.update(0,ms);assert.equal(restored.aquaticCount(),18);
 const again=new CoastGame(restored.snapshot(),700001,rng(47));again.update(0,700002);assert.equal(again.aquaticCount(),18);
});

test('observe transactions refresh covered stranded animals before awarding a rescue',()=>{
 const point=exposedPoint(),saved=data([{...entity('stale-stranded','fish_silver',1),...point,stranded:true,submerged:false}],{fallingCycle:0,strandedThisCycle:1});
 const game=new CoastGame(saved,1500000,rng(51));assert.equal(game.entities[0].stranded,true);
 const result=game.interact('stale-stranded','observe',2500000);assert.equal(result.ok,true);assert.equal(result.action,'observe');assert.equal(game.rescues,0);assert.equal(game.catalog.fish_silver.rescued,0);assert.equal(game.tide.phase,'high');
 assert.equal(game.entities[0].stranded,false);assert.ok(isHabitatValid('fish_silver',game.entities[0].x,game.entities[0].y,game.tide.level));
});

test('coordinate clicks refresh and hit-test again after an offline relocation',()=>{
 let point;for(let y=100;y<880&&!point;y+=12)for(let x=50;x<1560;x+=12){const h=habitatAt(x,y,0);if(h.wet&&!h.water&&h.distance>70&&isHabitatValid('fish_silver',x,y,1)){point={x,y};break;}}assert.ok(point);
 const fish={...entity('stale-point','fish_silver',1),...point};const game=new CoastGame(data([fish]),700000,rng(53));
 game.update(0,700001);const result=game.interact(point.x,point.y,'catch',1500000);assert.equal(game.tide.phase,'low');assert.equal(game.bucketCount(),0);assert.equal(result.ok,false);assert.equal(game.rescues,0);
});

test('release uses current tide habitat and refresh never changes duplicate-capture protection',()=>{
 const game=new CoastGame(data([entity('release-current','fish_silver',0,'bucket')]),1500000,rng(59));
 const result=game.release('release-current',2500000);assert.equal(result.ok,true);assert.equal(game.tide.phase,'high');const fish=game.entities[0];assert.ok(isHabitatValid(fish.species,fish.target.x,fish.target.y,game.tide.level));
 assert.equal(game.release('release-current',2500001).ok,false);assert.equal(game.entities.length,1);assert.equal(game.bucketCount(),0);
});


test('high-water visitors choose separated shallow foraging targets with valid return routes',()=>{
 const game=new CoastGame(null,0,rng(23));game.update(0,700000);const visitors=game.entities.filter(e=>e.migrant);
 assert.equal(game.aquaticCount(),18);assert.equal(visitors.length,10);
 const points=visitors.map(e=>e.moveTarget);assert.equal(new Set(points.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2))).size,10);
 // Complete central stones occupy part of the former 500px-wide open route.
 // Visitors still span the upper and lower beach with room to circle each home.
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);assert.ok(Math.max(...xs)-Math.min(...xs)>450);assert.ok(Math.max(...ys)-Math.min(...ys)>400);
 for(const e of visitors){
   assert.ok(pathIsHabitatValid(e.species,e.entry.x,e.entry.y,e.moveTarget.x,e.moveTarget.y,game.tide.level,9));
   assert.ok(isHabitatValid(e.species,e.moveTarget.x,e.moveTarget.y,game.tide.level,game.getSpecies(e.species).kind==='fish'?39:35),'a visitor can circle its home without grazing a reef');
   const nearest=Math.min(...visitors.filter(other=>other!==e).map(other=>Math.hypot(e.moveTarget.x-other.moveTarget.x,e.moveTarget.y-other.moveTarget.y)));
   assert.ok(nearest>35,'foraging targets leave at least one body width between visitors');
 }
});
