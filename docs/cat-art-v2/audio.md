# 猫咪庭院本地合成反馈音

本轮修改 `src/themes/cats/audio.js`，保持 `configure(enabled, volume)`、`cue(kind)`、`stop()`、`destroy()` 接口。所有声音由本地 Web Audio 播放短 PCM 缓冲，**不是采集的真实猫咪录音**，不需要联网、音频下载或在线模型。

| cue | 合成方式 | 时长 | 同类最短间隔 |
| --- | --- | --- | --- |
| `purr` | 低频声带谐波，约24Hz轻微喉音起伏，柔和呼吸包络 | 1.65秒 | 9秒 |
| `meow` | 温和音高弧线、随张口变化的共振峰，短喵声 | 0.72秒 | 14秒 |
| `food` | 两次衰减的细小接触声 | 0.26秒 | 2.6秒 |
| `tap` | 玩具或抓板互动的短触碰 | 0.16秒 | 1.1秒 |
| `step` | 更低、更轻的单次脚步提示，供后续事件使用 | 0.10秒 | 1.4秒 |

无随机噪声、持续底噪、循环播放或后台定时器。只允许一个声音正在播放；同时来的请求直接跳过，不排队，不在多只猫互动时叠声。所有 cue 之间还保留至少550毫秒间隔。PCM按类型与采样率缓存，只有首次播放计算，音量不变时不会每帧增加 AudioParam 自动化事件。

静音、零音量、暂停、隐藏和主题销毁调用原有停止接口，立即断开正在播放的增益节点并停止源。异步 `AudioContext.resume()` 即使在主题切换后完成，也不能启动旧声源。

## 建议场景映射

- 手动呼唤或首次点中猫咪：`meow`，依赖14秒限频；不要自主频繁触发。
- 猫咪真正开始接受轻抚：`purr`。
- 到达食盆并开始进食：`food`。放置食盆时可用一次 `tap`，避免未走到食物先吃出声音。
- 毛线、小鼠、抓板等互动开始：`tap`。
- `step` 暂不在每帧移动中调用；若以后接脚落地事件，也保持全局限频。

CatScene已按上列建议接入：手动呼唤短喵，轻抚开始呼噜，进食开始轻触，玩具轻响。

## 验证与试听文件

`tests/cats-audio.test.js` 的7组测试已通过：PCM峰值/首尾/时长、呼噜起伏、单声源与限频、静音立即停止、异步resume竞态、实时音量及无效音量、异常和销毁清理。

测量结果保存在 [audio-validation.json](audio-validation.json)。预览WAV位于本目录，音量为0.4，48kHz单声道：`purr-synth-preview.wav`、`meow-synth-preview.wav`、`food-synth-preview.wav`、`tap-synth-preview.wav`、`step-synth-preview.wav`。这些开发试听文件不进入程序运行包。

已执行数值与生命周期检查，未进行真人听感验收。后续如有授权实录，可在同一 `cue` 边界替换，继续保留限频和静音规则。

## 发行资源过滤

Vite的 `exclude-cat-source-art` 插件仅在构建时移除 `dist/assets/cats/**/*-source.png`，原始PNG及开发文档继续保留，其他运行PNG遮罩与所有WebP不受影响。Electron只打包dist等明确目录，source PNG不会通过public或docs旁路进入包。

`tests/cats-assets.test.js` 另有5组检查：16个独立外观、涂色坐标与来源、四季和夜景真实尺寸、新资源体积、真实构建插件的过滤规则。已实际运行Vite构建并确认dist里的猫咪source PNG数量为 **0**。
