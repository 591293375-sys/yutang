# 动作虹膜标定

2026-09-30。原头部仿射推算眼位会在部分动作把眼色投到脸毛上，已改为按实际图集逐帧校准。

## 数据

`src/themes/cats/action-eye-landmarks.js` 导出 `CAT_ACTION_EYES[presetId][frameIndex]`，每项为 `{x,y,rx,ry}` 的椭圆。所有数值均在对应 `CAT_SOURCE_RECTS[presetId].sourceRects[index]` 的内部归一化，不是全 atlas 坐标，也不是屏幕、编辑器或概略头部 UV。

16 套图集分别标定，没有重用另一品种的眼位：

- 每套动作 0、1、2、3、8、11、15 为两只可见眼，共 **112 个可见眼动作 / 224 只虹膜**。
- 4—7 背向，9、10、12、13、14 睡眠、进食低头或闭眼：明确空数组。不会把闭眼线、粉色鼻子或脸部毛发当作虹膜。
- 椭圆位于可见虹膜内部，保守避开眼睑，原图半径约 3—9 px。
- 挪威森林猫图集为 1447×1087，奶牛猫为 1263×1245；均按自己的真实 sourceRect 标定，没有假设全部为 1254×1254。

Runtime 将 sourceRect 坐标通过 frame.sourceMapping 转为通用动作单元坐标，再转换到已经裁出的 frame.image；不再将头像的眼位仿射映射到动作头部。

## 人工校对证据

两名实现者分工逐套放大查看原图，标注后逐张检查洋红椭圆是否位于眼内。

工作区 `work/cats/v2.7/`：

- `ragdoll-eyes-overlay.png`、`british-shorthair-eyes-overlay.png`、`american-shorthair-eyes-overlay.png`、`chinchilla-eyes-overlay.png`、`siamese-eyes-overlay.png`、`maine-coon-eyes-overlay.png`、`norwegian-forest-eyes-overlay.png`、`russian-blue-eyes-overlay.png`。
- `eight-closed-eyes.png` 用于核实闭眼/低头动作。
- `eye-landmarks/*-review.png` 覆盖四种田园花色与波斯、异国短毛、孟加拉、阿比西尼亚，每张显示 10 个动作头部与 sourceRect 像素刻度。
- 原始绝对点保存在 `action-eyes-8-absolute.json`，另一批原始矩形内像素点保存在 `eye-landmarks/new-eight-pixels.json`。

## 验证

`node --test tests/cats-action-eyes.test.js` **3/3 通过**：16 预设完整覆盖、闭眼安全空表、椭圆尺寸和归一化边界、实际源图 SHA-256 与来源矩形一致。更换源图或改裁切时，测试要求重新校准，避免旧眼位静默错配。

离线检查 224 个椭圆范围内实际 WebP alpha，最小值 252，均为实际不透明图内像素。此检查只佐证未落入透明区域；眼位正确性来自人工对照。

机器记录见 `action-eyes-validation.json`。实际浏览器 Canvas 的全 256 帧改色测试由 `electron/cat-action-eyes-smoke.cjs` 执行，结果保存在工作区 `action-eye-256-validation.json`，另输出 `action-eye-16-before-after.png` 供肉眼复核。


### 实际 Canvas 全动作结果

`node electron/cat-action-eyes-smoke.cjs` 在独立 Electron 开发 profile 中 **PASS**：

- 16 图集 × 16 动作 = **256 帧**。
- 仅改变 eyeColor 为浅紫灰 `#acaed0`，所有帧透明度像素变化 **0**。
- 112 个可见眼动作都产生局部眼色变化，两只眼均有实际颜色像素改变。
- 144 个闭眼/背向动作 RGB 像素变化 **0**。
- 224 个指定虹膜椭圆外 RGB 像素变化 **0**。
- 页面错误 **0**。临时测试 profile 已清理。

测试按动作的通用单元坐标对齐原图和带透明留白的改色图，不把新增透明外边距误算为体型/透明度变化。每个变化像素都反查是否位于该动作标定的虹膜椭圆内。

已查看 16 种猫首个走路动作的原图/改色图对照 `work/cats/v2.7/action-eye-16-before-after.png`，确认眼色改变保留瞳孔与高光，脸毛与鼻子不受影响。完整逐帧结果也复制到本文同目录 `action-eye-256-validation.json`。
