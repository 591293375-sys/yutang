import test from 'node:test';
import assert from 'node:assert/strict';
import { CoastGame } from '../src/themes/coast/game.js';
import { tideAt, TIDE_DURATIONS } from '../src/themes/coast/tide.js';
const rng=(seed=1)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};

test('production tide reversal preserves level, resumes the normal cycle and survives reload',()=>{
 const game=new CoastGame(null,0,rng(61));game.update(0,250000);const level=game.tide.level,ids=game.entities.map(e=>e.id),next=game.nextId;
 assert.equal(game.setTideDirection('falling',250000).ok,true);assert.ok(Math.abs(game.tide.level-level)<1e-12);assert.equal(game.tide.phase,'falling');assert.equal(game.clock.speed,1);assert.equal(game.clock.paused,false);assert.equal(game.isDebugTime(),false);
 assert.ok(game.clock.snapshot(260000).level<level);const saved=game.snapshot(),restored=new CoastGame(saved,250000,rng(99));assert.ok(Math.abs(restored.tide.level-level)<1e-12);assert.equal(restored.view().tideDirection,'falling');assert.equal(restored.clock.epochMs,saved.epochMs);
 assert.deepEqual(game.entities.map(e=>e.id),ids);assert.equal(game.nextId,next);
 const later=250000+(game.tide.remainingSeconds+TIDE_DURATIONS.low)*1000+10;assert.equal(game.clock.snapshot(later).phase,'rising');
 assert.equal(restored.setTideDirection('rising',250000).ok,true);assert.ok(Math.abs(restored.tide.level-level)<1e-12);assert.ok(restored.clock.snapshot(260000).level>level);
});

test('rapid production direction toggles never duplicate visitors or reset their per-cycle admission budget',()=>{
 const game=new CoastGame(null,0,rng(67));game.update(0,700000);for(let ms=700100;ms<=702000;ms+=100)game.update(.1,ms);const ids=game.entities.map(e=>e.id),next=game.nextId,level=game.tide.level;
 for(let i=0;i<30;i++){game.setTideDirection(i%2?'rising':'falling',702000);assert.ok(Math.abs(game.tide.level-level)<1e-12);assert.equal(game.nextId,next);assert.equal(game.admissionStage,2);assert.equal(game.rescues,0);assert.equal(game.shells,0);}
 assert.deepEqual(game.entities.map(e=>e.id),ids);assert.equal(new Set(ids).size,ids.length);
 const restored=new CoastGame(game.snapshot(),702001,rng(8));restored.update(0,702002);assert.equal(restored.nextId,next);assert.equal(restored.aquaticCount(),18);
});

test('direction at boundary levels may persist a negative epoch and cancels temporary debug time cleanly',()=>{
 const game=new CoastGame(null,0,rng(71));game.setTideDirection('falling',0);assert.equal(game.tide.level,0);assert.ok(game.clock.epochMs<0);const saved=game.snapshot();assert.ok(saved);const restored=new CoastGame(saved,1,rng(3));assert.equal(restored.tide.level,0);
 game.clock.setSpeed(60,0);game.update(0,1000);const before=game.tide.level;game.setTideDirection('rising',1000);assert.ok(Math.abs(game.tide.level-before)<1e-12);assert.equal(game.isDebugTime(),false);assert.equal(game.clock.virtualNow(1000),1000);
 assert.equal(game.snapshot().admissionCycle,tideAt(game.clock.epochMs,1000).cycle);const epoch=game.clock.epochMs;assert.equal(game.setTideDirection('invalid',2000).ok,false);assert.equal(game.clock.epochMs,epoch);
});
