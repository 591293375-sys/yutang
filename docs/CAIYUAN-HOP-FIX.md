# 金蟾跳跃闪烁修复（2026-10-01）

起跳和落地的旧实现将两个姿态分别以互补透明度直接画到场景上。普通 source-over 合成使重叠身体在过渡中途变成约 75% 不透明，产生周期性闪淡；尚未结束的眨眼也可能覆盖空中姿态。

现在先在缓存的小画布内按预乘透明度混合姿态，再一次合成到场景。所有姿态沿用原有落脚锚点。过渡中收到新姿态时从当前已混合的画面继续，避免回跳；跳跃过程优先于眨眼。原有路径、布置、投币和存档逻辑保持原样。

修改：`src/themes/caiyuan/toad-pose.js`、`life-renderer.js`、`toad.js`，以及两份相关测试。

验证：

- `node --test tests/caiyuan*.test.js`：47 项通过。
- `node node_modules/vite/bin/vite.js build`：通过；仍有现有单包超过 500 kB 的提示。
- Browser plugin not available；使用现有 Playwright/Electron、隔离临时用户目录运行实际页面，未改用户存档。
- 实际透明素材的 1,210 个身体重叠像素在起跳、落地过渡中没有透明度下降；过渡中切换目标姿态的首帧像素差为 0。
- 真实场景连续完成 16 次跳跃、一次投币—拾取—抱钱—送入聚宝盆。页面无异常，切换锦鲤后旧渲染器和角色均停止。

证据位于工作区 `work/caiyuan-hop-fix/`：`verify.cjs`、`report.json`、`transition-frames.png`、`continuous-hops.webm`、`tests.log`、`build.log`。从工作区根目录执行 `node work/caiyuan-hop-fix/verify.cjs`，需开发服务器运行在 5188 端口。

素材仍为用户提供的静态姿态，采用平滑混合和已有跳跃曲线；本次未生成新的连续动作帧。
