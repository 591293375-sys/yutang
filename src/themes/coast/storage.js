import { SPECIES_BY_ID } from './catalog.js';
import { normalizeManualTide } from './tide.js';
export const COAST_STORAGE_KEY = 'mofish-coast-v1';
export const COAST_LIMITS = Object.freeze({ alive: 52, shells: 24, bucket: 12 });
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const num = (value, min, max, fallback = min) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const count = value => Math.floor(num(value, 0, 1e9));
const point = value => record(value) && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: num(value.x, 0, 1600), y: num(value.y, 0, 900) } : null;
const speciesFor = id => Object.hasOwn(SPECIES_BY_ID, id) ? SPECIES_BY_ID[id] : null;

/** Validation also finishes presentation-only states before writing to disk. */
export function normalizeCoast(value) {
  if (!record(value) || value.version !== 1 || !Number.isFinite(value.epochMs) || Math.abs(value.epochMs) > 8.64e15 || !Array.isArray(value.entities)) return null;
  const seen = new Set(), entities = []; let alive = 0, shells = 0, bucket = 0;
  for (const item of value.entities.slice(0, 200)) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 100 || seen.has(item.id)) continue;
    const species = speciesFor(item.species);
    if (!species || ['collected', 'departed'].includes(item.state)) continue;
    let state = ['scene', 'bucket', 'rescuing', 'releasing'].includes(item.state) ? item.state : 'scene';
    const shell = !species.bucketable;
    if (state === 'bucket' && (shell || bucket >= COAST_LIMITS.bucket)) continue;
    if (shell ? shells >= COAST_LIMITS.shells : alive >= COAST_LIMITS.alive) continue;
    const transient = state === 'rescuing' || state === 'releasing';
    let concealment = state === 'scene' && ((item.concealment === 'sand' && ['crab','shell'].includes(species.kind)) || (item.concealment === 'crevice' && species.kind === 'fish')) ? item.concealment : null;
    const revealNeeded = concealment === 'crevice' ? 1 : concealment === 'sand' ? (item.revealNeeded === 3 ? 3 : 2) : Math.floor(num(item.revealNeeded, 0, 3));
    const revealSteps = Math.floor(num(item.revealSteps, 0, revealNeeded));
    if (concealment && revealSteps >= revealNeeded) concealment = null;
    const location = transient && record(item.target) ? item.target : item;
    if (transient) state = 'scene';
    entities.push({ id: item.id, species: item.species, x: num(location.x, 0, 1600, 800), y: num(location.y, 0, 900, 450),
      heading: Number.isFinite(item.heading) ? Math.atan2(Math.sin(item.heading), Math.cos(item.heading)) : 0, phase: num(item.phase, 0, Math.PI * 2), state,
      stranded: state === 'scene' && !transient && !!item.stranded, submerged: !!item.submerged,
      lastStrandedCycle: Number.isInteger(item.lastStrandedCycle) ? item.lastStrandedCycle : -1,
      migrant: !!item.migrant, admittedCycle: Number.isInteger(item.admittedCycle) ? item.admittedCycle : -1, entry: point(item.entry), forageHome: point(item.forageHome), returnEntry: point(item.returnEntry),
      migration: ['inward','outward','retreat','linger','forage','resident','recover','emerging'].includes(item.migration) ? item.migration : null,
      moveTarget: transient ? null : point(item.moveTarget), entryProgress: num(item.entryProgress, 0, 1, 1),
      lingerCycle: Number.isInteger(item.lingerCycle) ? item.lingerCycle : -1,
      concealment, revealSteps, revealNeeded, concealmentInitialized: item.concealmentInitialized === true || (item.concealmentInitialized !== false && (typeof item.concealment === 'string' || Number.isInteger(item.revealNeeded))),
      concealmentAnchor: point(item.concealmentAnchor), creviceExit: point(item.creviceExit), emergeProgress: concealment ? 0 : 1 });
    seen.add(item.id); if (shell) shells++; else alive++; if (state === 'bucket') bucket++;
  }
  const catalog = {};
  if (record(value.catalog)) for (const [id, item] of Object.entries(value.catalog)) {
    if (!speciesFor(id) || !record(item)) continue;
    catalog[id] = { firstDiscovered: Number.isFinite(item.firstDiscovered) && item.firstDiscovered >= 0 ? item.firstDiscovered : null,
      observed: count(item.observed), caught: count(item.caught), collected: count(item.collected), rescued: count(item.rescued) };
  }
  // Counter recovery prevents a malformed low counter from reusing a living entity's ID.
  const maxId = entities.reduce((max, item) => Math.max(max, Number(item.id.match(/-(\d+)$/)?.[1]) || 0), 0);
  return { version: 1, hadValidState: true, epochMs: value.epochMs, manualTide: normalizeManualTide(value.manualTide, value.epochMs), tideDirection: ['rising','falling'].includes(value.tideDirection) ? value.tideDirection : null,
    nextId: Math.max(1, count(value.nextId), maxId + 1), entities, catalog, shells: count(value.shells), rescues: count(value.rescues),
    fallingCycle: Number.isInteger(value.fallingCycle) ? value.fallingCycle : -1,
    strandedThisCycle: Math.floor(num(value.strandedThisCycle, 0, 3)),
    admissionCycle: Number.isInteger(value.admissionCycle) ? value.admissionCycle : -1,
    admissionStage: Math.floor(num(value.admissionStage, 0, 2)),
    shorePreparedCycle: Number.isInteger(value.shorePreparedCycle) ? value.shorePreparedCycle : -1,
    retreatCycle: Number.isInteger(value.retreatCycle) ? value.retreatCycle : -1 };
}

export function loadCoast(storage) {
  try { const raw = (storage ?? globalThis.localStorage)?.getItem(COAST_STORAGE_KEY); return raw && raw.length < 2e6 ? normalizeCoast(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveCoast(value, storage) {
  try { const normalized = normalizeCoast(value); if (!normalized) return false; (storage ?? globalThis.localStorage)?.setItem(COAST_STORAGE_KEY, JSON.stringify(normalized)); return !!(storage ?? globalThis.localStorage); } catch { return false; }
}
