import test from 'node:test';
import assert from 'node:assert/strict';
import {PondSimulation} from '../src/engine/simulation.js';
const rng=()=>{let seed=27;return()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296)};
test('fish sizes vary noticeably and resizing does not replace swimming fish',()=>{
 const s=new PondSimulation(1400,900,{fishCount:24},rng());
 const lengths=s.fish.map(f=>f.length);assert.ok(Math.max(...lengths)/Math.min(...lengths)>1.8);
 const first=s.fish[0],x=first.x,l=first.length;s.updateOptions({fishSize:1.5});
 assert.equal(s.fish[0],first);assert.equal(first.x,x);assert.ok(Math.abs(first.length/l-1.5)<.001);
});
test('individual size updates preserve custom koi identities, position and other fish sizes',()=>{
 const s=new PondSimulation(1400,900,{fishCount:3},rng());
 s.setCustomFish([{id:'a',size:.6},{id:'b',size:1.6}]);
 const a=s.fish.find(f=>f.custom?.id==='a'),b=s.fish.find(f=>f.custom?.id==='b'),bx=b.length;
 assert.ok(b.length/a.length>2.5);const x=a.x;
 s.setCustomFish([{id:'a',size:1.2},{id:'b',size:1.6}]);assert.equal(a.x,x);assert.ok(Math.abs(a.length/b.length-.75)<.001);assert.equal(b.length,bx);
});
test('turtles are optional, bounded, preserved on count changes and swim toward nearby food',()=>{
 const s=new PondSimulation(1000,700,{fishCount:0,turtleCount:1},rng());
 assert.equal(s.turtles?.length,1);const turtle=s.turtles[0];
 Object.assign(turtle,{x:350,y:350,heading:0,targetX:450,targetY:350,rest:0});s.feed(440,350);
 const before=s.food.length;for(let i=0;i<900;i++)s.update(1/60);
 assert.ok(turtle.x>365);assert.ok(s.food.length<before);
 s.updateOptions({turtleCount:100});assert.equal(s.turtles.length,4);assert.equal(s.turtles[0],turtle);
 s.updateOptions({turtleCount:0});assert.equal(s.turtles.length,0);
});
test('turtles respect pause, resizing and invalid settings',()=>{
 const s=new PondSimulation(1000,700,{turtleCount:2},rng());assert.equal(s.turtles?.length,2);
 s.updateOptions({paused:true});const old=JSON.stringify(s.turtles);s.update(.05);assert.equal(JSON.stringify(s.turtles),old);
 s.updateOptions({paused:false,fishSize:NaN});s.setBounds(320,240);
 for(let i=0;i<3000;i++)s.update(.05);
 assert.ok([...s.fish,...s.turtles].every(f=>Number.isFinite(f.x)&&f.x>=0&&f.x<=320&&f.y>=0&&f.y<=240&&Number.isFinite(f.length)));
});
