import { PondSimulation, DEFAULT_OPTIONS, clamp } from './simulation.js';
import { renderScale, createFishShadow, watchDeviceScale } from './rendering.js';
import {Atmosphere} from './atmosphere.js';
import {Scenery} from './scenery.js';
import {Landscape} from './landscape.js';
import {KoiRenderer} from './koi-renderer.js';
import {prepareKoiSkin} from './koi-skin.js';
import {TurtleRenderer} from './turtles.js';
import {drawSurfaceRipples,drawShoreRipples} from './surface-waves.js';

const TAU = Math.PI * 2;
const ellipse = (ctx, x, y, rx, ry, fill, angle = 0) => {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
};
/** A transparent Canvas pond layer; UI owns all pointer event listeners. */
export class PondEngine extends KoiRenderer {
  constructor(canvas, options = {}, landscapeCanvas = null) {
    super(canvas.getContext('2d', {alpha:true}));
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.sim = new PondSimulation(1000, 700, this.options);
    this.images = new Map();
    this.shadowSprite = createFishShadow();
    this.atmosphere = new Atmosphere(this.options);
    this.scenery = new Scenery();
    this.turtleRenderer = new TurtleRenderer();
    this.landscape = new Landscape(landscapeCanvas);
    this.landscape.onLoad = () => this.render();
    this.isWater = (x,y) => this.landscape.waterAt(x,y);
    this.running = false;
    this.destroyed = false;
    this.lastTime = 0; this.nextFrame = 0;
    this.rafInterval = 1000 / 60; this.previousRaf = 0;
    this.fps = 0;
    this.sampleStart = 0;
    this.sampleFrames = 0;
    this.frame = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.motes = Array.from({ length: 120 }, (_, i) => ({
      x: ((i * 0.61803398875 + 0.13) % 1),
      y: ((i * 0.38196601125 + 0.21) % 1),
      seed: ((i * 0.7548776662 + 0.1) % 1),
      size: 0.6 + ((i * 0.56984029) % 1) * 1.5,
    }));
    this.tick = this.tick.bind(this);
    this.handleVisibility = () => {
      this.lastTime = 0; this.nextFrame = 0;
      this.sampleStart = this.sampleFrames = this.fps = 0;
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; }
      else if (this.running && !this.destroyed) this.schedule();
    };
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.handleResize = () => this.resize();
    this.stopWatchingDeviceScale = watchDeviceScale(this.handleResize);
    window.addEventListener('resize', this.handleResize);
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    if (this.destroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.displayScale = Math.max(window.devicePixelRatio || 1, this.options.desktopMode ? this.options.displayPixelRatio || 1 : 1);
    const dpr = renderScale(width, height, window.devicePixelRatio || 1, this.options.quality, this.options.desktopMode, this.options.displayPixelRatio);
    if (width !== this.width || height !== this.height || dpr !== this.dpr) {
      this.width = width; this.height = height; this.dpr = dpr;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.sim.setBounds(width, height);
      this.atmosphere.impacts.length = 0;
      this.landscape.resize(width, height, dpr);
    }
    if (this.options.desktopMode) {
      this.desktopSize = [this.canvas.width, this.canvas.height];
      this.desktopBackgroundSize = this.landscape.getStats().backgroundSize;
    }
    this.render();
  }

  start() { if (this.destroyed || this.running) return; this.running = true; this.lastTime = 0; this.nextFrame = 0; this.schedule(); }
  schedule() { if (!this.frame && !this.options.paused && !document.hidden && !this.destroyed) this.frame = requestAnimationFrame(this.tick); }
  tick(timestamp) {
    this.frame = 0;
    if (!this.running || this.destroyed || document.hidden) return;
    const interval = this.options.quality === 'low' || this.options.reducedMotion ? 1000 / 30 : 1000 / 60;
    if (this.previousRaf) this.rafInterval = this.rafInterval * .9 + Math.min(100, timestamp - this.previousRaf) * .1;
    this.previousRaf = timestamp;
    // At 60 Hz render every vsync; a second wall-clock gate would mistake GPU jitter
    // for a too-early frame. Faster displays and 30 FPS modes use a phase-aligned cap.
    if (interval < 20 && this.rafInterval > 14.5) this.nextFrame = timestamp + interval;
    else {
      if (!this.nextFrame || timestamp - this.nextFrame > interval * 2) this.nextFrame = timestamp;
      if (timestamp + 2 < this.nextFrame) { this.schedule(); return; }
      this.nextFrame += Math.max(1, Math.floor((timestamp - this.nextFrame + 2) / interval) + 1) * interval;
    }
    const dt = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, 0.05) : 1 / 60;
    this.lastTime = timestamp;
    this.sim.update(dt);
    for (const event of this.atmosphere.update(dt, this.width, this.height, this.sim.fish, this.sim.hand, this.isWater)) this.options.onThunder?.(event);
    this.render();
    if (!this.sampleStart) this.sampleStart = timestamp;
    else this.sampleFrames++;
    if (timestamp - this.sampleStart >= 1000) {
      this.fps = Math.round(this.sampleFrames * 1000 / (timestamp - this.sampleStart));
      this.sampleStart = timestamp; this.sampleFrames = 0;
    }
    this.schedule();
  }

  updateOptions(partial = {}) {
    const qualityChanged = (partial.quality !== undefined && partial.quality !== this.options.quality)
      || (partial.desktopMode !== undefined && partial.desktopMode !== this.options.desktopMode)
      || (partial.displayPixelRatio !== undefined && partial.displayPixelRatio !== this.options.displayPixelRatio);
    this.options = { ...this.options, ...partial };
    this.sim.updateOptions(partial);
    this.atmosphere.configure(partial);
    if (this.options.paused) { cancelAnimationFrame(this.frame); this.frame = 0; this.lastTime = 0; this.nextFrame = 0; this.sampleStart = this.sampleFrames = this.fps = 0; }
    else if (this.running) this.schedule();
    if (qualityChanged) { this.nextFrame = 0; this.resize(); }
    else this.render();
  }
  pointer(x, y, active = true) { this.sim.pointer(x, y, active); }
  feed(x, y) { this.sim.feed(x, y); if (this.options.paused) this.render(); }
  getStats() { return { ...this.sim.getStats(), fps: this.fps, width: this.canvas.width, height: this.canvas.height,
    ...this.landscape.getStats(), displayScale: this.displayScale,
    desktopMode: !!this.options.desktopMode, desktopSize: this.desktopSize, desktopBackgroundSize: this.desktopBackgroundSize, scenery: {rainDrops:this.atmosphere.drops.length, rainHits:this.atmosphere.rainHits, leaves:this.atmosphere.leaves.length, landings:this.atmosphere.landings, landscape:!!this.landscape.ready} }; }
  setCustomFish(items = []) {
    this.sim.setCustomFish(items);
    const wanted = new Set(this.sim.customFish.map((item) => item.texture).filter(Boolean));
    for (const key of this.images.keys()) if (!wanted.has(key)) this.images.delete(key);
    for (const texture of wanted) {
      if (this.images.has(texture)) continue;
      const img = new Image();
      this.images.set(texture, img);
      img.onload = () => {
        if (this.destroyed) return;
        const item = this.sim.customFish.find(f => f.texture === texture);
        try { img.skin = prepareKoiSkin(img, item?.appearance); } catch { /* A damaged saved PNG keeps a native koi visible. */ }
        this.render();
      };
      img.src = texture;
    }
    this.render();
  }
  destroy() {
    this.destroyed = true; this.running = false;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.stopWatchingDeviceScale?.();
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    for (const img of this.images.values()) img.onload = null;
    this.images.clear();
    this.shadowSprite.width = this.shadowSprite.height = 0;
    this.scenery.destroy(); this.landscape.destroy(); this.turtleRenderer.destroy();
  }

  render() {
    const ctx = this.ctx;
    if (!ctx || this.destroyed) return;
    this.landscape.render(this.sim.time, this.options, this.sim.hand);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    this.drawWater();
    if (this.options.season === 'summer') this.drawLotus();
    const turtleScale = clamp(Math.min(this.width / 1250, this.height / 780), .78, 1.15);
    for (const turtle of this.sim.turtles) this.turtleRenderer.draw(ctx, turtle, {scale:turtleScale,night:this.options.night,shadow:true});
    for (const fish of this.sim.fish) this.drawFish(fish, true);
    for (const fish of this.sim.fish) this.drawFish(fish, false);
    for (const turtle of this.sim.turtles) this.turtleRenderer.draw(ctx, turtle, {scale:turtleScale,night:this.options.night});
    if (this.options.season === 'winter' || this.options.weather === 'snowy') this.drawIce();
    this.scenery.clouds(ctx, this.atmosphere, this.width, this.height, this.options);
    drawSurfaceRipples(ctx, this.sim.time, this.width, this.height, this.options);
    drawShoreRipples(ctx, this.sim.time, this.width, this.height, this.options, this.isWater);
    this.drawFood();
    this.drawRipples();
    this.scenery.leaves(ctx, this.atmosphere, this.width, this.height, this.options);
    this.scenery.rain(ctx, this.atmosphere, this.width, this.height, this.options);
    this.drawWeather();
    this.drawInsects();
    ctx.restore();
  }

  drawWater() {
    const ctx = this.ctx, { weather, night, reducedMotion } = this.options;
    const t = reducedMotion ? 0 : this.sim.time;
    if (night) {
      ctx.fillStyle = 'rgba(7,25,39,.22)'; ctx.fillRect(0, 0, this.width, this.height);
      const moon = ctx.createRadialGradient(this.width * 0.72, this.height * 0.18, 0, this.width * 0.72, this.height * 0.18, this.width * 0.32);
      moon.addColorStop(0, 'rgba(176,224,230,.10)'); moon.addColorStop(1, 'rgba(131,204,215,0)');
      ctx.fillStyle = moon; ctx.fillRect(0, 0, this.width, this.height);
    } else if (weather === 'sunny') {
      const light = ctx.createRadialGradient(this.width * 0.62, this.height * 0.16, 0, this.width * 0.62, this.height * 0.16, this.width * 0.63);
      light.addColorStop(0, 'rgba(255,245,181,.10)'); light.addColorStop(1, 'rgba(235,249,191,0)');
      ctx.fillStyle = light; ctx.fillRect(0, 0, this.width, this.height);
    } else if (weather === 'cloudy' || weather === 'rainy' || weather === 'stormy') {
      ctx.fillStyle = weather === 'stormy' ? 'rgba(22,40,58,.25)' : weather === 'rainy' ? 'rgba(33,62,69,.18)' : 'rgba(41,70,66,.09)'; ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.options.quality === 'low') return;
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.lineWidth = 0.6;
    for (let i = 0; i < 10; i++) {
      const m = this.motes[i];
      const x = this.width * (0.17 + m.x * 0.64) + Math.sin(t * 0.07 + i) * 15;
      const y = this.height * (0.16 + m.y * 0.7) + Math.cos(t * 0.09 + i) * 12;
      ctx.strokeStyle = `rgba(221,246,200,${night ? 0.015 : 0.025 + Math.sin(t * 0.4 + i) * 0.009})`;
      ctx.beginPath(); ctx.ellipse(x, y, 38 + m.seed * 54, 13 + m.seed * 24, m.seed * 3, 0.4, 4.9); ctx.stroke();
    }
    ctx.restore();
  }

  drawFood() {
    const ctx = this.ctx, t = this.sim.time;
    for (const pellet of this.sim.food) {
      const bob = Math.sin(t * 2 + pellet.phase) * 0.65;
      const alpha = Math.min(1, (pellet.life - pellet.age) / 3);
      ctx.globalAlpha = alpha;
      ellipse(ctx, pellet.x + 1.3, pellet.y + 2.5, pellet.size + 1, pellet.size * 0.65, 'rgba(10,45,28,.25)');
      ellipse(ctx, pellet.x, pellet.y + bob, pellet.size, pellet.size * 0.8, '#a16d38');
      ellipse(ctx, pellet.x - 0.4, pellet.y - 0.5 + bob, pellet.size * 0.52, pellet.size * 0.32, '#eed3a0');
    }
    ctx.globalAlpha = 1;
  }

  drawRipples() {
    const ctx = this.ctx;
    for (const ripple of this.sim.ripples) {
      const progress = ripple.age / ripple.life;
      const radius = 4 + progress * 65 * ripple.strength;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(226,248,211,${(1 - progress) ** 1.6 * 0.45 * ripple.strength})`;
      ctx.beginPath(); ctx.ellipse(ripple.x, ripple.y, radius, radius * 0.64, -0.15, 0, TAU); ctx.stroke();
      if (progress > 0.12) {
        ctx.strokeStyle = `rgba(193,230,194,${(1 - progress) ** 1.8 * 0.2 * ripple.strength})`;
        ctx.beginPath(); ctx.ellipse(ripple.x, ripple.y, radius * 0.72, radius * 0.46, -0.15, 0, TAU); ctx.stroke();
      }
    }
  }

  drawLotus() {
    const ctx = this.ctx, t = this.options.reducedMotion ? 0 : this.sim.time;
    const pads = [[0.76, 0.93, 26], [0.80, 0.94, 34], [0.835, 0.905, 23]];
    for (let i = 0; i < pads.length; i++) {
      const [px, py, size] = pads[i];
      ctx.save(); ctx.translate(px * this.width, py * this.height + Math.sin(t * 0.5 + i) * 1.6);
      ctx.rotate(-0.3 + i * 0.7); ctx.scale(1, 0.67);
      ctx.shadowColor = 'rgba(9,48,31,.24)'; ctx.shadowBlur = 9; ctx.shadowOffsetY = 6;
      const g = ctx.createRadialGradient(-size * 0.3, -size * 0.3, 2, 0, 0, size);
      g.addColorStop(0, '#698357'); g.addColorStop(1, '#355f45');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size, 0.16, TAU - 0.22); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = 'rgba(177,181,111,.22)'; ctx.lineWidth = 0.65;
      for (let j = 1; j < 10; j++) { const a = j / 10 * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * size * 0.9, Math.sin(a) * size * 0.9); ctx.stroke(); }
      ctx.restore();
    }
    ctx.save(); ctx.translate(this.width * 0.815, this.height * 0.90 + Math.sin(t * 0.5) * 1.3);
    ctx.shadowColor = 'rgba(9,48,31,.24)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 7; i++) {
      ctx.save(); ctx.rotate(i / 7 * TAU + ring * 0.38);
      ctx.fillStyle = ring ? '#f6e0cf' : '#d6a6ad';
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.bezierCurveTo(-8 + ring * 3, -4, -7 + ring * 2, -10, 0, -17 + ring * 6);
      ctx.bezierCurveTo(7 - ring * 2, -10, 8 - ring * 3, -4, 0, 2); ctx.fill(); ctx.restore();
    }
    ellipse(ctx, 0, 0, 3.4, 3.1, '#d3ad57'); ctx.restore();
  }

  drawIce() {
    const ctx = this.ctx;
    const width = this.width, height = this.height;
    const edge = Math.min(this.width, this.height) * 0.08;
    ctx.save();
    // Drawn above the fish: a clear frozen surface, with koi still visible below.
    ctx.globalAlpha = this.options.night ? 0.72 : 1;
    const sheen = ctx.createLinearGradient(0, height, width, 0);
    sheen.addColorStop(0, 'rgba(203,236,235,.018)');
    sheen.addColorStop(0.35, 'rgba(227,246,244,.038)');
    sheen.addColorStop(0.50, 'rgba(220,242,242,.070)');
    sheen.addColorStop(0.68, 'rgba(220,243,240,.025)');
    sheen.addColorStop(1, 'rgba(230,248,242,.042)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = 0.65;
    const cracks = [
      [[0.19, 0.14], [0.27, 0.24], [0.31, 0.27], [0.35, 0.37], [0.43, 0.40]],
      [[0.31, 0.27], [0.38, 0.24], [0.42, 0.26]],
      [[0.90, 0.64], [0.79, 0.60], [0.73, 0.53], [0.66, 0.51], [0.61, 0.45]],
      [[0.73, 0.53], [0.70, 0.63], [0.63, 0.68]],
      [[0.22, 0.91], [0.27, 0.81], [0.37, 0.76], [0.40, 0.70]],
    ];
    for (let i = 0; i < cracks.length; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(232,252,247,.10)' : 'rgba(232,252,247,.17)';
      ctx.beginPath(); cracks[i].forEach(([x, y], j) => j ? ctx.lineTo(x * width, y * height) : ctx.moveTo(x * width, y * height)); ctx.stroke();
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, edge * 1.8);
    gradient.addColorStop(0, 'rgba(208,237,229,.28)'); gradient.addColorStop(1, 'rgba(217,242,235,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(this.width, 0); ctx.lineTo(this.width, edge * 0.8);
    for (let i = 18; i >= 0; i--) ctx.lineTo(this.width * i / 18, edge * (0.62 + Math.sin(i * 2.4) * 0.25));
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(222,245,240,.26)'; ctx.lineWidth = 0.7;
    for (let i = 0; i < 9; i++) {
      const x = this.width * (i + 0.35) / 9;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + edge * 0.3, edge * 0.25); ctx.lineTo(x + edge * 0.18, edge * 0.52); ctx.stroke();
    }
    // Tiny settled snow grains stay at the banks instead of obscuring the pond.
    for (let i = 0; i < 46; i++) {
      const mote = this.motes[i + 20];
      const x = mote.x * width;
      const bankY = 3 + mote.seed * edge * 0.32;
      ellipse(ctx, x, i % 2 ? bankY : height - bankY, 0.65 + mote.size * 0.42, 0.5 + mote.size * 0.3, 'rgba(241,251,245,.56)');
    }
    ctx.restore();
  }

  drawWeather() {
    const ctx = this.ctx, { weather, season, reducedMotion, quality, night } = this.options;
    const t = reducedMotion ? 0 : this.sim.time;
    if (weather === 'snowy' || season === 'winter') {
      const deepWinter = ['大雪', '冬至', '小寒', '大寒'].includes(this.options.solarTerm);
      const count = weather === 'snowy' ? (quality === 'low' ? 34 : 72) : deepWinter ? 28 : 18;
      for (let i = 0; i < count; i++) {
        const m = this.motes[i];
        const x = (m.x * (this.width + 80) + Math.sin(t * 0.3 + i) * 18 + t * 4) % (this.width + 80) - 40;
        const y = (m.y * (this.height + 40) + t * (9 + m.seed * 15)) % (this.height + 40) - 20;
        ctx.globalAlpha = 0.38 + m.seed * 0.5;
        ellipse(ctx, x, y, m.size, m.size, '#eff8ec');
      }
      ctx.globalAlpha = 1;
    }
    if (weather === 'foggy') {
      for (let i = 0; i < 5; i++) {
        const m = this.motes[i];
        const x = (m.x * this.width + Math.sin(t * 0.06 + i) * this.width * 0.16);
        const y = this.height * (0.18 + m.y * 0.65);
        ctx.save(); ctx.translate(x, y); ctx.scale(2.8, 1);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.height * 0.28);
        gradient.addColorStop(0, night ? 'rgba(159,197,197,.10)' : 'rgba(223,235,219,.18)'); gradient.addColorStop(1, 'rgba(232,242,228,0)');
        ctx.fillStyle = gradient; ctx.fillRect(-this.height, -this.height, this.height * 2, this.height * 2); ctx.restore();
      }
    }
    if (weather === 'sunny' && !night) {
      for (let i = 0; i < 19; i++) {
        const m = this.motes[i + 20];
        const opacity = Math.max(0, Math.sin(t * 0.75 + m.seed * 35)) ** 6 * 0.54;
        if (opacity < 0.02) continue;
        const x = this.width * (0.12 + m.x * 0.75) + Math.sin(t * 0.1 + i) * 5;
        const y = this.height * (0.13 + m.y * 0.73);
        ctx.strokeStyle = `rgba(246,253,214,${opacity})`; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x - 2.5, y); ctx.lineTo(x + 2.5, y); ctx.moveTo(x, y - 1.2); ctx.lineTo(x, y + 1.2); ctx.stroke();
      }
    }
  }

  drawInsects() {
    const ctx = this.ctx, { night, weather, season, reducedMotion } = this.options;
    const t = reducedMotion ? 0 : this.sim.time;
    if (['rainy','stormy','snowy'].includes(weather)) return;
    if (night && season !== 'winter') {
      for (let i = 0; i < 12; i++) {
        const m = this.motes[i + 60];
        const x = this.width * (0.04 + m.x * 0.9) + Math.sin(t * 0.28 + i) * 22;
        const y = this.height * (0.2 + m.y * 0.75) + Math.sin(t * 0.39 + i * 4) * 12;
        const opacity = 0.1 + Math.max(0, Math.sin(t * 0.8 + i * 1.7)) * 0.66;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
        g.addColorStop(0, `rgba(236,245,145,${opacity})`); g.addColorStop(0.2, `rgba(221,239,133,${opacity * 0.4})`); g.addColorStop(1, 'rgba(223,238,143,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 8, y - 8, 16, 16);
      }
      return;
    }
    if (night || weather === 'rainy' || weather === 'snowy' || season === 'winter') return;
    const count = season === 'summer' ? 3 : season === 'spring' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const m = this.motes[i + 51];
      const x = this.width * (0.15 + m.x * 0.72) + Math.sin(t * 0.15 + i * 3) * 60;
      const y = this.height * (0.18 + m.y * 0.64) + Math.cos(t * 0.19 + i) * 28;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 0.15 + i) * 0.9);
      const flap = 0.26 + Math.abs(Math.sin(t * (season === 'summer' ? 27 : 11) + i)) * 0.74;
      ctx.globalAlpha = 0.77;
      if (season === 'summer') {
        ctx.strokeStyle = '#567967'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 9); ctx.stroke();
        for (const side of [-1, 1]) {
          ellipse(ctx, side * 5 * flap, -1, 7 * flap, 1.7, 'rgba(224,236,221,.65)', side * 0.3);
          ellipse(ctx, side * 4.5 * flap, 2, 6 * flap, 1.5, 'rgba(224,236,221,.55)', -side * 0.26);
        }
        ellipse(ctx, 0, -4, 1.8, 1.5, '#577565');
      } else {
        for (const side of [-1, 1]) {
          ellipse(ctx, side * 4 * flap, -1.9, 4.6 * flap, 5.5, i % 2 ? '#f1deb0' : '#edf0d6', side * 0.23);
          ellipse(ctx, side * 3.5 * flap, 3, 3.6 * flap, 3.8, i % 2 ? '#d7bb75' : '#d7dfba', -side * 0.2);
        }
        ctx.strokeStyle = '#747e50'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 5); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export default PondEngine;
