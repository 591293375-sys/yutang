// Existing Electron/Playwright stack; every test uses a disposable local profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron } = require('@playwright/test');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
const report = { checks: [], errors: [] };
const output = process.env.CAIYUAN_QA_OUTPUT || path.join(root, 'test-results/caiyuan');

function observe() {
  window.cyRuntime = () => {
    const node = document.querySelector('.caiyuan-stage');
    let fiber = node?.[Object.keys(node).find(k => k.startsWith('__reactFiber$'))];
    for (let i = 0; fiber && i < 30; fiber = fiber.return, i++) {
      for (let hook = fiber.memoizedState, j = 0; hook && j < 30; hook = hook.next, j++) {
        const runtime = hook.memoizedState?.current;
        if (runtime?.model && runtime?.renderer) return runtime;
      }
    }
  };
}

(async () => {
  const profile = fs.mkdtempSync('/tmp/caiyuan-edge-');
  let app, page;
  try {
    app = await _electron.launch({ executablePath: electron, args: [root, '--user-data-dir=' + profile], env: { ...process.env, VITE_DEV_SERVER_URL: process.env.CAIYUAN_QA_URL || 'http://127.0.0.1:5188/' } });
    page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => report.errors.push(e.message));
    await page.waitForSelector('.pond-canvas');
    await page.evaluate(() => { localStorage.setItem('mofish-theme', JSON.stringify('caiyuan')); localStorage.setItem('fusheng-settings', JSON.stringify({ sound: false, volume: .18 })); });
    await page.reload();
    await page.waitForSelector('.caiyuan-stage');
    await page.evaluate(observe);
    await page.waitForFunction(() => cyRuntime()?.renderer.stats().loaded >= 11);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900));
    const state = () => page.evaluate(() => cyRuntime().model.snapshot());
    const close = async () => { if (await page.getByRole('button', { name: '关闭面板', exact: true }).count()) await page.getByRole('button', { name: '关闭面板', exact: true }).click(); };
    const dock = async name => { await close(); await page.getByRole('navigation', { name: '财源广进工具栏' }).getByRole('button', { name, exact: true }).click(); };
    const point = kind => page.evaluate(async kind => { const r = cyRuntime(), item = r.model.state.items.find(i => i.kind === kind && !i.stored), { bounds } = await import('/src/themes/caiyuan/geometry.js'), b = bounds(item), t = r.renderer.t; return { id: item.id, x: t.x + (b.x + b.w * .5) * t.width, y: t.y + (b.y + b.h * .58) * t.height }; }, kind);

    // Invalid dragging and focus loss must never commit an invisible placement.
    await dock('布置');
    await page.getByRole('button', { name: '进入布置 · 拖动摆件', exact: true }).click();
    const before = await state(), p = await point('fruit');
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 50, 300, { steps: 10 }); await page.mouse.up();
    assert.deepEqual((await state()).items, before.items);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 50, p.y, { steps: 10 });
    assert.ok(await page.evaluate(() => cyRuntime().renderer.drag));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up(); await page.mouse.move(p.x + 90, p.y);
    assert.equal(await page.evaluate(() => cyRuntime().renderer.drag), null);
    assert.deepEqual((await state()).items, before.items);
    await page.keyboard.press('Escape');
    report.checks.push('invalid drag returns to original position; lost focus cancels drag without saving');

    // Instrument writes/voices/draws in this isolated test only.
    await page.evaluate(() => {
      window.cyWrites = 0; const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) { if (key === 'mofish-caiyuan-v1') window.cyWrites++; return write.call(this, key, value); };
      window.cyVoices = new Set(); const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { if (this.src.includes('/cats/audio/')) cyVoices.add(this); return play.call(this); };
      const r = cyRuntime(), draw = r.renderer.draw.bind(r.renderer); r.draws = 0;
      r.renderer.draw = (...args) => { r.draws++; return draw(...args); };
    });
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(() => cyWrites), 0);
    await dock('设置');
    await page.locator('.toggle-row').filter({ has: page.getByText('阁内声音', { exact: true }) }).click();
    await close();
    await page.waitForFunction(() => [...cyVoices].some(a => a.src.includes('temple-breeze') && !a.paused));
    assert.ok(await page.evaluate(() => [...cyVoices].every(a => a.volume >= 0 && a.volume <= .12)));
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
    await page.waitForFunction(() => [...cyVoices].every(a => a.paused));
    const stopped = await page.evaluate(() => cyRuntime().draws);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => cyRuntime().draws), stopped);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].show(); BrowserWindow.getAllWindows()[0].focus(); });
    await page.waitForFunction(old => cyRuntime().draws > old, stopped);
    report.checks.push('no per-frame storage writes; quiet recorded wind plays; hidden window stops audio and rendering, then resumes');

    await dock('设置'); await page.getByRole('button', { name: /暂停片刻/ }).click();
    await page.getByRole('button', { name: '夜晚', exact: true }).click();
    assert.equal(await page.evaluate(() => cyRuntime().renderer.currentNight), 1);
    await page.getByRole('button', { name: /继续静赏/ }).click(); await close();
    report.checks.push('environment changes remain visible while motion is paused');

    // Time-fixture checks use the production model/renderer, not a long real-time wait.
    const geometry = await page.evaluate(async () => {
      const r = cyRuntime(), { incenseGeometry, lampAnchor } = await import('/src/themes/caiyuan/geometry.js'), b = r.model.state.items[0];
      r.command('ignite', { id: b.id, minutes: 3 });
      const full = incenseGeometry(b, 0); b.incense.startedAt = Date.now() - 90000;
      const halfway = incenseGeometry(b, r.model.incense().progress);
      r.command('move', { id: b.id, x: .54, y: .87 }); r.command('scale', { id: b.id, scale: .8 });
      const moved = incenseGeometry(b, r.model.incense().progress), lamp = r.model.state.items.find(i => i.kind === 'lamp'), first = lampAnchor(lamp);
      r.command('move', { id: lamp.id, x: lamp.x + .025, y: lamp.y }); const second = lampAnchor(lamp);
      b.incense.startedAt = Date.now() - 180001; r.model.tick(Date.now()); r.model.tick(Date.now());
      return { full, halfway, moved, first, second, status: r.model.incense().status, completeEvents: r.model.events.filter(e => e === 'complete').length };
    });
    assert.equal(geometry.full[0].baseY, geometry.halfway[0].baseY);
    assert.ok(geometry.halfway[0].tipY > geometry.full[0].tipY);
    assert.ok(geometry.moved[1].x > geometry.full[1].x);
    assert.ok(Math.abs(geometry.second.x - geometry.first.x - .025) < 1e-8);
    assert.equal(geometry.status, 'spent'); assert.equal(geometry.completeEvents, 1);
    report.checks.push('accelerated clock: incense shortens from top, expires once; flame and incense anchors follow move/scale');

    // Actual desktop mode + existing IPC pointer delivery; no accessibility permission changes.
    const desktop = await page.evaluate(() => pondDesktop.setDesktopMode(true));
    if (desktop.desktopMode) {
      await page.waitForTimeout(500); const burner = await point('burner');
      await app.evaluate(({ BrowserWindow }, p) => BrowserWindow.getAllWindows()[0].webContents.send('pond:pointer', { type: 'feed', x: p.x, y: p.y }), burner);
      await page.getByRole('dialog', { name: '三炷清香，片刻从容' }).waitFor({ state: 'visible' });
      assert.equal((await page.evaluate(() => pondDesktop.getState())).desktopMode, false);
      await close(); report.checks.push('desktop global-click bridge restores the existing focusable window before opening an editable panel');
    } else report.desktopLimitation = desktop.message;

    await page.evaluate(() => { window.finishedCy = cyRuntime(); window.cyVoiceRefs = [...cyVoices]; });
    await page.getByRole('button', { name: '切换主题', exact: true }).click();
    await page.locator('.theme-card').filter({ has: page.getByText('锦鲤池', { exact: true }) }).click();
    await page.waitForSelector('.theme-koi .pond-canvas');
    const endDraws = await page.evaluate(() => finishedCy.draws);
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => finishedCy.draws), endDraws);
    assert.equal(await page.evaluate(() => finishedCy.renderer.dead), true);
    assert.ok(await page.evaluate(() => cyVoiceRefs.every(a => a.paused)));
    assert.deepEqual(report.errors, []);
    report.checks.push('theme unmount stops old draw calls and every previously tracked caiyuan voice');
    report.result = 'PASS'; console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    report.result = 'FAIL'; report.failure = error.stack; console.error(error); process.exitCode = 1;
    if (page) console.error(await page.locator('body').innerText().catch(() => ''));
  } finally {
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'edge-report.json'), JSON.stringify(report, null, 2));
    if (app) await app.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
})();
