import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {FACILITIES,SLEEP_SLOT_MAP,surfaceAt,isWalkable,findPath,segmentWalkable,distance,hitCat,ASPECT} from '../src/themes/cats/geometry.js';
import {normalizeCats} from '../src/themes/cats/storage.js';
const make=()=>{let seed=33;const game=new CatGame(null,{random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});game.cats.slice(1).forEach(c=>game.archiveCat(c.id));return game;};
const until=(game,predicate,seconds=90)=>{for(let i=0;i<seconds*30;i++){if(predicate())return;game.update(1/30,{night:false});}assert.ok(predicate(),'expected state within bounded simulation');};
const settle=game=>{const cat=game.cats[0];assert.ok(game.visitFacility('climbing',cat.id).ok);until(game,()=>cat.state==='rest'&&cat.surfaceId==='lower-platform');return cat;};

test('lower platform has a real surface, is isolated from walking navigation, and uses a staged jump',()=>{
 const ground=FACILITIES.climbing.approach,platform=FACILITIES.climbing.landing;
 assert.ok(isWalkable(ground));assert.ok(isWalkable(platform));assert.equal(surfaceAt(platform).id,'lower-platform');assert.equal(surfaceAt(platform).elevation,.075);
 assert.equal(findPath(ground,platform),null,'a cat cannot walk through the flowerbed or up the vertical post');assert.equal(segmentWalkable(ground,platform),false);
 const game=make(),cat=game.cats[0],initial={x:cat.x,y:cat.y};assert.ok(game.visitFacility('climbing',cat.id).ok);assert.deepEqual({x:cat.x,y:cat.y},initial);assert.ok(cat.path.length);
 const phases=new Set();let maxArc=0,walked=false;
 for(let i=0;i<2700&&!(cat.state==='rest'&&cat.surfaceId==='lower-platform');i++){
  const before={x:cat.x,y:cat.y},previousTraverse=cat.traverse?.phase;game.update(1/30,{});
  if(cat.traverse){phases.add(cat.traverse.phase);maxArc=Math.max(maxArc,cat.traverse.jumpHeight);assert.ok(cat.traverse.jumpHeight>=0);assert.ok(cat.traverse.jumpHeight<=.045001);}
  if(!previousTraverse&&!cat.traverse){assert.ok(segmentWalkable(before,cat));walked=walked||distance(before,cat)>0;}
  if(cat.traverse?.phase==='jump'&&cat.traverse.jumpHeight>.035){const target={x:cat.x,y:cat.y-cat.traverse.jumpHeight/ASPECT-.04};assert.equal(hitCat([cat],target)?.id,cat.id,'click mapping follows the airborne body');}
 }
 assert.ok(walked);assert.deepEqual([...phases].sort(),['crouch','jump','land']);assert.ok(maxArc>.044);assert.equal(cat.state,'rest');assert.equal(cat.surfaceId,'lower-platform');assert.deepEqual({x:cat.x,y:cat.y},platform);assert.equal(cat.restIntent.slotId,'climbing-lower');
});

test('one cat reserves the low platform during approach, sleep and descent; waking jumps back safely',()=>{
 const game=make(),first=game.cats[0],second=game.cats[1];game.setActive(second.id,true);assert.ok(game.visitFacility('climbing',first.id).ok);assert.equal(game.visitFacility('climbing',second.id).ok,false);
 until(game,()=>first.state==='rest'&&first.surfaceId==='lower-platform');assert.equal(game.visitFacility('climbing',second.id).ok,false);
 assert.ok(game.setActive(first.id,true).ok);assert.equal(first.traverse.direction,'down');assert.equal(game.visitFacility('climbing',second.id).ok,false);
 until(game,()=>!first.traverse&&first.surfaceId==='ground');assert.ok(isWalkable(first));assert.equal(first.restIntent,null);assert.ok(game.visitFacility('climbing',second.id).ok);assert.equal(game.view().visibleCount,2);
});

test('latest manual interaction replaces the pending action without stopping a cat in the air',()=>{
 const game=make(),cat=settle(game);assert.ok(game.command('food',cat,cat.id).pending);game.update(.12,{});
 const traversal=cat.traverse;assert.ok(game.command('yarn',cat,cat.id).pending);assert.equal(cat.traverse,traversal);assert.equal(game.props.length,0);assert.equal(cat.pendingCommand.tool,'yarn');
 until(game,()=>!cat.traverse&&cat.task?.tool==='yarn');assert.equal(cat.surfaceId,'ground');assert.deepEqual(game.props.map(p=>p.tool),['yarn']);assert.equal(cat.pendingCommand,null);
 assert.ok(game.command('pet',cat,cat.id).ok);assert.equal(cat.task.tool,'pet');assert.ok(game.props.every(p=>p.tool==='pet'||!p.catIds.includes(cat.id)));
});

test('commands issued on the upward jump finish landing before a single safe return jump',()=>{
 const game=make(),cat=game.cats[0];game.visitFacility('climbing',cat.id);until(game,()=>cat.traverse?.phase==='jump');const upward=cat.traverse;
 game.command('food',cat,cat.id);game.command('pet',cat,cat.id);assert.equal(cat.traverse,upward);assert.equal(cat.pendingCommand.tool,'pet');
 until(game,()=>cat.traverse?.direction==='down');assert.equal(cat.traverse.from.x,FACILITIES.climbing.landing.x);
 until(game,()=>cat.task?.tool==='pet');assert.equal(cat.surfaceId,'ground');assert.equal(game.props.filter(p=>p.catIds.includes(cat.id)).length,1);
});

test('climbing save/cleanup stores grounded positions and durable platform intention, never a half-air pose',()=>{
 const game=make(),cat=game.cats[0];game.visitFacility('climbing',cat.id);until(game,()=>cat.traverse?.phase==='jump'&&cat.traverse.jumpHeight>.03);
 const airborne={x:cat.x,y:cat.y};const saved=game.snapshot();assert.ok(isWalkable(saved.cats[0]));assert.equal(saved.cats[0].traverse,undefined);assert.equal(saved.cats[0].restIntent.slotId,'climbing-lower');assert.deepEqual({x:cat.x,y:cat.y},airborne,'saving does not teleport the live cat');
 const restored=new CatGame(saved),restCat=restored.cats[0];until(restored,()=>restCat.state==='rest'&&restCat.surfaceId==='lower-platform');const again=new CatGame(restored.snapshot());assert.equal(again.cats[0].state,'rest');assert.equal(again.cats[0].surfaceId,'lower-platform');
 game.clearTransient();assert.ok(isWalkable(cat));assert.notEqual(cat.traverse?.phase,'jump');assert.equal(cat.traverse?.jumpHeight||0,0);assert.equal(cat.restIntent.slotId,'climbing-lower');until(game,()=>cat.state==='rest'&&cat.surfaceId==='lower-platform');
 game.setActive(cat.id,true);until(game,()=>cat.traverse?.phase==='jump');const down=game.snapshot();assert.equal(down.cats[0].surfaceId,'ground');assert.equal(down.cats[0].restIntent,null);const landed=new CatGame(down);assert.ok(isWalkable(landed.cats[0]));assert.equal(landed.cats[0].traverse,null);
});

test('malformed duplicate platform occupants normalize to one reserved cat and a safe ground position',()=>{
 const game=make(),data=game.snapshot(),slot=SLEEP_SLOT_MAP['climbing-lower'];for(const c of data.cats){c.active=true;c.x=slot.x;c.y=slot.y;c.restIntent={slotId:slot.id};}
 const normalized=normalizeCats(data);assert.equal(normalized.cats.filter(c=>c.surfaceId==='lower-platform').length,1);assert.equal(normalized.cats.filter(c=>c.restIntent?.slotId===slot.id).length,1);
 const restored=new CatGame(normalized);assert.equal(restored.cats.filter(c=>c.surfaceId==='lower-platform').length,1);assert.ok(restored.cats.every(c=>isWalkable(c)));
});

test('returning from the platform chooses a free nearby landing when another cat occupies the takeoff point',()=>{
 const game=make(),cat=settle(game),other=game.cats[1];game.setActive(other.id,true);Object.assign(other,FACILITIES.climbing.approach,{state:'sleep',wait:Infinity});
 game.setActive(cat.id,true);assert.equal(cat.traverse.direction,'down');assert.ok(distance(cat.traverse.to,other)>=.054);assert.equal(surfaceAt(cat.traverse.to).id,'ground');
 until(game,()=>!cat.traverse&&cat.surfaceId==='ground');assert.ok(distance(cat,other)>=.045);assert.ok(isWalkable(cat));
});
