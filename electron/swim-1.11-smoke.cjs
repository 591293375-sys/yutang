const { _electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '../../work/1.11');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const profile = fs.mkdtempSync(path.join(out, 'swim-profile-'));
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [root, `--user-data-dir=${profile}`],
    env: { ...process.env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5188/' },
  });
  try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForSelector('.pond-canvas');
    await page.evaluate(() => {
      localStorage.setItem('fusheng-settings', JSON.stringify({
        season: 'spring', weather: 'sunny', day: 'day', fishCount: 24,
        turtleCount: 4, quality: 'high', sound: false, fishSize: 1.3,
      }));
      const canvas = document.createElement('canvas');
      canvas.width = 512; canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff6df'; ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#e76c44'; ctx.fillRect(125, 20, 80, 80); ctx.fillRect(380, 0, 50, 90);
      localStorage.setItem('fusheng-fish', JSON.stringify(Array.from({ length: 12 }, (_, i) => ({
        id: `swim-${i}`, name: '测试锦鲤', texture: canvas.toDataURL(), size: .6 + i * .1, appearance: 'skin-v2',
      }))));
    });
    await page.reload();
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map(r => r.name).findLast(u => u.includes('/src/engine/pond.js'));
      const { PondEngine } = await import(url);
      const render = PondEngine.prototype.render;
      PondEngine.prototype.render = function (...args) { window.swimEngine = this; return render.apply(this, args); };
    });
    await page.waitForFunction(() => window.swimEngine?.sim.fish.length === 36 && [...window.swimEngine.images.values()].every(i => i.skin));
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
    await page.waitForFunction(() => window.swimEngine.canvas.width === 3840);

    const swimming = await page.evaluate(async () => {
      const e = window.swimEngine;
      const sample = () => e.sim.fish.map(f => ({
        x: f.x, y: f.y, phase: f.phase, velocity: f.velocity,
        amplitude: f.swimAmplitude, tail: e.bodyPoint(f, 0).y, bend: f.bodyBend,
      }));
      const before = sample();
      e.feed(e.width * .65, e.height * .4);
      await new Promise(resolve => setTimeout(resolve, 2000));
      const feeding = sample();
      e.sim.food.length = 0;
      await new Promise(resolve => setTimeout(resolve, 3500));
      const cruise = sample();
      e.updateOptions({ paused: true });
      const frozen = JSON.stringify(sample());
      await new Promise(resolve => setTimeout(resolve, 300));
      const pauseStable = frozen === JSON.stringify(sample());
      e.updateOptions({ paused: false });
      const average = (fish, key) => fish.reduce((sum, f) => sum + f[key], 0) / fish.length;
      return {
        beforeSpeed: average(before, 'velocity'), feedingSpeed: average(feeding, 'velocity'), cruiseSpeed: average(cruise, 'velocity'),
        beforeAmplitude: average(before, 'amplitude'), feedingAmplitude: average(feeding, 'amplitude'),
        movingTails: feeding.filter((f, i) => Math.abs(f.tail - before[i].tail) > .2).length,
        bendingBodies: feeding.filter(f => Math.abs(f.bend) > .05).length,
        phasesContinuous: feeding.every((f, i) => f.phase > before[i].phase), pauseStable,
      };
    });
    assert.ok(swimming.feedingSpeed > swimming.beforeSpeed * 1.2);
    assert.ok(swimming.cruiseSpeed < swimming.feedingSpeed * .8);
    assert.ok(swimming.feedingAmplitude > swimming.beforeAmplitude);
    assert.ok(swimming.movingTails > 28 && swimming.bendingBodies > 8);
    assert.ok(swimming.phasesContinuous && swimming.pauseStable);
    console.log(JSON.stringify({ swimming }));

    // Render enlarged poses with the production painter for visual inspection.
    const poses = await page.evaluate(async () => {
      const { KoiRenderer } = await import('/src/engine/koi-renderer.js');
      const e = window.swimEngine, canvas = document.createElement('canvas');
      canvas.width = 1440; canvas.height = 690;
      const ctx = canvas.getContext('2d'), painter = new KoiRenderer(ctx);
      painter.images = e.images;
      ctx.fillStyle = '#164a47'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const fish = e.sim.fish.find(f => f.custom);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 4; col++) {
          painter.drawFish({ ...fish, x: 190 + col * 350, y: 90 + row * 230, length: 270,
            variant: 0, width: .125, phase: col * Math.PI / 2, heading: 0,
            swimAmplitude: .075, bodyBend: row === 0 ? 0 : .7, depth: 1,
            custom: row === 2 ? fish.custom : null }, false);
        }
      }
      return canvas.toDataURL();
    });
    fs.writeFileSync(path.join(out, 'swim-poses.png'), Buffer.from(poses.split(',')[1], 'base64'));
    await page.screenshot({ path: path.join(out, 'pond-4k.png') });

    async function measure(name) {
      await page.waitForTimeout(1000);
      const result = await page.evaluate(() => new Promise(resolve => {
        const e = window.swimEngine, original = e.render, costs = [], intervals = [];
        e.render = function (...args) { const start = performance.now(); const result = original.apply(this, args); costs.push(performance.now() - start); return result; };
        let start, previous;
        function frame(t) {
          start ??= t;
          if (previous !== undefined) intervals.push(t - previous);
          previous = t;
          if (t - start < 6000) requestAnimationFrame(frame);
          else {
            e.render = original;
            costs.sort((a, b) => a - b); intervals.sort((a, b) => a - b);
            resolve({ ...e.getStats(), renderFPS: costs.length * 1000 / (t - start), rafFPS: intervals.length * 1000 / (t - start),
              drawP95: costs[Math.floor(costs.length * .95)], frameP95: intervals[Math.floor(intervals.length * .95)], slowFrames: intervals.filter(n => n > 33.5).length });
          }
        }
        requestAnimationFrame(frame);
      }));
      console.log(JSON.stringify({ name, ...result }));
      return { name, ...result };
    }
    const performance = [await measure('4k-sunny-36-fish-4-turtles')];
    await page.evaluate(() => window.swimEngine.updateOptions({ weather: 'stormy' }));
    performance.push(await measure('4k-storm-36-fish-4-turtles'));
    assert.ok(performance.every(p => p.renderFPS >= 50 && p.width === 3840 && p.height === 2160));
    await page.evaluate(() => window.swimEngine.updateOptions({ quality: 'low' }));
    performance.push(await measure('energy-saving-36-fish'));
    assert.ok(performance.at(-1).renderFPS >= 27 && performance.at(-1).renderFPS < 32);
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'swim-check.json'), JSON.stringify({ result: 'PASS', swimming, performance, errors }, null, 2));
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
