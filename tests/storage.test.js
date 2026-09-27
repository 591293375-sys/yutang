import test from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/lib/storage.js';
import { DEFAULT_CITY } from '../src/lib/environment.js';

function localStore(t, entries = {}) {
  const values = new Map(Object.entries(entries));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  } });
  t.after(() => previous ? Object.defineProperty(globalThis, 'localStorage', previous) : delete globalThis.localStorage);
  return values;
}

test('corrupt settings cannot introduce unsupported scene keys or enable sound', (t) => {
  localStore(t, { 'fusheng-settings': JSON.stringify({ season: 'monsoon', weather: {}, day: 'bright', quality: 'ultra', sound: 'false', reducedMotion: 1, alien: true }) });
  assert.deepEqual(storage.loadSettings(), storage.DEFAULT_SETTINGS);
});

test('settings clamp numeric controls to UI limits and keep fish counts integral', (t) => {
  const values = localStore(t, { 'fusheng-settings': JSON.stringify({ fishCount: 7.8, volume: 500 }) });
  assert.equal(storage.loadSettings().fishCount, 8);
  assert.equal(storage.loadSettings().volume, 0.6);
  values.set('fusheng-settings', JSON.stringify({ fishCount: -20, volume: -1 }));
  assert.equal(storage.loadSettings().fishCount, 3);
  assert.equal(storage.loadSettings().volume, 0);
  values.set('fusheng-settings', '{"fishCount":1e400,"volume":1e400}');
  assert.equal(storage.loadSettings().fishCount, 12);
  assert.equal(storage.loadSettings().volume, 0.18);
});

test('non-object or malformed persisted settings restore defaults', (t) => {
  const values = localStore(t);
  for (const raw of ['null', '[]', '"oops"', '12', '{oops']) {
    values.set('fusheng-settings', raw);
    assert.deepEqual(storage.loadSettings(), storage.DEFAULT_SETTINGS);
  }
});

test('valid settings survive a storage round trip without unrelated persisted fields', (t) => {
  localStore(t);
  const settings = { fishSize:1, turtleCount:0, season: 'autumn', weather: 'rainy', day: 'night', fishCount: 24, quality: 'low', reducedMotion: true, sound: true, volume: 0.4 };
  assert.equal(storage.writeStore('fusheng-settings', settings), true);
  assert.deepEqual(storage.loadSettings(), settings);
});

test('unavailable browser storage falls back without throwing', (t) => {
  localStore(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage unavailable'); } });
  assert.deepEqual(storage.loadSettings(), storage.DEFAULT_SETTINGS);
  assert.deepEqual(storage.loadFish(), []);
  assert.equal(storage.writeStore('anything', 'value'), false);
});

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
test('fish loaded from storage have safe text names, unique IDs and supported image data', (t) => {
  localStore(t, { 'fusheng-fish': JSON.stringify([
    { id: 'one', name: { crash: true }, texture: png },
    { id: 'one', name: '重复', texture: png },
    { id: 'two', name: ' 第二尾 ', texture: png },
    { id: 'three', name: '错误图片', texture: 'data:text/html;base64,AA==' },
  ]) });
  const fish = storage.loadFish();
  assert.equal(fish.length, 2);
  assert.equal(typeof fish[0].name, 'string');
  assert.equal(fish[1].name, '第二尾');
});

test('invalid saved city coordinates and non-text names cannot reach the scene', () => {
  assert.equal(typeof storage.normalizeCity, 'function');
  for (const city of [null, [], { ...DEFAULT_CITY, latitude: 92 }, { ...DEFAULT_CITY, longitude: 190 }, { ...DEFAULT_CITY, name: {} }]) {
    assert.equal(storage.normalizeCity(city), null);
  }
  assert.equal(storage.normalizeCity({ ...DEFAULT_CITY, name: ' 武汉 ' }).name, '武汉');
});

const now = Date.parse('2026-09-27T12:00:00.000Z');
const weather = { city: DEFAULT_CITY, temperature: 24, weather: 'cloudy', description: '多云', isDay: true, updatedAt: '2026-09-27T11:45:00.000Z' };
test('weather cache requires matching city, sane observations, and a bounded age', (t) => {
  assert.equal(typeof storage.readCachedWeather, 'function');
  const values = localStore(t, { 'fusheng-weather-30.5928,114.3055': JSON.stringify(weather) });
  assert.equal(storage.readCachedWeather(DEFAULT_CITY, now).temperature, 24);
  for (const changes of [
    { city: { ...DEFAULT_CITY, latitude: 31 } },
    { isDay: 'false' }, { temperature: null }, { temperature: 999 },
    { weather: 'invalid' }, { description: {} }, { updatedAt: 'invalid' },
    { updatedAt: '2026-09-25T12:00:00.000Z' }, { updatedAt: '2026-09-28T12:00:00.000Z' },
  ]) {
    values.set('fusheng-weather-30.5928,114.3055', JSON.stringify({ ...weather, ...changes }));
    assert.equal(storage.readCachedWeather(DEFAULT_CITY, now), null);
  }
});

test('older offline weather remains usable but can no longer be called current daylight', () => {
  assert.equal(typeof storage.normalizeWeather, 'function');
  assert.equal(typeof storage.isWeatherFresh, 'function');
  const old = { ...weather, updatedAt: '2026-09-27T00:00:00.000Z' };
  assert.ok(storage.normalizeWeather(old, DEFAULT_CITY, now));
  assert.equal(storage.isWeatherFresh(old, now), false);
  assert.equal(storage.isWeatherFresh(weather, now), true);
});

test('legacy manual fog selection upgrades to thunderstorm while live fog caches remain valid', t => {
 const values=localStore(t,{'fusheng-settings':JSON.stringify({weather:'foggy'})});
 assert.equal(storage.loadSettings().weather,'stormy');
 values.set('fusheng-settings',JSON.stringify({weather:'stormy'}));
 assert.equal(storage.loadSettings().weather,'stormy');
 assert.equal(storage.normalizeWeather({...weather,weather:'foggy',description:'雾'},DEFAULT_CITY,now).weather,'foggy');
});

test('creature settings and individual koi sizes survive reload with safe legacy defaults',t=>{
 const values=localStore(t,{'fusheng-settings':JSON.stringify({fishSize:1.4,turtleCount:2}), 'fusheng-fish':JSON.stringify([{id:'a',name:'大锦鲤',texture:png,size:1.65,appearance:'skin-v2'},{id:'b',texture:png},{id:'c',texture:png,size:99,appearance:'invalid'}])});
 assert.equal(storage.loadSettings().fishSize,1.4);assert.equal(storage.loadSettings().turtleCount,2);
 const fish=storage.loadFish();assert.equal(fish[0].size,1.65);assert.equal(fish[0].appearance,'skin-v2');assert.equal(fish[1].size,1);assert.equal(fish[1].appearance,'legacy');assert.equal(fish[2].size,1.8);assert.equal(fish[2].appearance,'legacy');
 values.set('fusheng-settings',JSON.stringify({fishSize:1e9,turtleCount:99}));assert.equal(storage.loadSettings().fishSize,1.6);assert.equal(storage.loadSettings().turtleCount,4);
});
