import {clamp} from './simulation.js';
import {koiBodyPoint,koiTailAngle,koiPectoralPose} from './koi-motion.js';
const TAU = Math.PI * 2;
const smoothPath = (ctx, points, close = true) => {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo((points[0].x + points.at(-1).x) / 2, (points[0].y + points.at(-1).y) / 2);
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    ctx.quadraticCurveTo(points[i].x, points[i].y, (points[i].x + next.x) / 2, (points[i].y + next.y) / 2);
  }
  if (close) ctx.closePath();
};
const ellipse = (ctx, x, y, rx, ry, fill, angle = 0) => {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
};
const palettes = [
  { base: '#f2efdf', light: '#fffdf0', side: '#9da79b', spot: '#d95b3c', fin: '#e9e0b9', accent: '#e08a52' },
  { base: '#ebad45', light: '#ffeaa1', side: '#b96e23', spot: '#f4e6c4', fin: '#f0c877', accent: '#bc672a' },
  { base: '#e4e7d9', light: '#fffbe9', side: '#7d9b88', spot: '#263d32', fin: '#d8dcb8', accent: '#e46835' },
  { base: '#dfb75b', light: '#fff0a7', side: '#948041', spot: '#d48d30', fin: '#f1db94', accent: '#c6923f' },
  { base: '#efeee0', light: '#fffcee', side: '#8da697', spot: '#dd553b', fin: '#e1e7d3', accent: '#d25839' },
  { base: '#d8e2d3', light: '#f5f1df', side: '#708b7a', spot: '#313e34', fin: '#b9cfc0', accent: '#d67d32' },
];

export class KoiRenderer {
  constructor(ctx) { this.ctx=ctx;this.width=1250;this.height=780;this.options={quality:'high'};this.images=new Map(); }
  bodyPoint(fish, u) {
    return koiBodyPoint(fish, u);
  }

  bodyPath(fish) {
    const points = [];
    for (let i = 0; i <= 20; i++) {
      const p = this.bodyPoint(fish, i / 20);
      points.push({ x: p.x - p.nx * p.width, y: p.y - p.ny * p.width });
    }
    for (let i = 20; i >= 0; i--) {
      const p = this.bodyPoint(fish, i / 20);
      points.push({ x: p.x + p.nx * p.width, y: p.y + p.ny * p.width });
    }
    smoothPath(this.ctx, points);
  }

  drawFish(fish, shadow) {
    const ctx = this.ctx;
    const skin = fish.custom && this.images.get(fish.custom.texture)?.skin;
    const palette = skin?.palette || palettes[fish.variant];
    const scale = clamp(Math.min(this.width / 1250, this.height / 780), 0.78, 1.15);
    ctx.save();
    ctx.translate(fish.x + (shadow ? 7 : 0), fish.y + (shadow ? 12 : 0));
    ctx.rotate(fish.heading);
    ctx.scale(scale, scale);
    ctx.globalAlpha = shadow ? 0.22 : fish.depth * (this.options.night ? 0.82 : 0.98);
    if (shadow) {
      const stretch = fish.length / 86;
      ctx.drawImage(this.shadowSprite, -72 * stretch, -36 * stretch, 144 * stretch, 72 * stretch);
      ctx.restore(); return;
    }
    this.drawFins(fish, palette);
    this.bodyPath(fish);
    const gradient = ctx.createLinearGradient(0, -fish.length * 0.16, 0, fish.length * 0.15);
    gradient.addColorStop(0, palette.side);
    gradient.addColorStop(0.25, palette.base);
    gradient.addColorStop(0.47, palette.light);
    gradient.addColorStop(0.71, palette.base);
    gradient.addColorStop(1, palette.side);
    ctx.fillStyle = gradient; ctx.fill();
    ctx.save(); this.bodyPath(fish); ctx.clip();
    if (skin) this.drawSkin(fish, skin.surface);
    else this.drawPattern(fish, palette);
    if (this.options.quality !== 'low') this.drawScales(fish, palette);
    // A soft dorsal sheen gives every fish a rounded body in the water.
    const sheen = ctx.createLinearGradient(0, -fish.length * 0.12, 0, fish.length * 0.12);
    sheen.addColorStop(0, 'rgba(7,35,28,.43)');
    sheen.addColorStop(0.43, 'rgba(255,255,235,.23)');
    sheen.addColorStop(0.59, 'rgba(255,255,235,.06)');
    sheen.addColorStop(1, 'rgba(5,35,27,.45)');
    ctx.fillStyle = sheen; ctx.fillRect(-fish.length, -fish.length, fish.length * 2, fish.length * 2);
    ctx.restore();
    this.drawHead(fish, palette);
    ctx.restore();
  }

  drawFins(fish, palette) {
    const ctx = this.ctx, l = fish.length;
    const root = this.bodyPoint(fish, 0);
    const tail = {x:0,y:0};
    ctx.save(); ctx.translate(root.x,root.y); ctx.rotate(koiTailAngle(fish));
    // Flexible fin tips follow the tail stalk a fraction of a stroke later.
    const wag = Math.sin(fish.phase - 4.65) * l * (fish.swimAmplitude ?? .072) * .7;
    const finGradient = ctx.createLinearGradient(tail.x, tail.y, tail.x - l * 0.27, tail.y);
    finGradient.addColorStop(0, palette.base);
    finGradient.addColorStop(0.65, palette.fin + 'bf');
    finGradient.addColorStop(1, palette.fin + '40');
    ctx.fillStyle = finGradient;
    ctx.beginPath(); ctx.moveTo(tail.x + 4, tail.y);
    ctx.bezierCurveTo(tail.x - l * 0.11, tail.y - l * 0.03, tail.x - l * 0.2, tail.y - l * 0.18 + wag, tail.x - l * 0.27, tail.y - l * 0.13 + wag);
    ctx.quadraticCurveTo(tail.x - l * 0.24, tail.y + wag, tail.x - l * 0.19, tail.y + wag * 0.7);
    ctx.quadraticCurveTo(tail.x - l * 0.23, tail.y + l * 0.1 + wag, tail.x - l * 0.27, tail.y + l * 0.14 + wag);
    ctx.bezierCurveTo(tail.x - l * 0.17, tail.y + l * 0.15 + wag, tail.x - l * 0.1, tail.y + l * 0.015, tail.x + 4, tail.y);
    ctx.fill();
    ctx.lineWidth = 0.45; ctx.strokeStyle = palette.side + '70';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
      ctx.quadraticCurveTo(tail.x - l * 0.13, tail.y + i * l * 0.025 + wag * 0.3, tail.x - l * 0.25, tail.y + i * l * 0.061 + wag);
      ctx.stroke();
    }
    ctx.restore();
    for (const side of [-1, 1]) {
      const p = this.bodyPoint(fish, 0.72);
      const fin = koiPectoralPose(fish, side);
      const rootY = side * p.width * 0.74;
      ctx.save(); ctx.globalAlpha *= 0.77;
      ctx.translate(p.x,p.y); ctx.rotate(p.angle); p.x=0; p.y=0;
      ctx.translate(p.x,rootY); ctx.transform(1,0,fin.sweep * 3,fin.spread,0,0); ctx.translate(-p.x,-rootY);
      const g = ctx.createLinearGradient(p.x, rootY, p.x - l * 0.1, rootY + side * l * 0.17);
      g.addColorStop(0, palette.base + 'e0'); g.addColorStop(1, palette.fin + '50');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(p.x + l * 0.025, rootY);
      ctx.bezierCurveTo(p.x - l * 0.035, rootY + side * l * 0.21, p.x - l * 0.16, rootY + side * l * .14, p.x - l * 0.19, rootY + side * l * 0.08);
      ctx.quadraticCurveTo(p.x - l * 0.13, rootY + side * l * 0.025, p.x + l * 0.025, rootY);
      ctx.fill();
      ctx.strokeStyle = palette.side + '65'; ctx.lineWidth = 0.45;
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.moveTo(p.x, rootY);
        ctx.quadraticCurveTo(p.x - i * l * 0.025, rootY + side * l * 0.07, p.x - l * (0.025 + i * 0.03), rootY + side * l * (0.16 - i * 0.013)); ctx.stroke();
      }
      ctx.restore();
      const pelvic = this.bodyPoint(fish, 0.27);
      ctx.save(); ctx.globalAlpha *= .77;
      ctx.translate(pelvic.x,pelvic.y);ctx.rotate(pelvic.angle+Math.sin((fish.finPhase??fish.phase)-.8)*.06);
      pelvic.x=0;pelvic.y=0;
      ctx.fillStyle = palette.fin + '90';
      ctx.beginPath(); ctx.moveTo(pelvic.x + 5, pelvic.y + side * pelvic.width * 0.7);
      ctx.quadraticCurveTo(pelvic.x - 6, pelvic.y + side * l * 0.13, pelvic.x - 13, pelvic.y + side * l * 0.105);
      ctx.lineTo(pelvic.x - 3, pelvic.y); ctx.fill();
      ctx.restore();
    }
  }

  patch(fish, u, offset, rx, ry, color, seed) {
    const ctx = this.ctx, points = [];
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      const r = 0.76 + Math.sin(i * 3.7 + seed * 9.3) * 0.17;
      const p = this.bodyPoint(fish, u + Math.cos(a) * rx * r / .78);
      const across = (offset + Math.sin(a) * ry * r) * fish.length;
      points.push({ x: p.x + p.nx * across, y: p.y + p.ny * across });
    }
    smoothPath(ctx, points); ctx.fillStyle = color; ctx.fill();
  }

  drawPattern(fish, palette) {
    if (fish.variant === 4) {
      this.patch(fish, 0.85, 0, 0.081, 0.075, palette.spot, fish.seed);
      return;
    }
    if (fish.variant === 3) {
      this.patch(fish, 0.17, 0, 0.08, 0.03, '#f3d885', 1);
      return;
    }
    this.patch(fish, 0.77, -0.014, 0.116, 0.145, palette.spot, fish.seed);
    this.patch(fish, 0.48, 0.018, 0.131, 0.118, palette.spot, fish.seed + 4);
    this.patch(fish, 0.22, -0.013, 0.08, 0.07, palette.spot, fish.seed + 8);
    if (fish.variant === 2 || fish.variant === 5) {
      this.patch(fish, 0.9, 0, 0.056, 0.049, palette.accent, fish.seed + 2);
      this.patch(fish, 0.57, -0.071, 0.045, 0.061, palette.accent, fish.seed + 1);
    }
    if (fish.variant === 1) this.patch(fish, 0.96, 0.01, 0.06, 0.06, '#f2dfbd', 2);
  }

  drawScales(fish) {
    const ctx = this.ctx, l = fish.length;
    ctx.lineWidth = 0.34;
    ctx.strokeStyle = fish.variant === 3 ? 'rgba(113,98,40,.25)' : 'rgba(76,89,66,.12)';
    for (let row = -2; row <= 2; row++) {
      for (let column = 2; column < 12; column++) {
        const u = column / 15 + (Math.abs(row) % 2) * 0.026;
        const p = this.bodyPoint(fish, u);
        const across = row * l * .035;
        ctx.beginPath(); ctx.ellipse(p.x+p.nx*across, p.y+p.ny*across, l * 0.023, l * 0.025, p.angle, -Math.PI * 0.5, Math.PI * 0.5); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,254,216,.4)'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for(let i=0;i<=12;i++){const p=this.bodyPoint(fish,.30+i*.034);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y)}
    ctx.stroke();
  }

  drawHead(fish, palette) {
    const ctx = this.ctx, l = fish.length;
    const p = this.bodyPoint(fish, 0.88);
    ctx.lineWidth = 0.65;
    for (const side of [-1, 1]) {
      ellipse(ctx, p.x + l * 0.01, p.y + side * l * 0.04, l * 0.0145, l * 0.018, palette.side);
      ellipse(ctx, p.x + l * 0.013, p.y + side * l * 0.04, l * 0.0085, l * 0.011, '#172f29');
      ellipse(ctx, p.x + l * 0.016, p.y + side * l * 0.039, l * 0.0025, l * 0.0032, '#e9eec9');
      const gill = this.bodyPoint(fish, 0.77);
      ctx.strokeStyle = 'rgba(75,92,65,.36)';
      ctx.beginPath(); ctx.moveTo(gill.x + l * 0.014, gill.y + side * l * 0.02);
      ctx.quadraticCurveTo(gill.x - l * 0.028, gill.y + side * l * 0.075, gill.x - l * 0.055, gill.y + side * l * 0.083); ctx.stroke();
      ctx.strokeStyle = palette.fin + 'cc';
      ctx.beginPath(); ctx.moveTo(l * 0.379, side * l * 0.014);
      ctx.quadraticCurveTo(l * 0.423, side * l * 0.024, l * 0.44, side * l * 0.057); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(109,82,50,.38)'; ctx.lineWidth = 0.55;
    ctx.beginPath(); ctx.moveTo(l * 0.387, -l * 0.016); ctx.quadraticCurveTo(l * 0.368, 0, l * 0.387, l * 0.016); ctx.stroke();
  }

  drawSkin(fish, surface) {
    const ctx=this.ctx, strips=this.options.skinStrips || (this.options.quality==='low'?18:Math.min(112,Math.max(36,Math.ceil(fish.length*.5))));
    // Follow each cross-section of the actual fish body, preserving the painted placement.
    for(let i=0;i<strips;i++){
      const u=(i+.5)/strips,p=this.bodyPoint(fish,u),dw=fish.length*.78/strips;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.drawImage(surface,i*surface.width/strips,0,surface.width/strips,surface.height,-dw*.5,-p.width,dw+.6,p.width*2);
      ctx.restore();
    }
  }
}
