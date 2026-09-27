import test from 'node:test';
import assert from 'node:assert/strict';
import { PondEngine } from '../src/engine/pond.js';
import { PondSimulation } from '../src/engine/simulation.js';
import { renderScale, UHD_PIXELS, landscapeDimensions, watchDeviceScale } from '../src/engine/rendering.js';

test('Retina 1080p renders a real 3840 × 2160 buffer', () => {
  assert.equal(renderScale(1920, 1080, 2), 2);
});

test('a 4K viewport on Retina never silently allocates an 8K buffer', () => {
  assert.equal(renderScale(3840, 2160, 2), 1);
  for (const [w, h, dpr] of [[5120,2880,2], [2560,1440,3], [1107,1710,2]]) {
    const scale = renderScale(w, h, dpr);
    assert.ok(w * h * scale * scale <= UHD_PIXELS + 1);
  }
});

test('native pixel density is retained below the UHD budget and energy mode is bounded', () => {
  assert.equal(renderScale(1710, 1107, 2), 2);
  assert.equal(renderScale(1280, 720, 1), 1);
  assert.equal(renderScale(1920, 1080, 2, 'low'), 1);
  assert.equal(renderScale(3840, 2160, 2, 'low'), 0.5);
});

test('animated fish shadows never filter the full-resolution canvas', () => {
  const filters = [], images = [];
  const ctx = new Proxy({}, {
    get: (object, key) => object[key] ?? (key === 'drawImage' ? (...args) => images.push(args) : () => {}),
    set: (object, key, value) => { if (key === 'filter') filters.push(value); object[key] = value; return true; },
  });
  const engine = Object.assign(Object.create(PondEngine.prototype), {
    ctx, width: 1920, height: 1080, options: { quality: 'high' }, shadowSprite: {},
  });
  const sim = new PondSimulation(1920, 1080, { fishCount: 24 });
  for (let frame = 0; frame < 60; frame++) {
    sim.update(1 / 60);
    for (const fish of sim.fish) engine.drawFish(fish, true);
  }
  assert.equal(filters.filter(value => value !== 'none').length, 0, 'No blur on the live 4K surface');
  assert.equal(images.length, 24 * 60, 'Each shadow reuses one small pre-rendered texture');
  assert.ok(images.every(args => args[0] === engine.shadowSprite));
});

test('desktop mode renders at least a 4K long edge even on a smaller Retina display', () => {
  const scale = renderScale(1710, 1107, 2, 'high', true);
  assert.ok(1710 * scale >= 3840 - 0.01);
  assert.ok(1107 * scale >= 2485);
});

test('desktop mode keeps 5K native pixels while energy mode remains explicitly lower resolution', () => {
  assert.equal(renderScale(2560, 1440, 2, 'high', true), 2);
  assert.equal(renderScale(1920, 1080, 1, 'high', true), 2);
  assert.equal(renderScale(1710, 1107, 2, 'low', true), 1);
});

test('background and fish retain the same native 5K and 6K desktop pixels', () => {
  for (const [width, height] of [[2560, 1440], [3072, 1728]]) {
    const scale = renderScale(width, height, 2, 'high', true);
    assert.deepEqual(landscapeDimensions(width, height, scale), [width * scale, height * scale]);
  }
  assert.deepEqual(landscapeDimensions(3072, 1728, 2, 4096), [4096, 2304], 'A smaller GPU limit preserves the aspect ratio');
});

test('Electron display density corrects a stale renderer DPR without exceeding the desktop budget', () => {
  assert.equal(renderScale(2560, 1440, 1, 'high', true, 2), 2);
  assert.equal(renderScale(2560, 1440, 1, 'low', true, 2), .75);
  assert.equal(renderScale(2560, 1440, 1, 'high', false, 2), 1, 'Native desktop metadata does not override a browser window');
});

test('moving between displays refreshes pixel density even when the CSS size stays unchanged', () => {
  const queries = [], listeners = new Map(), removed = [];
  const target = {devicePixelRatio: 1, matchMedia: query => {
    queries.push(query);
    return {addEventListener: (_event, fn) => listeners.set(query, fn), removeEventListener: (_event, fn) => {if (listeners.get(query) === fn) listeners.delete(query); removed.push(query)}};
  }};
  let changes = 0;
  const stop = watchDeviceScale(() => changes++, target);
  target.devicePixelRatio = 2;
  listeners.get('(resolution: 1dppx)')();
  assert.equal(changes, 1);
  assert.deepEqual(queries, ['(resolution: 1dppx)', '(resolution: 2dppx)']);
  assert.equal(listeners.size, 1, 'Only the current display watcher remains subscribed');
  stop();
  assert.equal(listeners.size, 0);
});
