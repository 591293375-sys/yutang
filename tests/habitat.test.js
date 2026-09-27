import test from 'node:test';
import assert from 'node:assert/strict';
import { PondHabitat } from '../src/engine/habitat.js';
import { PondSimulation } from '../src/engine/simulation.js';
const seeded = (s = 41) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);

test('shore geometry follows background cover cropping at desktop and narrow sizes', () => {
  for (const [w,h] of [[1920,1080],[1082,897],[390,844],[3840,2160]]) {
    const habitat = new PondHabitat(w,h);
    for (const [u,v,water] of [[.5,.5,true],[.5,.15,true],[.08,.08,false],[.93,.8,false],[.12,.9,false]]) {
      const p = habitat.fromArtwork(u,v);
      if (p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h) assert.equal(habitat.contains(p.x,p.y),water,`${w}×${h}: ${u},${v}`);
    }
  }
});

test('bank clicks create no edible food; scattered food stays in water', () => {
  const sim = new PondSimulation(1920,1080,{},seeded());
  for (const [u,v] of [[.08,.08],[.93,.8],[.12,.9]]) {
    assert.equal(sim.feed(u*1920,v*1080),false);
    assert.equal(sim.food.length,0);
  }
  assert.equal(sim.feed(960,540),true);
  assert.ok(sim.food.length > 0);
  assert.ok(sim.food.every(p => sim.habitat.contains(p.x,p.y,8)));
});

test('fish and turtles remain in water when feeding, startled, enlarged, and resized', () => {
  const sim = new PondSimulation(1920,1080,{fishCount:24,turtleCount:4,fishSize:1.6},seeded());
  sim.setCustomFish([{id:'large',size:1.8}]);
  for (const [w,h] of [[1920,1080],[1082,897],[560,600],[3840,2160]]) {
    sim.setBounds(w,h);
    for (let frame=0;frame<600;frame++) {
      if (frame%60===0) { sim.feed(w*.8,h*.7); sim.pointer(w*.55,h*.45); }
      sim.update(1/30);
      for (const animal of [...sim.fish,...sim.turtles]) {
        assert.ok(sim.habitat.contains(animal.x,animal.y,sim.bodyRadius(animal)-.05),`Creature escaped at ${w}×${h}`);
      }
    }
  }
});

test('old or drifting pellets on land are discarded before fish choose a target', () => {
  const sim = new PondSimulation(1920,1080,{fishCount:1},seeded());
  sim.food.push({x:1800,y:880,age:0,life:100,phase:0,size:2});
  sim.update(1/60);
  assert.equal(sim.food.length,0);
});

test('a large fish ignores food in shallows too narrow for its body', () => {
  const fed = new PondSimulation(1920,1080,{fishCount:1,fishSize:1.6},seeded());
  const control = new PondSimulation(1920,1080,{fishCount:1,fishSize:1.6},seeded());
  const point=fed.habitat.project(1780,850,12);
  fed.food.push({...point,age:0,life:100,phase:0,size:2});
  for(let i=0;i<300;i++){fed.update(1/60);control.update(1/60);}
  assert.equal(fed.food.length,1);
  assert.deepEqual(fed.fish,control.fish,'An inaccessible morsel must not change steering or trigger a feeding rush');
});
