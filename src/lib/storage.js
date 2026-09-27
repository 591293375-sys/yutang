export function readStore(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const DEFAULT_SETTINGS = Object.freeze({
  season: 'auto', weather: 'auto', day: 'auto', fishCount: 12, fishSize: 1, turtleCount: 0, quality: 'high',
  reducedMotion: false, sound: false, volume: 0.18,
});
const WEATHER_TYPES = ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy'];
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;
const FRESH_WEATHER_MS = 30 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const clampNumber = (value, min, max, fallback) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

/** Persisted values are untrusted: scene keys feed object lookups and volume feeds Web Audio. */
export function loadSettings() {
  const stored = readStore('fusheng-settings', {});
  const source = isRecord(stored) ? stored : {};
  const pick = (key, values) => values.includes(source[key]) ? source[key] : DEFAULT_SETTINGS[key];
  return {
    season: pick('season', ['auto', 'spring', 'summer', 'autumn', 'winter']),
    weather: source.weather === 'foggy' ? 'stormy' : pick('weather', ['auto', ...WEATHER_TYPES]),
    day: pick('day', ['auto', 'day', 'night']),
    fishCount: Math.round(clampNumber(source.fishCount, 3, 24, DEFAULT_SETTINGS.fishCount)),
    fishSize: clampNumber(source.fishSize, .6, 1.6, 1),
    turtleCount: Math.round(clampNumber(source.turtleCount, 0, 4, 0)),
    quality: pick('quality', ['high', 'low']),
    reducedMotion: typeof source.reducedMotion === 'boolean' ? source.reducedMotion : false,
    sound: typeof source.sound === 'boolean' ? source.sound : false,
    volume: clampNumber(source.volume, 0, 0.6, DEFAULT_SETTINGS.volume),
  };
}

export function loadFish() {
  const stored = readStore('fusheng-fish', []);
  if (!Array.isArray(stored)) return [];
  const seen = new Set();
  return stored.filter((fish) => {
    if (!isRecord(fish) || typeof fish.id !== 'string' || !fish.id.trim() || fish.id.length > 120
      || typeof fish.texture !== 'string' || fish.texture.length > 1_500_000
      || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(fish.texture) || seen.has(fish.id)) return false;
    seen.add(fish.id);
    return true;
  }).slice(0, 12).map((fish) => ({
    id: fish.id,
    name: typeof fish.name === 'string' && fish.name.trim() ? fish.name.trim().slice(0, 12) : '无名锦鲤',
    texture: fish.texture,
    size: clampNumber(fish.size, .55, 1.8, 1),
    appearance: fish.appearance === 'skin-v2' ? 'skin-v2' : 'legacy',
  }));
}

export function normalizeCity(value) {
  if (!isRecord(value) || !Number.isFinite(value.latitude) || Math.abs(value.latitude) > 90
    || !Number.isFinite(value.longitude) || Math.abs(value.longitude) > 180
    || typeof value.name !== 'string' || !value.name.trim()) return null;
  const city = {
    id: typeof value.id === 'string' || Number.isFinite(value.id) ? value.id : `${value.latitude},${value.longitude}`,
    name: value.name.trim().slice(0, 80), latitude: value.latitude, longitude: value.longitude,
  };
  if (typeof value.country === 'string') city.country = value.country.slice(0, 80);
  if (value.source === 'manual' || value.source === 'approximate') city.source = value.source;
  return city;
}

export function weatherCacheKey(city) {
  return `fusheng-weather-${city.latitude},${city.longitude}`;
}

function observationAge(weather, now) {
  if (typeof weather?.updatedAt !== 'string') return NaN;
  return Number(now) - Date.parse(weather.updatedAt);
}

/** A cache can describe previous conditions for 24h, but is never itself a live response. */
export function normalizeWeather(value, city, now = Date.now()) {
  const cachedCity = normalizeCity(value?.city);
  const age = observationAge(value, now);
  if (!isRecord(value) || !cachedCity || !city || cachedCity.latitude !== city.latitude || cachedCity.longitude !== city.longitude
    || !Number.isFinite(value.temperature) || value.temperature < -100 || value.temperature > 70
    || !WEATHER_TYPES.includes(value.weather) || typeof value.isDay !== 'boolean'
    || typeof value.description !== 'string' || !value.description.trim()
    || !Number.isFinite(age) || age < -CLOCK_TOLERANCE_MS || age > MAX_CACHE_AGE_MS) return null;
  return {
    temperature: value.temperature, weather: value.weather,
    description: value.description.trim().slice(0, 80), isDay: value.isDay,
    updatedAt: new Date(value.updatedAt).toISOString(), city: { ...city },
  };
}

export function readCachedWeather(city, now = Date.now()) {
  return normalizeWeather(readStore(weatherCacheKey(city), null), city, now);
}

/** Used in addition to response status so a sleeping window cannot retain a stale live badge. */
export function isWeatherFresh(weather, now = Date.now()) {
  const age = observationAge(weather, now);
  return Number.isFinite(age) && age >= -CLOCK_TOLERANCE_MS && age <= FRESH_WEATHER_MS;
}
