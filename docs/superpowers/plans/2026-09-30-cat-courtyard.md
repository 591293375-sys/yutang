# 猫咪庭院实施计划与接口

用户已授权按专业判断直接开发。本计划随实际验证更新，不以缺失素材代替完成结果。

## 范围与架构

复用 React、Canvas、现有主题注册、Panel、HUD、设置、Electron 桌面桥和分辨率预算。不改旧存档格式。猫咪独立命名空间 `mofish-cats-v1`，草稿独立保存。仅活动主题挂载场景，单个动画循环、低频 UI 发布、节流保存，离开时销毁。

新增 `src/themes/cats/` 负责 catalog、geometry、game、storage、environment、appearance、renderer、audio；新增 CatScene、CatManager、CatStudio、CatPanels 复用面板。主工具栏保持六项：猫咪、道具、四时、光阴、庭院、设置。

坐标为原图归一化坐标，绘制、命中、寻路共享居中 cover 变换。猫咪按落脚点排序。固定设施只登记交互锚点；未有遮挡层前不开放攀爬。

## 模块约定

- 猫设计：`id, presetId, name, personality, active, x, y, appearance`。外观存稳定素材坐标上的矢量笔迹 `version:1, strokes`，不存编辑器屏幕像素。身体材质与轮廓由原素材保留。
- `CatGame`：update、command、pointer、clearTransient、snapshot/view、addCat/editCat/setActive/removeCat、removeProp/moveProp/setEnvironment。临时任务不进入存档；手动指令原子替换并释放占用。
- `CatScene`：与现有 CoastScene 一样通过 ref 暴露操作和 stats，UI 使用低频 view。打开编辑器、离开主题取消临时操作。
- 渲染缓存每个外观版本，只按需加载当前背景档位，运行包不包含 8K 原稿副本。原稿保留在用户提供路径。

## 实施顺序

1. 并行审计/压缩素材、纯逻辑与存档、涂色与管理；主线接入共享 UI 与渲染。
2. 完成场景、行为和六道具闭环，环境日夜、四季效果和萤火虫。
3. 编写坐标/障碍/任务替换/容量/外观/恢复的关键测试。
4. 构建运行，以独立浏览器/桌面档案验证三主题、涂色恢复、道具、环境、缩放与清理；保护日常存档。
5. 整理真实结果、截图、缺失品种/动作/季节/音效规格，构建桌面程序。

## 美术边界

现有素材为单张场景与站姿猫。先完成行为与交互逻辑、材质涂色、有限站姿微动；不将整图平移宣传为完整行走动画，不将滤镜宣传为完整四季背景。真实多方向步态、趴睡/进食姿态与同构图季节背景需要独立资源，清单见 `docs/cat-courtyard-assets.md`。
