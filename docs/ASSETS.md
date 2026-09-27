# 视觉素材记录

由内置 Image Gen 生成，无外部 CLI/API 密钥。输入为用户提供的《ChatGPT 图像 2026年9月27日 10_14_53.png》。生成结果均已复制到项目，可离线使用。

- `docs/design-reference.png`：主屏 UI 概念。青绿池塘满屏，左上「浮生／锦鲤池」、左侧「一池清欢／把日子，慢慢游成诗。」、右上天气、下方六项玻璃工具栏，投食／四时／天气／日夜／画锦鲤／设置，右下沉浸。禁止侧栏、营销区和卡片网格。
- `public/assets/pond.png`：precise-object-edit；去除参考图中所有锦鲤、鱼影、昆虫，精确保留俯视透水碧潭、岩石、水下石纹、岸边植被与荷花构图。16:9，无鱼、文字或 UI。
- `public/assets/spring.png`：lighting-weather；保留水和岩石构图，将夏荷替换成边缘淡粉樱花、桃花枝和嫩绿植被，少量花瓣，中心80%保持清水。无鱼、昆虫、文字、UI。
- `public/assets/autumn.png`：lighting-weather；同构图的晚秋，边缘金黄银杏、赭色与橙红枫叶、秋芦苇；夏荷移除，少量金叶浮水。保留碧水和水下石纹，无鱼、昆虫、文字、UI。
- `public/assets/winter.png`：lighting-weather；同构图的冬景，岩石和植被覆细雪，夏荷替换为积雪植物及细枯枝，边缘透明薄冰与细裂纹，中央碧水不做不透明封冰。无鱼、昆虫、文字、UI；落雪在运行时绘制。

代码原生绘制为有意选择：锦鲤必须随骨架连续弯曲，并接收用户手绘纹理，因此鱼、昆虫、粒子、冰面与涟漪由 Canvas 绘制。图标使用 lucide-react（ISC），原生图标为项目原创简洁矢量锦鲤。背景制作遵循用户参考图，未增加外部品牌标识。

概念对照：已在1672×941同尺寸检查品牌/竖排诗句、背景构图与色彩、底栏位置与六项文案、衬线字与细线图标、间距和圆角，以及390×844移动布局。动态城市、温度、数量、季节与节气属于有意的真实数据替换；四季独立背景、主题光线、绘画模态框和设置为用户要求的功能扩展。

## 1.1 的 4K 导出记录

四张现有季节背景分别作为编辑目标，使用内置 Image Gen（无 CLI/API 调用）重绘。共同提示词为：

> Use case: precise-object-edit, 4K asset restoration. Preserve the reference's exact top-down composition, color palette, clear turquoise water, submerged rock shapes and seasonal border vegetation. Reconstruct fine painterly details. Output a new UHD canvas exactly 3840×2160. No fish, fish shadows, insects, UI, text or watermarks.

春季保留樱花，夏季保留荷叶荷花，秋季保留银杏枫叶，冬季保留边缘薄冰积雪。生成器实际仍返回 1672×941，最终以 macOS sips 重采样导出为 3840×2160 PNG，替换项目 `public/assets/{pond,spring,autumn,winter}.png`。这些文件不是原生生成的 4K 细节；没有把重采样描述为原生超分辨率重建。全部四张文件已逐一核验尺寸，并经打包应用加载验证。

## 1.5 资源缓存与动态图层

秋季／春季的清水底图沿用已清理浮叶的文件，此次没有重复生成或降低贴图分辨率。问题复现为：运行中的浏览器仍使用无版本的 `/assets/autumn.png` 旧图像缓存。WebGL 图片加载与 CSS 后备背景统一改为 `?v=1.5`，刷新后固定水面叶片消失；漂流、旋转和落水由独立粒子承担。

新增风吹细波在 Canvas 中绘制；WebGL 的水色遮罩、近岸距离场和局部光线变化处理石边水纹，草叶／树梢风动扩展到四周。保持背景图像原有 3840×2160 文件尺寸，未将重采样图描述为原生 4K 细节。
