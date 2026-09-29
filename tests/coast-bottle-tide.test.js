import test from 'node:test';
import assert from 'node:assert/strict';
import {BottleDrift,normalizeBottles} from '../src/themes/coast/bottles.js';
import {TideClock,TIDE_CYCLE_SECONDS} from '../src/themes/coast/tide.js';
import {normalizeCoast} from '../src/themes/coast/storage.js';
import {CURATED_LETTERS} from '../src/themes/coast/letter-catalog.js';
const start=1700000000000,cycleMs=TIDE_CYCLE_SECONDS*1000;
const memory=()=>({value:null,fail:false,getItem(){return this.value},setItem(key,value){if(this.fail)throw Error('quota');this.value=value}});
const make=(storage,clock,now=start)=>new BottleDrift({storage,nowMs:now,random:()=>.3,getTide:time=>clock.bottleArrival(time)});
const tick=(drift,now)=>drift.update(0,now,0);
const incoming=drift=>drift.bottles.filter(b=>b.kind==='incoming');
const pick=(drift,now)=>{assert.equal(incoming(drift).length,1);assert.equal(drift.pickup(incoming(drift)[0].id,now).ok,true)};

test('the first active rising tide delivers immediately, once across pickup, theme switches and restart',()=>{
 const storage=memory(),clock=new TideClock(start,start),now=start+300000;let drift=make(storage,clock,now);
 tick(drift,now);assert.equal(incoming(drift).length,1);const key=drift.snapshot().lastArrivalTideKey;assert.ok(key);pick(drift,now+1);
 tick(drift,now+100);assert.equal(incoming(drift).length,0);
 for(let i=0;i<3;i++){drift=make(storage,new TideClock(start,now+1000+i),now+1000+i);tick(drift,now+1000+i);assert.equal(incoming(drift).length,0);assert.equal(drift.snapshot().lastArrivalTideKey,key)}
 tick(drift,start+cycleMs+100);assert.equal(incoming(drift).length,1);assert.notEqual(drift.snapshot().lastArrivalTideKey,key);assert.equal(drift.view().collection.length,1);
});

test('manual low/falling to rising starts one arrival and its stable key survives manual save normalization',()=>{
 const storage=memory(),now=start+1500000;let clock=new TideClock(start,now),drift=make(storage,clock,now);
 tick(drift,now);assert.equal(incoming(drift).length,0);
 clock.setDirection('rising',now);tick(drift,now);const firstKey=drift.snapshot().lastArrivalTideKey;pick(drift,now+1);
 clock.setDirection('rising',now+1000);tick(drift,now+1000);assert.equal(incoming(drift).length,0);assert.equal(clock.bottleArrival(now+1000).key,firstKey);
 const saved=normalizeCoast({version:1,epochMs:clock.epochMs,manualTide:clock.serializeManual(now+1000),entities:[]});
 clock=new TideClock(saved.epochMs,now+1001,saved.manualTide);drift=make(storage,clock,now+1001);tick(drift,now+1001);assert.equal(incoming(drift).length,0);
 clock.setDirection('falling',now+12000);tick(drift,now+12000);clock.setDirection('rising',now+13000);tick(drift,now+13000);
 assert.equal(incoming(drift).length,1);assert.notEqual(drift.snapshot().lastArrivalTideKey,firstKey);
});

test('accelerating an already rising natural tide does not deliver another letter',()=>{
 const storage=memory(),now=start+200000,clock=new TideClock(start,now),drift=make(storage,clock,now);
 tick(drift,now);pick(drift,now+1);const key=drift.snapshot().lastArrivalTideKey;
 clock.setDirection('rising',now+100);assert.equal(clock.bottleArrival(now+100).key,key);tick(drift,now+100);assert.equal(incoming(drift).length,0);
});

test('an existing incoming bottle counts for the new rising tide without being overwritten or queued',()=>{
 const storage=memory(),clock=new TideClock(start,start+200000),drift=make(storage,clock,start+200000);
 tick(drift,start+200000);const first=incoming(drift)[0];clock.setDirection('falling',start+201000);tick(drift,start+201000);clock.setDirection('rising',start+202000);tick(drift,start+202000);
 assert.equal(incoming(drift).length,1);assert.equal(incoming(drift)[0].id,first.id);assert.equal(drift.snapshot().lastArrivalTideKey,clock.bottleArrival(start+202000).key);
 pick(drift,start+202001);tick(drift,start+207000);assert.equal(incoming(drift).length,0,'there is no deferred extra bottle behind the existing one');
});

test('offline time only handles the current rise and never replays missed cycles or rewards',()=>{
 const storage=memory(),clock=new TideClock(start,start),drift=make(storage,clock);tick(drift,start);pick(drift,start+1);
 const now=start+cycleMs*300+300000,returning=make(storage,new TideClock(start,now),now);tick(returning,now);
 assert.equal(incoming(returning).length,1);assert.equal(returning.view().collection.length,1);pick(returning,now+1);
 const again=make(storage,new TideClock(start,now+2),now+2);tick(again,now+2);assert.equal(incoming(again).length,0);
 const fallingNow=start+cycleMs*500+1000000,falling=make(storage,new TideClock(start,fallingNow),fallingNow);tick(falling,fallingNow);assert.equal(incoming(falling).length,0);assert.equal(falling.view().collection.length,2);
});

test('debug jumps, level changes and acceleration cannot create tide rewards',()=>{
 const storage=memory(),now=start+1500000,clock=new TideClock(start,now),drift=make(storage,clock,now);
 for(let i=0;i<8;i++){clock.jump('rising',now+i*100);clock.setSpeed(60,now+i*100);tick(drift,now+i*100+1);clock.setLevel(.4,now+i*100+2);tick(drift,now+i*100+2)}
 assert.equal(incoming(drift).length,0);assert.equal(drift.snapshot().lastArrivalTideKey,null);assert.equal(drift.view().collection.length,0);
 clock.reset(now+1000);tick(drift,now+1000);assert.equal(incoming(drift).length,0);clock.setDirection('rising',now+1001);tick(drift,now+1001);assert.equal(incoming(drift).length,1);
});

test('failed arrival persistence consumes neither tide key nor bottle ID and a later retry is single',()=>{
 const storage=memory(),clock=new TideClock(start,start),drift=make(storage,clock),nextId=drift.snapshot().nextId;storage.fail=true;
 tick(drift,start+1);assert.equal(incoming(drift).length,0);assert.equal(drift.snapshot().lastArrivalTideKey,null);assert.equal(drift.snapshot().nextId,nextId);
 storage.fail=false;tick(drift,start+5001);assert.equal(incoming(drift).length,1);const id=incoming(drift)[0].id;tick(drift,start+10001);assert.equal(incoming(drift)[0].id,id);
 const restored=make(storage,clock,start+10002);tick(restored,start+10002);assert.equal(incoming(restored)[0].id,id);
});

test('legacy randomized deadlines no longer delay arrivals, and all collected letters stop new bottles',()=>{
 const storage=memory(),clock=new TideClock(start,start),drift=make(storage,clock),old=drift.snapshot();delete old.lastArrivalTideKey;old.nextArrivalAt=start+900000;storage.value=JSON.stringify(old);
 const migrated=make(storage,clock,start+1);tick(migrated,start+1);assert.equal(incoming(migrated).length,1);assert.ok(normalizeBottles(migrated.snapshot()).lastArrivalTideKey);
 const full=migrated.snapshot();full.collectedContentIds=CURATED_LETTERS.map(item=>item.id);full.bottles=[];storage.value=JSON.stringify(full);
 const next=make(storage,clock,start+cycleMs+1);tick(next,start+cycleMs+1);assert.equal(incoming(next).length,0);assert.equal(next.view().collectionComplete,true);assert.equal(next.snapshot().lastArrivalTideKey,clock.bottleArrival(start+cycleMs+1).key);
});

test('a new manual tide cannot issue a collectible letter before that tide is durably saved',async()=>{
 const {CoastGame}=await import('../src/themes/coast/game.js');
 const {loadCoast,saveCoast,COAST_STORAGE_KEY}=await import('../src/themes/coast/storage.js');
 const values=new Map(),storage={failCoast:false,getItem:key=>values.get(key)||null,setItem(key,value){if(this.failCoast&&key===COAST_STORAGE_KEY)throw Error('coast quota');values.set(key,value)}};
 const now=start+200000,game=new CoastGame({version:1,epochMs:start,entities:[]},now,()=>.3);
 assert.equal(saveCoast(game.snapshot(),storage),true);
 const options=owner=>({storage,nowMs:owner.nowMs,random:()=>.3,getTide:time=>owner.clock.bottleArrival(time),persistTide:()=>saveCoast(owner.snapshot(),storage)});
 const drift=new BottleDrift(options(game));tick(drift,now);pick(drift,now+1);const originalKey=drift.snapshot().lastArrivalTideKey;
 storage.failCoast=true;
 game.setTideDirection('falling',now+1000);assert.equal(saveCoast(game.snapshot(),storage),false);tick(drift,now+1000);
 game.setTideDirection('rising',now+2000);tick(drift,now+2000);
 assert.equal(incoming(drift).length,0,'the bottle must wait until its manual tide key is durable');
 assert.equal(drift.snapshot().lastArrivalTideKey,originalKey);assert.equal(drift.view().collection.length,1);assert.equal(drift.view().storageError,true);
 const restoredGame=new CoastGame(loadCoast(storage),now+2001,()=>.3),restored=new BottleDrift(options(restoredGame));tick(restored,now+2001);
 assert.equal(restoredGame.tide.phase,'rising');assert.equal(restoredGame.tide.manual,false);assert.equal(incoming(restored).length,0,'restoring the old natural tide may not issue the same tide again');
 storage.failCoast=false;game.update(0,now+7001);tick(drift,now+7001);assert.equal(incoming(drift).length,1);
 assert.equal(loadCoast(storage).manualTide.arrivalKey,drift.snapshot().lastArrivalTideKey,'the tide is saved before its incoming bottle');
 pick(drift,now+7002);const finalGame=new CoastGame(loadCoast(storage),now+7003,()=>.3),finalDrift=new BottleDrift(options(finalGame));tick(finalDrift,now+7003);assert.equal(incoming(finalDrift).length,0);assert.equal(finalDrift.view().collection.length,2);
});
