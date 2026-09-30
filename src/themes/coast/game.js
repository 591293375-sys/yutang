import { SPECIES, SPECIES_BY_ID } from './catalog.js';
import { habitatAt, findHabitat, isHabitatValid, pathIsHabitatValid, shoreLine, ROCKS } from './geometry.js';
import { TideClock } from './tide.js';
import { normalizeCoast, COAST_LIMITS } from './storage.js';
import { steerMotion, crabCruiseSpeed, shoreEscapeRoute, warmShoreNavigation } from './motion.js';
import { beachResident, occupiedShore, findSpacedHabitat, shoreCrowding } from './spacing.js';
const TAU = Math.PI * 2;
export const FISH_CATCH_RULES = Object.freeze({ attempts: 3, intervalMs: 500, resetMs: 15000, escapeMs: 1200, speed: 112, acceleration: 520, braking: 185, turnRate: 6.8 });
const speciesFor = id => Object.hasOwn(SPECIES_BY_ID, id) ? SPECIES_BY_ID[id] : null;
const active = entity => !['collected', 'departed'].includes(entity.state);
const inScene = entity => ['scene', 'rescuing', 'releasing'].includes(entity.state);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const success = (message, extra = {}) => ({ ok: true, message, ...extra });
const failure = message => ({ ok: false, message });
const elapsedAdmissionStages = tide => tide.phase === 'rising' ? Number(tide.level >= .32) + Number(tide.level >= .68) : 2;
const cycleAtOrBefore = (cycle, current) => Number.isInteger(cycle) && cycle <= current ? cycle : -1;
const concealmentRank = entity => { let hash = 2166136261; for (const char of entity.id + ':' + entity.species) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0; };

/** Game rules are synchronous; transitions only illustrate already committed operations. */
export class CoastGame {
  constructor(saved = null, nowMs = Date.now(), random = Math.random) {
    const state = normalizeCoast(saved);
    this.random = () => Math.max(0, Math.min(.999999, Number(random()) || 0));
    this.clock = new TideClock(state?.epochMs ?? nowMs, nowMs, state?.manualTide);
    this.tide = this.clock.snapshot(nowMs); this.userTideDirection = state?.tideDirection ?? null;
    this.nowMs = nowMs; this.elapsed = 0; this.nextId = state?.nextId ?? 1;
    this.entities = state?.entities ?? []; this.catalog = state?.catalog ?? {};
    this.shells = state?.shells ?? 0; this.rescues = state?.rescues ?? 0;
    this.transitions = []; this.lastCycle = this.tide.cycle;
    const elapsedStages = elapsedAdmissionStages(this.tide);
    this.admissionCycle = this.tide.cycle;
    this.admissionStage = state && state.admissionCycle === this.tide.cycle ? Math.max(state.admissionStage || 0, elapsedStages) : elapsedStages;
    this.shorePreparedCycle = cycleAtOrBefore(state?.shorePreparedCycle, this.tide.cycle); this.retreatCycle = cycleAtOrBefore(state?.retreatCycle, this.tide.cycle);
    this.shallowCache = new Map(); this.pointerState = null;
    this.fallingCycle = cycleAtOrBefore(state?.fallingCycle, this.tide.cycle); this.strandedThisCycle = this.fallingCycle === this.tide.cycle ? state?.strandedThisCycle ?? 0 : 0;
    this.hadValidState = !!state;
    if (!state) this.seed();
    else this.removeOfflineVisitors();
    // Offline return resolves against the current tide once, without replay or awards.
    this.reconcile(true); this.disperseCrowdedShore(); this.initializeConcealments(); this.concealmentReady = true;
    this.realLifecycle = this.lifecycle(); this.wasDebug = false; this.hasUpdated = false;
    this.populationVisits = new Set(['real:' + this.tide.cycle]);
  }
  lifecycle() {
    return { admissionCycle: this.admissionCycle, admissionStage: this.admissionStage, shorePreparedCycle: this.shorePreparedCycle,
      retreatCycle: this.retreatCycle, fallingCycle: this.fallingCycle, strandedThisCycle: this.strandedThisCycle };
  }
  isDebugTime(nowMs = this.nowMs) {
    return this.clock.isDebug(nowMs);
  }
  removeOfflineVisitors() {
    this.entities = this.entities.filter(e => !(e.state === 'scene' && e.migrant && !e.stranded
      && (e.admittedCycle !== this.tide.cycle || this.tide.phase === 'low' || (this.tide.phase === 'rising' && this.tide.level < .32))));
    for (const entity of this.entities) {
      entity.lastStrandedCycle = cycleAtOrBefore(entity.lastStrandedCycle, this.tide.cycle);
      entity.lingerCycle = cycleAtOrBefore(entity.lingerCycle, this.tide.cycle);
    }
  }
  calibrateLifecycle(source, tide = this.tide) {
    return { admissionCycle: tide.cycle, admissionStage: source?.admissionCycle === tide.cycle ? Math.max(source.admissionStage || 0, elapsedAdmissionStages(tide)) : elapsedAdmissionStages(tide),
      shorePreparedCycle: cycleAtOrBefore(source?.shorePreparedCycle, tide.cycle), retreatCycle: cycleAtOrBefore(source?.retreatCycle, tide.cycle),
      fallingCycle: tide.cycle, strandedThisCycle: source?.fallingCycle === tide.cycle ? source.strandedThisCycle || 0 : 0 };
  }
  reconcileAfterSuspension(source = this.lifecycle()) {
    const stable = normalizeCoast({ version: 1, epochMs: this.clock.epochMs, nextId: this.nextId, entities: this.entities });
    this.entities = stable.entities; this.transitions = []; this.pointerState = null;
    Object.assign(this, this.calibrateLifecycle(source)); this.lastCycle = this.tide.cycle;
    this.removeOfflineVisitors(); this.reconcile(true); this.disperseCrowdedShore();
  }
  /** Refresh before a UI hit-test or transaction; long sleeps never replay populations. */
  refresh(nowMs = Date.now()) { return this.update(0, nowMs, true); }
  /** Production manual tide changes visibly now, then rejoins the ordinary cycle. */
  setTideDirection(direction, nowMs = Date.now()) {
    if (!['rising','falling'].includes(direction)) return failure('请选择涨潮或退潮。');
    this.refresh(Number.isFinite(nowMs) ? nowMs : Date.now());
    const level = this.tide.level, previousPhase = this.tide.phase, wasDebug = this.isDebugTime();
    const source = wasDebug ? this.realLifecycle : this.lifecycle();
    const result = this.clock.setDirection(direction, this.nowMs);
    this.tide = result.tide; this.userTideDirection = direction;
    if (result.changed) {
      const cycle = this.tide.cycle;
      if (wasDebug) { Object.assign(this, this.calibrateLifecycle(source)); this.removeOfflineVisitors(); }
      // Reversing direction cannot reset this cycle's population or rescue budget.
      this.admissionCycle = cycle; this.admissionStage = Math.max(this.admissionStage, elapsedAdmissionStages(this.tide));
      this.lastCycle = cycle; this.populationVisits.add('real:' + cycle);
      if (direction === 'falling' && previousPhase !== 'falling') this.retreatCycle = -1;
      for (const entity of this.entities) if (speciesFor(entity.species)?.kind === 'crab') entity.shorePlanAt = 0;
      if (direction === 'rising') for (const entity of this.entities) {
        if (entity.state !== 'scene' || !entity.migrant || entity.stranded || entity.concealment || !['outward','retreat'].includes(entity.migration)) continue;
        const points = entity.forageHome && isHabitatValid(entity.species,entity.forageHome.x,entity.forageHome.y,level) ? [entity.forageHome] : this.shallowPoints(level);
        const target = this.reachableTarget(entity, points, level);
        if (target) { entity.migration = 'inward'; entity.moveTarget = { ...target }; }
      }
      this.wasDebug = false; this.hasUpdated = true; this.tidePopulation(); this.reconcile(false, level); this.realLifecycle = this.lifecycle();
    }
    const message = this.tide.manual ? direction === 'rising' ? '正在涨潮，海水开始漫向沙滩。' : '正在退潮，沙滩开始显露。'
      : direction === 'rising' ? '已经到高潮，海水正在停留。' : '已经到低潮，沙滩已经显露。';
    return success(message, { tide: { ...this.tide } });
  }
  getSpecies(id) { return speciesFor(id); }
  liveCount() { return this.entities.filter(e => active(e) && speciesFor(e.species)?.bucketable).length; }
  shellCount() { return this.entities.filter(e => active(e) && !speciesFor(e.species)?.bucketable).length; }
  bucketCount() { return this.entities.filter(e => e.state === 'bucket').length; }
  aquaticCount() { return this.entities.filter(e => inScene(e) && speciesFor(e.species)?.aquatic).length; }
  seed() {
    const aquatic = SPECIES.filter(s => s.aquatic), ground = SPECIES.filter(s => s.bucketable && !s.aquatic), shells = SPECIES.filter(s => !s.bucketable);
    for (let i = 0; i < 8; i++) this.spawn(aquatic[i % aquatic.length], { permanent: true });
    for (let i = 0; i < 10; i++) this.spawn(ground[i % ground.length]);
    for (let i = 0; i < 12; i++) this.spawn(shells[i % shells.length]);
  }
  spawn(species, { point, permanent = false, migrant = false, entry = null } = {}) {
    if (!species || (species.bucketable ? this.liveCount() >= COAST_LIMITS.alive : this.shellCount() >= COAST_LIMITS.shells)) return null;
    if (!point) {
      const sample = findHabitat(species, permanent ? 0 : this.tide.level, this.random);
      point = species.aquatic ? sample : sample && findSpacedHabitat(species, this.tide.level, this.entities, () => sample.x / 1600);
    }
    if (!point) return null;
    const entity = { id: 'coast-' + this.nextId++, species: species.id, ...point, heading: this.random() * TAU,
      phase: this.random() * TAU, state: 'scene', stranded: false, migrant, entry, admittedCycle: migrant ? this.tide.cycle : -1,
      submerged: !!habitatAt(point.x, point.y, this.tide.level).water, lastStrandedCycle: -1 };
    this.entities.push(entity);
    if (this.concealmentReady) this.initializeOneConcealment(entity);
    return entity;
  }
  disperseCrowdedShore() {
    // Repair only overlap in loaded saves. An established, well-spaced animal
    // keeps its exact position, ID and discovery state on every reopen.
    const settled = [];
    for (const entity of this.entities) {
      if (entity.state !== 'scene' || !beachResident(entity)) continue;
      if (settled.some(other => distance(entity, other) < 64)) {
        const level = !speciesFor(entity.species).bucketable && entity.submerged ? 0 : this.tide.level;
        const point = findSpacedHabitat(entity.species, level, this.entities, this.random, entity);
        if (point) {
          entity.x = point.x; entity.y = point.y; entity.submerged = !!habitatAt(point.x, point.y, this.tide.level).water;
          entity.moveTarget = null; entity.migration = null; delete entity.shoreWaypoints; delete entity.shoreEscaping; delete entity.shorePlanAt;
        }
      }
      settled.push(entity);
    }
  }
  initializeOneConcealment(entity, kind = undefined) {
    if (entity.concealmentInitialized) return;
    const species = speciesFor(entity.species), rank = concealmentRank(entity);
    entity.concealmentInitialized = true; entity.concealment = null; entity.revealSteps = 0; entity.revealNeeded = 0; entity.emergeProgress = 1;
    if (entity.state !== 'scene' || entity.stranded) return;
    if (kind === undefined && (species.kind === 'crab' || species.kind === 'shell') && rank % 4 === 0) kind = 'sand';
    if (kind === 'sand' && (species.kind === 'crab' || species.kind === 'shell')) {
      entity.concealment = 'sand'; entity.revealNeeded = 2 + (rank % 2); entity.emergeProgress = 0;
    } else if (kind === 'crevice' && species.kind === 'fish' && !entity.migrant) {
      const crevice = this.findCrevice(entity);
      if (crevice) {
        entity.x = crevice.x; entity.y = crevice.y; entity.submerged = true; entity.concealment = 'crevice';
        entity.concealmentAnchor = crevice.anchor; entity.creviceExit = crevice.exit;
        entity.revealNeeded = 1; entity.emergeProgress = 0; entity.moveTarget = null; entity.migration = null;
      }
    }
  }
  initializeConcealments() {
    const uninitialized = this.entities.filter(e => !e.concealmentInitialized);
    const sand = uninitialized.filter(e => e.state === 'scene' && ['crab','shell'].includes(speciesFor(e.species).kind)).sort((a,b) => concealmentRank(a) - concealmentRank(b));
    const fish = uninitialized.filter(e => e.state === 'scene' && !e.migrant && !e.stranded && speciesFor(e.species).kind === 'fish').sort((a,b) => concealmentRank(a) - concealmentRank(b));
    const selectedSand = new Set(sand.slice(0, Math.round(sand.length * .25)).map(e => e.id));
    const selectedFish = new Set(fish.slice(0, Math.min(2, Math.floor(fish.length / 6))).map(e => e.id));
    for (const entity of uninitialized) this.initializeOneConcealment(entity, selectedSand.has(entity.id) ? 'sand' : selectedFish.has(entity.id) ? 'crevice' : null);
  }
  findCrevice(entity) {
    const candidates = [];
    for (const rock of ROCKS) for (let i = 0; i < rock.length; i++) {
      const a = rock[i], b = rock[(i + 1) % rock.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx,dy) || 1;
      const anchor = { x: (a.x+b.x)/2, y: (a.y+b.y)/2 };
      for (const side of [-1, 1]) {
        const nx = -dy/length*side, ny = dx/length*side, point = { x: anchor.x+nx*31, y: anchor.y+ny*31 };
        const exit = { x: point.x+nx*68, y: point.y+ny*68 };
        if (isHabitatValid(entity.species,point.x,point.y,0) && isHabitatValid(entity.species,exit.x,exit.y,0)
          && pathIsHabitatValid(entity.species,point.x,point.y,exit.x,exit.y,0)) candidates.push({ ...point, anchor, exit });
      }
    }
    return candidates.sort((a,b) => distance(entity,a)-distance(entity,b))[0] ?? null;
  }
  reveal(entity) {
    const kind = entity.concealment;
    if (kind === 'sand' && entity.submerged) return failure('沙痕还在水下，等潮水退去再轻点。');
    if (entity.lastRevealAt !== undefined && this.nowMs - entity.lastRevealAt < 90) return failure('沙粒正在落下，再轻点一次看看。');
    entity.lastRevealAt = this.nowMs; entity.revealSteps = Math.min(entity.revealNeeded, entity.revealSteps + 1);
    this.transition(entity, 'reveal', undefined, 650);
    if (entity.revealSteps >= entity.revealNeeded) {
      entity.concealment = null; entity.emergeKind = kind; entity.emergeProgress = 0; entity.emergeStartMs = this.nowMs;
      if (kind === 'crevice') {
        const target = entity.creviceExit;
        if (target && pathIsHabitatValid(entity.species,entity.x,entity.y,target.x,target.y,this.tide.level,9)) {
          entity.moveTarget = { ...target }; entity.migration = 'emerging'; entity.speed = 0;
        }
      }
      return success(kind === 'crevice' ? '石缝里的小鱼慢慢游出来了。' : '沙粒散开了，海边的小住客露出身影。', { entityId: entity.id, action: 'reveal', revealed: true });
    }
    return success('轻轻拨开一点沙，再点 ' + (entity.revealNeeded - entity.revealSteps) + ' 次就能看清。', { entityId: entity.id, action: 'reveal', revealed: false });
  }
  replenish() {
    // New fish arrive at the ocean edge during rising tide, never in the scene center.
    const ground = SPECIES.filter(s => s.bucketable && !s.aquatic), shells = SPECIES.filter(s => !s.bucketable);
    const groundCount = this.entities.filter(e => active(e) && speciesFor(e.species)?.bucketable && !speciesFor(e.species)?.aquatic).length;
    for (let i = groundCount; i < Math.min(14, groundCount + 2); i++) this.spawn(ground[Math.floor(this.random() * ground.length)]);
    for (let i = 0; i < 4; i++) this.spawn(shells[Math.floor(this.random() * shells.length)]);
  }
  shallowPoints(level = this.tide.level) {
    const key = Math.round(level * 100);
    if (this.shallowCache.has(key)) return this.shallowCache.get(key);
    const line = shoreLine(level), points = [];
    for (let i = 7; i < line.length - 7; i += 4) {
      const a = line[i - 1], b = line[i + 1], p = line[i], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      for (const inset of [25, 34, 70, 110, 150, 190]) {
        const point = { x: p.x - dy / length * inset, y: p.y + dx / length * inset };
        const low = habitatAt(point.x, point.y, 0);
        if (!low.water && low.wet && isHabitatValid('fish_silver', point.x, point.y, level)) points.push(point);
      }
    }
    if (this.shallowCache.size > 8) this.shallowCache.clear();
    this.shallowCache.set(key, points); return points;
  }
  edgeEntries(species) {
    const points = [];
    // Both openings above the painted reefs connect to the open sea. Restricting
    // entries to the right opening crowds every visitor behind the new rocks.
    for (let x = 30; x <= 1570; x += 27) if (isHabitatValid(species, x, 24, 0)) points.push({ x, y: 24 });
    return points;
  }
  reachableTarget(entity, points, level = this.tide.level) {
    return points.slice().sort((a, b) => distance(entity, a) - distance(entity, b)).find(point => pathIsHabitatValid(entity.species, entity.x, entity.y, point.x, point.y, level)) ?? null;
  }
  admit(stage) {
    const aquatic = SPECIES.filter(s => s.aquatic), points = this.shallowPoints();
    // A stage admits several fish through the same static corridors. Share
    // their expensive full-body ray checks for this exact tide level only.
    if (this.admissionRoutes?.level !== this.tide.level) this.admissionRoutes = {level: this.tide.level, checks: new Map()};
    const routeChecks = this.admissionRoutes.checks;
    for (let i = 0; i < 5 && this.aquaticCount() < 18; i++) {
      const species = aquatic[(stage * 5 + i + this.tide.cycle) % aquatic.length];
      const entries = this.edgeEntries(species);
      if (!entries.length) continue;
      const firstEntry = Math.floor(this.random() * entries.length);
      // Give every visitor room across the flooded tidal band, including high tide
      // when the visible shoreline itself extends beyond the bottom of the canvas.
      const occupied = this.entities.filter(e => inScene(e) && speciesFor(e.species)?.aquatic)
        .flatMap(e => [e.moveTarget, e.forageHome].filter(Boolean));
      // Compare all real sea entrances together. Taking the first entrance
      // with any clear ray leaves the lower beach empty behind the central reef.
      const ranked = points.flatMap(point => {
        // A visitor circles within 24px of home. Reserve its body as well so a
        // home beside a sharp reef cannot strand its return stroke in a corner.
        if (!isHabitatValid(species,point.x,point.y,this.tide.level,species.kind==='fish'?39:35)) return [];
        const spacing = Math.max(0, 100 - Math.min(Infinity, ...occupied.map(home => distance(point, home)))) * 6;
        return entries.map((_, index) => {
          const entry = entries[(firstEntry + index) % entries.length];
          return { entry, point, score: spacing + distance(entry, point) * .025 };
        });
      }).sort((a, b) => a.score - b.score);
      const choice = ranked.find(({entry, point}) => {
        const key = species.kind + ':' + entry.x + ':' + point.x + ':' + point.y;
        if (!routeChecks.has(key)) routeChecks.set(key, pathIsHabitatValid(species, entry.x, entry.y, point.x, point.y, this.tide.level,species.kind==='fish'?15:11));
        return routeChecks.get(key);
      });
      let entry = choice?.entry ?? entries[firstEntry], target = choice?.point;
      target ??= this.reachableTarget({ ...entry, species: species.id }, [{ x: entry.x, y: 140 }, { x: entry.x - 60, y: 180 }]);
      if (!target) continue;
      const entity = this.spawn(species, { point: entry, migrant: true, entry: { ...entry } });
      if (entity) { entity.migration = 'inward'; entity.moveTarget = { ...target }; entity.heading = Math.atan2(target.y - entry.y, target.x - entry.x); entity.entryProgress = 0; }
    }
  }
  deepTarget(entity) {
    if (isHabitatValid(entity.species, entity.x, entity.y, 0)) return { x: entity.x, y: entity.y };
    const points = [], line = shoreLine(0);
    for (let i = 5; i < line.length - 5; i += 5) {
      const a = line[i - 1], b = line[i + 1], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const point = { x: line[i].x - dy / length * 42, y: line[i].y + dx / length * 42 };
      if (isHabitatValid(entity.species, point.x, point.y, 0)) points.push(point);
    }
    return this.reachableTarget(entity, points) ?? this.reachableTarget(entity, this.edgeEntries(entity.species));
  }
  prepareLingerers() {
    if (this.shorePreparedCycle === this.tide.cycle) return;
    this.shorePreparedCycle = this.tide.cycle;
    const points = this.shallowPoints(), fish = this.entities.filter(e => e.state === 'scene' && speciesFor(e.species)?.rescuable && !e.stranded && !e.concealment)
      .sort((a, b) => Number(a.migrant) - Number(b.migrant));
    let chosen = 0;
    for (const entity of fish) {
      const point = this.reachableTarget(entity, points); if (!point) continue;
      entity.lingerCycle = this.tide.cycle; entity.migration = 'linger'; entity.moveTarget = { ...point };
      if (++chosen >= 2) break;
    }
  }
  tidePopulation() {
    if (this.tide.cycle > this.admissionCycle) { this.admissionCycle = this.tide.cycle; this.admissionStage = 0; }
    if (this.tide.cycle === this.admissionCycle && ['rising', 'high'].includes(this.tide.phase)) {
      const stage = this.tide.level >= .68 ? 2 : this.tide.level >= .32 ? 1 : 0;
      while (this.admissionStage < stage) { const current = this.admissionStage++; this.admit(current); }
    }
    if (this.tide.level >= .92 && ['rising', 'high'].includes(this.tide.phase)) this.prepareLingerers();
    if (this.tide.phase === 'falling' && this.retreatCycle !== this.tide.cycle) {
      this.retreatCycle = this.tide.cycle;
      for (const entity of this.entities) {
        if (entity.state !== 'scene' || !speciesFor(entity.species)?.aquatic || entity.concealment || entity.lingerCycle === this.tide.cycle || entity.stranded) continue;
        const entry = entity.migrant && entity.entry;
        const home = entry && entity.forageHome && this.reachableTarget(entity, [entity.forageHome]);
        const directEntry = entry && this.reachableTarget(entity, [entry]);
        const target = home || directEntry || this.deepTarget(entity);
        if (target) { entity.migration = (home || directEntry) ? 'outward' : 'retreat'; entity.moveTarget = { ...target }; if (home || directEntry) entity.returnEntry = { ...entry }; }
      }
    }
  }
  pointer(x, y, active = true) {
    this.pointerState = active && Number.isFinite(x) && Number.isFinite(y) ? { x, y, until: this.nowMs + 450 } : null;
  }
  clearCatch(entity) {
    delete entity.catchAttempts; delete entity.lastCatchAt; this.clearEscape(entity); delete entity.escapeReturnPath;
  }
  clearEscape(entity) {
    delete entity.escapeTarget; delete entity.escapeUntil; delete entity.escapeStartedAt; delete entity.escapeElapsed;
  }
  planEscape(entity, source) {
    // Keep migration separate: an evasive dash never replaces a tidal destination.
    const target = entity.moveTarget, away = source && distance(entity, source) > 1;
    const base = target && distance(entity, target) > 2 ? Math.atan2(target.y - entity.y, target.x - entity.x)
      : away ? Math.atan2(entity.y - source.y, entity.x - source.x) : (entity.moveAngle ?? entity.heading) + (entity.phase > Math.PI ? -.42 : .42);
    const ahead = this.clock.predict(this.nowMs, FISH_CATCH_RULES.escapeMs * this.clock.speed).level;
    let destination = null;
    for (const radius of [110, 82, 54, 32, 20, 12]) {
      for (const turn of [0, Math.PI/6, -Math.PI/6, Math.PI/3, -Math.PI/3, Math.PI/2, -Math.PI/2, Math.PI]) {
        const point = { x: entity.x + Math.cos(base + turn) * radius, y: entity.y + Math.sin(base + turn) * radius };
        if (isHabitatValid(entity.species, point.x, point.y, ahead, 13)
          && pathIsHabitatValid(entity.species, entity.x, entity.y, point.x, point.y, this.tide.level, 13)) { destination = point; break; }
      }
      if (destination) break;
    }
    // In an exceptionally narrow gap, staying put is safer than inventing a route.
    if (destination && entity.migrant && entity.forageHome && !entity.moveTarget) {
      entity.escapeReturnPath = [{ x: entity.x, y: entity.y }, ...(entity.escapeReturnPath || [])].slice(0, FISH_CATCH_RULES.attempts - 1);
    }
    entity.escapeTarget = destination; entity.escapeUntil = this.nowMs + FISH_CATCH_RULES.escapeMs;
    entity.escapeStartedAt = this.nowMs; entity.escapeElapsed = 0;
  }
  moveEscape(entity, dt) {
    const target = entity.escapeTarget;
    if (!target) { this.clearEscape(entity); return false; }
    const span = distance(entity, target);
    entity.escapeElapsed = Math.max(entity.escapeElapsed + dt * 1000, this.nowMs - entity.escapeStartedAt);
    if (entity.escapeElapsed >= FISH_CATCH_RULES.escapeMs || span < 1) {
      this.clearEscape(entity); entity.wanderHeading = entity.heading; return false;
    }
    const progress = entity.escapeElapsed / FISH_CATCH_RULES.escapeMs;
    const bend = Math.sin(progress * TAU) * .16 * (entity.phase > Math.PI ? -1 : 1);
    const angle = Math.atan2(target.y - entity.y, target.x - entity.x) + bend;
    // A short C-start pushes the fish away quickly. Its own nose steers the
    // curved course, then the tail slows as the burst fades back to cruising.
    const desiredSpeed = Math.min(17 + (FISH_CATCH_RULES.speed - 17) * Math.pow(1 - progress, .8), Math.max(8, span * 3));
    const motion = steerMotion(entity, angle, desiredSpeed, dt, { acceleration: FISH_CATCH_RULES.acceleration, braking: FISH_CATCH_RULES.braking, turnRate: FISH_CATCH_RULES.turnRate, response: 11 });
    const travel = Math.min(span, motion.speed * dt), x = entity.x + Math.cos(motion.angle) * travel, y = entity.y + Math.sin(motion.angle) * travel;
    if (!pathIsHabitatValid(entity.species, entity.x, entity.y, x, y, this.tide.level, 13)) {
      // Near rocks a legal destination can still have no room for this turn.
      // Stop the burst here instead of cutting across land or moving twice.
      this.clearEscape(entity); entity.wanderHeading = angle; entity.speed = Math.max(0, entity.speed - FISH_CATCH_RULES.braking * dt); return true;
    }
    entity.x = x; entity.y = y; entity.submerged = true;
    if (entity.entry) entity.entryProgress = Math.max(0, Math.min(1, distance(entity, entity.entry) / 60));
    return true;
  }
  moveForageReturn(entity, dt) {
    const home = entity.forageHome;
    if (!entity.migrant || !home || entity.moveTarget || distance(entity, home) <= 24 + 1e-6) {
      delete entity.escapeReturnPath; return false;
    }
    // Outside the normal forage circle, swim back through the dash origins.
    // A restored save has no transient path, so it steers toward the same home.
    // The ordinary 24px projection is only reached once already inside it.
    while (entity.escapeReturnPath?.length && distance(entity, entity.escapeReturnPath[0]) < 1) entity.escapeReturnPath.shift();
    const target = entity.escapeReturnPath?.[0] || home, span = distance(entity, target);
    const angle = Math.atan2(target.y - entity.y, target.x - entity.x);
    const motion = steerMotion(entity, angle, Math.min(17, Math.max(3, span * 2)), dt);
    const travel = Math.min(span, motion.speed * dt), x = entity.x + Math.cos(motion.angle) * travel, y = entity.y + Math.sin(motion.angle) * travel;
    if (pathIsHabitatValid(entity.species, entity.x, entity.y, x, y, this.tide.level, 13)) {
      entity.x = x; entity.y = y; entity.submerged = true;
      if (entity.entry) entity.entryProgress = Math.max(0, Math.min(1, distance(entity, entity.entry) / 60));
    }
    return true;
  }
  discover(species, counter) {
    const item = this.catalog[species] ??= { firstDiscovered: this.nowMs, observed: 0, caught: 0, collected: 0, rescued: 0 };
    if (item.firstDiscovered === null) item.firstDiscovered = this.nowMs;
    if (counter) item[counter] = Math.min(1e9, (item[counter] || 0) + 1);
    return item;
  }
  transition(entity, type, to = { x: entity.x, y: entity.y }, duration = 700) {
    const item = { id: entity.id, type, from: { x: entity.x, y: entity.y }, to: { ...to }, startedAt: this.nowMs, duration };
    this.transitions = this.transitions.filter(t => t.id !== entity.id); this.transitions.push(item);
    if (type === 'rescue' || type === 'release') entity.target = { ...to };
    return item;
  }
  reconcile(offline = false, previousLevel = this.tide.level) {
    if (this.fallingCycle !== this.tide.cycle) { this.fallingCycle = this.tide.cycle; this.strandedThisCycle = 0; }
    for (const entity of this.entities) {
      if (offline || entity.state !== 'scene' || entity.stranded || (entity.lastCatchAt !== undefined && (this.nowMs - entity.lastCatchAt >= FISH_CATCH_RULES.resetMs || this.nowMs < entity.lastCatchAt))) this.clearCatch(entity);
      if (entity.state !== 'scene') continue;
      const species = speciesFor(entity.species), habitat = habitatAt(entity.x, entity.y, this.tide.level);
      const valid = isHabitatValid(species, entity.x, entity.y, this.tide.level);
      const wasSubmerged = entity.submerged;
      entity.submerged = !!habitat.water;
      if (entity.stranded && valid) { entity.stranded = false; entity.migration = 'retreat'; entity.moveTarget = this.deepTarget(entity); }
      // Decorative water coverage never respawns a shell. Only newly solid
      // terrain in an older save needs a same-instance relocation to real sand.
      if (!species.bucketable) {
        if (habitat.blocked) {
          const point = findHabitat(species, this.tide.level, this.random, entity);
          if (point) { entity.x = point.x; entity.y = point.y; entity.submerged = false; }
        }
        continue;
      }
      if (entity.concealment === 'sand' && !habitat.blocked) continue;
      // Reloading a still-wet exposed shore does not silently rescue its occupants.
      if (entity.stranded && species.rescuable && !valid && (habitat.water || habitat.wet) && !habitat.blocked) continue;
      if (offline) entity.stranded = false;
      const bodyJustExposed = !valid && isHabitatValid(species, entity.x, entity.y, previousLevel);
      const newlyExposed = !offline && species.rescuable && wasSubmerged && ((!habitat.water && habitat.wet) || bodyJustExposed) && !habitat.blocked
        && this.tide.phase === 'falling' && this.tide.level < previousLevel;
      if (newlyExposed && this.strandedThisCycle < 3 && entity.lastStrandedCycle !== this.tide.cycle) {
        this.clearCatch(entity); entity.stranded = true; entity.lastStrandedCycle = this.tide.cycle; this.strandedThisCycle++;
        entity.migration = null; delete entity.moveTarget; continue;
      }
      if (species.kind === 'crab' && !offline && !entity.concealment) {
        const virtualNow = this.clock.virtualNow(this.nowMs);
        const ahead = this.clock.predict(this.nowMs, this.tide.manual ? 3000 : 60000).level;
        const futureLevel = ['rising', 'falling'].includes(this.tide.phase) ? ahead : this.tide.level;
        const seekingRefuge = (this.tide.phase === 'rising' && !isHabitatValid(species, entity.x, entity.y, 1))
          || (this.tide.phase === 'falling' && !isHabitatValid(species, entity.x, entity.y, 0));
        const needsShore = !valid || !isHabitatValid(species, entity.x, entity.y, futureLevel) || (seekingRefuge && (!entity.shoreEscaping || !entity.moveTarget || !isHabitatValid(species, entity.moveTarget.x, entity.moveTarget.y, futureLevel)));
        // A direction change can wake every shore animal at once. Share one
        // full search per real-time update so the first wave never pays for a
        // whole school of routes in the button's frame. Debug time must finish
        // all routes before its deliberately accelerated next tide step.
        const planningTurn = this.clock.speed !== 1 || this.shorePlannedAt !== this.nowMs;
        if (needsShore && planningTurn && (!entity.shorePlanAt || virtualNow >= entity.shorePlanAt)) {
          this.shorePlannedAt = this.nowMs;
          // The wider exposed beach can invalidate a short local waypoint
          // within two seconds of a manual surge. Replan sooner while its
          // water is advancing quickly; natural tides keep the calmer cadence.
          entity.shorePlanAt = virtualNow + (this.tide.manual ? 1000 : 2000);
          const occupied = occupiedShore(this.entities, entity);
          const route = seekingRefuge ? shoreEscapeRoute(entity, this.tide.level, futureLevel, (x,y)=>this.shoreRecoveryPath(entity,x,y), point=>shoreCrowding(point, occupied)) : null;
          const point = route?.[0] ?? this.shoreTarget(entity, futureLevel);
          if (point) { entity.migration = 'recover'; entity.moveTarget = point; entity.shoreWaypoints = route?.slice(1) ?? []; entity.shoreEscaping = !!route; }
        }
      }
      if (entity.concealment === 'crevice' && (offline || habitat.blocked)
        && (!valid || !entity.creviceExit || !entity.concealmentAnchor || distance(entity,entity.concealmentAnchor)>32
          || !pathIsHabitatValid(species,entity.x,entity.y,entity.creviceExit.x,entity.creviceExit.y,0))) {
        const crevice = this.findCrevice(entity);
        if (crevice) {
          entity.x = crevice.x; entity.y = crevice.y; entity.submerged = true;
          entity.concealmentAnchor = crevice.anchor; entity.creviceExit = crevice.exit;
          entity.moveTarget = null; entity.migration = null; entity.emergeProgress = 0;
          continue;
        }
        entity.concealment = null; entity.revealNeeded = 0; entity.revealSteps = 0; entity.emergeProgress = 1;
        delete entity.concealmentAnchor; delete entity.creviceExit;
      }
      if (valid) continue;
      if (offline || habitat.blocked) {
        // Only offline/corrupt coordinates may be repaired instantly. Normal tides steer.
        const point = findHabitat(species, this.tide.level, this.random, entity);
        if (point) { entity.x = point.x; entity.y = point.y; entity.submerged = !!habitatAt(point.x, point.y, this.tide.level).water;
          if (offline) { entity.migration = null; entity.moveTarget = null; entity.lingerCycle = -1; }
        }
        continue;
      }
      if (entity.migration === 'linger' && habitat.water) continue;
      if (!entity.moveTarget && !entity.stranded) {
        const point = findHabitat(species, this.tide.level, this.random, entity);
        if (point) { entity.migration = 'recover'; entity.moveTarget = point; }
      }
    }
  }
  shorePenalty(x, y, level) {
    // A body-sized margin rejects rocks and pools even while a tide overtakes a crab.
    let penalty = 0;
    for (let i = -1; i < 8; i++) {
      const a = i * Math.PI / 4, h = habitatAt(x + (i < 0 ? 0 : Math.cos(a) * 8), y + (i < 0 ? 0 : Math.sin(a) * 8), level);
      if (h.blocked || h.pool) return Infinity;
      penalty = Math.max(penalty, h.water ? Math.max(0, h.distance - 34.2) : Math.max(0, h.distance - 185));
    }
    return penalty;
  }
  shoreRecoveryPath(entity, x, y) {
    let previous = this.shorePenalty(entity.x, entity.y, this.tide.level);
    if (!Number.isFinite(previous)) return false;
    // A coarse 5px connector can skip a thin rock corner which the next 1px
    // motion step then hits forever. Validate at the actual walking-step scale.
    const steps = Math.max(1, Math.ceil(Math.hypot(x - entity.x, y - entity.y)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, penalty = this.shorePenalty(entity.x + (x - entity.x) * t, entity.y + (y - entity.y) * t, this.tide.level);
      if (!Number.isFinite(penalty) || penalty > previous + 1e-6) return false;
      previous = penalty;
    }
    return true;
  }
  shoreTarget(entity, level = this.tide.level) {
    const occupied = occupiedShore(this.entities, entity); let best = null, score = Infinity;
    for (const radius of [16, 32, 56, 88, 128, 192, 288, 432, 640, 960]) {
      for (let i = 0; i < 24; i++) {
        const angle = i * TAU / 24, point = { x: entity.x + Math.cos(angle) * radius, y: entity.y + Math.sin(angle) * radius };
        const candidateScore = radius * .18 + shoreCrowding(point, occupied) * 110;
        if (candidateScore < score && isHabitatValid(entity.species, point.x, point.y, level) && this.shoreRecoveryPath(entity, point.x, point.y)) { best = point; score = candidateScore; }
      }
      if (best && radius * .18 > score) break;
    }
    return best;
  }
  centerPath(entity, x, y, allowWet = false) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x - entity.x, y - entity.y) / 6));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, h = habitatAt(entity.x + (x - entity.x) * t, entity.y + (y - entity.y) * t, this.tide.level);
      if (h.blocked || !(h.water || (allowWet && h.wet))) return false;
      const radius = speciesFor(entity.species).kind === 'fish' ? 13 : 9;
      for (let j = 0; j < 8; j++) {
        const a = j * Math.PI / 4, body = habitatAt(entity.x + (x - entity.x) * t + Math.cos(a) * radius, entity.y + (y - entity.y) * t + Math.sin(a) * radius, this.tide.level);
        if (body.blocked || (speciesFor(entity.species).kind === 'fish' && body.pool)) return false;
      }
    }
    return true;
  }
  moveEntity(entity, dt) {
    const species = speciesFor(entity.species), aquatic = species.aquatic, crab = species.kind === 'crab';
    if (entity.state !== 'scene' || entity.stranded || entity.concealment || !species.bucketable) { entity.speed = 0; entity.motionState = 'resting'; return; }
    let virtualDt = Math.min(8, dt * this.clock.speed); let target = entity.moveTarget;
    // Route waypoints are bends in one walk, not destinations to stop at.
    // Pausing at each bend loses enough time for a fast manual tide to overtake
    // a crab crossing the newly exposed, wider low-water beach.
    while (crab && target && distance(entity, target) < 2 && entity.shoreWaypoints?.length) target = entity.moveTarget = entity.shoreWaypoints.shift();
    if (species.kind === 'fish' && (this.moveEscape(entity, virtualDt) || this.moveForageReturn(entity, virtualDt))) return;
    // A manual surge crosses the wider low beach in thirty seconds. Migrating
    // crabs need up to 64 world px/s to reach its distant refuge; ordinary
    // wandering and the natural thirty-minute cycle keep their gentle speed.
    if (this.tide.manual && target && (aquatic || (crab && entity.migration === 'recover'))) virtualDt = Math.min(8, virtualDt * (crab ? 8 : 4));
    if (target) {
      const dist = distance(entity, target);
      if (dist < 2) {
        steerMotion(entity, entity.moveAngle ?? entity.heading, 0, virtualDt, { crab, direct: true });
        if (crab && entity.shoreWaypoints?.length) { entity.moveTarget = entity.shoreWaypoints.shift(); return; }
        entity.shoreEscaping = false;
        if (entity.migration === 'outward') {
          if (target.y <= 30 && isHabitatValid(entity.species, entity.x, entity.y, 0)) entity.state = 'departed';
          else if (entity.returnEntry) entity.moveTarget = { ...entity.returnEntry };
        } else if (entity.migration !== 'linger') {
          if (entity.migration === 'inward') entity.forageHome = { ...target };
          entity.migration = entity.migration === 'inward' ? 'forage' : 'resident'; delete entity.moveTarget;
          entity.wanderHeading = entity.moveAngle;
        }
        return;
      }
      const desiredSpeed = entity.migration === 'outward' ? 38 : entity.migration === 'retreat' ? 30 : crab ? 8 : 22;
      const desiredAngle = Math.atan2(target.y - entity.y, target.x - entity.x);
      steerMotion(entity, desiredAngle, crab && entity.shoreWaypoints?.length ? desiredSpeed : Math.min(desiredSpeed, Math.max(3, dist * 1.3)), virtualDt, { crab, direct: true });
      const travel = Math.min(dist, entity.speed * virtualDt), x = entity.x + (target.x - entity.x) / dist * travel, y = entity.y + (target.y - entity.y) / dist * travel;
      const physicalPath = pathIsHabitatValid(species, entity.x, entity.y, x, y, this.tide.level, aquatic ? undefined : crab ? 8 : 5)
        || (aquatic && !isHabitatValid(species, entity.x, entity.y, this.tide.level) && this.centerPath(entity, x, y, entity.migration === 'recover'))
        || (crab && entity.migration === 'recover' && this.shoreRecoveryPath(entity, x, y));
      if (physicalPath) { entity.x = x; entity.y = y; }
      else if (entity.migration !== 'linger' && (!entity.retryAt || this.nowMs > entity.retryAt)) {
        entity.retryAt = this.nowMs + 1000;
        if (crab) { entity.shoreEscaping = false; entity.shoreWaypoints = []; entity.shorePlanAt = 0; }
        const replacement = aquatic ? this.deepTarget(entity) : crab ? this.shoreTarget(entity) : findHabitat(species, this.tide.level, this.random, entity);
        if (replacement) { entity.migration = 'recover'; entity.moveTarget = replacement; }
      }
    } else {
      const responding = (entity.responseUntil || 0) > this.nowMs;
      let desiredSpeed = aquatic ? 17 * (.86 + .14 * Math.sin(this.elapsed * .7 + entity.phase)) + (responding ? 3 : 0)
        : crab ? crabCruiseSpeed(entity, virtualDt, responding) : 1.8;
      entity.wanderHeading ??= entity.moveAngle ?? entity.heading + (crab ? (entity.phase > Math.PI ? -1 : 1) * Math.PI / 2 : 0);
      entity.wanderHeading += Math.sin(this.elapsed * .34 + entity.phase) * .32 * virtualDt;
      if (crab) {
        let awayX = 0, awayY = 0;
        for (const other of this.entities) {
          if (other === entity || other.state !== 'scene' || !beachResident(other)) continue;
          const separation = distance(entity, other);
          if (separation > 0 && separation < 85) {
            const weight = (1 - separation / 85) * 3;
            awayX += (entity.x - other.x) / separation * weight; awayY += (entity.y - other.y) / separation * weight;
          }
        }
        if (awayX || awayY) entity.wanderHeading = Math.atan2(Math.sin(entity.wanderHeading) + awayY, Math.cos(entity.wanderHeading) + awayX);
      }
      const pointer = this.pointerState;
      if (aquatic && pointer && pointer.until >= this.nowMs && distance(entity, pointer) < 130) {
        entity.wanderHeading = Math.atan2(entity.y - pointer.y, entity.x - pointer.x); desiredSpeed += 5;
      }
      if ((entity.brakeUntil || 0) > this.nowMs) desiredSpeed = 0;
      steerMotion(entity, entity.wanderHeading, desiredSpeed, virtualDt, { crab });
      let x = entity.x + Math.cos(entity.moveAngle) * entity.speed * virtualDt, y = entity.y + Math.sin(entity.moveAngle) * entity.speed * virtualDt;
      if (entity.migrant && entity.forageHome) {
        const home = entity.forageHome, away = Math.hypot(x - home.x, y - home.y);
        if (away > 24) { x = home.x + (x - home.x) / away * 24; y = home.y + (y - home.y) / away * 24; entity.wanderHeading = Math.atan2(home.y - entity.y, home.x - entity.x); }
      }
      const level = aquatic && (this.tide.phase === 'falling' || this.tide.phase === 'low') ? 0 : this.tide.level;
      if (pathIsHabitatValid(species, entity.x, entity.y, x, y, level, aquatic ? undefined : crab ? 8 : 5)) { entity.x = x; entity.y = y; }
      else { entity.wanderHeading += .7 + this.random() * 1.2; entity.brakeUntil = this.nowMs + 300; }
    }
    if (entity.entry) entity.entryProgress = Math.max(0, Math.min(1, distance(entity, entity.entry) / 60));
    entity.submerged = !!habitatAt(entity.x, entity.y, this.tide.level).water;
  }
  update(dt = 0, nowMs = Date.now(), forceRefresh = false) {
    const nextNow = Number.isFinite(nowMs) ? nowMs : this.nowMs, gap = nextNow - this.nowMs;
    const debug = this.isDebugTime(nextNow), resumedRealTime = this.wasDebug && !debug;
    const previousLevel = this.tide.level, previousCycle = this.tide.cycle, previousManual = this.tide.manual;
    this.nowMs = nextNow; this.tide = this.clock.snapshot(this.nowMs);
    const suspended = !debug && (((this.hasUpdated || forceRefresh) && (gap > ((previousManual || this.tide.manual) ? 1000 : 30000) || gap < -1000)) || this.tide.cycle > previousCycle + 1);
    if (suspended || resumedRealTime) {
      this.reconcileAfterSuspension(resumedRealTime ? this.realLifecycle : this.lifecycle());
      this.realLifecycle = this.lifecycle(); this.wasDebug = debug; this.hasUpdated = true;
      return this.tide;
    }
    dt = Math.max(0, Math.min(.12, Number(dt) || 0)); this.elapsed += dt;
    if (this.tide.cycle > this.lastCycle) {
      this.lastCycle = this.tide.cycle; const visit = (debug ? 'debug:' : 'real:') + this.tide.cycle;
      if (!this.populationVisits.has(visit)) { this.populationVisits.add(visit); this.replenish(); }
      if (this.populationVisits.size > 256) this.populationVisits.delete(this.populationVisits.values().next().value);
    }
    this.tidePopulation();
    if (this.clock.speed === 1 && !this.tide.manual && this.tide.level < .98) {
      const level = this.tide.level, duration = Math.max(1500, (1 - level) * 30000);
      const possibleSurge = level + (1 - level) * Math.sin(Math.min(1, 3000 / duration) * Math.PI / 2);
      warmShoreNavigation(level, possibleSurge);
    }
    for (const transition of this.transitions) {
      const entity = this.entities.find(e => e.id === transition.id); if (!entity) continue;
      const progress = Math.max(0, Math.min(1, (this.nowMs - transition.startedAt) / transition.duration));
      if (entity.state === 'rescuing' || entity.state === 'releasing') {
        const eased = .5 - Math.cos(progress * Math.PI) * .5;
        entity.x = transition.from.x + (transition.to.x - transition.from.x) * eased;
        entity.y = transition.from.y + (transition.to.y - transition.from.y) * eased;
        if (progress >= 1) { entity.state = 'scene'; delete entity.target; }
      }
    }
    this.entities = this.entities.filter(e => e.state !== 'departed' && (e.state !== 'collected' || this.transitions.some(t => t.id === e.id && this.nowMs - t.startedAt < t.duration)));
    this.transitions = this.transitions.filter(t => this.nowMs - t.startedAt < t.duration);
    this.reconcile(false, previousLevel);
    for (const entity of this.entities) {
      if (entity.emergeStartMs !== undefined) {
        entity.emergeProgress = Math.max(0, Math.min(1, (this.nowMs - entity.emergeStartMs) / (entity.emergeKind === 'crevice' ? 1100 : 650)));
        if (entity.emergeProgress === 1) delete entity.emergeStartMs;
      }
      this.moveEntity(entity, dt);
    }
    if (!debug) this.realLifecycle = this.lifecycle();
    this.wasDebug = debug; this.hasUpdated = true;
    return this.tide;
  }
  hitTest(x, y) {
    const point = { x, y };
    return this.entities.filter(e => e.state === 'scene' && (e.entryProgress ?? 1) >= .08 && (!(!speciesFor(e.species).bucketable && e.submerged)))
      .map(e => ({ entity: e, distance: distance(point, e) })).filter(x => x.distance <= 44)
      .sort((a, b) => a.distance - b.distance)[0]?.entity ?? null;
  }
  interact(idOrX, yOrMode, modeOrNow, maybeNow) {
    const coordinate = typeof idOrX === 'number';
    const mode = coordinate ? modeOrNow : yOrMode;
    const nowMs = coordinate ? maybeNow : modeOrNow;
    this.refresh(Number.isFinite(nowMs) ? nowMs : Date.now());
    const entity = coordinate ? this.hitTest(idOrX, yOrMode) : this.entities.find(e => e.id === idOrX);
    if (!entity || entity.state !== 'scene') return failure('这里暂时没有可以互动的小生灵。');
    const species = speciesFor(entity.species);
    if (entity.concealment) return this.reveal(entity);
    if (!species.bucketable) {
      if (entity.submerged) return failure('贝壳还在水下，等潮水退去再来看看。');
      if (mode !== 'catch') {
        if (this.transitions.some(t => t.id === entity.id && t.type === 'observe' && this.nowMs - t.startedAt < 400)) return failure('慢慢看看它的纹路吧。');
        this.discover(entity.species, 'observed'); this.transition(entity, 'observe', undefined, 900);
        return success('看清了' + species.name + '的纹路，切换到捕捉模式就能拾起。', { entityId: entity.id, action: 'observe' });
      }
      entity.state = 'collected'; this.shells++; this.discover(entity.species, 'collected'); this.transition(entity, 'collect');
      return success('拾起一枚' + species.name + '，收好这份海边的小礼物。', { entityId: entity.id, action: 'collect' });
    }
    if (mode === 'catch') {
      if (this.bucketCount() >= COAST_LIMITS.bucket) return failure('小桶已经满了，先放生几位海边朋友吧。');
      if (species.kind === 'fish' && entity.submerged && !entity.stranded) {
        if (entity.lastCatchAt !== undefined && this.nowMs - entity.lastCatchAt < FISH_CATCH_RULES.intervalMs) {
          return { ...failure('小鱼刚刚游开，等一小会儿再追它。'), entityId: entity.id, action: 'catch-wait', attempt: entity.catchAttempts, remainingAttempts: FISH_CATCH_RULES.attempts - entity.catchAttempts };
        }
        const attempt = (entity.catchAttempts || 0) + 1;
        if (attempt < FISH_CATCH_RULES.attempts) {
          entity.catchAttempts = attempt; entity.lastCatchAt = this.nowMs;
          this.planEscape(entity, coordinate ? { x: idOrX, y: yOrMode } : this.pointerState?.until >= this.nowMs ? this.pointerState : null);
          return success('小鱼轻快地游开了，再追 ' + (FISH_CATCH_RULES.attempts - attempt) + ' 次就能接住。', { entityId: entity.id, action: 'escape', attempt, remainingAttempts: FISH_CATCH_RULES.attempts - attempt });
        }
      }
      this.clearCatch(entity);
      entity.state = 'bucket'; entity.stranded = false; entity.migrant = false; entity.migration = null; entity.entry = null; entity.entryProgress = 1; delete entity.forageHome; delete entity.returnEntry; delete entity.moveTarget; delete entity.lingerCycle; delete entity.shoreWaypoints; delete entity.shoreEscaping; delete entity.shorePlanAt; this.discover(entity.species, 'caught'); this.transition(entity, 'capture');
      return success(species.name + '暂时住进了小桶。', { entityId: entity.id, action: 'capture' });
    }
    if (entity.stranded && species.rescuable) {
      const point = findHabitat(species, this.tide.level, this.random, entity);
      if (!point || !isHabitatValid(species, point.x, point.y, this.tide.level)) return failure('还没有找到合适的水域，稍等片刻再试试。');
      this.clearCatch(entity); entity.state = 'rescuing'; entity.stranded = false; entity.migration = null; delete entity.moveTarget; delete entity.lingerCycle; delete entity.shoreWaypoints; delete entity.shoreEscaping; delete entity.shorePlanAt; this.rescues++; this.discover(entity.species, 'rescued'); this.transition(entity, 'rescue', point, 1000);
      return success('轻轻送' + species.name + '回到海水里。', { entityId: entity.id, action: 'rescue' });
    }
    if (this.transitions.some(t => t.id === entity.id && t.type === 'observe' && this.nowMs - t.startedAt < 400)) return failure('它正在回应你，慢慢看。');
    this.discover(entity.species, 'observed'); this.transition(entity, 'observe', undefined, 900); entity.wanderHeading = (entity.moveAngle ?? entity.heading) + .8; entity.responseUntil = this.nowMs + 1400;
    return success(species.name + '向你打了个招呼。', { entityId: entity.id, action: 'observe' });
  }
  release(selector, nowMs = Date.now()) {
    this.refresh(nowMs);
    const selected = this.entities.filter(e => e.state === 'bucket' && (selector === 'all' || e.id === selector || selector === 'species:' + e.species));
    if (!selected.length) return failure('小桶里没有需要放生的这一位。');
    let released = 0;
    for (const entity of selected) {
      const species = speciesFor(entity.species), point = species.aquatic ? findHabitat(species, this.tide.level, this.random, entity)
        : findSpacedHabitat(species, this.tide.level, this.entities, this.random, entity);
      if (!point || !isHabitatValid(species, point.x, point.y, this.tide.level)) continue;
      this.clearCatch(entity); entity.state = 'releasing'; entity.stranded = false; entity.migration = null; delete entity.moveTarget; delete entity.lingerCycle; delete entity.shoreWaypoints; delete entity.shoreEscaping; delete entity.shorePlanAt; this.transition(entity, 'release', point, 850); released++;
    }
    return released ? success('送 ' + released + ' 位海边朋友回家。' + (released < selected.length ? '其余伙伴还在等待合适的栖息地。' : ''), { released })
      : failure('暂时没有合适的栖息地，它们会先留在小桶里。');
  }
  snapshot() {
    const realTide = this.clock.productionSnapshot(this.nowMs), debug = this.isDebugTime();
    const lifecycle = debug ? this.calibrateLifecycle(this.realLifecycle, realTide) : this.calibrateLifecycle(this.lifecycle(), realTide);
    const entities = this.entities.filter(e => !(debug && e.migrant && !e.stranded && e.admittedCycle > realTide.cycle))
      .map(e => ({ ...e, lastStrandedCycle: cycleAtOrBefore(e.lastStrandedCycle, realTide.cycle), lingerCycle: cycleAtOrBefore(e.lingerCycle, realTide.cycle) }));
    return normalizeCoast({ version: 1, epochMs: this.clock.epochMs, manualTide: this.clock.serializeManual(this.nowMs), tideDirection: this.userTideDirection, nextId: this.nextId, entities,
      catalog: this.catalog, shells: this.shells, rescues: this.rescues, ...lifecycle });
  }
  view() {
    return { tide: { ...this.tide }, tideDirection: this.userTideDirection, bucket: this.entities.filter(e => e.state === 'bucket').map(e => ({ ...e })),
      catalog: Object.fromEntries(Object.entries(this.catalog).map(([id, item]) => [id, { ...item }])), shells: this.shells, rescues: this.rescues,
      entityCount: this.entities.filter(e => inScene(e)).length, aquaticCount: this.aquaticCount(), aliveCount: this.liveCount(), shellCount: this.shellCount(),
      strandedCount: this.entities.filter(e => e.stranded && e.state === 'scene').length, bucketLimit: COAST_LIMITS.bucket, hadValidState: this.hadValidState };
  }
}
export default CoastGame;
