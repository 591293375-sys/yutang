import {PondHabitat} from './habitat.js';
import {syncTurtles,updateTurtles} from './turtles.js';
import {updateSwimMotion} from './koi-motion.js';
export const DEFAULT_OPTIONS = Object.freeze({
  season: 'spring', weather: 'sunny', night: false, paused: false,
  reducedMotion: false, fishCount: 12, fishSize: 1, turtleCount: 0, quality: 'high', solarTerm: '春分',
});
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const valid = Number.isFinite;
const finite = (value, fallback) => valid(value) ? value : fallback;
const TAU = Math.PI * 2;

/** Browser-independent simulation, in CSS pixels and seconds. */
export class PondSimulation {
  constructor(width = 1000, height = 700, options = {}, random = Math.random) {
    this.width = Math.max(1, finite(width, 1000));
    this.height = Math.max(1, finite(height, 700));
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.random = random;
    this.habitat = new PondHabitat(this.width, this.height);
    this.fish = [];
    this.turtles = [];
    this.food = [];
    this.ripples = [];
    this.customFish = [];
    this.hand = { x: 0, y: 0, life: 0 };
    this.time = 0;
    this.serial = 0;
    this.syncFish();
    syncTurtles(this);
    this.reconcileHabitat();
  }

  createFish(index, custom = null) {
    const random = this.random;
    const x = this.width * (0.18 + random() * 0.64);
    const y = this.height * (0.19 + random() * 0.62);
    return {
      id: custom ? `custom-${custom.id}` : `koi-${this.serial++}`,
      custom, x, y, heading: random() * TAU,
      targetX: this.width * (0.15 + random() * 0.7),
      targetY: this.height * (0.16 + random() * 0.68),
      speed: 15 + random() * 13, velocity: 18,
      baseLength: custom ? 76 : 43 + random() * 61, length: 76, width: 0.115 + random() * 0.016,
      phase: random() * TAU, turn: 0, angularVelocity: 0, wander: 2 + random() * 5,
      variant: index % 6, depth: 0.84 + random() * 0.16,
      seed: random() * 100,
    };
  }

  syncFish() {
    const count = Math.round(clamp(finite(this.options.fishCount, 12), 0, 24));
    const natives = this.fish.filter((fish) => !fish.custom).slice(0, count);
    while (natives.length < count) natives.push(this.createFish(natives.length));
    const previous = new Map(this.fish.filter((fish) => fish.custom).map((fish) => [fish.custom.id, fish]));
    const custom = this.customFish.map((item, i) => {
      const old = previous.get(item.id);
      if (old) { old.custom = item; return old; }
      return this.createFish(i, item);
    });
    this.fish = [...natives, ...custom];
    this.resizeFish();
    this.reconcileHabitat();
  }

  resizeFish() {
    const globalSize = clamp(finite(this.options.fishSize, 1), .6, 1.6);
    for (const fish of this.fish) fish.length = fish.baseLength * globalSize * (fish.custom ? clamp(finite(fish.custom.size, 1), .55, 1.8) : 1);
  }

  setCustomFish(items = []) {
    const seen = new Set();
    this.customFish = items.filter((item) => {
      if (!item || item.id == null || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).slice(0, 12);
    this.syncFish();
  }

  updateOptions(options) {
    this.options = { ...this.options, ...options };
    if ('fishCount' in options) this.syncFish();
    if ('fishSize' in options) this.resizeFish();
    if ('turtleCount' in options) syncTurtles(this);
    this.reconcileHabitat();
  }

  setBounds(width, height) {
    const nextWidth = Math.max(1, finite(width, this.width));
    const nextHeight = Math.max(1, finite(height, this.height));
    const sx = nextWidth / this.width;
    const sy = nextHeight / this.height;
    for (const item of [...this.fish, ...this.turtles, ...this.food, ...this.ripples]) {
      item.x = clamp(item.x * sx, 0, nextWidth);
      item.y = clamp(item.y * sy, 0, nextHeight);
      if (valid(item.targetX)) { item.targetX *= sx; item.targetY *= sy; }
    }
    this.width = nextWidth;
    this.height = nextHeight;
    this.habitat.resize(nextWidth, nextHeight);
    this.reconcileHabitat();
  }

  bodyRadius(animal) {
    const scale = clamp(Math.min(this.width / 1250, this.height / 780), .78, 1.15);
    return Math.min(animal.length * .66 * scale + 5, Math.min(this.width, this.height) * .3);
  }

  reconcileHabitat() {
    for (const animal of [...this.fish, ...this.turtles]) {
      const radius = this.bodyRadius(animal);
      Object.assign(animal, this.habitat.project(animal.x, animal.y, radius));
      const target = this.habitat.project(animal.targetX, animal.targetY, radius + 2);
      animal.targetX = target.x; animal.targetY = target.y;
    }
    this.food = this.food.filter(p => this.habitat.contains(p.x, p.y, 8));
  }

  shoreForce(animal) {
    const edge = this.habitat.boundary(animal.x, animal.y);
    const clearance = edge.distance - this.bodyRadius(animal);
    const anticipation = Math.max(60, animal.velocity * 1.6);
    const force = Math.max(0, 1 - clearance / anticipation) * 7;
    return {x: edge.nx * force, y: edge.ny * force};
  }

  moveAnimal(animal, dt) {
    const x = animal.x + Math.cos(animal.heading) * animal.velocity * dt;
    const y = animal.y + Math.sin(animal.heading) * animal.velocity * dt;
    if (this.habitat.contains(x, y, this.bodyRadius(animal))) { animal.x = x; animal.y = y; }
    else animal.velocity *= Math.exp(-dt * 5);
  }

  pointer(x, y, active = true) {
    if (!active) { this.hand.life = 0; return; }
    if (!valid(x) || !valid(y)) return;
    this.hand = { x, y, life: 0.85 };
  }

  addRipple(x, y, strength = 1) {
    this.ripples.push({ x, y, age: 0, life: 2.6, strength });
    if (this.ripples.length > 40) this.ripples.splice(0, this.ripples.length - 40);
  }

  feed(x, y) {
    if (!valid(x) || !valid(y) || !this.habitat.contains(x, y, 8)) return false;
    // A feeding click invites fish; don't retain the preceding pointer scare.
    this.hand.life = 0;
    x = clamp(x, 8, Math.max(8, this.width - 8));
    y = clamp(y, 8, Math.max(8, this.height - 8));
    for (let i = 0; i < 9; i++) {
      const angle = this.random() * TAU;
      const radius = this.random() * 21;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      if (!this.habitat.contains(px, py, 8)) continue;
      this.food.push({
        x: px, y: py,
        age: 0, life: 26 + this.random() * 5, phase: this.random() * TAU, size: 1.5 + this.random() * 1.2,
      });
    }
    if (this.food.length > 80) this.food.splice(0, this.food.length - 80);
    this.addRipple(x, y, 1.25);
    return true;
  }

  update(delta) {
    if (this.options.paused || !valid(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    this.time += dt;
    this.hand.life = Math.max(0, this.hand.life - dt);
    const { season, weather, reducedMotion } = this.options;
    const seasonalSpeed = season === 'winter' ? 0.51 : season === 'autumn' ? 0.86 : 1;
    const weatherSpeed = weather === 'rainy' || weather === 'stormy' || weather === 'snowy' ? 0.78 : 1;
    const motionSpeed = reducedMotion ? 0.42 : 1;
    const marginX = Math.min(85, this.width * 0.13);
    const marginY = Math.min(75, this.height * 0.13);

    // Shared by both fish and turtles, including food delivered by global clicks.
    this.food = this.food.filter(p => { p.clearance = this.habitat.boundary(p.x, p.y).distance; return p.clearance >= 8; });
    for (const fish of this.fish) {
      const radius = this.bodyRadius(fish);
      fish.wander -= dt;
      let targetFood = null;
      let nearest = Infinity;
      for (const pellet of this.food) {
        if (pellet.clearance < radius) continue;
        const distance = Math.hypot(pellet.x - fish.x, pellet.y - fish.y);
        if (distance < nearest) { nearest = distance; targetFood = pellet; }
      }
      if (targetFood && !this.habitat.routeClear(fish.x, fish.y, targetFood.x, targetFood.y, radius)) targetFood = null;
      if (fish.wander <= 0 || Math.hypot(fish.targetX - fish.x, fish.targetY - fish.y) < 48) {
        fish.targetX = marginX + this.random() * Math.max(1, this.width - marginX * 2);
        fish.targetY = marginY + this.random() * Math.max(1, this.height - marginY * 2);
        const target = this.habitat.project(fish.targetX, fish.targetY, radius + 15);
        fish.targetX = target.x; fish.targetY = target.y;
        fish.wander = 4 + this.random() * 8;
      }
      const tx = targetFood ? targetFood.x : fish.targetX;
      const ty = targetFood ? targetFood.y : fish.targetY;
      const dist = Math.max(1, Math.hypot(tx - fish.x, ty - fish.y));
      let steerX = (tx - fish.x) / dist;
      let steerY = (ty - fish.y) / dist;
      let startled = false;
      if (this.hand.life > 0) {
        const dx = fish.x - this.hand.x;
        const dy = fish.y - this.hand.y;
        const handDist = Math.hypot(dx, dy);
        if (handDist < 125) {
          const force = (1 - handDist / 125) * 5.5 * Math.min(1, this.hand.life * 3);
          steerX += dx / Math.max(1, handDist) * force;
          steerY += dy / Math.max(1, handDist) * force;
          startled = true;
        }
      }
      for (const other of this.fish) {
        if (other === fish) continue;
        const dx = fish.x - other.x;
        const dy = fish.y - other.y;
        const distance = Math.hypot(dx, dy);
        const personalSpace = targetFood ? Math.max(18, (fish.length + other.length) * .15) : Math.max(30, (fish.length + other.length) * .29);
        if (distance < personalSpace && distance > 0.01) {
          const force = (1 - distance / personalSpace) * 1.15;
          steerX += dx / distance * force;
          steerY += dy / distance * force;
        }
      }
      // Soft banks anticipate the turn; hard clamps are a final resize safeguard.
      if (fish.x < marginX) steerX += (1 - fish.x / marginX) * 5;
      if (fish.x > this.width - marginX) steerX -= (1 - (this.width - fish.x) / marginX) * 5;
      if (fish.y < marginY) steerY += (1 - fish.y / marginY) * 5;
      if (fish.y > this.height - marginY) steerY -= (1 - (this.height - fish.y) / marginY) * 5;
      const bank = this.shoreForce(fish);
      steerX += bank.x; steerY += bank.y;
      const targetHeading = Math.atan2(steerY, steerX);
      const maxTurnRate = startled ? 2.0 : targetFood ? 2.3 : Math.hypot(bank.x, bank.y) > 1 ? 1.3 : .66;
      const goalTurn = clamp(angleDelta(fish.heading, targetHeading) * 2.25, -maxTurnRate, maxTurnRate);
      // A turn builds and releases continuously; choosing another morsel or
      // wandering target cannot flip the body's angular velocity in one frame.
      const previousTurn = fish.angularVelocity || 0;
      fish.angularVelocity = previousTurn + (goalTurn - previousTurn) *
        (1 - Math.exp(-dt * (targetFood || startled ? 5.2 : 3.2)));
      fish.heading += (previousTurn + fish.angularVelocity) * .5 * dt;
      fish.turn += (fish.angularVelocity - fish.turn) * (1 - Math.exp(-dt * 5));
      // Notice food across the pond, rush toward it, then brake before reaching
      // the mouth. Heading alignment avoids accelerating away during a U-turn.
      const approach = clamp((dist - 42) / 160, 0, 1);
      const easing = approach * approach * (3 - 2 * approach);
      const aligned = clamp(Math.cos(angleDelta(fish.heading, targetHeading)), 0, 1);
      const feedingSpeed = (1.05 + easing * 2.35) * (0.5 + aligned * 0.5);
      const goalSpeed = fish.speed * seasonalSpeed * weatherSpeed * motionSpeed * (startled ? 1.8 : targetFood ? feedingSpeed : 1);
      const response = fish.velocity > goalSpeed ? 5 : targetFood ? 4 : 1.7;
      fish.velocity += (goalSpeed - fish.velocity) * (1 - Math.exp(-dt * response));
      this.moveAnimal(fish, dt);
      updateSwimMotion(fish, dt, this.time, reducedMotion);
      const bodyScale = clamp(Math.min(this.width / 1250, this.height / 780), .78, 1.15);
      const mouthX = fish.x + Math.cos(fish.heading) * fish.length * .385 * bodyScale;
      const mouthY = fish.y + Math.sin(fish.heading) * fish.length * .385 * bodyScale;
      for (let i = this.food.length - 1; i >= 0; i--) {
        const pellet = this.food[i];
        if (Math.hypot(pellet.x - mouthX, pellet.y - mouthY) < 13) {
          this.food.splice(i, 1);
          this.addRipple(pellet.x, pellet.y, 0.36);
          break;
        }
      }
    }
    updateTurtles(this, dt);
    for (const pellet of this.food) {
      pellet.age += dt;
      pellet.x += Math.sin(this.time * 0.4 + pellet.phase) * dt * 0.42;
      pellet.y += Math.cos(this.time * 0.3 + pellet.phase) * dt * 0.35;
    }
    this.food = this.food.filter((pellet) => pellet.age < pellet.life && this.habitat.contains(pellet.x, pellet.y, 8));
    for (const ripple of this.ripples) ripple.age += dt;
    this.ripples = this.ripples.filter((ripple) => ripple.age < ripple.life);
  }

  getStats() { return { fishCount: this.fish.length, turtleCount: this.turtles.length, foodCount: this.food.length }; }
}
