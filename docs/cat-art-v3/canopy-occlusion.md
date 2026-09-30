# 四季树冠前景遮挡

## 诊断与资源

原 `CAT_FOLIAGE_REGIONS` 是季节替换绘画的宽区域，不是树叶轮廓。直接重绘该区域会把树下猫咪连同花叶间的石板空隙一起遮掉。

本次没有生成新的树或移动原画。`scripts/prepare-cat-canopy.cjs` 从现有春樱、夏、秋、冬绘画中提取 alpha：手工树枝/枝簇边界约束、叶/花色分割、冬季实际棕色细枝及相邻积雪、微小封闭花蕊孔修补。背景阴影和开放枝隙不作为整块前景。

资源在 `public/assets/cats/canopy-v1/`，4 张独立无损 WebP 透明遮罩，总计 **95,122 字节**。每张 1028 × 432，对应统一 1920 × 1080 参考坐标的左上裁片。春秋冬仍受其原始 1672 × 941 季节绘画分辨率限制，遮罩不宣称增加原画细节。

场景 UV 裁片为 `{x:0,y:0,width:1028/1920,height:.4}`。右边和底边最后 12 像素全部透明，不会出现矩形截断；左/上与画面边缘对齐。

## 接口

```js
import {buildCanopyOcclusion} from './canopy.js';
const canopy = await buildCanopyOcclusion(backgroundCanvas, season);
// 在同一背景切换的 generation 检查后，一起接纳背景和树冠。
const {image, bounds:b} = canopy;
context.drawImage(image,
  cover.offsetX + b.x * cover.drawWidth,
  cover.offsetY + b.y * cover.drawHeight,
  b.width * cover.drawWidth, b.height * cover.drawHeight);
```

绘制顺序：地面背景 → 猫咪/道具 → 树冠前景 → 空中花瓣/萤火虫。前景颜色从已经完成四季和日夜合成的 **同一背景画布** 中取出，不载入一套不同光线的叶片彩图。背景 1.4 秒渐变期间，旧/新树冠分别与对应背景同步淡化。

返回对象：
- `image`：原生背景尺寸下的透明裁片。
- `bounds`：上述场景 UV 范围。
- `alphaAt(x,y)`：原遮罩 alpha 双线性采样。仅用于真实花叶遮挡处的命中排除，例如 `> .8`；不要使用宽范围树荫代替它。
- `sampleAt(x,y)`：48 × 24 邻域平均、5 × 5 三角核平滑后的连续覆盖场，用于克制的整体受光变化。不会跟着单片叶像素跳变。

四季遮罩各解码一次。透明裁片按背景对象使用 WeakMap 缓存；重复请求返回同一结果。像素扫描只发生在首次读取遮罩时，逐帧只有查表和一次裁片绘制。

## 实际验证

- `node --test tests/cats-canopy.test.js`：3 / 3，通过四季独立透明资源、尺寸/总量、精确命中 alpha、空隙可点、连续光照采样。
- 独立 Electron 临时 profile 中渲染四季 × 日夜，共 8 组 before/after。每组缓存身份相同。
- 测试猫落脚 `(0.328,0.302)` 与 `(0.425,0.342)`。第一只猫的部分头/背被真实花叶/枝条遮挡，腿脚仍显示；第二只冠外猫仅尾端经过枝叶时局部遮挡。
- 脚点 `(0.328,0.302)` 在四季 alpha 均为 0；开放地面 `(0.46,0.43)` 为 0。
- 春天不透明叶/花样例 `(0.270,0.170)`，开放间隙 `(0.286,0.170)`；对应精确样本在 `canopy-qa.json`。
- 已人工查看春/夏/秋/冬白天对照、春/冬夜间对照与紫底独立遮罩。冬季专门修复了较细雪枝被分割成不连续小片的问题。

证据位于项目外 `work/cats/canopy-2.8/`：`*-occlusion.png`、`*-matte-review.png`、`four-seasons-occlusion.png`、`canopy-qa.json`、`canopy-metrics.json`。这些是隔离前景效果的静态猫测试，夜间测试刻意保留原猫贴图亮度以观察遮挡轮廓；最终猫受光、运动、命中和渲染接入由 renderer 的集成验证覆盖。

## 范围

本层只处理左上悬垂树冠。地面苔藓、落花、石板影子不提升为上层遮挡。右侧爬架、猫窝沿、台阶等仍由各自设施遮挡逻辑负责。细小低对比边缘采取保守 alpha，不会用一个实心多边形完全擦除树下猫咪。
