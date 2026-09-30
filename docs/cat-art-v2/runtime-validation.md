# 新动作与PCM音效的运行时验证

2026-09-30 17:11，本机 macOS Electron 开发环境，运行 `node electron/cat-runtime-smoke.cjs`，结果 **PASS**。

使用独立临时 Electron profile，种入12只测试猫；原用户profile和存档未接触。测试通过公开UI和桌面桥操作，仪表仅观察Canvas绘制、RAF和AudioContext/BufferSource，不调用内部CatGame行为函数。测试后应用进程关闭，临时profile清理。

| 检查 | 实际结果 |
| --- | --- |
| 4K窗口，12猫，10秒采样 | 猫层与背景均3840×2160，600次绘制，59.97fps；P95帧间隔17.7ms，最大20.2ms，无大于34ms间隔 |
| 静音 | 新PCM BufferSource正在播放0.72秒喵音时静音，立即disconnect并无延迟stop；活动声源0 |
| 切至赶海 | 旧猫咪AudioContext关闭，活动声音0，待执行猫咪RAF0，绘制次数不再增加 |
| 三主题 | 猫咪→赶海→锦鲤→猫咪均实际切换成功 |
| 暂停/恢复 | 暂停后绘制数固定、待执行猫咪RAF0；恢复后绘制继续 |
| 原生隐藏 | 即使Electron的document.hidden保持false，绘制1592→1592，RAF0，活动声音0 |
| showControls恢复 | 不打开设置面板就直接检查绘制继续：1592→1594；原生visible=true |
| 桌面模式 | 当前屏幕比例下猫层和背景均3840×2486，globalInteraction=false，保持鼠标穿透 |
| 退出桌面模式 | 恢复原窗口位置与1380×900尺寸 |
| 重新加载 | 12只猫、12只active，临时道具0；页面错误列表为空 |

完整报告见 [runtime-validation.json](runtime-validation.json)，原输出位于项目父级 `work/cats/runtime-smoke.json`。

本次仪表已兼容新音频 `createBufferSource`，仍观察旧振荡器以检测残留；测试猫名单取catalog前12项，避免新增16个预设后超过12只活动上限。喵声复测间隔按14秒限频调整。

这是本机开发环境实测，不宣称所有设备或发行包性能相同。本次没有发生需要改动CatScene或Electron main的真实缺陷；声音主观听感仍没有真人验收。
