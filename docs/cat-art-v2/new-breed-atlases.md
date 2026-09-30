# 四种新增猫咪动作图集

2026-09-30，使用内置 `image_gen` 分别生成四张独立图集。具体模型选择未由工具暴露，不确认“image2.5”。每次以对应的 canonical 猫咪外观为身份参考、已有布偶 atlas 为动作布局参考，没有将同一张猫图改名使用。

| ID | 运行文件 | WebP体积 | 已识别完整主体数 |
| --- | --- | --- | --- |
| `persian` | `public/assets/cats/actions-v2/persian.webp` | 361,480 B | 16 |
| `exotic-shorthair` | `public/assets/cats/actions-v2/exotic-shorthair.webp` | 358,702 B | 16 |
| `bengal` | `public/assets/cats/actions-v2/bengal.webp` | 463,772 B | 16 |
| `abyssinian` | `public/assets/cats/actions-v2/abyssinian.webp` | 409,840 B | 16 |

总计 **1,593,794字节，约1.52 MiB**。全部为1254 × 1254、带真实alpha的WebP，quality91、alphaQuality100，未缩放；压缩前仅清除小于8/255的不可见alpha噪点。原PNG保存于 `sources/atlas-<id>-source.png`，精确prompt在 `atlas-<id>-prompt.txt`，来源元数据见 `new-breed-atlases.json`。

布局为4列×4行：

1. 向左下前进的四个步态相位。
2. 向左上离开镜头的四个步态相位，实际背面画稿。
3. 趴卧、蜷睡、低头进食、坐姿舔嘴。
4. 洗脸、舔爪、伸展抓挠、低伏轻扑。

已用 `scripts/locate-cat-action-frames.cjs` 的 `locate()` 函数只读验证，四张均识别16个完整主体，并分别查看实际切帧拼图：`atlas-<id>-review.png`。帧元数据检查保存在 `new-breed-atlas-frames.json`。

生成图的行高并非精确均匀，不可按固定313px格子强切。部分完整矩形边界包含邻帧耳尖/尾尖（波斯2帧，其余各5帧），应使用既有运行时主体alpha过滤去除邻帧。切帧审阅图故意保留这些矩形污染用于核查，没有把它们当作正确的成品帧。整合者统一重跑定位脚本并更新动作manifest后方可验证场景表现；本次没有改动作manifest或全局sourceRects。

单张图集提供基础姿态和每方向4相位，精细的8—12帧连续步态或逐帧人工UV仍属于后续精修，不宣称本次达到电影级连续运动。
