/** No API key is required for Open-Meteo's public, non-commercial API.
 * https://open-meteo.com/en/docs
 * https://open-meteo.com/en/docs/geocoding-api
 */
export const DEFAULT_CITY = Object.freeze({
  id: 'wuhan', name: '武汉', latitude: 30.5928, longitude: 114.3055,
});

const REQUEST_TIMEOUT_MS = 10_000;
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const SOLAR_TERMS = [
  '春分', '清明', '谷雨', '立夏', '小满', '芒种',
  '夏至', '小暑', '大暑', '立秋', '处暑', '白露',
  '秋分', '寒露', '霜降', '立冬', '小雪', '大雪',
  '冬至', '小寒', '大寒', '立春', '雨水', '惊蛰',
];
const CITY_ALIASES = {
  武汉: 'Wuhan', 北京: 'Beijing', 上海: 'Shanghai', 广州: 'Guangzhou', 深圳: 'Shenzhen',
  杭州: 'Hangzhou', 苏州: 'Suzhou', 南京: 'Nanjing', 成都: 'Chengdu', 重庆: 'Chongqing',
  天津: 'Tianjin', 西安: "Xi'an", 长沙: 'Changsha', 郑州: 'Zhengzhou', 青岛: 'Qingdao',
  厦门: 'Xiamen', 福州: 'Fuzhou', 昆明: 'Kunming', 合肥: 'Hefei', 济南: 'Jinan',
  沈阳: 'Shenyang', 大连: 'Dalian', 哈尔滨: 'Harbin', 长春: 'Changchun', 石家庄: 'Shijiazhuang',
  太原: 'Taiyuan', 南昌: 'Nanchang', 南宁: 'Nanning', 贵阳: 'Guiyang', 海口: 'Haikou',
  三亚: 'Sanya', 兰州: 'Lanzhou', 银川: 'Yinchuan', 西宁: 'Xining', 拉萨: 'Lhasa',
  乌鲁木齐: 'Urumqi', 呼和浩特: 'Hohhot', 宁波: 'Ningbo', 无锡: 'Wuxi', 珠海: 'Zhuhai',
};
const WEATHER = new Map([
  [0, ['sunny', '晴']], [1, ['sunny', '晴间多云']], [2, ['cloudy', '多云']], [3, ['cloudy', '阴']],
  [45, ['foggy', '雾']], [48, ['foggy', '雾凇']],
  [51, ['rainy', '小毛毛雨']], [53, ['rainy', '毛毛雨']], [55, ['rainy', '浓毛毛雨']],
  [56, ['rainy', '轻冻毛毛雨']], [57, ['rainy', '冻毛毛雨']],
  [61, ['rainy', '小雨']], [63, ['rainy', '中雨']], [65, ['rainy', '大雨']],
  [66, ['rainy', '轻冻雨']], [67, ['rainy', '冻雨']],
  [71, ['snowy', '小雪']], [73, ['snowy', '中雪']], [75, ['snowy', '大雪']], [77, ['snowy', '米雪']],
  [80, ['rainy', '小阵雨']], [81, ['rainy', '阵雨']], [82, ['rainy', '强阵雨']],
  [85, ['snowy', '小阵雪']], [86, ['snowy', '强阵雪']],
  [95, ['stormy', '雷雨']], [96, ['stormy', '雷雨伴冰雹']], [97, ['stormy', '强雷雨']], [99, ['stormy', '强雷雨伴冰雹']],
]);

function requireDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new RangeError('日期无效');
  }
  return date;
}

/** Local-calendar meteorological seasons; equatorial locations use the northern convention. */
export function getSeason(date = new Date(), latitude = 30) {
  requireDate(date);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new RangeError('纬度无效');
  const seasonIndex = Math.floor(((date.getMonth() + 1) % 12) / 3);
  return SEASONS[(seasonIndex + (latitude < 0 ? 2 : 0)) % 4];
}

/** Offline ambience uses the device clock. Live daylight should use fetchWeather().isDay. */
export function getDayPhase(date = new Date()) {
  const hour = requireDate(date).getHours();
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

/**
 * Returns the current solar term, not a lunar festival or the next term.
 * Approximate apparent solar longitude, using the Meeus/NOAA equations:
 * https://gml.noaa.gov/grad/solcalc/calcdetails.html
 * Supported display range: 1900–2100. This is recreational calendar ambience;
 * transition instants are approximate, not an authoritative almanac. Uses the
 * UTC instant (not a fixed table of month/day boundaries or local midnight).
 */
export function getSolarTerm(date = new Date()) {
  requireDate(date);
  if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) return '';
  const centuries = (date.getTime() / 86_400_000 + 2440587.5 - 2451545) / 36525;
  const normalize = (angle) => ((angle % 360) + 360) % 360;
  const sin = (angle) => Math.sin(angle * Math.PI / 180);
  const meanLongitude = normalize(280.46646 + centuries * (36000.76983 + centuries * 0.0003032));
  const anomaly = 357.52911 + centuries * (35999.05029 - 0.0001537 * centuries);
  const center = sin(anomaly) * (1.914602 - centuries * (0.004817 + 0.000014 * centuries))
    + sin(2 * anomaly) * (0.019993 - 0.000101 * centuries) + sin(3 * anomaly) * 0.000289;
  const longitude = normalize(meanLongitude + center - 0.00569 - 0.00478 * sin(125.04 - 1934.136 * centuries));
  return SOLAR_TERMS[Math.floor(longitude / 15)];
}

/** Unknown codes deliberately render a neutral cloudy scene, never fabricated sunshine. */
export function mapWeatherCode(code) {
  return WEATHER.get(code)?.[0] ?? 'cloudy';
}

function serviceError(name, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.name = name;
  return error;
}

function abortError() {
  return new DOMException('请求已取消', 'AbortError');
}

async function requestJson(url, signal) {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  const abort = () => controller.abort(abortError());
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(serviceError('TimeoutError', '天气服务连接超时，请稍后重试')), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw serviceError('WeatherNetworkError', `天气服务暂时不可用（${response.status}）`);
    }
    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw serviceError('WeatherDataError', '天气服务返回的数据无法读取', error);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) {
      throw serviceError('WeatherDataError', '天气服务返回的数据不完整');
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.name === 'WeatherNetworkError' || error.name === 'WeatherDataError') throw error;
    throw serviceError('WeatherNetworkError', '暂时无法连接天气服务，请检查网络后重试', error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

function hasCoordinates(city) {
  return city && Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90
    && Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180;
}

/** Search all countries; common Chinese aliases improve GeoNames matching. */
export async function searchCities(query, { signal } = {}) {
  if (typeof query !== 'string') throw new TypeError('请输入城市名称');
  const input = query.trim();
  if (input.length < 2) return [];
  if (input.length > 80) throw new RangeError('城市名称过长');
  const aliasKey = input.replace(/市$/, '');
  const alias = Object.hasOwn(CITY_ALIASES, aliasKey) ? CITY_ALIASES[aliasKey] : undefined;
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: alias ?? input, count: '8', language: 'zh', format: 'json' }).toString();
  if (alias) url.searchParams.set('countryCode', 'CN');
  const data = await requestJson(url, signal);
  if (data.results === undefined) return [];
  if (!Array.isArray(data.results)) throw serviceError('WeatherDataError', '城市搜索返回的数据不完整');
  const seen = new Set();
  return data.results.filter((city) => {
    if (!hasCoordinates(city) || typeof city.name !== 'string' || !city.name.trim()) return false;
    const key = `${city.latitude},${city.longitude}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((city) => ({
    id: city.id ?? `${city.latitude},${city.longitude}`,
    name: city.name,
    country: typeof city.country === 'string' ? city.country : '',
    latitude: city.latitude,
    longitude: city.longitude,
  }));
}

/**
 * Current conditions are Open-Meteo model data. Failure is thrown so the UI can
 * retain cached data or explicitly label its offline scene. No sample weather
 * is ever passed off as a successful live response.
 */
export async function fetchWeather(city, { signal } = {}) {
  if (!hasCoordinates(city)) throw new RangeError('城市坐标无效');
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(city.latitude), longitude: String(city.longitude),
    current: 'temperature_2m,weather_code,is_day', temperature_unit: 'celsius',
    timeformat: 'unixtime', timezone: 'auto', forecast_days: '1',
  }).toString();
  const { current } = await requestJson(url, signal);
  if (!current || !Number.isFinite(current.temperature_2m) || !Number.isInteger(current.weather_code)
    || (current.is_day !== 0 && current.is_day !== 1) || !Number.isFinite(current.time)
    || !Number.isFinite(new Date(current.time * 1000).getTime())) {
    throw serviceError('WeatherDataError', '当前天气数据不完整，请稍后重试');
  }
  return {
    temperature: current.temperature_2m,
    weather: mapWeatherCode(current.weather_code),
    description: WEATHER.get(current.weather_code)?.[1] ?? '天气暂不详',
    isDay: current.is_day === 1,
    updatedAt: new Date(current.time * 1000).toISOString(),
    city: { ...city },
  };
}

/**
 * City-level IP lookup, used only when no saved city exists or on explicit click.
 * The selected response fields omit the IP address and network metadata.
 * Provider contract: https://ipwhois.io/documentation
 * Approximate network location can differ when a VPN or mobile gateway is used.
 */
export async function lookupApproximateCity({ signal } = {}) {
  const url = new URL('https://ipwho.is/');
  url.search = new URLSearchParams({ fields: 'success,city,country,latitude,longitude', lang: 'zh-CN' }).toString();
  const data = await requestJson(url, signal);
  if (data.success !== true || !hasCoordinates(data) || typeof data.city !== 'string' || !data.city.trim()) {
    throw serviceError('LocationDataError', '暂时无法识别所在城市，可手动选择');
  }
  return {
    id: `approximate-${data.latitude},${data.longitude}`,
    name: data.city.trim().slice(0, 80),
    country: typeof data.country === 'string' ? data.country.slice(0, 80) : '',
    latitude: data.latitude, longitude: data.longitude, source: 'approximate',
  };
}
