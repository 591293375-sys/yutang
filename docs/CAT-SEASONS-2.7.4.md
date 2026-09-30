# 猫咪庭院中央四季变化 · 2.7.4

已将四季变化从树冠与花丛扩展到中央石板地面。春天嫩苔与落樱，夏天保留原图绿荫，秋天苔缝转暖并有落叶，冬天沿苔藓和石缝覆薄霜。静态地面细节不依赖飘落粒子开关。猫咪、设施与点击继续使用原场景坐标。

新材料通过颜色遮罩与原生高清纹理混合；季节/时间/分辨率改变时合成一次，运行中不逐帧重建背景。没有新增大幅图片，也没有修改猫咪及旧主题存档格式。

## 验证

- `pnpm test`：377/377；`pnpm test:desktop`：5/5。
- `pnpm package:mac` 成功，正式包版本 2.7.4，3737个打包文件完整性核验通过，产物与构建文件一致；macOS签名校验通过。
- 开发环境与实际安装包各8项季节集成验收通过。关闭粒子后，四季中心六种配对都存在可见差异；五处固定设施配准无位移。
- 快速切换最终选择、重启后的季节/猫咪存档、粒子开关、夜景都通过。正式包在真实1045×899与1600×900内容窗口下铺满，未露出空白边；开发环境也验证3840×2160渲染画布。
- 使用独立临时profile，不改日常用户存档。最终页面错误及资源失败均为0。Codex内置浏览器预览已刷新。

Browser plugin not available：沿用项目已有Electron/Playwright测试，并使用正式应用原生BrowserWindow尺寸与webContents.capturePage截图。早期CDP模拟尺寸/截图链路出现像素停留及一次Target closed，改用真实窗口后8项原断言通过；无生产代码修改，CDP异常内部机制未确定，未将其记为已证实的产品缺陷。

验证JSON位于 `docs/verification/cats-2.7.4/`，实际截图与运行日志位于工作区 `work/cats/seasons-2.7.4/`。背景单独的清晰度和四季日夜检查见 `docs/cat-art-v3/season-ground-2.7.4.md`。

## 主要文件

- `src/themes/cats/background.js`：组合植被季节画稿与中央地面层。
- `src/themes/cats/ground-season.js`：原苔藓识别、地面材质和静态落花/落叶。
- `src/themes/cats/season-effects.js`：少量中央地面细节和随风飘过中央的花叶。
- `tests/cats-ground-season.test.js`、`tests/cats-season-ground.test.js`：坐标、材质、设施保护和粒子分布。
- `electron/cat-seasons-smoke.cjs`：实际四季、存档、快速切换与窗口验收。

原季节及夜景绘画的源分辨率仍为1672×941，本次没有将它们宣称为原生4K素材；中央石板保留原高清细节，霜雪为二维材质效果。
