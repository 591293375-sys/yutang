import test from 'node:test';
import assert from 'node:assert/strict';
import {habitatAt, isHabitatValid, pathIsHabitatValid} from '../src/themes/coast/geometry.js';
import {BottleDrift, bottleWaterPath, bottleWaterPoint} from '../src/themes/coast/bottles.js';
import {CoastGame} from '../src/themes/coast/game.js';
import {TideClock} from '../src/themes/coast/tide.js';

// Hand-checked locations on the supplied 1672 × 941 painting. These fixtures
// deliberately do not derive their expected classification from the rock masks.
const scenePoint=([x,y])=>({x:x*1600/1672,y:y*900/941});

test('complete visible stone faces stay dry and block swimming at every tide',()=>{
  const stoneFaces=[
    ['central back rock',[620,510]],['central back lower face',[537,594]],
    ['left rear rock',[299,602]],['left front rock',[453,677]],
    ['right front rock',[836,654]],['right front lower edge',[787,705]],
    ['small bottom rock',[638,718]],['middle-right large rock',[1134,451]],
    ['middle-right lower edge',[1225,511]],['attached upper rock',[1047,361]],
    ['right small rock lower face',[1388,424]],
  ];
  for(const [name,pixel] of stoneFaces){
    const {x,y}=scenePoint(pixel);
    for(const level of [0,.2,.5,.8,1]){
      const h=habitatAt(x,y,level);
      assert.equal(h.blocked,true,`${name} must be a solid foreground stone at tide ${level}`);
      assert.equal(h.water,false,`${name} must never become exposed water`);
      assert.equal(isHabitatValid('fish_silver',x,y,level),false);
    }
  }
});

test('water surrounds the silhouettes without a pasted elliptical rock halo',()=>{
  for(const pixel of [[465,454],[720,417],[944,529],[1446,411],[1390,372],[1380,383]]){
    const {x,y}=scenePoint(pixel),h=habitatAt(x,y,1);
    assert.equal(h.blocked,false,`Open water beside a stone is not part of its mask: ${pixel}`);
    assert.equal(h.water,true,`High tide must flow around each stone: ${pixel}`);
  }
  for(const pixel of [[465,454],[720,417],[944,529],[1446,411]]){
    const {x,y}=scenePoint(pixel);
    assert.equal(isHabitatValid('fish_silver',x,y,1),true,`Water beside the rocks remains swimmable: ${pixel}`);
  }
});

test('visible bottle arrivals and departures remain reachable around the complete rocks',()=>{
  const start=1700000000000;
  for(const seed of [0,.2,.5,.8,.999]){
    const storage={value:null,getItem(){return this.value},setItem(key,value){this.value=value}};
    const drift=new BottleDrift({storage,nowMs:start,random:()=>seed,getTide:now=>new TideClock(start,now).bottleArrival(now)});
    let now=start;const due=start+5000;
    while(now<due){now=Math.min(now+10000,due);drift.update(2,now,0)}
    const incoming=drift.bottles.find(b=>b.kind==='incoming');
    assert.ok(incoming,`Arrival route exists for seed ${seed}`);
    const result=drift.sendLetter({body:'从石间的海水放流。'},now,0);
    assert.equal(result.ok,true,`Departure route exists for seed ${seed}`);
    for(const bottle of [incoming,result.bottle]){
      for(let i=0;i<bottle.route.length;i++){
        assert.ok(bottleWaterPoint(bottle.route[i].x,bottle.route[i].y));
        if(i)assert.ok(bottleWaterPath(bottle.route[i-1],bottle.route[i]));
      }
      const shore=bottle.kind==='incoming'?bottle.route.at(-1):bottle.route[0];
      assert.ok(shore.x>=660&&shore.x<=940&&shore.y>280&&shore.y<680,'Shore end remains visible in the mobile crop');
    }
  }
});

test('legacy shells newly covered by rock silhouettes relocate once without changing their identity or awards',()=>{
  const legacy={version:1,epochMs:0,nextId:8,shells:4,rescues:2,catalog:{shell:{firstDiscovered:10,observed:1,caught:0,collected:4,rescued:0}},
    entities:[{id:'coast-7',species:'shell',x:600,y:500,heading:0,phase:0,state:'scene',concealmentInitialized:true,concealment:null,revealNeeded:0}]};
  const game=new CoastGame(legacy,0,()=>.4),shell=game.entities.find(e=>e.id==='coast-7');
  assert.ok(isHabitatValid('shell',shell.x,shell.y,0),'An old shell inside the newly solid rock must return to real beach');
  assert.equal(game.entities.length,1);assert.equal(game.shells,4);assert.equal(game.rescues,2);assert.equal(game.catalog.shell.collected,4);
  const restored=new CoastGame(game.snapshot(),100,()=>.4),again=restored.entities[0];
  assert.equal(again.id,shell.id);assert.equal(again.x,shell.x);assert.equal(again.y,shell.y);
  assert.equal(restored.shells,4);assert.equal(restored.entities.length,1);
});

test('terrain migration reanchors a hidden fish and its exit as one legal crevice',()=>{
 for(const location of [{x:975.739,y:330.785},{x:928.007,y:365.465}]){
  const entity={id:'coast-2',species:'fish_silver',x:975.739,y:330.785,heading:0,phase:0,state:'scene',submerged:true,
    concealment:'crevice',concealmentInitialized:true,revealSteps:0,revealNeeded:1,
    concealmentAnchor:{x:973.084,y:299.899},creviceExit:{x:981.564,y:398.536},...location};
  const game=new CoastGame({version:1,epochMs:0,nextId:3,entities:[entity],shells:3,rescues:2},0,()=>.4),fish=game.entities[0];
  assert.equal(fish.id,entity.id);assert.equal(game.shells,3);assert.equal(game.rescues,2);
  assert.equal(fish.concealment,'crevice');
  assert.ok(isHabitatValid(fish.species,fish.x,fish.y,0));
  assert.ok(isHabitatValid(fish.species,fish.creviceExit.x,fish.creviceExit.y,0),'The migrated exit cannot stay inside the new boulder');
  assert.ok(pathIsHabitatValid(fish.species,fish.x,fish.y,fish.creviceExit.x,fish.creviceExit.y,0,13));
  assert.ok(Math.hypot(fish.x-fish.concealmentAnchor.x,fish.y-fish.concealmentAnchor.y)<=31.01,'The clue stays at its own rock edge');
  const before={x:fish.x,y:fish.y,anchor:fish.concealmentAnchor,exit:fish.creviceExit},restored=new CoastGame(game.snapshot(),100,()=>.4).entities[0];
  assert.deepEqual({x:restored.x,y:restored.y,anchor:restored.concealmentAnchor,exit:restored.creviceExit},before);
 }
});
