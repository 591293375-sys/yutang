import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';
import {FACILITIES,distance,isWalkable,segmentWalkable,surfaceAt,findPath} from '../src/themes/cats/geometry.js';
import {prepareSurfacePath} from '../src/themes/cats/traversal.js';

const make=()=>{let seed=71;const game=new CatGame(null,{random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296)});game.cats.slice(1).forEach(c=>game.archiveCat(c.id));return game;};
const until=(game,predicate,seconds=90)=>{for(let i=0;i<seconds*30&&!predicate();i++)game.update(1/30,{});assert.ok(predicate(),'expected bounded transition');};
function boardOnPorch(game,cat){
 const result=game.command('scratch',cat,cat.id);assert.ok(result.ok);assert.ok(game.moveProp(result.propId,FACILITIES.water.approach).ok);assert.ok(game.useProp(result.propId,cat.id).ok);return game.props.find(p=>p.id===result.propId);
}
function travel(game,cat,target){
 const jumps=[],phases=new Set();let maxArc=0,lastMove=null;
 for(let i=0;i<90*30;i++){
  const before={x:cat.x,y:cat.y},wasJump=!!cat.traverse;
  game.update(1/30,{});
  if(cat.traverse){const move=cat.traverse;phases.add(move.phase);maxArc=Math.max(maxArc,move.jumpHeight);
   if(move!==lastMove){jumps.push([move.fromSurface,move.toSurface]);lastMove=move;assert.ok(isWalkable(move.from));assert.ok(isWalkable(move.to));assert.ok(segmentWalkable(move.from,move.to));}
  }
  if(!wasJump&&!cat.traverse)assert.ok(segmentWalkable(before,cat),'walking portions stay on the original legal route');
  if(!cat.path.length&&!cat.traverse&&distance(cat,target)<.004)return {jumps,phases,maxArc};
 }
 assert.fail('cat did not reach the requested facility within 90 seconds');
}

test('going up the stone step and wooden porch uses crouch, airborne arc and landing before continuing',()=>{
 const game=make(),cat=game.cats[0];assert.ok(game.visitFacility('water',cat.id).ok);
 const result=travel(game,cat,FACILITIES.water.approach);
 assert.ok(result.jumps.some(([a,b])=>a==='ground'&&b==='step'),'ground to stone step must be a jump');
 assert.ok(result.jumps.some(([a,b])=>a==='step'&&b==='porch'),'stone step to porch must be a jump');
 assert.deepEqual([...result.phases].sort(),['crouch','jump','land']);assert.ok(result.maxArc>.018);
 assert.equal(surfaceAt(cat).id,'porch');
});

test('coming down from the porch jumps each physical edge and returns to ground',()=>{
 const game=make(),cat=game.cats[0];Object.assign(cat,FACILITIES.water.approach);assert.ok(game.visitFacility('sun',cat.id).ok);
 const result=travel(game,cat,{...cat.target});
 assert.ok(result.jumps.some(([a,b])=>a==='porch'&&b==='step'),'porch descent must leave the floor');
 assert.ok(result.jumps.some(([a,b])=>a==='step'&&b==='ground'),'stone step descent must leave the floor');
 assert.deepEqual([...result.phases].sort(),['crouch','jump','land']);assert.ok(result.maxArc>.018);assert.equal(cat.state,'rest');
});

test('a crossing keeps the assigned prop and resumes its original interaction after landing',()=>{
 const game=make(),cat=game.cats[0],board=boardOnPorch(game,cat),task=cat.task;
 until(game,()=>cat.traverse?.phase==='jump');assert.equal(cat.traverse.kind,'surface');assert.equal(cat.task,task);assert.deepEqual(board.catIds,[cat.id]);
 until(game,()=>cat.task?.phase==='interact');assert.equal(cat.task,task);assert.deepEqual(board.catIds,[cat.id]);assert.equal(surfaceAt(cat).id,'porch');
 until(game,()=>cat.interactions===1);assert.equal(board.catIds.length,0);
});

test('a new instruction during a step jump releases the old reservation and runs only after landing',()=>{
 const game=make(),cat=game.cats[0],board=boardOnPorch(game,cat);
 until(game,()=>cat.traverse?.phase==='jump');const hop=cat.traverse,foot={x:cat.x,y:cat.y};
 assert.ok(game.command('food',cat,cat.id).pending);assert.ok(game.command('pet',cat,cat.id).pending);
 assert.equal(cat.traverse,hop);assert.deepEqual({x:cat.x,y:cat.y},foot);assert.deepEqual(board.catIds,[]);assert.equal(cat.task,null);assert.equal(cat.pendingCommand.tool,'pet');
 until(game,()=>cat.task?.tool==='pet');assert.equal(cat.traverse,null);assert.equal(surfaceAt(cat).id,hop.toSurface);assert.equal(game.props.filter(p=>p.tool==='food').length,0);
 assert.equal(game.props.filter(p=>p.catIds.includes(cat.id)).length,1);
});

test('saving or switching themes in a step hop preserves the bed intent without persisting an airborne position',()=>{
 const game=make(),cat=game.cats[0];game.setActive(cat.id,false);
 until(game,()=>cat.traverse?.phase==='jump'&&cat.traverse.jumpProgress>.55);
 const live={x:cat.x,y:cat.y},slot=cat.restIntent.slotId,snapshot=game.snapshot(),saved=snapshot.cats[0];
 assert.ok(isWalkable(saved));assert.equal(saved.traverse,undefined);assert.equal(saved.restIntent.slotId,slot);assert.deepEqual({x:cat.x,y:cat.y},live,'snapshot is read-only');
 const restored=new CatGame(snapshot),other=restored.cats[0];until(restored,()=>other.state==='sleep');assert.equal(other.restIntent.slotId,slot);assert.equal(surfaceAt(other).id,'bed');
 game.clearTransient();assert.equal(cat.traverse,null);assert.ok(isWalkable(cat));assert.equal(cat.restIntent.slotId,slot);
 until(game,()=>cat.state==='sleep');assert.equal(surfaceAt(cat).id,'bed');
});

test('warm stone entry and exit are short jumps on a legal route rather than movement through its vertical face',()=>{
 const game=make(),cat=game.cats[0];assert.ok(game.visitFacility('rock',cat.id).ok);
 const up=travel(game,cat,{...cat.target});assert.ok(up.jumps.some(([a,b])=>b==='safe-rock'));assert.ok(up.maxArc>.018);
 game.visitFacility('sun',cat.id);const down=travel(game,cat,{...cat.target});assert.ok(down.jumps.some(([a])=>a==='safe-rock'));assert.equal(surfaceAt(cat).id,'ground');
});

test('a cat hopping onto a stone step does not reserve the separate climbing platform',()=>{
 const game=make(),cat=game.cats[0],other=game.cats[1];game.visitFacility('water',cat.id);until(game,()=>cat.traverse?.phase==='jump');
 assert.ok(game.setActive(other.id,true).ok);assert.ok(game.visitFacility('climbing',other.id).ok);assert.equal(other.climbAction,'up');
});

test('removing a prop mid-hop cancels the task but lets the cat land safely',()=>{
 const game=make(),cat=game.cats[0],board=boardOnPorch(game,cat);until(game,()=>cat.traverse?.phase==='jump'&&cat.traverse.jumpProgress>.25);const hop=cat.traverse;
 game.removeProp(board.id);assert.equal(cat.traverse,hop,'a prop removal must not delete in-flight locomotion');assert.equal(cat.task,null);
 until(game,()=>!cat.traverse);assert.ok(distance(cat,hop.to)<.00001);assert.ok(isWalkable(cat));assert.equal(cat.pendingCommand,null);
});

test('a step landing occupied by another resting cat is replanned or waited for without jumping onto it',()=>{
 const game=make(),cat=game.cats[0],other=game.cats[1];game.visitFacility('water',cat.id);game.update(1/30,{});
 const first=cat.path.find(point=>point.jump),landing=first.jump.to,d=distance(first,landing);
 Object.assign(cat,{x:first.x,y:first.y,heading:0,motionHeading:0,speed:0});while(cat.path[0]!==first)cat.path.shift();
 Object.assign(other,{active:true,x:landing.x+(landing.x-first.x)*.032/d,y:landing.y+(landing.y-first.y)*.032/d,state:'sleep',wait:Infinity});
 assert.ok(isWalkable(other));assert.ok(distance(cat,other)>.05);
 for(let tick=0;tick<180;tick++){game.update(1/30,{});assert.ok(distance(cat,other)>=.0449,'jump must not land inside another cat');}
 game.archiveCat(other.id);travel(game,cat,FACILITIES.water.approach);
});

test('a target exactly on a stone or porch polygon edge still includes the physical crossing',()=>{
 const start={x:.5,y:.49};
 for(const target of [{x:.527,y:.273},{x:.637,y:.191},{x:.590,y:.190}]){
  const route=prepareSurfacePath(start,findPath(start,target));let previous=start,jumps=0;
  for(const node of route){assert.equal(surfaceAt(previous).id,surfaceAt(node).id,'no unmarked walking edge');previous=node.jump?node.jump.to:node;if(node.jump)jumps++;}
  assert.ok(jumps>0);assert.ok(distance(previous,target)<1e-9);
 }
});
