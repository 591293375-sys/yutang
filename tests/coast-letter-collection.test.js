import test from 'node:test';
import assert from 'node:assert/strict';
import {BottleDrift,BOTTLE_STORAGE_KEY,normalizeBottles} from '../src/themes/coast/bottles.js';
import {TideClock,TIDE_CYCLE_SECONDS} from '../src/themes/coast/tide.js';
const start=1700000000000;
const memory=()=>({value:null,fail:false,getItem(key){assert.equal(key,BOTTLE_STORAGE_KEY);return this.value},setItem(key,value){assert.equal(key,BOTTLE_STORAGE_KEY);if(this.fail)throw Error('quota');this.value=value}});
const seeded=(seed=34)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const getTide=now=>new TideClock(start,now).bottleArrival(now);
const create=(storage,now=start,random=seeded())=>new BottleDrift({storage,nowMs:now,random,getTide});
const advance=(drift,to)=>{let now=drift.snapshot().lastSeenAt;while(now<to){now=Math.min(to,now+10000);drift.update(2,now,0)}};
const arrive=drift=>{const now=drift.snapshot().lastSeenAt,tide=getTide(now),cycleMs=TIDE_CYCLE_SECONDS*1000;const target=tide.phase==='rising'&&tide.key!==drift.view().lastArrivalTideKey?now+5000:start+(Math.floor((now-start)/cycleMs)+1)*cycleMs+5000;advance(drift,target)};

test('all 29 supplied letters are drawn without replacement across reloads, then arrivals stop',()=>{
 const storage=memory();let drift=create(storage);const found=[];
 assert.equal(drift.view().contentTotal,29);
 for(let i=0;i<29;i++){
  arrive(drift);const bottle=drift.bottles.find(b=>b.kind==='incoming');assert.ok(bottle,'an unread letter must arrive');
  assert.equal(typeof bottle.letter.contentId,'string');assert.ok(!found.includes(bottle.letter.contentId),'a collected letter must never return');
  const received=drift.pickup(bottle.id,drift.snapshot().lastSeenAt+1);assert.equal(received.ok,true);found.push(received.letter.contentId);
  const now=drift.snapshot().lastSeenAt+2;drift=create(storage,now,seeded(i+20));
  assert.equal(drift.view().collectedContentIds.length,i+1);assert.equal(drift.view().collection.length,i+1);
 }
 assert.equal(new Set(found).size,29);assert.equal(drift.view().collectionComplete,true);
 advance(drift,drift.snapshot().lastSeenAt+TIDE_CYCLE_SECONDS*1000);assert.equal(drift.bottles.filter(b=>b.kind==='incoming').length,0);
 assert.ok(storage.value.length<55000,'only compact IDs and metadata are saved, never image bytes');
});

test('random selection does not impose file order and a missed bottle remains eligible',()=>{
 const a=create(memory(),start,()=>0),b=create(memory(),start,()=>.95);
 arrive(a);arrive(b);
 assert.notEqual(a.bottles[0].letter.contentId,b.bottles[0].letter.contentId);
 const first=a.bottles[0];advance(a,first.expiresAt+1000);arrive(a);
 assert.equal(a.view().collectedContentIds.length,0);assert.ok(a.bottles.length>0);
 assert.equal(a.bottles[0].letter.contentId,first.letter.contentId,'uncollected content was not consumed');assert.notEqual(a.bottles[0].id,first.id);
});

test('failed pickup leaves unread selection intact; successful collection stays known even without display rows',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);const bottle=drift.bottles[0],before=drift.snapshot();storage.fail=true;
 assert.equal(drift.pickup(bottle.id,bottle.createdAt+1).ok,false);assert.deepEqual(drift.snapshot(),before);
 storage.fail=false;assert.equal(drift.pickup(bottle.id,bottle.createdAt+2).ok,true);const state=drift.snapshot();state.collection=[];
 const clean=normalizeBottles(state);assert.ok(clean.collectedContentIds.includes(bottle.letter.contentId));
 storage.value=JSON.stringify(clean);const restored=create(storage,clean.lastSeenAt+1,()=>0);arrive(restored);
 assert.notEqual(restored.bottles[0].letter.contentId,bottle.letter.contentId);
});

test('normalization reconstructs collected content IDs, removes duplicates and preserves legacy text',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);const result=drift.pickup(drift.bottles[0].id,drift.snapshot().lastSeenAt+1);const state=drift.snapshot();
 delete state.collectedContentIds;state.collection.push({...result.letter,id:'bottle-500'});state.collection.push({id:'bottle-501',source:'shore',title:'旧信',body:'旧版海边手记',createdAt:start,receivedAt:start});
 const clean=normalizeBottles(state);assert.deepEqual(clean.collectedContentIds,[result.letter.contentId]);assert.equal(clean.collection.filter(l=>l.contentId===result.letter.contentId).length,1);assert.ok(clean.collection.some(l=>l.body==='旧版海边手记'));
 const invalid=normalizeBottles({...clean,collectedContentIds:['../../secret',...clean.collectedContentIds,...clean.collectedContentIds]});assert.deepEqual(invalid.collectedContentIds,clean.collectedContentIds);
});

test('clicking an outgoing bottle reads the original sent letter without collecting it again',()=>{
 const storage=memory(),drift=create(storage);const sent=drift.sendLetter({body:'随海风走吧。',signature:'我'},start);assert.equal(sent.ok,true);const before=drift.snapshot();
 const read=drift.pickup(sent.bottle.id,start+1000);assert.equal(read.ok,true);assert.equal(read.action,'read-sent');assert.equal(read.letter.id,sent.letter.id);assert.deepEqual(drift.snapshot(),before);
 assert.equal(sent.bottle.opacity,1);drift.update(.016,start+16,0);assert.equal(drift.bottles[0].opacity,1,'the launch lands into a visible outgoing bottle');
});
