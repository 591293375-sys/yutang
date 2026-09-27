'use strict';
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, globalShortcut, ipcMain, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { allowedEntry, requireBoolean, pointForBounds, parseHelperLine, displayMetrics } = require('./policy.cjs');

app.setName('浮生锦鲤池');
const SHORTCUT = 'CommandOrControl+Shift+K';
const FEED_SHORTCUT = 'CommandOrControl+Shift+F';
const isMac = process.platform === 'darwin';
const WINDOW_MIN = [560, 420];
let windowTransition = Promise.resolve();
let pondWindow, tray, nativeWindow, normalBounds, cursorTimer, permissionTimer, pointerProcess;
let quitting = false;
let globalGeneration = 0;
let lastCursor = '';
let nativeError = '';
let state = {
  isDesktop: true, desktopMode: false, globalInteraction: false,
  globalInteractionStatus: 'disabled', launchAtLogin: false,
  launchAtLoginSupported: app.isPackaged && ['darwin', 'win32'].includes(process.platform),
  platform: process.platform, desktopSupported: false,
  shortcut: SHORTCUT, feedShortcut: FEED_SHORTCUT,
  shortcutAvailable: false, feedShortcutAvailable: false,
  message: '窗口内点击即可投喂。桌面模式可从菜单栏锦鲤图标恢复。',
};

const nativeDir = app.isPackaged ? path.join(process.resourcesPath, 'native') : path.join(__dirname, 'native', 'bin');
const pointerPath = path.join(nativeDir, 'pond-pointer');
let entryURL = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href;
if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
  const candidate = new URL(process.env.VITE_DEV_SERVER_URL);
  if (candidate.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname) || candidate.username || candidate.password || candidate.pathname !== '/') {
    throw new Error('Development UI must use a loopback HTTP origin and root path.');
  }
  entryURL = candidate.href;
}

function currentState() {
  const display = state.desktopMode || !pondWindow || pondWindow.isDestroyed()
    ? screen.getPrimaryDisplay() : screen.getDisplayMatching(pondWindow.getBounds());
  return { ...state, fullScreen: !!pondWindow?.isFullScreen(), visible: !!pondWindow?.isVisible(), minimized: !!pondWindow?.isMinimized(), display: displayMetrics(display) };
}
function publish() {
  if (pondWindow && !pondWindow.isDestroyed()) pondWindow.webContents.send('pond:state', currentState());
  updateTray();
  return currentState();
}
function describeInteraction() {
  if (state.globalInteractionStatus === 'active') return '全局点击投喂已开启，仅监听鼠标左键；不读取键盘内容。';
  if (state.globalInteractionStatus === 'awaiting-permission') return '请在系统设置 → 隐私与安全性 → 辅助功能中允许本应用，然后返回；也可继续使用托盘或快捷键投喂。';
  if (state.globalInteractionStatus === 'error') return '系统未允许鼠标监听。可在系统设置检查辅助功能／输入监控，或使用托盘和快捷键投喂。';
  if (state.globalInteractionStatus === 'unavailable') return '此版本无法监听全局点击。桌面中可使用托盘或投喂快捷键。';
  return state.desktopMode ? '桌面已开启鼠标穿透。移动鼠标可与鱼互动；投喂请用托盘或 ⌘/Ctrl+Shift+F。' : '窗口内点击即可投喂。桌面模式可从菜单栏锦鲤图标恢复。';
}

function sendPointer(type, point, source, fallbackCenter = false) {
  if (!pondWindow || pondWindow.isDestroyed()) return;
  const bounds = pondWindow.getContentBounds();
  let mapped = pointForBounds(point, bounds);
  if (!mapped && fallbackCenter) mapped = { x: bounds.width / 2, y: bounds.height / 2, normalizedX: 0.5, normalizedY: 0.5 };
  if (mapped) pondWindow.webContents.send('pond:pointer', { type, ...mapped, source, timestamp: Date.now() });
}
function cursorPoint() {
  try { return screen.getCursorScreenPoint(); } catch { return { x: Number.NaN, y: Number.NaN }; }
}
function feed(source = 'tray') { sendPointer('feed', cursorPoint(), source, true); }

function applyDesktopMode(enabled) {
  requireBoolean(enabled);
  if (!pondWindow || pondWindow.isDestroyed()) return currentState();
  if (enabled && !state.desktopSupported) {
    state.message = nativeError || '此平台暂不支持原生桌面层；可以继续使用窗口或全屏预览。';
    return publish();
  }
  if (state.desktopMode === enabled) return currentState();
  let placementError = '';
  if (enabled) {
    normalBounds = pondWindow.getNormalBounds();
    pondWindow.setMinimumSize(1, 1);
    pondWindow.setResizable(false);
    pondWindow.setMovable(false);
    pondWindow.setFullScreenable(false);
    pondWindow.setAlwaysOnTop(false);
    pondWindow.setHasShadow(false);
    pondWindow.setSkipTaskbar(true);
    if (isMac) {
      pondWindow.setWindowButtonVisibility(false);
      pondWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
      pondWindow.setHiddenInMissionControl(true);
    }
    pondWindow.setBounds(screen.getPrimaryDisplay().bounds, false);
    pondWindow.setIgnoreMouseEvents(true, { forward: true });
    pondWindow.setFocusable(false);
    pondWindow.blur();
    pondWindow.showInactive();
    try { nativeWindow.setDesktopLevel(pondWindow.getNativeWindowHandle(), true); }
    catch (error) { placementError = `桌面层切换失败：${error.message}`; }
    if (isMac) app.dock.hide();
  } else {
    if (isMac) {
      try { nativeWindow?.setDesktopLevel(pondWindow.getNativeWindowHandle(), false); } catch { /* Restore the ordinary window controls even if the addon failed. */ }
      pondWindow.setVisibleOnAllWorkspaces(false);
      pondWindow.setHiddenInMissionControl(false);
      pondWindow.setWindowButtonVisibility(true);
      app.dock.show();
    }
    pondWindow.setIgnoreMouseEvents(false);
    pondWindow.setFocusable(true);
    pondWindow.setSkipTaskbar(false);
    pondWindow.setResizable(true);
    pondWindow.setMovable(true);
    pondWindow.setFullScreenable(true);
    pondWindow.setHasShadow(true);
    if (normalBounds) pondWindow.setBounds(normalBounds);
    pondWindow.setMinimumSize(...WINDOW_MIN);
    pondWindow.show();
    pondWindow.focus();
  }
  state.desktopMode = enabled;
  if (placementError) {
    applyDesktopMode(false);
    state.desktopSupported = false;
    nativeError = placementError;
    state.message = `${placementError}，已恢复窗口。`;
    return publish();
  }
  lastCursor = '';
  state.message = describeInteraction();
  return publish();
}

// macOS fullscreen changes Spaces asynchronously. Queue transitions so entering
// desktop mode cannot race a pending fullscreen animation or a second click.
function transitionWindow(action) {
  const result = windowTransition.then(action);
  windowTransition = result.catch(() => {});
  return result;
}
function changeFullScreen(enabled) {
  if (!pondWindow || pondWindow.isDestroyed() || pondWindow.isFullScreen() === enabled) return Promise.resolve();
  const win = pondWindow;
  return new Promise((resolve, reject) => {
    const event = enabled ? 'enter-full-screen' : 'leave-full-screen';
    const cleanup = () => { clearTimeout(timer); win.removeListener(event, done); win.removeListener('closed', closed); };
    const done = () => { cleanup(); resolve(); };
    const closed = () => { cleanup(); reject(new Error('Window closed during fullscreen transition.')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Fullscreen transition timed out.')); }, 6000);
    win.once(event, done); win.once('closed', closed);
    win.setFullScreen(enabled);
  });
}
function setDesktopMode(enabled) {
  requireBoolean(enabled);
  return transitionWindow(async () => {
    if (enabled) await changeFullScreen(false);
    return applyDesktopMode(enabled);
  });
}
function setFullScreen(enabled) {
  requireBoolean(enabled);
  return transitionWindow(async () => {
    if (state.desktopMode) applyDesktopMode(false);
    if (pondWindow?.isMinimized()) pondWindow.restore();
    pondWindow?.show();
    await changeFullScreen(enabled);
    return publish();
  });
}
function hideWindow() {
  pondWindow?.hide();
  return publish();
}

function showControls() {
  if (!pondWindow || pondWindow.isDestroyed()) createWindow();
  applyDesktopMode(false);
  if (pondWindow.isMinimized()) pondWindow.restore();
  pondWindow.show();
  pondWindow.focus();
  return currentState();
}

function stopPointerHelper() {
  globalGeneration += 1;
  clearInterval(permissionTimer);
  permissionTimer = undefined;
  if (pointerProcess) { pointerProcess.kill('SIGTERM'); pointerProcess = undefined; }
}
function startPointerHelper() {
  if (pointerProcess || !state.globalInteraction) return;
  clearInterval(permissionTimer);
  permissionTimer = undefined;
  const generation = globalGeneration;
  let pending = '';
  pointerProcess = spawn(pointerPath, [], { stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true });
  pointerProcess.stdout.setEncoding('utf8');
  pointerProcess.stdout.on('data', (chunk) => {
    if (generation !== globalGeneration) return;
    pending += chunk;
    if (pending.length > 16384) { pending = ''; return; }
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const data = parseHelperLine(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      if (!data) continue;
      if (data.event === 'ready' || data.event === 'denied') {
        state.globalInteractionStatus = data.event === 'ready' ? 'active' : 'error';
        state.message = describeInteraction();
        publish();
      } else if (state.desktopMode && state.globalInteractionStatus === 'active') {
        sendPointer('feed', data, 'global-click');
      }
    }
  });
  const failed = () => {
    if (generation !== globalGeneration || !state.globalInteraction) return;
    pointerProcess = undefined;
    state.globalInteractionStatus = 'error';
    state.message = describeInteraction();
    publish();
  };
  pointerProcess.on('error', failed);
  pointerProcess.on('exit', failed);
}
function setGlobalInteraction(enabled) {
  requireBoolean(enabled);
  stopPointerHelper();
  state.globalInteraction = enabled;
  if (!enabled) state.globalInteractionStatus = 'disabled';
  else if (!isMac || !fs.existsSync(pointerPath)) state.globalInteractionStatus = 'unavailable';
  else if (systemPreferences.isTrustedAccessibilityClient(true)) {
    state.globalInteractionStatus = 'awaiting-permission';
    startPointerHelper();
  } else {
    state.globalInteractionStatus = 'awaiting-permission';
    permissionTimer = setInterval(() => {
      if (state.globalInteraction && systemPreferences.isTrustedAccessibilityClient(false)) startPointerHelper();
    }, 1500);
  }
  state.message = describeInteraction();
  return publish();
}
function setLaunchAtLogin(enabled) {
  requireBoolean(enabled);
  if (!state.launchAtLoginSupported) {
    state.message = '登录时启动仅在已安装的 macOS／Windows 应用中可用。';
    return publish();
  }
  try {
    app.setLoginItemSettings({ openAtLogin: enabled });
    state.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    state.message = state.launchAtLogin === enabled ? (enabled ? '已设为登录时启动。' : '已关闭登录时启动。') : '系统没有接受登录启动设置；可在系统设置 → 通用 → 登录项中手动管理。';
  } catch { state.message = '系统未能更新登录项；可在系统设置中手动管理。'; }
  return publish();
}

function makeTrayIcon() {
  const size = 22;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const body = ((x - 9) / 6) ** 2 + ((y - 11) / 3.4) ** 2 <= 1;
    const tail = x >= 14 && x <= 19 && Math.abs(y - 11) <= (x - 13) * 0.65;
    const eye = (x - 6) ** 2 + (y - 10) ** 2 < 1.6;
    if ((body || tail) && !eye) bitmap[(y * size + x) * 4 + 3] = 255;
  }
  const icon = nativeImage.createFromBitmap(bitmap, { width: size, height: size });
  if (isMac) icon.setTemplateImage(true);
  return icon;
}
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '浮生锦鲤池', enabled: false },
    { type: 'separator' },
    { label: '打开池塘控制台', accelerator: SHORTCUT, click: showControls },
    { label: '融入桌面', type: 'checkbox', checked: state.desktopMode, enabled: state.desktopSupported, click: (item) => setDesktopMode(item.checked) },
    { label: '隐藏池塘窗口', click: hideWindow },
    { label: '投喂一把鱼食', accelerator: FEED_SHORTCUT, click: () => feed('tray') },
    { type: 'separator' },
    { label: '全局点击投喂（需系统授权）', type: 'checkbox', checked: state.globalInteraction, enabled: isMac && fs.existsSync(pointerPath), click: (item) => setGlobalInteraction(item.checked) },
    { label: '登录时启动', type: 'checkbox', checked: state.launchAtLogin, enabled: state.launchAtLoginSupported, click: (item) => setLaunchAtLogin(item.checked) },
    { type: 'separator' },
    { label: '退出锦鲤池', click: () => app.quit() },
  ]));
}

function registerIPC() {
  const handle = (channel, action) => ipcMain.handle(channel, (event, ...args) => {
    if (!pondWindow || event.sender !== pondWindow.webContents || event.senderFrame !== pondWindow.webContents.mainFrame || !allowedEntry(event.senderFrame.url, entryURL)) {
      throw new Error('Untrusted IPC sender.');
    }
    return action(...args);
  });
  handle('pond:get-state', currentState);
  handle('pond:set-desktop-mode', setDesktopMode);
  handle('pond:set-global-interaction', setGlobalInteraction);
  handle('pond:set-launch-at-login', setLaunchAtLogin);
  handle('pond:feed', () => feed('tray'));
  handle('pond:show-controls', showControls);
  handle('pond:set-full-screen', setFullScreen);
  handle('pond:hide', hideWindow);
  handle('pond:minimize', () => { pondWindow.minimize(); return publish(); });
  handle('pond:quit', () => { setImmediate(() => app.quit()); });
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  pondWindow = new BrowserWindow({
    width: Math.min(1380, workArea.width - 60), height: Math.min(900, workArea.height - 70),
    minWidth: WINDOW_MIN[0], minHeight: WINDOW_MIN[1], show: false, frame: true,
    resizable: true, movable: true, fullscreenable: true, minimizable: true, closable: true,
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 20 } } : {}),
    title: '浮生锦鲤池', backgroundColor: '#1d302e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true,
      nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false, navigateOnDragDrop: false, backgroundThrottling: false,
    },
  });
  pondWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pondWindow.webContents.on('will-navigate', (event, url) => { if (!allowedEntry(url, entryURL)) event.preventDefault(); });
  pondWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  pondWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  pondWindow.webContents.session.setPermissionCheckHandler(() => false);
  pondWindow.webContents.on('did-finish-load', publish);
  pondWindow.on('moved', publish);
  for (const event of ['enter-full-screen', 'leave-full-screen', 'show', 'hide', 'minimize', 'restore']) pondWindow.on(event, publish);
  pondWindow.once('ready-to-show', () => pondWindow.show());
  pondWindow.on('close', (event) => {
    // Defer quit until this cancellable close event finishes. Calling quit
    // inside it re-enters the same native close and can leave the app running.
    if (!quitting) { event.preventDefault(); setImmediate(() => app.quit()); }
  });
  pondWindow.on('closed', () => { pondWindow = undefined; });
  pondWindow.on('leave-full-screen', () => {
    if (state.desktopMode) {
      pondWindow.setBounds(screen.getPrimaryDisplay().bounds, false);
      nativeWindow?.setDesktopLevel(pondWindow.getNativeWindowHandle(), true);
    }
  });
  pondWindow.loadURL(entryURL).catch((error) => console.error('Could not load the pond UI:', error.message));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showControls);
  app.whenReady().then(() => {
    if (isMac) {
      try { nativeWindow = require(path.join(nativeDir, 'pond-window.node')); state.desktopSupported = true; }
      catch { nativeError = '原生桌面模块尚未构建，请先运行 npm run build:native；当前可使用窗口预览。'; }
    }
    if (state.launchAtLoginSupported) state.launchAtLogin = app.getLoginItemSettings().openAtLogin;
    tray = new Tray(makeTrayIcon());
    tray.setToolTip('浮生锦鲤池 · 慢下来，鱼会游向你');
    tray.on('double-click', showControls);
    Menu.setApplicationMenu(Menu.buildFromTemplate(isMac ? [
      { label: '浮生锦鲤池', submenu: [{ label: '关于浮生锦鲤池', role: 'about' }, { type: 'separator' }, { label: '打开池塘控制台', click: showControls }, { type: 'separator' }, { role: 'quit', label: '退出锦鲤池' }] },
      { label: '编辑', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: '窗口', submenu: [{ role: 'minimize', label: '最小化窗口' }, { role: 'togglefullscreen', label: '切换全屏' }, { label: '隐藏池塘窗口', click: hideWindow }, { label: '打开池塘控制台', click: showControls }] },
    ] : []));
    registerIPC();
    createWindow();
    state.shortcutAvailable = globalShortcut.register(SHORTCUT, showControls);
    state.feedShortcutAvailable = globalShortcut.register(FEED_SHORTCUT, () => feed('shortcut'));
    updateTray();
    cursorTimer = setInterval(() => {
      if (!state.desktopMode || !pondWindow?.isVisible()) return;
      const point = cursorPoint();
      const key = `${point.x},${point.y}`;
      if (key !== lastCursor) { lastCursor = key; sendPointer('move', point, 'cursor'); }
    }, 33);
    const fitDesktopDisplay = () => {
      if (state.desktopMode && pondWindow) {
        pondWindow.setBounds(screen.getPrimaryDisplay().bounds, false);
        nativeWindow?.setDesktopLevel(pondWindow.getNativeWindowHandle(), true);
      }
      publish();
    };
    screen.on('display-metrics-changed', fitDesktopDisplay);
    screen.on('display-added', fitDesktopDisplay);
    screen.on('display-removed', fitDesktopDisplay);
  });
  app.on('activate', showControls);
  app.on('window-all-closed', () => { /* A menu bar app stays available until explicitly quit. */ });
  app.on('before-quit', () => {
    quitting = true;
    stopPointerHelper();
    clearInterval(cursorTimer);
    globalShortcut.unregisterAll();
    tray?.destroy();
    tray = undefined;
  });
}
