import { getSpecies } from './catalog.js';
import { habitatAt, isHabitatValid, WORLD_WIDTH, WORLD_HEIGHT } from './geometry.js';

const candidateCache = new Map();
export const beachResident = entity => ['shore', 'beach'].includes(getSpecies(entity.species)?.habitat);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function occupiedShore(entities, exclude) {
  return entities.filter(e => e !== exclude && beachResident(e) && ['scene', 'releasing'].includes(e.state))
    .map(e => e.target || e.shoreWaypoints?.at(-1) || e.moveTarget || e);
}

// Search the entire legal beach, not just the first successful shoreline sample.
// A small fixed jitter avoids a visible grid while retaining a bounded search.
function candidates(species, level) {
  const key = species.habitat + ':' + Math.round(level * 500);
  if (candidateCache.has(key)) return candidateCache.get(key);
  const points = [];
  for (let row = 0, y = 24; y < WORLD_HEIGHT - 20; row++, y += 28) {
    for (let col = 0, x = 24; x < WORLD_WIDTH - 20; col++, x += 28) {
      const point = { x: x + Math.sin(row * 19 + col * 7) * 7, y: y + Math.cos(row * 11 + col * 17) * 7 };
      // Give shore walkers room to react before the advancing tide reaches
      // them. A valid shallow-water point can be a dead end behind a boulder.
      const habitat = species.habitat === 'shore' && level < .96 ? habitatAt(point.x, point.y, level) : null;
      if (habitat && (habitat.water || habitat.distance < 30 || habitat.distance > 155)) continue;
      if (isHabitatValid(species, point.x, point.y, level)) points.push(point);
    }
  }
  if (candidateCache.size >= 12) candidateCache.delete(candidateCache.keys().next().value);
  candidateCache.set(key, points); return points;
}

export function shoreCrowding(point, occupied, radius = 100) {
  return occupied.reduce((sum, other) => sum + Math.max(0, 1 - distance(point, other) / radius) ** 2, 0);
}

export function findSpacedHabitat(value, level, entities, random, exclude = null) {
  const species = getSpecies(value);
  if (!species || species.aquatic) return null;
  const pool = species.habitat === 'pool', gap = pool ? 40 : 68;
  const occupied = pool ? entities.filter(e => e !== exclude && getSpecies(e.species)?.habitat === 'pool' && ['scene', 'releasing'].includes(e.state)).map(e => e.target || e)
    : occupiedShore(entities, exclude);
  const options = candidates(species, level), start = Math.floor(random() * options.length);
  let best = null, score = -Infinity;
  for (let i = 0; i < options.length; i++) {
    const p = options[(start + i) % options.length], clearance = Math.min(230, ...occupied.map(other => distance(p, other)));
    if (clearance < gap || !isHabitatValid(species, p.x, p.y, level)) continue;
    const current = clearance - shoreCrowding(p, occupied, 190) * 42;
    if (current > score) { best = p; score = current; }
  }
  // A small high-water beach may have no room. New arrivals can wait, and a
  // release stays in the bucket; never sacrifice habitat or overlap bodies.
  return best && { ...best };
}
