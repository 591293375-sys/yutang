import test from 'node:test';
import assert from 'node:assert/strict';
import {CatGame} from '../src/themes/cats/game.js';

function advanceUntil(game,condition,seconds=45){for(let i=0;i<seconds*60;i++){game.update(1/60);if(condition())return true;}return false;}
test('a cat fed by clicking it walks to the bowl and faces the food before eating',()=>{
 const game=new CatGame(null,{random:()=>.5}),cat=game.cats[0];game.cats=[cat];
 const result=game.command('food',cat,cat.id);assert.equal(result.ok,true);const bowl=game.props.find(p=>p.id===result.propId),origin={x:bowl.x,y:bowl.y};
 assert.ok(advanceUntil(game,()=>cat.state==='eat'));
 assert.equal(cat.facing,Math.sign(bowl.x-cat.x),'the mouth must face into the bowl, not away along the approach direction');
 assert.deepEqual({x:bowl.x,y:bowl.y},origin,'the bowl cannot jump to the cat to fake contact');
});

import {feedingDock,feedingMouthWorld,mouthInsideFood,foodBowlLayout} from '../src/themes/cats/feeding.js';
import {CAT_PRESETS} from '../src/themes/cats/catalog.js';
import {isWalkable,distance} from '../src/themes/cats/geometry.js';
import {CatAnimationState} from '../src/themes/cats/animation.js';
const custom=(size,build)=>({version:1,size,build,earSize:1,earShape:'natural',eyeColor:'original'});
test('all sixteen mouths remain above the food through chewing at small, normal and large sizes',()=>{
 for(const preset of CAT_PRESETS)for(const [size,build]of[[.7,.8],[1,1],[1.35,1.25]])for(const seat of[-1,1]){
  const cat={presetId:preset.id,x:.45,y:.4,facing:1,customization:custom(size,build)},bowl={x:.60,y:.62,capacity:1,foodScale:1};
  const dock=feedingDock(cat,bowl,seat);Object.assign(cat,{x:dock.x,y:dock.y,facing:dock.facing});
  assert.ok(isWalkable(cat));for(let t=0;t<5;t+=.08){const mouth=feedingMouthWorld(cat,{time:t});assert.ok(mouthInsideFood(mouth,bowl),`${preset.id} size ${size} seat ${seat}: mouth left the edible part of the bowl`);}
 }
});
test('two real cats finish feeding without changing the bowl or teleporting their foot positions',()=>{
 const game=new CatGame(null,{random:()=>.42});game.cats=game.cats.slice(0,2);game.cats[0].customization=custom(.7,.8);game.cats[1].customization=custom(1.35,1.25);
 const result=game.command('food',{x:.57,y:.61});assert.equal(result.catIds.length,2);
 const bowl=game.props.find(p=>p.id===result.propId),before={x:bowl.x,y:bowl.y,foodScale:bowl.foodScale};let samples=0;const animation=new CatAnimationState();
 for(let i=0;i<2200;i++){
  const old=game.cats.map(cat=>({x:cat.x,y:cat.y}));game.update(1/60);
  for(const [j,cat]of game.cats.entries()){
   assert.ok(distance(cat,old[j])<.002,'arrival and switching into eat cannot shift the entire cat');
   const pose=animation.sample(cat,CAT_PRESETS.find(p=>p.id===cat.presetId),i/60);
   if(cat.state==='eat'&&pose.renderAction==='eat'){
    assert.ok(mouthInsideFood(feedingMouthWorld(cat,{flip:pose.renderFlip,time:i/60+cat.phase}),bowl));samples++;
   }
  }
  assert.deepEqual({x:bowl.x,y:bowl.y,foodScale:bowl.foodScale},before,'a food bowl cannot move or grow while its diners eat');
  if(game.cats.every(c=>c.interactions>0))break;
 }
 assert.ok(samples>200);assert.ok(game.cats.every(c=>c.interactions>0));
});
test('replacing food or switching themes releases seating and never leaves an eating pose active',()=>{
 const game=new CatGame(null,{random:()=>.5}),cat=game.cats[0];game.cats=[cat];
 const first=game.command('food',cat,cat.id);assert.ok(advanceUntil(game,()=>cat.state==='eat'));
 game.command('pet',cat,cat.id);assert.equal(cat.task.tool,'pet');assert.equal(game.props.find(p=>p.id===first.propId).catIds.length,0);
 game.command('food',cat,cat.id);assert.ok(advanceUntil(game,()=>cat.state==='eat'));game.clearTransient();assert.equal(cat.task,null);assert.equal(game.props.length,0);assert.notEqual(cat.state,'eat');
});
test('food docking near a flower border uses a reachable same-surface seat or refuses the placement',()=>{
 const game=new CatGame(null,{random:()=>.5}),cat=game.cats[0];game.cats=[cat];
 for(const point of[{x:.285,y:.44},{x:.845,y:.42},{x:.3,y:.85}]){
  const result=game.command('food',point);if(!result.ok)continue;
  const bowl=game.props.find(p=>p.id===result.propId);assert.ok(isWalkable(cat.target));assert.deepEqual({x:bowl.x,y:bowl.y},point);assert.ok(cat.path.length);game.clearTransient();
 }
});
