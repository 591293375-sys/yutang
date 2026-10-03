import test from 'node:test';
import assert from 'node:assert/strict';
import {BottleDrift,BOTTLE_ARRIVAL_INTERVAL,normalizeBottles,bottleWaterPath,bottleWaterPoint} from '../src/themes/coast/bottles.js';
import {TideClock} from '../src/themes/coast/tide.js';
import {setRockHabitat} from '../src/themes/coast/geometry.js';
const start=1700000000000;
const memory=()=>({value:null,fail:false,getItem(){return this.value},setItem(key,value){if(this.fail)throw Error('quota');this.value=value}});
const incoming=d=>d.bottles.filter(b=>b.kind==='incoming');
const remaining=d=>d.snapshot().nextArrivalAt-d.snapshot().lastSeenAt;
const make=(storage=memory(),nowMs=start,options={})=>new BottleDrift({storage,nowMs,random:()=>.3,getTide:()=>({phase:'high',key:null,debug:false}),...options});
const run=(d,ms)=>{const end=d.snapshot().lastSeenAt+ms;while(d.snapshot().lastSeenAt<end){const delta=Math.min(2000,end-d.snapshot().lastSeenAt);d.update(delta/1000,d.snapshot().lastSeenAt+delta)}};

test('each ordinary tide phase offers one bottle after four to six active minutes',()=>{
 for(const phase of ['high','falling','low'])for(const value of [0,.3,.999]){
  const d=make(memory(),start,{random:()=>value,getTide:()=>({phase,key:null,debug:false})});
  assert.ok(remaining(d)>=BOTTLE_ARRIVAL_INTERVAL.minMs&&remaining(d)<=BOTTLE_ARRIVAL_INTERVAL.maxMs);
  run(d,239000);assert.equal(incoming(d).length,0);
  run(d,126000);assert.equal(incoming(d).length,1);
  const first=incoming(d)[0];run(d,600000);assert.equal(incoming(d).length,1);assert.equal(incoming(d)[0].id,first.id);
 }
});

test('pickup restarts the full active wait and new manual tides cannot issue back-to-back bottles',()=>{
 const clock=new TideClock(start,start),d=make(memory(),start,{getTide:now=>clock.bottleArrival(now)});
 d.update(0,start);const first=incoming(d)[0];assert.ok(first);assert.equal(d.pickup(first.id,start).ok,true);
 clock.setDirection('falling',start+1);d.update(0,start+1);clock.setDirection('rising',start+2);d.update(0,start+2);
 run(d,239000);assert.equal(incoming(d).length,0);run(d,126000);assert.equal(incoming(d).length,1);
 assert.notEqual(incoming(d)[0].letter.contentId,first.letter.contentId);
});

test('old unused deadlines migrate once without changing collection, drafts, sent letters or in-flight bottles',()=>{
 const storage=memory(),clock=new TideClock(start,start),d=make(storage,start,{getTide:now=>clock.bottleArrival(now)});
 d.update(0,start);assert.equal(d.pickup(incoming(d)[0].id,start+1).ok,true);
 assert.equal(d.setDraft({body:'保留我的草稿',signature:'岸边'}).ok,true);assert.equal(d.sendLetter({body:'已经寄出的信'},start+2).ok,true);
 const legacy=d.snapshot();delete legacy.arrivalScheduleVersion;legacy.nextArrivalAt=0;
 storage.value=JSON.stringify(legacy);const restored=make(storage,start+10000),state=restored.snapshot();
 for(const key of ['collection','collectedContentIds','sent','draft','bottles'])assert.deepEqual(state[key],legacy[key]);
 assert.equal(state.version,1);assert.equal(state.arrivalScheduleVersion,1);assert.ok(remaining(restored)>=240000&&remaining(restored)<=360000);
 run(restored,50000);const wait=remaining(restored);restored.persist();assert.equal(remaining(make(storage,start+600000)),wait,'another restart cannot reset a migrated timer');
});

test('theme switches, process restarts and a hidden window preserve the unspent active wait',()=>{
 const storage=memory();let d=make(storage);run(d,90000);const wait=remaining(d);d.persist();
 const returnedAt=start+5*86400000;d=make(storage,returnedAt);assert.equal(remaining(d),wait);d.update(0,returnedAt);assert.equal(incoming(d).length,0);
 d.update(0,returnedAt+86400000);assert.equal(remaining(d),wait);assert.equal(incoming(d).length,0);
 d.persist();d=make(storage,returnedAt+2*86400000);assert.equal(remaining(d),wait);
 run(d,wait+6000);assert.equal(incoming(d).length,1);const id=incoming(d)[0].id;
 for(let i=0;i<5;i++){d=make(storage,d.snapshot().lastSeenAt+1000);d.update(0,d.snapshot().lastSeenAt);assert.equal(incoming(d).length,1);assert.equal(incoming(d)[0].id,id)}
});

test('debug pause and acceleration cannot consume the active wait or mint letters',()=>{
 const clock=new TideClock(start-1500000,start),d=make(memory(),start,{getTide:now=>clock.bottleArrival(now)});const wait=remaining(d);
 clock.setPaused(true,start);run(d,600000);assert.equal(remaining(d),wait);assert.equal(incoming(d).length,0);
 clock.setSpeed(60,d.snapshot().lastSeenAt);run(d,600000);assert.equal(remaining(d),wait);assert.equal(incoming(d).length,0);
 clock.reset(d.snapshot().lastSeenAt);run(d,wait+6000);assert.equal(incoming(d).length,1);
});

test('a due periodic arrival is atomic on quota failure and retries once after recovery',()=>{
 const storage=memory(),d=make(storage);run(d,remaining(d)-2000);const nextId=d.snapshot().nextId;storage.fail=true;run(d,10000);
 assert.equal(incoming(d).length,0);assert.equal(d.snapshot().nextId,nextId);assert.equal(d.view().storageError,true);
 storage.fail=false;run(d,6000);assert.equal(incoming(d).length,1);assert.equal(d.snapshot().nextId,nextId+1);
 const restored=make(storage,d.snapshot().lastSeenAt+1000);assert.equal(incoming(restored)[0].id,incoming(d)[0].id);run(restored,6000);assert.equal(incoming(restored).length,1);
});

test('clock rollback and corrupt future deadlines remain bounded without changing valid letters',()=>{
 const storage=memory(),d=make(storage);run(d,50000);const wait=remaining(d);d.persist();
 const rollback=make(storage,start-86400000);assert.equal(remaining(rollback),wait);assert.equal(incoming(rollback).length,0);
 const state=rollback.snapshot();state.nextArrivalAt=1e15;storage.value=JSON.stringify(state);const restored=make(storage,start);
 assert.equal(remaining(restored),360000);assert.ok(normalizeBottles(restored.snapshot()));
});

test('bottle routes invalidate with rock material changes and tolerate a shoreline with no reachable target',()=>{
 setRockHabitat(null);
 try{
  const first=make();assert.equal(first.sendLetter({body:'原航路'},start).ok,true);
  setRockHabitat({blocked:(x,y)=>y>140,clearance:()=>1000});
  const obstructed=make();assert.doesNotThrow(()=>assert.equal(obstructed.sendLetter({body:'稍候再寄'},start).ok,false));
  run(obstructed,400000);assert.equal(incoming(obstructed).length,0);assert.equal(obstructed.view().collection.length,0);
  setRockHabitat(null);run(obstructed,6000);assert.equal(incoming(obstructed).length,1,'a restored route retries without restarting the theme');
  assert.equal(obstructed.sendLetter({body:'航路恢复'},obstructed.snapshot().lastSeenAt).ok,true);
 }finally{setRockHabitat(null)}
});

test('a reef across the top entry falls back to connected open water while every bottle stays inside the original sea corridor',()=>{
 setRockHabitat({blocked:(x,y)=>y>=170&&y<=230,clearance:()=>1000});
 try{
  const d=make();run(d,370000);const bottle=incoming(d)[0];assert.ok(bottle);assert.ok(bottle.route[0].y>230&&bottle.route[0].y<350);
  assert.ok(bottle.route.at(-1).y-bottle.route[0].y>=80);
  for(let i=0;i<bottle.route.length;i++){const p=bottle.route[i];assert.ok(p.x>=660&&p.x<=940);assert.ok(bottleWaterPoint(p.x,p.y));if(i)assert.ok(bottleWaterPath(bottle.route[i-1],p))}
  assert.equal(d.sendLetter({body:'从同一片海面放流'},d.snapshot().lastSeenAt).ok,true);
 }finally{setRockHabitat(null)}
});

test('late rock decoding replans in-flight bottles without changing their letters, IDs or expiry',()=>{
 setRockHabitat(null);
 try{
  const clock=new TideClock(start,start),d=make(memory(),start,{getTide:now=>clock.bottleArrival(now)});d.update(0,start);
  assert.equal(d.sendLetter({body:'别弄丢我的信'},start+1).ok,true);const old=d.snapshot();assert.equal(old.bottles.length,2);
  setRockHabitat({blocked:(x,y)=>y>=170&&y<=230,clearance:()=>1000});d.update(0,start+1000);const replanned=d.snapshot();
  assert.deepEqual(replanned.bottles.map(b=>b.id),old.bottles.map(b=>b.id));assert.deepEqual(replanned.sent,old.sent);assert.deepEqual(replanned.collection,old.collection);
  for(const b of replanned.bottles){const original=old.bottles.find(x=>x.id===b.id);assert.deepEqual(b.letter,original.letter);assert.equal(b.expiresAt,original.expiresAt);assert.ok(bottleWaterPoint(b.x,b.y));assert.ok(b.route.every((p,i)=>!i||bottleWaterPath(b.route[i-1],p)))}
  assert.equal(incoming(d)[0].opacity,0,'a disconnected entry reappears softly rather than teleporting at full opacity');
  run(d,8000);assert.equal(incoming(d)[0].opacity,1);assert.ok(normalizeBottles(d.snapshot()).bottles.length===2);
 }finally{setRockHabitat(null)}
});
