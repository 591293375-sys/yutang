export const TIDE_PHASES = Object.freeze(['rising', 'high', 'falling', 'low']);
export const TIDE_DURATIONS = Object.freeze({ rising: 600, high: 300, falling: 600, low: 300 });
export const MANUAL_TIDE = Object.freeze({ fullDurationMs: 30000, minDurationMs: 1500 });
export const TIDE_CYCLE_SECONDS = TIDE_PHASES.reduce((sum, phase) => sum + TIDE_DURATIONS[phase], 0);
const starts = Object.fromEntries(TIDE_PHASES.map((phase, i) => [phase, TIDE_PHASES.slice(0, i).reduce((sum, previous) => sum + TIDE_DURATIONS[previous], 0)]));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const validTideArrivalKey = value => typeof value === 'string' && value.length <= 100 && /^(?:natural:-?\d+(?:\.\d+)?:\d+|manual:-?\d+(?:\.\d+)?)$/.test(value);

/** An epoch is the start of a rising tide. No rewards or mutable state live in the clock. */
export function tideAt(epochMs, nowMs = Date.now()) {
  const elapsed = Math.max(0, (finite(nowMs, 0) - finite(epochMs, finite(nowMs, 0))) / 1000);
  const cycle = Math.floor(elapsed / TIDE_CYCLE_SECONDS);
  const position = elapsed - cycle * TIDE_CYCLE_SECONDS;
  const phase = TIDE_PHASES.find(phase => position < starts[phase] + TIDE_DURATIONS[phase]) || 'low';
  const phaseElapsed = position - starts[phase];
  const duration = TIDE_DURATIONS[phase];
  const progress = clamp(phaseElapsed / duration, 0, 1);
  const level = phase === 'rising' ? (1 - Math.cos(Math.PI * progress)) / 2
    : phase === 'falling' ? (1 + Math.cos(Math.PI * progress)) / 2 : phase === 'high' ? 1 : 0;
  return { phase, level, remainingSeconds: Math.ceil(duration - phaseElapsed), cycle, progress, position, nextPhase: TIDE_PHASES[(TIDE_PHASES.indexOf(phase) + 1) % 4] };
}

/** Optional production transition; old saves continue to use only their epoch. */
export function normalizeManualTide(value, epochMs) {
  if (!value || !['rising','falling'].includes(value.direction) || !Number.isFinite(value.startMs) || Math.abs(value.startMs) > 8.64e15
    || !Number.isFinite(value.fromLevel) || value.fromLevel < 0 || value.fromLevel > 1
    || !Number.isFinite(value.durationMs) || value.durationMs < MANUAL_TIDE.minDurationMs || value.durationMs > MANUAL_TIDE.fullDurationMs
    || !Number.isSafeInteger(value.cycle) || value.cycle < 0) return null;
  const distance = Math.abs((value.direction === 'rising' ? 1 : 0) - value.fromLevel);
  const expectedDuration = Math.max(MANUAL_TIDE.minDurationMs, MANUAL_TIDE.fullDurationMs * distance);
  if (distance <= 1e-12 || Math.abs(expectedDuration - value.durationMs) > 1e-6) return null;
  const holdStart = value.direction === 'rising' ? starts.high : starts.low;
  const expectedEpoch = value.startMs + value.durationMs - (value.cycle * TIDE_CYCLE_SECONDS + holdStart) * 1000;
  if (Number.isFinite(epochMs) && Math.abs(expectedEpoch - epochMs) > 1) return null;
  return { direction: value.direction, startMs: value.startMs, fromLevel: value.fromLevel, durationMs: value.durationMs, cycle: value.cycle,
    ...(value.direction === 'rising' ? { arrivalKey: validTideArrivalKey(value.arrivalKey) ? value.arrivalKey : `manual:${value.startMs}` } : {}) };
}

/** Production transitions use real wall time; debug controls only change the view. */
export class TideClock {
  constructor(epochMs = Date.now(), nowMs = Date.now(), manualTide = null) {
    this.epochMs = finite(epochMs, nowMs);
    this.manualTide = normalizeManualTide(manualTide, this.epochMs);
    this.anchorRealMs = finite(nowMs, Date.now());
    this.anchorVirtualMs = this.anchorRealMs;
    this.paused = false; this.speed = 1; this.debugIgnoreManual = false;
  }
  virtualNow(nowMs = Date.now()) {
    return this.anchorVirtualMs + (this.paused ? 0 : (finite(nowMs, this.anchorRealMs) - this.anchorRealMs) * this.speed);
  }
  isDebug(nowMs = Date.now()) {
    return this.debugIgnoreManual || this.speed !== 1 || this.paused || Math.abs(this.virtualNow(nowMs) - nowMs) > 1;
  }
  productionSnapshot(nowMs = Date.now()) {
    const m = this.manualTide, now = finite(nowMs, this.anchorRealMs);
    if (!m || now >= m.startMs + m.durationMs) return { ...tideAt(this.epochMs, now), manual: false };
    const progress = clamp((now - m.startMs) / m.durationMs, 0, 1), eased = Math.sin(progress * Math.PI / 2);
    const level = m.fromLevel + ((m.direction === 'rising' ? 1 : 0) - m.fromLevel) * eased;
    const phaseProgress = Math.acos(m.direction === 'rising' ? 1 - 2 * level : 2 * level - 1) / Math.PI;
    return { phase: m.direction, level, remainingSeconds: Math.ceil(m.durationMs * (1 - progress) / 1000), cycle: m.cycle,
      progress: phaseProgress, position: starts[m.direction] + phaseProgress * TIDE_DURATIONS[m.direction],
      nextPhase: m.direction === 'rising' ? 'high' : 'low', manual: true };
  }
  /** Persistent identity for the real rising tide, never a debug phase edge. */
  bottleArrival(nowMs = Date.now()) {
    const tide = this.productionSnapshot(nowMs);
    const key = tide.phase === 'rising' ? tide.manual
      ? this.manualTide.arrivalKey || `manual:${this.manualTide.startMs}`
      : `natural:${this.epochMs}:${tide.cycle}` : null;
    return { phase: tide.phase, key, debug: this.isDebug(nowMs) };
  }
  readVirtual(nowMs) {
    return this.debugIgnoreManual ? { ...tideAt(this.epochMs, nowMs), manual: false } : this.productionSnapshot(nowMs);
  }
  snapshot(nowMs = Date.now()) {
    return { ...this.readVirtual(this.virtualNow(nowMs)), paused: this.paused, speed: this.speed };
  }
  /** Look ahead by milliseconds on the same tide timeline used for rendering. */
  predict(nowMs, advanceMs) { return this.readVirtual(this.virtualNow(nowMs) + Math.max(0, finite(advanceMs, 0))); }
  serializeManual(nowMs = Date.now()) {
    return this.manualTide && this.productionSnapshot(nowMs).manual ? { ...this.manualTide } : null;
  }
  setDirection(direction, nowMs = Date.now()) {
    if (!['rising','falling'].includes(direction)) return { changed: false, tide: this.snapshot(nowMs) };
    const current = this.snapshot(nowMs), debug = this.isDebug(nowMs), target = direction === 'rising' ? 1 : 0;
    const arrival = this.bottleArrival(nowMs);
    if (!debug && ((current.manual && current.phase === direction) || (current.level === target && current.phase === (target ? 'high' : 'low')))) {
      return { changed: false, tide: current };
    }
    const cycle = this.productionSnapshot(nowMs).cycle, distance = Math.abs(target - current.level);
    const durationMs = Math.max(MANUAL_TIDE.minDurationMs, MANUAL_TIDE.fullDurationMs * distance);
    this.manualTide = distance > 1e-12 ? { direction, startMs: nowMs, fromLevel: current.level, durationMs, cycle,
      ...(direction === 'rising' ? { arrivalKey: arrival.phase === 'rising' ? arrival.key : `manual:${nowMs}` } : {}) } : null;
    const endMs = nowMs + (this.manualTide ? durationMs : 0), holdStart = target ? starts.high : starts.low;
    this.epochMs = endMs - (cycle * TIDE_CYCLE_SECONDS + holdStart) * 1000;
    this.anchorRealMs = this.anchorVirtualMs = nowMs; this.paused = false; this.speed = 1; this.debugIgnoreManual = false;
    return { changed: true, tide: this.snapshot(nowMs) };
  }
  anchor(nowMs) { this.anchorVirtualMs = this.virtualNow(nowMs); this.anchorRealMs = nowMs; }
  setPaused(value, nowMs = Date.now()) { this.anchor(nowMs); this.paused = !!value; return this.snapshot(nowMs); }
  setSpeed(value, nowMs = Date.now()) { this.anchor(nowMs); this.speed = value === 60 ? 60 : 1; return this.snapshot(nowMs); }
  setLevel(value, nowMs = Date.now()) {
    const level = clamp(finite(value, 0), 0, 1), cycle = this.snapshot(nowMs).cycle;
    this.anchorRealMs = nowMs;
    this.anchorVirtualMs = this.epochMs + (cycle * TIDE_CYCLE_SECONDS + Math.acos(1 - level * 2) / Math.PI * TIDE_DURATIONS.rising) * 1000;
    this.paused = true; this.debugIgnoreManual = true;
    return this.snapshot(nowMs);
  }
  jump(phase, nowMs = Date.now()) {
    if (!TIDE_PHASES.includes(phase)) return this.snapshot(nowMs);
    const cycle = this.snapshot(nowMs).cycle;
    this.anchorRealMs = nowMs;
    this.anchorVirtualMs = this.epochMs + (cycle * TIDE_CYCLE_SECONDS + starts[phase]) * 1000;
    this.debugIgnoreManual = true;
    return this.snapshot(nowMs);
  }
  reset(nowMs = Date.now()) {
    this.anchorRealMs = this.anchorVirtualMs = nowMs;
    this.paused = false; this.speed = 1; this.debugIgnoreManual = false;
    return this.snapshot(nowMs);
  }
}
