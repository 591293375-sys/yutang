const test = require('node:test');
const assert = require('node:assert/strict');
const { allowedEntry, requireBoolean, pointForBounds, parseHelperLine, displayMetrics } = require('./policy.cjs');

test('IPC navigation accepts only the exact packaged entry and rejects sibling files and remote origins', () => {
  const entry = 'file:///Applications/Koi%20Pond.app/Contents/Resources/app.asar/dist/index.html';
  assert.equal(allowedEntry(entry, entry), true);
  assert.equal(allowedEntry(`${entry}#settings`, entry), true);
  assert.equal(allowedEntry(entry.replace('index.html', 'untrusted.html'), entry), false);
  assert.equal(allowedEntry('https://example.com/', entry), false);
  assert.equal(allowedEntry('not a URL', entry), false);
});

test('settings reject coercible values so malformed IPC cannot enable OS features', () => {
  assert.equal(requireBoolean(false), false);
  assert.equal(requireBoolean(true), true);
  for (const value of ['false', 1, null, undefined, {}]) assert.throws(() => requireBoolean(value), TypeError);
});

test('screen points map correctly on displays left of primary and exclude outside edges', () => {
  const bounds = { x: -1280, y: 100, width: 1280, height: 720 };
  assert.deepEqual(pointForBounds({ x: -640, y: 460 }, bounds), { x: 640, y: 360, normalizedX: 0.5, normalizedY: 0.5 });
  assert.equal(pointForBounds({ x: 0, y: 460 }, bounds), null);
  assert.equal(pointForBounds({ x: -1281, y: 460 }, bounds), null);
  assert.equal(pointForBounds({ x: NaN, y: 460 }, bounds), null);
});

test('native helper messages reject oversized, nonfinite and unexpected event payloads', () => {
  assert.deepEqual(parseHelperLine('{"event":"click","x":14,"y":22}'), { event: 'click', x: 14, y: 22 });
  assert.deepEqual(parseHelperLine('{"event":"ready"}'), { event: 'ready' });
  assert.equal(parseHelperLine('{"event":"key","x":14,"y":22}'), null);
  assert.equal(parseHelperLine('{"event":"click","x":1e999,"y":22}'), null);
  assert.equal(parseHelperLine('x'.repeat(5000)), null);
  assert.equal(parseHelperLine('invalid json'), null);
});

test('display metrics retain Retina backing pixels separately from logical desktop bounds', () => {
  assert.deepEqual(displayMetrics({id: 7, bounds: {x: -2560, y: 0, width: 2560, height: 1440}, scaleFactor: 2}),
    {id: 7, width: 2560, height: 1440, scaleFactor: 2, pixelWidth: 5120, pixelHeight: 2880});
  assert.equal(displayMetrics({bounds: {width: 0, height: 1080}, scaleFactor: 2}), null);
  assert.equal(displayMetrics({bounds: {width: 1920, height: 1080}, scaleFactor: NaN}).pixelWidth, 1920);
});
