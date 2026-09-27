# 浮生锦鲤池 · 桌面版

双击打包后的「浮生锦鲤池.app」打开控制窗口。点击界面的「融入桌面」后，锦鲤池铺满主屏，位于桌面图标和其他应用窗口下方；鼠标点击会穿过池塘，继续操作原来的桌面或应用。

菜单栏的锦鲤图标始终提供控制入口。关闭控制窗口会收起到菜单栏，选择「退出锦鲤池」才会完全退出。

| 操作 | 方式 |
| --- | --- |
| 恢复控制窗口 | 菜单栏锦鲤 → 打开池塘控制台，或 `⌘⇧K`（Windows 为 `Ctrl+Shift+K`） |
| 桌面中投喂 | 菜单栏锦鲤 → 投喂一把鱼食，或 `⌘⇧F` |
| 在其他应用中点击也投喂 | 手动开启「全局点击投喂」，按系统提示授予辅助功能权限 |
| 完全退出 | 菜单栏锦鲤 → 退出锦鲤池 |

全局点击默认关闭，每次启动保持关闭。鼠标位置跟随使用 Electron 的屏幕坐标查询，无需辅助功能权限。全局点击选项启用后，独立的原生程序仅以被动方式监听鼠标左键按下坐标，不读取键盘、不阻断点击、不截图、不联网、不保存输入记录。关闭该选项或退出应用会终止监听。若授权后系统仍拒绝监听，界面会显示失败状态，可继续通过托盘和快捷键投喂。

## 构建与运行

桌面应用要求 macOS 12 或更新版本；当前交付包适配 Apple Silicon。源码构建需要 Node.js、项目依赖，以及 macOS 的 Xcode Command Line Tools。首次原生编译会下载四个固定版本的官方 Node-API 头文件及其许可证，后续构建直接复用 `electron/native/include`。

```sh
npm install
npm run build
node electron/build-native.cjs
npx electron .
```

原生编译默认使用本机架构。交叉构建时先指定 `POND_BUILD_ARCH=arm64` 或 `POND_BUILD_ARCH=x64`；打包的 Electron 架构必须一致。桌面层模块使用稳定的 Node-API，不依赖 Electron 的 V8 ABI。无需 `uiohook-napi` 或其他运行时依赖。

electron-builder 应包含：

```json
{
  "main": "electron/main.cjs",
  "build": {
    "files": ["dist/**/*", "electron/**/*.cjs", "package.json"],
    "extraResources": [
      { "from": "electron/native/bin", "to": "native", "filter": ["pond-window.node", "pond-pointer"] }
    ],
    "mac": { "target": "dir", "category": "public.app-category.entertainment" }
  }
}
```

开发时也可先运行 Vite，再使用 `VITE_DEV_SERVER_URL=http://127.0.0.1:5173/ npx electron .`。开发入口仅接受本机 HTTP 根路径。正式版只加载打包内的 `dist/index.html`，Vite 的 `base` 应为 `./`。

## 界面桥接约定

浏览器预览中不存在 `window.pondDesktop`。Electron 中提供以下有限接口：

```js
await window.pondDesktop.getState()
await window.pondDesktop.setDesktopMode(true)
await window.pondDesktop.setGlobalInteraction(false)
await window.pondDesktop.setLaunchAtLogin(false)
await window.pondDesktop.feed()
await window.pondDesktop.showControls()
await window.pondDesktop.minimize()
await window.pondDesktop.quit()
const unsubscribeState = window.pondDesktop.onState(state => {})
const unsubscribePointer = window.pondDesktop.onPointer(pointer => {})
```

`isDesktop` 表示运行于桌面应用；`desktopMode` 表示已融入桌面。界面应在 `desktopMode` 为真时隐藏所有 HUD 和控制面板。`desktopSupported` 为假时不可宣称已启用系统桌面；应展示 `message`，继续提供普通窗口或浏览器全屏预览。`globalInteraction` 为用户当前的开关意图，实际监听成功必须以 `globalInteractionStatus === 'active'` 为准。其他状态为 `disabled`、`awaiting-permission`、`unavailable`、`error`。

指针事件为 `{ type: 'move' | 'feed', x, y, normalizedX, normalizedY, source, timestamp }`。坐标位于当前池塘内容区内，`normalizedX/Y` 为 0–1。`source` 为 `cursor`、`global-click`、`shortcut`、`tray`。主屏以外的全局点击不投喂；使用快捷键而光标在别的显示器时，会在池塘中央投喂。

设置 API 只接受真正的布尔值。所有 IPC 验证发送者、主 frame 和精确入口 URL；网页无法获得通用 IPC、Node、文件路径、shell 或原生窗口句柄。窗口启用 `sandbox` 与 `contextIsolation`，关闭 `nodeIntegration`，拒绝弹出窗口、外部导航、webview 和 Chromium 权限请求。原生权限仅由用户明确开启全局点击时请求。

## 已验证与平台边界

在本机 macOS arm64 实测通过：原生编译、安全 preload、无效设置拒绝、主屏全尺寸桌面层切换、不可聚焦、跨工作区可见、恢复原窗口尺寸、弹窗拦截、收起至托盘再恢复。自动化测试没有开启全局点击授权，也没有更改登录项。

```sh
node --test electron/policy.test.cjs
npx electron electron/smoke.cjs
node electron/packaged-smoke.cjs
```

最后一条在已有 `release/mac-arm64/浮生锦鲤池.app` 后执行，用独立用户资料目录启动真实打包应用，检查原生模块、权限隔离、桌面层中的持续动画和控制面板恢复，结束后删除临时用户资料。不会开启输入监听或登录项。原创矢量图标源位于 `electron/assets/app-icon.svg`；运行 `npx electron electron/build-icon.cjs` 可重新生成 PNG 与 ICNS。

桌面层使用 Electron 官方的 `NSView*` 句柄，通过 Cocoa 将窗口放到 `desktopWindow + 1` 层。此实现面向 macOS；Windows 和 Linux 会保留普通窗口，并明确报告原生桌面层不可用。不会更改系统壁纸文件。Stage Manager、全屏 Spaces 和系统桌面策略可能影响可见性；池塘不会盖在其他应用的全屏窗口上。

桌面版不开放 Chromium 精确地理位置权限。天气可以使用城市搜索及网络提供的城市级估算；需要更准确的城市时请手动选择。该限制不会影响天气查询、桌面动画或投喂。

当前构建使用本机临时签名（ad hoc），通过 `codesign --verify --deep --strict` 完整性验证；没有使用开发者证书，也未提交 Apple 公证。跨机器分发可能需要用户在 macOS 中允许打开。登录启动是否生效以系统登录项为准；Electron 官方文档说明，macOS 应用需签名和公证才能保证该设置可靠。分发正式版应使用开发者证书签名、公证，并在安装到「应用程序」后设置登录启动。快捷键被其他软件占用时，`shortcutAvailable` 或 `feedShortcutAvailable` 会为假，托盘仍可操作。

实现依据：[Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)、[Electron screen](https://www.electronjs.org/docs/latest/api/screen)、[辅助功能授权 API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesistrustedaccessibilityclientprompt-macos)、[登录启动 API](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)、[Apple 桌面窗口层级](https://developer.apple.com/documentation/coregraphics/cgwindowlevelkey)、[Apple 被动事件监听](https://developer.apple.com/documentation/coregraphics/cgeventtapoptions/listenonly)。
