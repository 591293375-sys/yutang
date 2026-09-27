import test from 'node:test';
import assert from 'node:assert/strict';
import { PondSimulation } from '../src/engine/simulation.js';

const seeded = (seed = 79) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pond = (options = {}) => new PondSimulation(1000, 700, options, seeded());

// A missing initialization or accidentally disabled steering leaves the pond empty/static.
test('an initialized pond has twelve fish that continue to swim', () => {
  const sim = pond();
  assert.equal(sim.getStats().fishCount, 12);
  const before = sim.fish.map(({ x, y }) => ({ x, y }));
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert.ok(sim.fish.some((fish, i) => Math.hypot(fish.x - before[i].x, fish.y - before[i].y) > 3));
});

// Loss of the population and particle caps would make repeated UI interactions unbounded.
test('repeated feeding and custom fish replacement remain bounded', () => {
  const sim = pond();
  for (let i = 0; i < 200; i++) sim.feed(500, 350);
  assert.ok(sim.food.length > 0 && sim.food.length <= 80);
  assert.ok(sim.ripples.length <= 40);
  sim.setCustomFish(Array.from({ length: 100 }, (_, i) => ({ id: String(i), texture: 'data:image/png;base64,' })));
  assert.ok(sim.fish.length <= 36);
  sim.setCustomFish([]);
  assert.equal(sim.fish.length, 12);
});

// Without food attraction or eating, nearby reachable food never disappears.
test('a fish swims to and eats reachable food', () => {
  const sim = pond({ fishCount: 1 });
  assert.equal(sim.fish.length, 1);
  Object.assign(sim.fish[0], { x: 350, y: 350, heading: 0, targetX: 450, targetY: 350 });
  sim.feed(480, 350);
  const foodBefore = sim.food.length;
  assert.ok(foodBefore > 0);
  for (let i = 0; i < 10 * 60; i++) sim.update(1 / 60);
  assert.ok(sim.food.length < foodBefore, 'reachable food should be eaten within ten seconds');
});

// Removing finite input validation, frame clamping, or boundary recovery escapes the viewport.
test('resizing and a stalled animation frame keep fish finite and in the pond', () => {
  const sim = pond();
  assert.equal(sim.fish.length, 12);
  sim.setBounds(320, 220);
  sim.feed(Number.NaN, Infinity);
  sim.pointer(Number.NaN, Infinity, true);
  for (let i = 0; i < 3000; i++) sim.update(i === 0 ? 90 : 1 / 30);
  for (const fish of sim.fish) {
    assert.ok(Number.isFinite(fish.x) && Number.isFinite(fish.y) && Number.isFinite(fish.heading));
    assert.ok(fish.x >= 0 && fish.x <= 320 && fish.y >= 0 && fish.y <= 220);
  }
});

// A paused pond must not advance its fish or consume time-sensitive food.
test('pause freezes simulation and resume moves fish again', () => {
  const sim = pond();
  assert.equal(sim.fish.length, 12);
  sim.feed(500, 350);
  sim.updateOptions({ paused: true });
  const before = JSON.stringify({ fish: sim.fish, food: sim.food });
  sim.update(1);
  assert.equal(JSON.stringify({ fish: sim.fish, food: sim.food }), before);
  sim.updateOptions({ paused: false });
  sim.update(1 / 30);
  assert.notEqual(JSON.stringify({ fish: sim.fish, food: sim.food }), before);
});

// Forgetting the cursor repulsion branch lets fish approach a moving hand.
test('fish turn away from an active nearby pointer', () => {
  const sim = pond({ fishCount: 1 });
  assert.equal(sim.fish.length, 1);
  Object.assign(sim.fish[0], { x: 500, y: 350, heading: 0, targetX: 750, targetY: 350 });
  sim.pointer(525, 358, true);
  for (let i = 0; i < 40; i++) { sim.pointer(525, 358, true); sim.update(1 / 60); }
  assert.ok(Math.abs(sim.fish[0].heading) > 0.2);
});

test('food immediately attracts distant fish across a wide desktop and produces a clear rush', () => {
  const sim = new PondSimulation(1920, 1080, { fishCount: 1, season: 'summer' }, seeded());
  const fish = sim.fish[0];
  Object.assign(fish, { x: 200, y: 500, heading: 0, targetX: 200, targetY: 500, speed: 20, velocity: 20 });
  sim.feed(1400, 500);
  for (let i = 0; i < 60; i++) sim.update(1 / 60);
  assert.ok(fish.velocity > 50, `Expected a visible feeding rush, got ${fish.velocity}`);
  assert.ok(fish.x > 235, 'Distant fish should travel toward the food instead of idly wandering');
  assert.ok(Math.abs(fish.y - 500) < 20);
});

test('fish slow near food and settle back to cruising after it is gone', () => {
  const sim = new PondSimulation(1000, 700, { fishCount: 1, season: 'summer' }, seeded());
  const fish = sim.fish[0];
  Object.assign(fish, { x: 500, y: 350, heading: 0, speed: 20, velocity: 65 });
  sim.food = [{ x: 538, y: 350, age: 0, life: 100, phase: 0, size: 2 }];
  for (let i = 0; i < 24; i++) sim.update(1 / 60);
  assert.ok(fish.velocity < 30, 'Fish should brake as they reach a morsel');
  sim.food = [];
  for (let i = 0; i < 240; i++) sim.update(1 / 60);
  assert.ok(Math.abs(fish.velocity - fish.speed) < 0.5);
});

test('feeding clears the click-position scare while later mouse movement still repels fish', () => {
  const sim = pond({ fishCount: 1 });
  sim.pointer(500, 350, true);
  sim.feed(500, 350);
  assert.equal(sim.hand.life, 0);
  sim.pointer(520, 350, true);
  assert.ok(sim.hand.life > 0);
});
