import test from 'node:test';
import assert from 'node:assert/strict';
import {BottleDrift,BOTTLE_STORAGE_KEY,BOTTLE_LIMITS,normalizeBottles,saveBottles} from '../src/themes/coast/bottles.js';
import {emptyDrawing,DRAWING_COLORS,DRAWING_WIDTHS,jsonBytes} from '../src/themes/coast/letter-drawing.js';
import {habitatAt} from '../src/themes/coast/geometry.js';
import {hitTestBottle} from '../src/themes/coast/bottle-renderer.js';
import {TideClock} from '../src/themes/coast/tide.js';
const start=1700000000000;
const memory=()=>({value:null,fail:false,getItem(key){assert.equal(key,BOTTLE_STORAGE_KEY);return this.value},setItem(key,value){assert.equal(key,BOTTLE_STORAGE_KEY);if(this.fail)throw Error('quota');this.value=value}});
const getTide=now=>new TideClock(start,now).bottleArrival(now);
const create=(storage=memory(),nowMs=start)=>new BottleDrift({storage,nowMs,random:()=>.3,getTide});
const arrive=drift=>drift.update(0,drift.snapshot().lastSeenAt+1,0);
const advance=(drift,to)=>{let now=drift.snapshot().lastSeenAt;while(now<to){now=Math.min(to,now+10000);drift.update(2,now,0)}};

test('a natural rising tide replaces the random deadline and does not accumulate offline bottles',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);assert.equal(drift.bottles.length,1);
 const key=drift.view().lastArrivalTideKey;assert.equal(create(storage,start+30000).view().lastArrivalTideKey,key);
 advance(drift,start+600000);assert.equal(drift.bottles.length,1);
 const now=start+5*86400000,later=create(storage,now);assert.equal(later.bottles.length,0);later.update(0,now,0);assert.equal(later.bottles.length,1);
 assert.equal(later.view().collection.length,0);assert.equal(create(storage,now+1000).bottles[0].id,later.bottles[0].id);
});

test('pickup is atomic, idempotent, persisted, and never changes the old coast save',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);const bottle=drift.view().bottles[0];
 const first=drift.pickup(bottle.id,bottle.createdAt+1000);assert.equal(first.ok,true);assert.equal(first.letter.source,'shore');assert.ok(first.letter.receivedAt);
 assert.equal(drift.pickup(bottle.id).ok,false);assert.equal(drift.view().collection.length,1);assert.equal(create(storage).view().collection[0].id,first.letter.id);
 assert.equal(hitTestBottle(bottle.x,bottle.y,{bottles:[{...bottle,opacity:1}]}),bottle.id);assert.equal(hitTestBottle(bottle.x+80,bottle.y+80,{bottles:[bottle]}),null);assert.equal(hitTestBottle(bottle.x,bottle.y,{bottles:[{...bottle,opacity:0}]}),null);
});

test('failed storage rolls back pickup, sends and drafts without success',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);const id=drift.view().bottles[0].id,before=drift.snapshot();storage.fail=true;
 assert.equal(drift.pickup(id,before.lastSeenAt).ok,false);assert.deepEqual(drift.snapshot(),before);
 assert.equal(drift.sendLetter({body:'写给海风。',signature:'岸边'},start,0).ok,false);assert.deepEqual(drift.snapshot(),before);
 assert.equal(drift.setDraft({body:'没能保存',signature:''}).ok,false);assert.deepEqual(drift.snapshot(),before);
});

test('drafts and own letters are local, bounded, and duplicate request IDs send only once',()=>{
 const storage=memory(),drift=create(storage);assert.equal(drift.setDraft({body:'<script>海风</script>\n留一封信。',signature:'我'}).ok,true);
 const draft=drift.view().draft;assert.equal(create(storage).view().draft.body,draft.body);
 const result=drift.sendLetter({...draft,requestId:draft.id},start,0);assert.equal(result.ok,true);assert.equal(result.letter.source,'local');assert.equal(result.letter.sentAt,start);assert.equal(result.bottle.kind,'outgoing');
 const repeated=drift.sendLetter({...draft,requestId:draft.id},start+1,0);assert.equal(repeated.ok,true);assert.equal(repeated.alreadySent,true);assert.equal(drift.view().sent.length,1);assert.equal(drift.view().bottles.length,1);
 assert.equal(drift.setDraft(draft).ok,false,'A delayed autosave cannot overwrite the next blank letter');assert.equal(drift.view().draft.body,'');
 assert.equal(drift.sendLetter({body:'   '},start,0).ok,false);assert.equal(drift.sendLetter({body:'字'.repeat(601)},start,0).ok,false);assert.equal(drift.setDraft({body:'海',signature:'名'.repeat(25)}).ok,false);
 assert.equal(drift.sendLetter({body:'第二封'},start+1000,0).ok,true);assert.equal(drift.sendLetter({body:'第三封'},start+2000,0).ok,false);assert.equal(drift.view().bottles.length,BOTTLE_LIMITS.outgoing);
});

test('arrival, departing routes and every motion segment remain in legal sea water at all tides',()=>{
 const drift=create();arrive(drift);drift.sendLetter({body:'向海上放流。'},drift.snapshot().lastSeenAt,0);
 let now=drift.snapshot().lastSeenAt;
 for(let i=0;i<1200;i++){
  now+=500;drift.update(.5,now,(Math.sin(i/35)+1)/2);
  for(const b of drift.view().bottles){const h=habitatAt(b.x,b.y,0);assert.equal(h.water,true);assert.equal(h.blocked,false);assert.equal(h.pool,false);}
 }
 assert.equal(drift.view().bottles.filter(b=>b.kind==='outgoing').length,0);assert.equal(drift.view().sent.length,1);
});

test('collection cap does not overwrite old letters or consume an uncollectable bottle',()=>{
 const storage=memory(),drift=create(storage);arrive(drift);const state=drift.snapshot(),target=state.bottles[0];
 state.collection=Array.from({length:100},(_,i)=>({...target.letter,contentId:undefined,body:'旧信 '+i,id:'bottle-'+(i+100),receivedAt:start}));storage.value=JSON.stringify(state);
 const full=create(storage,start);assert.equal(full.pickup(target.id,start).ok,false);assert.equal(full.view().collection.length,100);assert.equal(full.view().bottles.length,1);
});

test('normalization rejects corrupt state, deduplicates IDs and recovers the monotonic counter',()=>{
 assert.equal(normalizeBottles(null),null);assert.equal(normalizeBottles({version:99}),null);
 const state=create().snapshot();state.nextId=1;state.draft.id='draft-900';state.collection=[{id:'bottle-999',title:'海',body:'信',signature:'岸边',source:'shore',createdAt:start,receivedAt:start}];state.collection.push({...state.collection[0]});
 const normalized=normalizeBottles(state);assert.equal(normalized.collection.length,1);assert.ok(normalized.nextId>999);
});

test('arrival save failures produce no unsaved bottle and resume without repeated spawning',()=>{
 const storage=memory(),drift=create(storage);storage.fail=true;drift.update(.1,start+5000,0);
 assert.equal(drift.bottles.length,0);assert.equal(drift.view().storageError,true);assert.equal(drift.view().lastArrivalTideKey,null);
 storage.fail=false;drift.update(.1,start+10000,0);assert.equal(drift.bottles.length,1);assert.equal(drift.view().storageError,false);
 const state=drift.snapshot(),restored=create(storage,start+11000);assert.equal(restored.bottles[0].id,state.bottles[0].id);assert.equal(restored.view().lastArrivalTideKey,state.lastArrivalTideKey);
});

test('different routes preserve the whole bottle footprint and travel progress across reload',()=>{
 for(let seed=0;seed<9;seed++){
  const storage=memory(),drift=new BottleDrift({storage,nowMs:start,random:()=>seed/9});const r=drift.sendLetter({body:'海边路径 '+seed},start,1);assert.equal(r.ok,true);
  drift.update(2,start+1000,1);drift.persist();const snapshot=drift.snapshot(),restored=new BottleDrift({storage,nowMs:start+1001,random:()=>.6});
  assert.equal(restored.bottles[0].x,snapshot.bottles[0].x);assert.equal(restored.bottles[0].routeIndex,snapshot.bottles[0].routeIndex);
  for(const p of restored.bottles[0].route)for(const [dx,dy]of[[23,0],[-23,0],[0,23],[0,-23]]){const h=habitatAt(p.x+dx,p.y+dy,0);assert.equal(h.water,true);assert.equal(h.blocked,false);}
 }
});

test('a short theme switch during a rising tide delivers once without waiting for the old random deadline',()=>{
 const storage=memory();create(storage);const returning=create(storage,start+15000);assert.equal(returning.bottles.length,0);returning.update(0,start+15000,0);assert.equal(returning.bottles.length,1);
 const again=create(storage,start+16000);again.update(0,start+16000,0);assert.equal(again.bottles[0].id,returning.bottles[0].id);
});

test('incoming bottles finish and remain reachable in the narrow cover viewport',()=>{
 const samples=[[.3,.3,.3,.99,0],...[0,.2,.5,.8,.999].map(n=>[n,n,n,n,n])];
 const scale=844/900,left=(1600-390/scale)/2,right=1600-left;
 for(const values of samples){
  let index=0;const storage=memory(),drift=new BottleDrift({storage,nowMs:start,random:()=>values[index++]??.5,getTide});advance(drift,start+5000);
  const bottle=drift.bottles[0];assert.ok(bottle);
  for(const point of bottle.route)assert.ok(point.x-23>=left&&point.x+23<=right,`Bottle route must stay inside the mobile crop: ${JSON.stringify(point)}`);
  let now=drift.snapshot().lastSeenAt;for(let i=0;i<420;i++){now+=1000;drift.update(1,now,0)}
  const resting=drift.bottles.find(b=>b.id===bottle.id);assert.ok(resting?.arrivedAt);assert.ok(resting.x-23>=left&&resting.x+23<=right);
  // Below the top badges and above the bottom desktop/immersive controls.
  assert.ok(resting.y>=280&&resting.y+23<=695);assert.equal(hitTestBottle(resting.x,resting.y,drift),resting.id);
  drift.persist();const restored=new BottleDrift({storage,nowMs:now+1,random:()=>.5});assert.equal(restored.bottles[0].x,resting.x);assert.equal(restored.bottles[0].y,resting.y);
  const outgoing=restored.sendLetter({body:'从看得见的潮线放流。'},now+2,0);assert.equal(outgoing.ok,true);assert.ok(outgoing.bottle.x-23>=left&&outgoing.bottle.x+23<=right);assert.ok(outgoing.bottle.y+23<=695);
 }
});

const drawing=(x=.2)=>({version:1,strokes:[{tool:'pen',color:DRAWING_COLORS[0].value,width:DRAWING_WIDTHS[1].value,points:[[x,.2],[.6,.7]]}]});
test('drawn-only drafts and letters survive reload, departure and repeated send requests',()=>{
 const storage=memory(),drift=create(storage),draft={...drift.view().draft,body:'',signature:'画给海',drawing:drawing()};
 assert.equal(drift.setDraft(draft).ok,true);assert.deepEqual(create(storage).view().draft.drawing,draft.drawing);
 const result=drift.sendLetter({...draft,requestId:draft.id},start);assert.equal(result.ok,true);assert.deepEqual(result.letter.drawing,draft.drawing);assert.equal(result.letter.body,'');
 const again=drift.sendLetter({...draft,requestId:draft.id},start+1);assert.equal(again.alreadySent,true);assert.equal(drift.view().sent.length,1);
 const reloaded=create(storage,start+1000);assert.deepEqual(reloaded.view().sent[0].drawing,draft.drawing);assert.deepEqual(reloaded.view().bottles[0].letter.drawing,draft.drawing);assert.deepEqual(reloaded.view().draft.drawing,emptyDrawing());
 const next=reloaded.view().draft;assert.equal(reloaded.sendLetter({...next,body:'',drawing:drawing(.4),requestId:next.id},start+1100).ok,true);assert.equal(reloaded.view().sent.length,2);
});
test('invalid drawing edits reject atomically and quota failure preserves the complete drawn draft',()=>{
 const storage=memory(),drift=create(storage),draft={...drift.view().draft,body:'纸上的海',signature:'我',drawing:drawing()};assert.equal(drift.setDraft(draft).ok,true);
 const before=drift.snapshot(),invalid={version:1,strokes:[{...drawing().strokes[0],color:'url(example)'}]};
 assert.equal(drift.setDraft({...draft,drawing:invalid}).ok,false);assert.equal(drift.sendLetter({...draft,drawing:invalid}).ok,false);assert.deepEqual(drift.snapshot(),before);
 storage.fail=true;assert.equal(drift.sendLetter({...draft,requestId:draft.id}).ok,false);assert.deepEqual(drift.snapshot(),before);
 storage.fail=false;assert.equal(drift.sendLetter({...draft,requestId:draft.id}).ok,true);assert.equal(drift.view().sent.length,1);
});
test('legacy text letters load with an empty paper and a malformed image never erases valid text',()=>{
 const state=create().snapshot();delete state.draft.drawing;
 state.sent=[{id:'bottle-5',source:'local',body:'旧信',signature:'从前',createdAt:start,sentAt:start,drawing:{version:99,strokes:[]}}];
 const normalized=normalizeBottles(state);assert.equal(normalized.sent[0].body,'旧信');assert.deepEqual(normalized.sent[0].drawing,emptyDrawing());assert.deepEqual(normalized.draft.drawing,emptyDrawing());
});
test('the complete serialized bottle store has a strict byte budget and does not replace an old save',()=>{
 const storage=memory(),drift=create(storage),prior=storage.value,state=drift.snapshot();
 const large={version:1,strokes:Array.from({length:5},()=>({...drawing().strokes[0],points:Array.from({length:1000},(_,i)=>[+(i/1000).toFixed(4),.3456])}))};
 state.sent=Array.from({length:100},(_,i)=>({id:'bottle-'+(i+100),source:'local',body:'有画的信',signature:'我',createdAt:start,sentAt:start,drawing:large}));
 assert.ok(jsonBytes(state)>BOTTLE_LIMITS.storageBytes);assert.equal(saveBottles(state,storage),false);assert.equal(storage.value,prior);
});
