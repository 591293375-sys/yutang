'use strict';
const { _electron } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function measureFrames(page) {
  // No screenshots, readbacks or artificial animation loops in the timed run.
  return page.evaluate(() => new Promise(resolve => {
    const intervals = []; let start, previous;
    function sample(time) {
      if (start === undefined) start = time;
      if (previous !== undefined) intervals.push(time - previous);
      previous = time;
      if (time - start < 10000) requestAnimationFrame(sample);
      else {
        intervals.sort((a, b) => a - b);
        const canvas = document.querySelector('.pond-canvas');
        resolve({ fps: intervals.length * 1000 / (time - start),
          p95: intervals[Math.floor(intervals.length * .95)],
          slowFrames: intervals.filter(n => n > 33.5).length,
          pixels: [canvas.width, canvas.height],
          backgroundPixels: [document.querySelector('.living-background').getContext('webgl').drawingBufferWidth, document.querySelector('.living-background').getContext('webgl').drawingBufferHeight] });
      }
    }
    requestAnimationFrame(sample);
  }));
}

async function smoke() {
  const root = path.resolve(__dirname, '..');
  const executablePath = process.env.POND_TEST_EXECUTABLE || path.join(root, 'release/mac-arm64/浮生锦鲤池.app/Contents/MacOS/浮生锦鲤池');
  const work = path.resolve(root, '../../work');
  fs.mkdirSync(work, { recursive: true });
  const profile = fs.mkdtempSync(path.join(work, 'packaged-smoke-profile-'));
  const app = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`], timeout: 30000 });
  let closed = false;
  try {
    const page = await app.firstWindow();
    await page.waitForSelector('.pond-canvas');
    const runtime = await app.evaluate(({ app, BrowserWindow }) => ({
      packaged: app.isPackaged, version: app.getVersion(), arch: process.arch, userData: app.getPath('userData'),
      preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
    }));
    assert.equal(runtime.packaged, true);
    assert.equal(runtime.version, require('../package.json').version);
    assert.equal(runtime.arch, 'arm64');
    assert.equal(runtime.userData, profile, 'Packaged smoke must use its own local profile.');
    assert.equal(runtime.preferences.sandbox, true);
    assert.equal(runtime.preferences.contextIsolation, true);
    assert.equal(runtime.preferences.nodeIntegration, false);
    const state = await page.evaluate(() => window.pondDesktop.getState());
    assert.equal(state.desktopSupported, true);
    assert.equal(state.globalInteraction, false);
    assert.equal(state.globalInteractionStatus, 'disabled');
    await page.evaluate(() => {
      const settings = JSON.parse(localStorage.getItem('fusheng-settings') || '{}');
      localStorage.setItem('fusheng-settings', JSON.stringify({ ...settings,
        fishCount: 24, turtleCount: 4, fishSize: 1, quality: 'high', reducedMotion: false, season: 'autumn', weather: 'sunny', day: 'day' }));
    });
    await page.reload();
    await page.getByText(/4 只小乌龟/).waitFor();
    await page.getByRole('button',{name:'画锦鲤',exact:true}).click();
    assert.equal(await page.getByRole('slider',{name:'新锦鲤大小'}).inputValue(), '1');
    const bodyPixels=await page.getByLabel('锦鲤绘画画布').evaluate(c=>c.getContext('2d').getImageData(640,320,1,1).data[3]);
    assert.ok(bodyPixels>0,'Packaged anatomical preview must render');
    await page.getByRole('button',{name:'关闭面板',exact:true}).click();
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    const labels = await page.locator('.dock button span').evaluateAll(items=>items.map(el=>({text:el.textContent,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,available:el.parentElement.clientWidth-6})));
    assert.equal(labels.length,6);
    assert.ok(labels.every(l=>l.height<23&&l.width<=l.available),'All six home tools have single-line mobile labels');
    await page.screenshot({path:path.join(work,'packaged-mobile-1.11.png')});
    await client.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false });
    await page.waitForFunction(() => document.querySelector('.pond-canvas')?.width === 3840);
    const backgrounds = await page.evaluate(async () => Promise.all(['pond.png', 'spring.png', 'autumn.png', 'winter.png'].map(async (name) => {
      const image = new Image();
      image.src = new URL(`./assets/${name}`, location.href).href;
      await image.decode();
      return { name, width: image.naturalWidth, height: image.naturalHeight };
    })));
    assert.equal(backgrounds.every((image) => image.width === 3840 && image.height === 2160), true, 'All four packaged seasonal backgrounds must decode at exactly 3840 × 2160.');
    const sounds = await page.evaluate(async () => Promise.all([...document.querySelectorAll('audio')].map(async media => {
      await new Promise((resolve,reject)=>{
        media.addEventListener('canplay',resolve,{once:true});
        media.addEventListener('error',()=>reject(new Error('Bundled audio failed to decode')),{once:true});
        media.preload='auto';media.load();
      });
      return {id:media.dataset.ambient,duration:media.duration,loop:media.loop,offline:media.currentSrc.startsWith('file:')};
    })));
    assert.equal(sounds.length,5);assert.ok(sounds.every(s=>s.offline&&s.duration>15));
    assert.equal(sounds.find(s=>s.id==='stream').duration,120);
    assert.equal(sounds.find(s=>s.id==='ocean').duration,90);
    assert.equal(sounds.find(s=>s.id==='thunder').loop,false);
    assert.equal(sounds.find(s=>s.id==='wind').loop,false);
    await page.waitForFunction(()=>document.querySelector('.living-background').style.opacity==='1');
    await page.getByRole('button',{name:'打开天气设置',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'薄雾',exact:true}).count(),0);
    await page.getByRole('button',{name:'雷雨',exact:true}).click();
    await page.getByRole('button',{name:'关闭面板',exact:true}).click();
    const windowPerformance = await measureFrames(page);
    assert.deepEqual(windowPerformance.pixels, [3840, 2160]);
    assert.deepEqual(windowPerformance.backgroundPixels, windowPerformance.pixels);
    assert.ok(windowPerformance.fps > 45, `4K animation stalled: ${windowPerformance.fps.toFixed(1)} FPS`);
    await page.screenshot({ path: path.join(work, 'packaged-window-preview.png') });
    await page.getByRole('button',{name:'桌面模式',exact:true}).click();
    await page.waitForFunction(async () => (await window.pondDesktop.getState()).desktopMode);
    const desktop = await page.evaluate(() => window.pondDesktop.getState());
    assert.equal(desktop.desktopMode, true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.hud')).visibility === 'hidden');
    const firstFrame = await page.evaluate(() => document.querySelector('.pond-canvas').toDataURL());
    await page.waitForTimeout(850);
    assert.equal(await page.evaluate(() => document.hidden), false);
    const secondFrame = await page.evaluate(() => document.querySelector('.pond-canvas').toDataURL());
    assert.notEqual(firstFrame, secondFrame, 'Fish should continue rendering at desktop level.');
    const window = await app.evaluate(({ BrowserWindow, screen }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return { bounds: win.getBounds(), primary: screen.getPrimaryDisplay().bounds, focusable: win.isFocusable() };
    });
    assert.deepEqual(window.bounds, window.primary);
    assert.equal(window.focusable, false);
    await page.waitForFunction(() => Math.max(document.querySelector('.pond-canvas').width, document.querySelector('.pond-canvas').height) >= 3840);
    const desktopPerformance = await measureFrames(page);
    assert.deepEqual(desktopPerformance.backgroundPixels, desktopPerformance.pixels);
    assert.ok(desktopPerformance.fps > 45, `Desktop animation stalled: ${desktopPerformance.fps.toFixed(1)} FPS`);
    await page.screenshot({ path: path.join(work, 'packaged-desktop-preview.png') });
    await page.evaluate(() => window.pondDesktop.feed());
    const restored = await page.evaluate(() => window.pondDesktop.showControls());
    assert.equal(restored.desktopMode, false);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.hud')).visibility === 'visible');
    assert.equal((await page.evaluate(() => window.pondDesktop.getState())).globalInteraction, false);
    const exited = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => { setImmediate(() => BrowserWindow.getAllWindows()[0].close()); });
    await exited; closed = true;
    console.log(JSON.stringify({ result: 'PASS', nativeCloseExits:true, version: runtime.version, packaged: runtime.packaged, anatomyPreview:true, turtles:4, architecture: runtime.arch,
      desktopSupported: state.desktopSupported, animationWhileOnDesktop: true, isolatedProfile: profile,
      seasonalBackgrounds: backgrounds,
      sounds,
      windowPerformance, desktopPerformance,
      screenshots: ['packaged-window-preview.png', 'packaged-desktop-preview.png'] }, null, 2));
  } finally {
    if (!closed) await app.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
smoke().catch((error) => { console.error(error); process.exitCode = 1; });
