# 猫咪原画步态与轻音乐 · 2026-10-01

## 修改

- 正面行走与站立直接使用最初的猫咪原画（包含用户旧毛色）；不再抹掉原腿后重新拼接腿条。背面使用现有动作画中脚掌落地的姿态，替换朝向镜头露出脚底的姿态。
- 对完整透明画面进行连续局部网格变形，保留爪形、毛边和腿根连接。四肢沿用已有距离驱动步序，自然被身体挡住的远侧脚不额外复制出来。限制最大步幅，站稳后渐渐恢复原画。平地不增加身体上下跳动；台阶跳跃仍沿用已有系统。
- 新配乐《晴窗小憩》，约 3 分 02 秒。通过 ChatCut / Mureka 9 生成并在原生音乐时间线加入 2 秒开头、4 秒结尾淡化，再以 AAC 128 kbps 随项目离线分发。
- 设置中新增「背景轻音乐 · 晴窗小憩」开关和独立音量，默认启用、35%。仍服从庭院声音总开关和总音量；猫叫时轻微压低音乐。关闭、暂停、编辑、隐藏及离开主题都会暂停或释放音乐；重新播放缓慢淡入。
- 新偏好存入已有猫咪存档的 environment，只补充 music/musicVolume；旧猫咪、摆设、外观、季节与其他主题数据保持原样。音乐生成记录单独放在 music-source.json，不混入 CC0 音效声明。

## 主要文件

- src/themes/cats/painted-gait.js、animation.js、morphology.js：原画、关节位移和外观兼容。
- src/themes/cats/music.js、audio.js、environment.js：本地配乐、生命周期与存档默认值。
- src/components/CatScene.jsx、CatPanels.jsx、src/App.jsx：音乐设置和现有场景接入。
- public/assets/cats/audio/courtyard-music.m4a、music-source.json、LICENSE.md。
- source-art/cats/audio/courtyard-music.mp3：导出母版。

## 验证

- 项目现有测试体系：471 项通过（包含所有主题测试）；Vite 生产构建成功，仍有原项目的大 bundle 提示。
- 实际 Electron + Vite（127.0.0.1:5188）隔离临时 profile 验证，不触碰用户日常存档。
- 实际本地 AAC 解码 readyState=4、播放时间前进且输出音量非零；音乐独立开关、独立音量、总静音、暂停恢复均通过。
- 关闭音乐、音量 20% 后重载仍保持；重新开启及切回猫咪主题可播放。切出后旧音乐 src 被释放、暂停为 true、AudioContext 关闭。四个主题能切换显示，页面错误为 0。
- 检查 16 种猫咪正背面各 4 个步态相位的画面，另保存 8 秒连续动作预览和庭院/设置截图。
- 证据位于工作区 work/cats/portrait-gait/：gait-0..3.png、natural-walk.webm、courtyard-final.png、music-settings.png、gait-report.json、music-report.json、verify-music.cjs。

## 实际边界

- 行走仍为已有手绘静态素材驱动的 2D 局部变形，不是新绘制的完整八方向逐帧动画；背面继续使用已有背面素材。
- 实际验证了媒体解码、播放时钟和控制，并未以物理扬声器做主观听感审听。
- 当前会话没有 Browser 插件，界面检查使用项目现有 Playwright/Electron；未重新打包或发布桌面安装包。
