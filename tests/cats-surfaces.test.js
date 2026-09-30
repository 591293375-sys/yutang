import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {findPath,isWalkable,segmentWalkable,surfaceAt,SLEEP_SLOTS,SLEEP_SLOT_MAP,FACILITIES,distance} from '../src/themes/cats/geometry.js';
import {saveCats,loadCats} from '../src/themes/cats/storage.js';
const make=()=>{let seed=72;return new CatGame(null,{random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});};
const run=(game,seconds)=>{for(let i=0;i<seconds*30;i++)game.update(1/30,{night:true});};
test('every sleeping spot is on its genuine surface and reached through legal continuously elevated segments',()=>{
 for(const slot of SLEEP_SLOTS.filter(slot=>!slot.traversal)){
  assert.equal(surfaceAt(slot)?.id,slot.surfaceId);const path=findPath({x:.52,y:.59},slot);assert.ok(path?.length,slot.id);
  let previous={x:.52,y:.59},lastHeight=surfaceAt(previous).elevation;const seen=new Set(['ground']);
  for(const next of path){assert.ok(segmentWalkable(previous,next));const steps=Math.ceil(distance(previous,next)/.0007);
   for(let i=0;i<=steps;i++){const p={x:previous.x+(next.x-previous.x)*i/steps,y:previous.y+(next.y-previous.y)*i/steps};assert.ok(isWalkable(p),slot.id);const surface=surfaceAt(p);assert.ok(surface);assert.ok(Math.abs(surface.elevation-lastHeight)<.0025,`${slot.id}: discontinuous physical height`);lastHeight=surface.elevation;seen.add(surface.id);}
   previous=next;
  }
  if(slot.surfaceId==='bed'){assert.ok(seen.has('step'),'the cat enters the porch through its stone step');assert.ok(seen.has('porch'));assert.ok(lastHeight>.005);}
  if(slot.surfaceId==='safe-rock'){assert.ok(seen.has('rock-step'));assert.ok(lastHeight>0);}
 }
 assert.equal(segmentWalkable({x:.79,y:.34},{x:.79,y:.22}),false,'no climbing the porch face directly from the flowers');
});
test('send home makes three cats walk to two actual mat slots and the flat rock without disappearing',()=>{
 const game=make(),initial=game.cats.map(c=>({x:c.x,y:c.y}));game.cats.forEach(c=>assert.ok(game.setActive(c.id,false).ok));
 assert.equal(game.view().visibleCount,3);assert.equal(game.view().sleepingCount,3);assert.equal(game.view().awakeCount,0);
 game.cats.forEach((c,i)=>{assert.deepEqual({x:c.x,y:c.y},initial[i],'returning is a route, never a teleport');assert.ok(c.path.length);assert.ok(c.active);});
 run(game,100);
 assert.deepEqual(game.cats.map(c=>c.surfaceId).sort(),['bed','bed','safe-rock']);
 for(const c of game.cats){assert.equal(c.state,'sleep');assert.ok(distance(c,c.restIntent.target)<.003);assert.ok(c.strideDistance>.1);assert.ok(Number.isFinite(c.heading));assert.ok(c.elevation>0);}
 run(game,180);assert.ok(game.cats.every(c=>c.state==='sleep'&&c.restIntent&&c.active));
});
test('sleeping and en-route rest intentions survive cleanup, persistence and recovery',()=>{
 const game=make();game.setActive(game.cats[0].id,false);run(game,2);const id=game.cats[0].id,slot=game.cats[0].restIntent.slotId;
 game.clearTransient();assert.equal(game.cats[0].restIntent.slotId,slot);assert.ok(game.cats[0].path.length);
 const map=new Map(),storage={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};assert.ok(saveCats(game.snapshot(),storage));
 const restored=new CatGame(loadCats(storage));const cat=restored.cats.find(c=>c.id===id);assert.equal(cat.restIntent.slotId,slot);run(restored,100);assert.equal(cat.state,'sleep');
 restored.clearTransient();assert.equal(cat.state,'sleep');assert.ok(saveCats(restored.snapshot(),storage));const again=new CatGame(loadCats(storage));assert.equal(again.cats.find(c=>c.id===id).state,'sleep');
});
test('sleeping counts toward the twelve visible cats, explicit archive frees a place, and commands can gently wake',()=>{
 const game=make();for(let i=0;i<10;i++)game.addCat({presetId:'ragdoll',name:`小猫${i}`,appearance:{version:1,strokes:[]}});
 const outside=game.cats.find(c=>!c.active);assert.ok(outside);game.setActive(game.cats[0].id,false);
 assert.equal(game.view().visibleCount,12);assert.equal(game.setActive(outside.id,true).ok,false);
 assert.ok(game.setActive(game.cats[0].id,true).ok);assert.equal(game.cats[0].restIntent,null);
 game.archiveCat(game.cats[0].id);assert.equal(game.view().visibleCount,11);assert.ok(game.setActive(outside.id,true).ok);assert.equal(game.view().visibleCount,12);
 const small=make();small.cats.forEach(c=>small.setActive(c.id,false));run(small,100);const cat=small.cats[0];const position={x:cat.x,y:cat.y};assert.ok(small.command('pet',cat,cat.id).ok);assert.equal(cat.restIntent,null);assert.deepEqual({x:cat.x,y:cat.y},position);assert.equal(cat.state,'interact');
});
test('malformed rest metadata cannot redirect cats off the valid sleeping surfaces',()=>{
 const game=make(),data=game.snapshot();data.cats[0].restIntent={slotId:'bed-left',surfaceId:'lava',kind:'bad',target:{x:99,y:-100}};
 const restored=new CatGame(data);assert.deepEqual(restored.cats[0].restIntent.target,{x:SLEEP_SLOT_MAP['bed-left'].x,y:SLEEP_SLOT_MAP['bed-left'].y});assert.equal(restored.cats[0].restIntent.surfaceId,'bed');
 data.cats[0].restIntent={slotId:'not-a-slot'};assert.equal(new CatGame(data).cats[0].restIntent,null);
 assert.equal(game.visitFacility('climbing-high',game.cats[0].id).ok,false,'unreachable tall platforms stay disabled');
 assert.ok(game.visitFacility('step',game.cats[0].id).ok);assert.deepEqual(game.cats[0].target,FACILITIES.step.approach);
});
test('twelve home commands reserve distinct physical slots and all cats actually settle',()=>{
 const game=make();for(let i=0;i<9;i++)game.addCat({presetId:'ragdoll',name:`睡猫${i}`,personality:'relaxed',appearance:{version:1,strokes:[]}});
 for(const cat of game.cats)assert.ok(game.setActive(cat.id,false).ok);assert.equal(new Set(game.cats.map(c=>c.restIntent.slotId)).size,12);
 run(game,180);assert.equal(game.view().visibleCount,12);assert.equal(game.view().awakeCount,0);assert.equal(game.view().sleepingCount,12);
 for(const cat of game.cats){assert.equal(cat.state,'sleep',`${cat.name} should reach its reserved slot`);assert.ok(distance(cat,cat.restIntent.target)<.003);assert.equal(surfaceAt(cat)?.id,cat.restIntent.surfaceId);}
 const restored=new CatGame(game.snapshot());assert.equal(restored.view().sleepingCount,12);assert.ok(restored.cats.every(c=>c.state==='sleep'));
});
