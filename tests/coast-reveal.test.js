import test from 'node:test';
import assert from 'node:assert/strict';
import { CoastGame } from '../src/themes/coast/game.js';
import { isHabitatValid, pathIsHabitatValid, habitatAt } from '../src/themes/coast/geometry.js';
import { loadCoast, saveCoast } from '../src/themes/coast/storage.js';
const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

test('initial hidden clues occupy 20–30 percent and initialize once across reloads',()=>{
 const game=new CoastGame(null,0,rng()),hidden=game.entities.filter(e=>e.concealment);
 assert.ok(hidden.length/game.entities.length>=.2&&hidden.length/game.entities.length<=.3);
 assert.ok(hidden.some(e=>e.concealment==='sand'));assert.ok(hidden.some(e=>e.concealment==='crevice'));assert.ok(game.entities.every(e=>e.concealmentInitialized));
 const saved=game.snapshot(),again=new CoastGame(saved,1,rng(100));
 assert.deepEqual(again.entities.map(e=>[e.id,e.concealment,e.revealSteps,e.revealNeeded]),game.entities.map(e=>[e.id,e.concealment,e.revealSteps,e.revealNeeded]));
 const legacy={...saved,entities:saved.entities.map(e=>{const copy={...e};for(const key of ['concealment','concealmentInitialized','revealNeeded','revealSteps','concealmentAnchor','creviceExit','emergeProgress'])delete copy[key];return copy;})};
 let raw=JSON.stringify(legacy);const store={getItem:()=>raw,setItem:(_key,value)=>{raw=value;}};
 const migrated=new CoastGame(loadCoast(store),2,rng(99));assert.ok(migrated.entities.some(e=>e.concealment));saveCoast(migrated.snapshot(),store);
 const reload=new CoastGame(loadCoast(store),3,rng(50));assert.deepEqual(reload.entities.map(e=>[e.id,e.x,e.y,e.concealment]),migrated.entities.map(e=>[e.id,e.x,e.y,e.concealment]));
});

test('sand takes distinct reveal-only taps, persists partial progress and captures only on the next tap',()=>{
 const game=new CoastGame(null,0,rng()),crab=game.entities.find(e=>e.concealment==='sand'&&e.species==='crab');assert.ok(crab);assert.ok([2,3].includes(crab.revealNeeded));
 const first=game.interact(crab.id,'catch',1000);assert.equal(first.action,'reveal');assert.equal(crab.revealSteps,1);assert.equal(game.bucketCount(),0);assert.deepEqual(game.catalog,{});
 assert.equal(game.interact(crab.id,'catch',1001).ok,false);assert.equal(crab.revealSteps,1);
 const restored=new CoastGame(game.snapshot(),1100,rng(55)),same=restored.entities.find(e=>e.id===crab.id);assert.equal(same.revealSteps,1);
 for(let step=1;step<same.revealNeeded;step++){const result=restored.interact(same.id,'catch',1100+step*150);assert.equal(result.action,'reveal');assert.equal(restored.bucketCount(),0);assert.deepEqual(restored.catalog,{});}
 assert.equal(same.concealment,null);assert.equal(same.state,'scene');assert.equal(restored.interact(same.id,'catch',2000).action,'capture');assert.equal(restored.bucketCount(),1);assert.equal(restored.catalog.crab.caught,1);
 assert.equal(restored.interact(same.id,'catch',2001).ok,false);assert.equal(restored.catalog.crab.caught,1);
});

test('uncovering a shell yields nothing until a subsequent collection and it never reburies',()=>{
 const game=new CoastGame(null,0,rng()),shell=game.entities.find(e=>e.concealment==='sand'&&e.species==='shell');assert.ok(shell);
 for(let step=0;step<shell.revealNeeded;step++){assert.equal(game.interact(shell.id,step%2?'catch':'observe',1000+step*150).action,'reveal');assert.equal(game.shells,0);assert.deepEqual(game.catalog,{});}
 const revealed=new CoastGame(game.snapshot(),1500,rng(12)),same=revealed.entities.find(e=>e.id===shell.id);assert.equal(same.concealment,null);assert.equal(same.revealSteps,same.revealNeeded);
 assert.equal(revealed.interact(same.id,'observe',1600).action,'observe');assert.equal(revealed.shells,0);assert.equal(revealed.interact(same.id,'catch',1700).action,'collect');assert.equal(revealed.shells,1);assert.equal(revealed.interact(same.id,'catch',1701).ok,false);
 const later=new CoastGame(revealed.snapshot(),1801000,rng(12));assert.ok(!later.entities.some(e=>e.id===same.id));assert.equal(later.shells,1);
});

test('covered sand cannot be revealed, while a water-side crevice reveals the same fish without rewards',()=>{
 const game=new CoastGame(null,0,rng()),sand=game.entities.find(e=>e.concealment==='sand'&&e.species==='shell'),fish=game.entities.find(e=>e.concealment==='crevice');assert.ok(fish);
 const before={x:fish.x,y:fish.y},id=fish.id;assert.ok(isHabitatValid(fish.species,fish.x,fish.y,0));assert.ok(pathIsHabitatValid(fish.species,fish.x,fish.y,fish.creviceExit.x,fish.creviceExit.y,0,9));assert.ok(Math.hypot(fish.concealmentAnchor.x-fish.x,fish.concealmentAnchor.y-fish.y)<=36);
 game.clock.jump('high',0);game.update(0,0);assert.equal(sand.submerged,true);assert.equal(game.interact(sand.id,'observe',100).ok,false);assert.equal(sand.revealSteps,0);
 const result=game.interact(id,'catch',1000);assert.equal(result.action,'reveal');assert.equal(fish.concealment,null);assert.equal(fish.state,'scene');assert.equal(fish.catchAttempts,undefined);assert.equal(game.bucketCount(),0);assert.equal(game.rescues,0);assert.equal(game.shells,0);assert.deepEqual(game.catalog,{});
 for(let ms=1050;ms<=6000;ms+=50){const old={x:fish.x,y:fish.y};game.update(.05,ms);assert.ok(pathIsHabitatValid(fish.species,old.x,old.y,fish.x,fish.y,game.tide.level,9));}
 assert.equal(fish.id,id);assert.ok(Math.hypot(fish.x-before.x,fish.y-before.y)>40);assert.equal(fish.emergeProgress,1);assert.ok(habitatAt(fish.x,fish.y,game.tide.level).water);
});
