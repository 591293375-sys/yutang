import test from 'node:test';
import assert from 'node:assert/strict';
import {PondSimulation} from '../src/engine/simulation.js';
import {KoiRenderer} from '../src/engine/koi-renderer.js';
import {koiTailAngle, koiPectoralPose} from '../src/engine/koi-motion.js';

const random = () => .43;
const painter = new KoiRenderer(null);
const create = () => new PondSimulation(1600, 1000, {fishCount: 1, season: 'summer'}, random);
const span = (fish, u) => {
  const saved = fish.phase, values = [];
  for (let phase = 0; phase < Math.PI * 2; phase += .01) {
    fish.phase = phase; values.push(painter.bodyPoint(fish, u).y);
  }
  fish.phase = saved;
  return Math.max(...values) - Math.min(...values);
};

test('a swimming bend travels from the shoulder toward the tail while the head stays stable', () => {
  const fish = create().fish[0];
  const peak = u => {
    let best = -Infinity, time = 0;
    for (let phase = 0; phase < Math.PI * 2; phase += .01) {
      fish.phase = phase;
      const y = painter.bodyPoint(fish, u).y;
      if (y > best) { best = y; time = phase; }
    }
    return time;
  };
  assert.ok(peak(.15) > peak(.65) + .5, 'The tail must receive each stroke after the shoulder');
  assert.ok(span(fish, .94) < span(fish, .05) * .025, 'Head motion must remain much smaller than tail motion');
});

test('food rush produces stronger, faster tail strokes and eases back to cruising', () => {
  const sim = create(), fish = sim.fish[0];
  Object.assign(fish, {x: 200, y: 500, heading: 0, speed: 20, velocity: 20, targetX: 1400, targetY: 500, wander: 100});
  for (let i = 0; i < 120; i++) sim.update(1 / 60);
  const cruise = span(fish, 0), cruisePhase = fish.phase;
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  const cruiseRate = fish.phase - cruisePhase;
  sim.feed(1400, 500);
  for (let i = 0; i < 120; i++) sim.update(1 / 60);
  const rush = span(fish, 0), rushPhase = fish.phase;
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert.ok(fish.phase - rushPhase > cruiseRate * 1.2);
  assert.ok(rush > cruise * 1.2, 'Acceleration should visibly engage the body and tail');
  sim.food = [];
  for (let i = 0; i < 300; i++) sim.update(1 / 60);
  assert.ok(span(fish, 0) < rush * .9, 'The tail should relax after the rush');
});

test('changing direction does not instantly reverse the fish angular velocity', () => {
  const sim = create(), fish = sim.fish[0];
  Object.assign(fish, {x: 700, y: 500, heading: 0, targetX: 950, targetY: 850, wander: 100});
  for (let i = 0; i < 24; i++) sim.update(1 / 60);
  let heading = fish.heading; sim.update(1 / 60);
  const before = (fish.heading - heading) * 60;
  fish.targetX = 950; fish.targetY = 150;
  heading = fish.heading; sim.update(1 / 60);
  const after = (fish.heading - heading) * 60;
  assert.ok(before > .2);
  assert.ok(Math.abs(after - before) < .15, 'A new destination must not create a one-frame turn jerk');
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert.ok(fish.turn < 0, 'Inertia must still allow the fish to complete its turn');
});

test('swimming and turns remain consistent between 30 and 60 FPS', () => {
  const slow = create(), fast = create();
  for (const sim of [slow, fast]) Object.assign(sim.fish[0], {x: 600, y: 450, heading: 0, targetX: 1200, targetY: 800, wander: 100});
  for (let i = 0; i < 180; i++) slow.update(1 / 30);
  for (let i = 0; i < 360; i++) fast.update(1 / 60);
  const a = slow.fish[0], b = fast.fish[0];
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 2);
  assert.ok(Math.abs(a.heading - b.heading) < .025);
  assert.ok(Math.abs(a.phase - b.phase) < .08);
  assert.ok(Math.abs(painter.bodyPoint(a, 0).y - painter.bodyPoint(b, 0).y) < .7);
});

test('tail fin remains tangent to the body throughout a stroke and a turn', () => {
  const fish = create().fish[0];
  for (const turn of [-2, 0, 2]) {
    fish.turn = turn;
    for (let phase = 0; phase < Math.PI * 2; phase += .2) {
      fish.phase = phase;
      const root = painter.bodyPoint(fish, 0), beside = painter.bodyPoint(fish, .0001);
      const direction = Math.atan2(beside.y - root.y, beside.x - root.x);
      assert.ok(Math.abs(koiTailAngle(fish) - direction) < .001, 'Fin/body joint should not kink during a tail stroke');
    }
  }
});

test('pectoral fins assist turning and reduced motion softens the swimming stroke', () => {
  const normal = create(), reduced = create(); reduced.updateOptions({reducedMotion: true});
  for (let i = 0; i < 180; i++) { normal.update(1 / 60); reduced.update(1 / 60); }
  assert.ok(span(reduced.fish[0], 0) < span(normal.fish[0], 0) * .8);
  assert.ok(reduced.fish[0].strokeRate < normal.fish[0].strokeRate * .8);
  const fish = normal.fish[0]; fish.finPhase = 0;
  fish.turn = 0; const relaxed = [-1, 1].map(side => koiPectoralPose(fish, side).spread);
  fish.turn = 1; const turning = [-1, 1].map(side => koiPectoralPose(fish, side).spread);
  assert.ok(turning[0] < relaxed[0] && turning[1] > relaxed[1]);
});
