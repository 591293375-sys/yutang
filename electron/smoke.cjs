'use strict';
// Run with: electron electron/smoke.cjs
// Uses isolated user data, a local inert HTML fixture, and no OS permission prompts.
const { app, BrowserWindow, screen } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pond-smoke-'));
app.setPath('userData', userData);
let server;
const timeout = setTimeout(() => { console.error('Desktop smoke timed out.'); app.exit(1); }, 20000);
function cleanup(code) {
  clearTimeout(timeout);
  server?.close();
  // Normal app shutdown cleans up shortcuts, tray and native listeners.
  process.exitCode = code;
  app.quit();
}

server = http.createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"><title>Pond smoke</title></head><body>Pond desktop integration test</body></html>');
});
server.listen(0, '127.0.0.1', () => {
  process.env.VITE_DEV_SERVER_URL = `http://127.0.0.1:${server.address().port}/`;
  app.once('browser-window-created', (_event, win) => {
    win.webContents.once('did-finish-load', async () => {
      try {
        const js = (source) => win.webContents.executeJavaScript(source);
        const initial = await js('window.pondDesktop.getState()');
        assert.equal(initial.desktopMode, false);
        assert.equal(initial.globalInteraction, false);
        assert.equal(initial.globalInteractionStatus, 'disabled');
        assert.equal(await js('typeof require'), 'undefined');
        assert.equal(await js('typeof process'), 'undefined');
        assert.equal(await js("window.pondDesktop.setGlobalInteraction('false').then(() => false, () => true)"), true);
        assert.equal((await js('window.pondDesktop.getState()')).globalInteraction, false);
        const original = win.getBounds();
        if (process.platform === 'darwin') {
          assert.equal(initial.desktopSupported, true, 'Build the macOS native module before running the smoke test.');
          const desktop = await js('window.pondDesktop.setDesktopMode(true)');
          assert.equal(desktop.desktopMode, true);
          assert.equal(win.isFocusable(), false);
          assert.deepEqual(win.getBounds(), screen.getPrimaryDisplay().bounds);
          assert.equal(win.isVisibleOnAllWorkspaces(), true);
          const normal = await js('window.pondDesktop.showControls()');
          assert.equal(normal.desktopMode, false);
          assert.equal(win.isFocusable(), true);
          assert.deepEqual(win.getBounds(), original);
        }
        assert.equal(await js("window.open('https://example.com') === null"), true);
        assert.equal(BrowserWindow.getAllWindows().length, 1);
        win.close();
        assert.equal(win.isDestroyed(), false);
        assert.equal(win.isVisible(), false);
        await js('window.pondDesktop.showControls()');
        assert.equal(win.isVisible(), true);
        console.log('PASS: safe preload, validated IPC, native desktop placement, primary-display bounds, click-through focus, restore, popup denial, and tray-close lifecycle.');
        cleanup(0);
      } catch (error) { console.error(error); cleanup(1); }
    });
  });
  require('./main.cjs');
});

app.on('quit', () => {
  // Chromium may still have file handles open; cleanup is best effort.
  try { fs.rmSync(userData, { recursive: true, force: true }); } catch { /* temporary data only */ }
});
