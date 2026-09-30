import test from 'node:test';
import assert from 'node:assert/strict';
import { CoastGame } from '../src/themes/coast/game.js';
import { SPECIES_BY_ID } from '../src/themes/coast/catalog.js';
import { isHabitatValid } from '../src/themes/coast/geometry.js';

const rng = (seed = 1) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const beach = game => game.entities.filter(e => e.state === 'scene' && ['crab', 'shell'].includes(SPECIES_BY_ID[e.species].kind));
const nearest = entities => Math.min(...entities.flatMap((e, i) => entities.slice(i + 1).map(other => Math.hypot(e.x - other.x, e.y - other.y))));
const saved = entities => ({ version: 1, epochMs: 0, nextId: 100, entities, shells: 7, rescues: 2, catalog: { shell: { firstDiscovered: 1, observed: 2, collected: 7 } } });
const creature = (id, species = 'crab', state = 'scene') => ({ id, species, state, x: 953.5, y: 554.5, heading: 0, phase: 0, concealmentInitialized: true });

test('shore arrivals spread across the available beach instead of piling onto the first valid point', () => {
  // Repeated random values reproduce the old first-valid-point pileup exactly.
  for (const level of [0, .5, 1]) {
    const game = new CoastGame(saved([]), 0, () => .5);
    game.clock.setLevel(level, 0); game.update(0, 0);
    for (let i = 0; i < 10; i++) game.spawn(SPECIES_BY_ID.crab);
    for (let i = 0; i < 12; i++) game.spawn(SPECIES_BY_ID.shell);
    const animals = beach(game);
    assert.ok(animals.length >= (level === 1 ? 5 : 20));
    assert.ok(nearest(animals) >= 64, 'body-sized gaps must remain even when a high tide leaves little sand');
    assert.ok(Math.max(...animals.map(e => e.y)) - Math.min(...animals.map(e => e.y)) > 350, 'use distant beach areas too');
    for (const e of animals) assert.ok(isHabitatValid(e.species, e.x, e.y, level));
  }
});

test('crowded legacy saves are dispersed once while IDs, hidden finds, bucket and earned collections survive', () => {
  const entities = Array.from({ length: 12 }, (_, i) => ({ ...creature('old-' + i, i % 2 ? 'shell' : 'crab'),
    ...(i === 4 ? { concealment: 'sand', revealNeeded: 3, revealSteps: 1 } : {}) }));
  entities.push(creature('bucket-crab', 'crab', 'bucket'));
  const game = new CoastGame(saved(entities), 0, rng(4));
  assert.deepEqual(game.entities.map(e => e.id), entities.map(e => e.id));
  assert.equal(game.bucketCount(), 1); assert.equal(game.shells, 7); assert.equal(game.rescues, 2); assert.equal(game.catalog.shell.collected, 7);
  assert.ok(nearest(beach(game)) >= 64);
  assert.equal(game.entities[4].concealment, 'sand'); assert.equal(game.entities[4].revealSteps, 1);
  const restored = new CoastGame(game.snapshot(), 0, rng(9));
  assert.deepEqual(restored.entities.map(e => [e.id, e.x, e.y]), game.entities.map(e => [e.id, e.x, e.y]), 'a valid spread must not reshuffle on reopen');
});

test('bulk release reserves separate legal destinations, including animals still in the release animation', () => {
  const game = new CoastGame(saved(Array.from({ length: 8 }, (_, i) => creature('bucket-' + i, 'crab', 'bucket'))), 0, () => .5);
  assert.equal(game.release('all', 1).released, 8);
  const targets = game.entities.map(e => e.target);
  assert.ok(nearest(targets) >= 64);
  for (const p of targets) assert.ok(isHabitatValid('crab', p.x, p.y, game.tide.level));
  assert.equal(game.entities.length, 8); assert.equal(game.bucketCount(), 0);
});

test('tide refuge routes do not collapse separately spawned crabs into one overlapping clump', () => {
  const game = new CoastGame(null, 0, rng(1)); game.clock.setSpeed(60, 0);
  for (let ms = 100; ms <= 14000; ms += 100) game.update(.1, ms);
  const crabs = beach(game).filter(e => !e.concealment && SPECIES_BY_ID[e.species].kind === 'crab');
  assert.ok(nearest(crabs) >= 35, 'crabs need room to walk even on the narrow high-water shore');
  for (const e of crabs) assert.ok(isHabitatValid(e.species, e.x, e.y, game.tide.level));
});
