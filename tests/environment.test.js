import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CITY, getSeason, getDayPhase, getSolarTerm, mapWeatherCode, searchCities, fetchWeather } from '../src/lib/environment.js';
import * as environment from '../src/lib/environment.js';

test('meteorological seasons change at local month boundaries and invert south of the equator', () => {
  assert.equal(getSeason(new Date(2026, 1, 28, 23, 59)), 'winter');
  assert.equal(getSeason(new Date(2026, 2, 1)), 'spring');
  assert.equal(getSeason(new Date(2026, 5, 1)), 'summer');
  assert.equal(getSeason(new Date(2026, 8, 1)), 'autumn');
  assert.equal(getSeason(new Date(2026, 11, 1)), 'winter');
  assert.equal(getSeason(new Date(2026, 11, 1), -33.87), 'summer');
  assert.equal(getSeason(new Date(2026, 2, 1), -33.87), 'autumn');
  assert.equal(getSeason(new Date(2026, 8, 1), 0), 'autumn');
});

test('day phase boundaries use local time for the offline scene', () => {
  for (const [hour, expected] of [[4, 'night'], [5, 'dawn'], [6, 'dawn'], [7, 'day'], [16, 'day'], [17, 'dusk'], [18, 'dusk'], [19, 'night'], [23, 'night']]) {
    assert.equal(getDayPhase(new Date(2026, 8, 27, hour)), expected);
  }
});

test('invalid calendar inputs and latitude never silently select a season', () => {
  assert.throws(() => getSeason(new Date('invalid')), RangeError);
  assert.throws(() => getSeason(new Date(), 91), RangeError);
  assert.throws(() => getDayPhase(new Date('invalid')), RangeError);
  assert.throws(() => getSolarTerm(new Date('invalid')), RangeError);
});

test('solar terms wrap across New Year and spring equinox without lunar-festival substitutions', () => {
  const cases = [
    ['2026-01-01T12:00:00Z', '冬至'],
    ['2026-01-07T12:00:00Z', '小寒'],
    ['2026-02-06T12:00:00Z', '立春'],
    ['2026-03-19T12:00:00Z', '惊蛰'],
    ['2026-03-21T12:00:00Z', '春分'],
    ['2026-06-22T12:00:00Z', '夏至'],
    ['2026-09-27T12:00:00Z', '秋分'],
    ['2026-12-23T12:00:00Z', '冬至'],
  ];
  for (const [date, expected] of cases) assert.equal(getSolarTerm(new Date(date)), expected);
  assert.equal(getSolarTerm(new Date('1800-01-01T00:00:00Z')), '');
  assert.equal(getSolarTerm(new Date('2101-01-01T00:00:00Z')), '');
});

test('weather mapping distinguishes fog, freezing rain, snowfall, and thunderstorms', () => {
  for (const [codes, weather] of [
    [[0, 1], 'sunny'], [[2, 3], 'cloudy'], [[45, 48], 'foggy'],
    [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'rainy'],
    [[95, 96, 97, 99], 'stormy'], [[71, 73, 75, 77, 85, 86], 'snowy'], [[null, undefined, -1, 999, '0'], 'cloudy'],
  ]) for (const code of codes) assert.equal(mapWeatherCode(code), weather);
});

test('city search accepts Chinese aliases, uses the real geocoding contract, and drops malformed coordinates', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, 'https://geocoding-api.open-meteo.com');
    assert.equal(request.searchParams.get('name'), 'Wuhan');
    assert.equal(request.searchParams.get('countryCode'), 'CN');
    assert.equal(request.searchParams.get('language'), 'zh');
    return new Response(JSON.stringify({ results: [
      { id: 1791247, name: '武汉', country: '中国', latitude: 30.58333, longitude: 114.26667, timezone: 'Asia/Shanghai' },
      { id: 1, name: '坏坐标', country: '中国', latitude: null, longitude: 114 },
      { id: 2, name: '越界', country: '中国', latitude: 95, longitude: 114 },
    ], generationtime_ms: 0.4 }));
  });
  const results = await searchCities(' 武汉市 ');
  assert.deepEqual(results, [{ id: 1791247, name: '武汉', country: '中国', latitude: 30.58333, longitude: 114.26667 }]);
});

test('short and empty city searches do not make unnecessary network requests', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No request expected'));
  assert.deepEqual(await searchCities(' '), []);
  assert.deepEqual(await searchCities('a'), []);
  await assert.rejects(searchCities('x'.repeat(81)), RangeError);
});

test('city search safely encodes arbitrary foreign names and accepts an empty result', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url);
    assert.equal(request.searchParams.get('name'), 'Paris, France');
    assert.equal(request.searchParams.has('countryCode'), false);
    return new Response('{}');
  });
  assert.deepEqual(await searchCities('Paris, France'), []);
});

test('ordinary object-property names are not mistaken for Chinese city aliases', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url);
    assert.equal(request.searchParams.get('name'), 'constructor');
    assert.equal(request.searchParams.has('countryCode'), false);
    return new Response('{}');
  });
  assert.deepEqual(await searchCities('constructor'), []);
});

const currentFixture = {
  latitude: 30.625, longitude: 114.25, generationtime_ms: 0.03,
  utc_offset_seconds: 28800, timezone: 'Asia/Shanghai', timezone_abbreviation: 'GMT+8', elevation: 34,
  current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°C', weather_code: 'wmo code', is_day: '' },
  current: { time: 1790467200, interval: 900, temperature_2m: 23.6, weather_code: 63, is_day: 0 },
};

test('weather preserves UTC observation time independently of destination timezone', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, 'https://api.open-meteo.com');
    assert.equal(request.searchParams.get('timeformat'), 'unixtime');
    assert.equal(request.searchParams.get('current'), 'temperature_2m,weather_code,is_day');
    assert.equal(request.searchParams.get('latitude'), '30.5928');
    return new Response(JSON.stringify(currentFixture));
  });
  const weather = await fetchWeather(DEFAULT_CITY);
  assert.equal(weather.temperature, 23.6);
  assert.equal(weather.weather, 'rainy');
  assert.equal(weather.description, '中雨');
  assert.equal(weather.isDay, false);
  assert.equal(weather.updatedAt, '2026-09-27T00:00:00.000Z');
  assert.deepEqual(weather.city, DEFAULT_CITY);
});

test('unknown valid weather codes are displayed honestly with a neutral scene', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...currentFixture, current: { ...currentFixture.current, weather_code: 999, is_day: 1 } })));
  const weather = await fetchWeather(DEFAULT_CITY);
  assert.equal(weather.weather, 'cloudy');
  assert.equal(weather.description, '天气暂不详');
  assert.equal(weather.isDay, true);
});

test('weather refuses invalid input coordinates before sending a request', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No request expected'));
  for (const city of [null, { latitude: null, longitude: 0 }, { latitude: 0, longitude: 181 }]) {
    await assert.rejects(fetchWeather(city), RangeError);
  }
});

test('missing current data cannot be mislabeled as zero degrees and a clear sky', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ...currentFixture, current: { ...currentFixture.current, temperature_2m: null } })));
  await assert.rejects(fetchWeather(DEFAULT_CITY), { name: 'WeatherDataError' });
});

test('HTTP failures are surfaced for the UI fallback instead of fabricating live weather', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  await assert.rejects(fetchWeather(DEFAULT_CITY), { name: 'WeatherNetworkError' });
});

test('malformed JSON is surfaced as a data error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Bad gateway</html>'));
  await assert.rejects(searchCities('杭州'), { name: 'WeatherDataError' });
});

test('pre-aborted requests do not access the network', async (t) => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No request expected'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchWeather(DEFAULT_CITY, { signal: controller.signal }), { name: 'AbortError' });
});

test('cancelling an in-flight search aborts its fetch and preserves AbortError', async (t) => {
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const controller = new AbortController();
  const promise = searchCities('武汉', { signal: controller.signal });
  controller.abort();
  await assert.rejects(promise, { name: 'AbortError' });
});

test('slow weather requests time out so refresh cannot remain stuck', { timeout: 1000 }, async (t) => {
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback) => realSetTimeout(callback, 5));
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  await assert.rejects(fetchWeather(DEFAULT_CITY), { name: 'TimeoutError' });
});

test('approximate location requests only city fields and never stores the response IP', async (t) => {
  assert.equal(typeof environment.lookupApproximateCity, 'function');
  t.mock.method(globalThis, 'fetch', async (url) => {
    const request = new URL(url);
    assert.equal(request.origin, 'https://ipwho.is');
    assert.equal(request.searchParams.get('fields'), 'success,city,country,latitude,longitude');
    return new Response(JSON.stringify({ success: true, city: '武汉', country: '中国', latitude: 30.58, longitude: 114.27, ip: '192.0.2.1' }));
  });
  const city = await environment.lookupApproximateCity();
  assert.equal(city.name, '武汉');
  assert.equal(city.source, 'approximate');
  assert.equal(city.latitude, 30.58);
  assert.equal(Object.hasOwn(city, 'ip'), false);
});

test('failed or invalid approximate locations are rejected instead of appearing as valid cities', async (t) => {
  assert.equal(typeof environment.lookupApproximateCity, 'function');
  const payloads = [{ success: false }, { success: true, city: 'Bad city', latitude: null, longitude: 114 }, { success: true, city: {}, latitude: 30, longitude: 114 }];
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payloads.shift())));
  for (let i = 0; i < 3; i++) await assert.rejects(environment.lookupApproximateCity(), { name: 'LocationDataError' });
});
