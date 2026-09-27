import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_CITY, fetchWeather, lookupApproximateCity, getSeason, getDayPhase, getSolarTerm } from '../lib/environment.js';
import { readStore, writeStore, normalizeCity, normalizeWeather, readCachedWeather, weatherCacheKey, isWeatherFresh } from '../lib/storage.js';

export function useEnvironment(settings) {
  const [savedCity] = useState(() => normalizeCity(readStore('fusheng-city', null)));
  const [city, setCityState] = useState(() => savedCity ?? { ...DEFAULT_CITY });
  const [locationStatus, setLocationStatus] = useState(() => savedCity ? (savedCity.source === 'approximate' ? 'approximate' : 'saved') : 'locating');
  const [now, setNow] = useState(() => new Date());
  const [snapshot, setSnapshot] = useState(() => {
    const data = readCachedWeather(city);
    return { key: weatherCacheKey(city), data, status: data ? 'cached' : 'loading' };
  });
  const request = useRef(null);
  const locationRequest = useRef(null);
  const activeCity = useRef(city);
  const selectionVersion = useRef(0);

  // Updating the ref and aborting synchronously closes the render/effect race:
  // a response for the previous city can never overwrite a new user selection.
  const setCity = useCallback((value) => {
    const next = normalizeCity(typeof value === 'function' ? value(activeCity.current) : value);
    if (!next) return;
    next.source = next.source === 'approximate' ? 'approximate' : 'manual';
    selectionVersion.current += 1;
    request.current?.abort();
    locationRequest.current?.abort();
    activeCity.current = next;
    const cached = readCachedWeather(next);
    setSnapshot({ key: weatherCacheKey(next), data: cached, status: 'loading' });
    setLocationStatus(next.source);
    setCityState(next);
    writeStore('fusheng-city', next);
  }, []);

  const refresh = useCallback(async () => {
    const requestedCity = activeCity.current;
    const key = weatherCacheKey(requestedCity);
    const version = selectionVersion.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const isCurrent = () => !controller.signal.aborted && request.current === controller && selectionVersion.current === version;
    setSnapshot((previous) => ({ key, data: previous.key === key ? previous.data : readCachedWeather(requestedCity), status: 'loading' }));
    try {
      const result = await fetchWeather(requestedCity, { signal: controller.signal });
      if (!isCurrent()) return;
      const data = normalizeWeather(result, requestedCity);
      if (!data) throw new Error('Weather observation is invalid or too old');
      setNow(new Date());
      setSnapshot({ key, data, status: isWeatherFresh(data) ? 'live' : 'cached' });
      writeStore(key, data);
    } catch {
      if (!isCurrent()) return;
      setNow(new Date());
      setSnapshot((previous) => {
        // Keep a valid in-memory observation even if localStorage was full.
        const data = (previous.key === key ? normalizeWeather(previous.data, requestedCity) : null)
          ?? readCachedWeather(requestedCity);
        return { key, data, status: data ? 'cached' : 'offline' };
      });
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    return () => { clearInterval(timer); request.current?.abort(); };
  }, [city, refresh]);

  useEffect(() => {
    // A saved choice always wins. Failed automatic lookup leaves an explicitly
    // labelled fallback and does not persist Wuhan as though the user chose it.
    if (savedCity || selectionVersion.current > 0) return undefined;
    const controller = new AbortController();
    locationRequest.current = controller;
    const version = selectionVersion.current;
    lookupApproximateCity({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted && selectionVersion.current === version) setCity(result);
    }).catch(() => {
      if (!controller.signal.aborted && selectionVersion.current === version) setLocationStatus('fallback');
    });
    return () => controller.abort();
  }, [savedCity, setCity]);

  useEffect(() => {
    const updateClock = () => setNow(new Date());
    const timer = setInterval(updateClock, 30_000);
    window.addEventListener('focus', updateClock);
    document.addEventListener('visibilitychange', updateClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', updateClock);
      document.removeEventListener('visibilitychange', updateClock);
    };
  }, []);

  const matchesCity = snapshot.key === weatherCacheKey(city);
  const data = matchesCity ? normalizeWeather(snapshot.data, city, now) : null;
  const fresh = isWeatherFresh(data, now);
  const status = !matchesCity ? 'loading' : snapshot.status === 'loading' ? 'loading'
    : !data ? 'offline' : snapshot.status === 'live' && fresh ? 'live' : 'cached';
  const phase = getDayPhase(now);
  // Cached isDay describes the observation time, not the current clock.
  const night = settings.day === 'auto' ? (status === 'live' && fresh ? !data.isDay : phase === 'night') : settings.day === 'night';
  return {
    city, setCity, data, status, locationStatus, refresh, now,
    season: settings.season === 'auto' ? getSeason(now, city.latitude) : settings.season,
    weather: settings.weather === 'auto' ? (data?.weather || 'sunny') : settings.weather,
    night, solarTerm: getSolarTerm(now),
  };
}
