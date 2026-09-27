'use strict';
// Original vector art is rendered to the standard macOS iconset sizes.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

app.whenReady().then(async () => {
  const assets = path.join(__dirname, 'assets');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pond-icon-'));
  const iconset = path.join(temp, 'Pond.iconset');
  fs.mkdirSync(iconset);
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(assets, 'app-icon.svg'));
    const bitmap = await win.webContents.capturePage();
    // capturePage uses device scale; normalize every icon directly from the source.
    fs.writeFileSync(path.join(assets, 'app-icon.png'), bitmap.resize({ width: 1024, height: 1024, quality: 'best' }).toPNG());
    for (const size of [16, 32, 128, 256, 512]) {
      for (const factor of [1, 2]) {
        const name = `icon_${size}x${size}${factor === 2 ? '@2x' : ''}.png`;
        fs.writeFileSync(path.join(iconset, name), bitmap.resize({ width: size * factor, height: size * factor, quality: 'best' }).toPNG());
      }
    }
    const result = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'app-icon.icns')], { stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) throw result.error || new Error('iconutil failed.');
    console.log('Created app-icon.icns and app-icon.png from original vector art.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { win.destroy(); fs.rmSync(temp, { recursive: true, force: true }); app.quit(); }
});
