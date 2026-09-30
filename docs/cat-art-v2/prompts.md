# 猫咪庭院美术补全：生成提示与来源

使用当前 Codex 内置 image_gen；工具未暴露模型选择参数，不将其记为已确认的“image2.5”。所有原始素材保持不变，新资源放在 `public/assets/cats/art-v2/`。

## night

```text
Use case: lighting-weather. Asset type: accurately registered nighttime game background.
Edit this exact courtyard painting into NIGHT. Preserve its 16:9 composition, fixed top-down camera, every paving stone edge and moss joint, the wood porch and stairs, wicker cat bed, ceramic water bowl, stone lantern, potted plants and right-side cat climbing tree at exactly the input coordinates and sizes. Do not crop, zoom or redesign the courtyard.
Crucial change: repaint the lighting itself, REMOVE THE HARSH MIDDAY SUN PATCHES AND SHARP DAPPLED NOON SHADOWS from the central stone pavement, stair and porch. Replace them with broad gentle desaturated blue-gray moonlight. Keep the artwork easily readable and calm, never crushed black. Add a very small soft warm amber ambient glow from the upper porch area, no visible new lamp required. Plant leaves become natural dark teal and muted blue-green, pale stones become cool pearly gray. Fine delicate translucent watercolor texture, natural Japanese hand-painted style. The original pale paving stones remain recognisable but uniformly soft-lit at night.
No cats, humans, UI, labels, text, stars on the ground, glowing fantasy particles, new objects or watermark. Do not simply put a dark overlay over the daytime shadows. Deliver one full-bleed registered night painting, ideally 3840x2160 landscape if available.
```

## winter

```text
Use case: lighting-weather. Asset type: production background for an existing cat courtyard desktop game. Edit the attached target painting; do NOT make a different courtyard.
Keep the 16:9 framing, exact top-down camera and every hard-surface object precisely registered to the input: identical paving stones and moss joints, porch edge and stairs, wicker cat bed, ceramic water bowl, stone lantern, flowerpot positions, right-side cat climbing tree. Do not shift, scale, crop or redesign facilities. Keep the clean Japanese watercolor illustration style with delicate painterly detail and natural clear colors. No cats, humans, new furniture, UI, typography, watermark or borders. No opaque color overlay. This is a seasonal change to the same landscape, not a re-layout.
Make this the WINTER courtyard. Existing plants are sparse/dormant with some evergreen leaves; deciduous branches are visible. A thin uneven layer of fresh soft snow sits only on the garden border plants, upper edges of rocks and selected leaves. Snow is shallow and natural. Keep all main stone walking routes, porch floor, stepping stones, cat bed and water bowl clearly visible and usable, no deep snow blanket over the central courtyard. Cool pearly daylight, subtly warmer wood. Do not invent new trees or change their trunks. Preserve every facility silhouette and coordinate exactly.
```

## autumn

```text
Use case: lighting-weather. Asset type: production background for an existing cat courtyard desktop game. Edit the attached target painting; do NOT make a different courtyard.
Keep the 16:9 framing, exact top-down camera and every hard-surface object precisely registered to the input: identical paving stones and moss joints, porch edge and stairs, wicker cat bed, ceramic water bowl, stone lantern, flowerpot positions, right-side cat climbing tree. Do not shift, scale, crop or redesign facilities. Keep the clean Japanese watercolor illustration style with delicate painterly detail and natural clear colors. No cats, humans, new furniture, UI, typography, watermark or borders. No opaque color overlay. This is a seasonal change to the same landscape, not a re-layout.
Make this the AUTUMN courtyard. Turn the existing maple leaves into softly varied amber, warm yellow and restrained rust-orange, preserving branch structure and edge density. Existing garden plants become autumn foliage; summer hydrangeas fade naturally on their existing bushes. Add a few scattered fallen leaves mainly by flowerbed edges and moss joints. Keep the broad center stone path unobstructed. Warm, gentle early-autumn sunlight, pale stone remains natural cream, never globally orange. Preserve the reference's light transparent texture.
```

## 固定背景编辑约束

以下每一张季节 / 夜景都以同一张提供的夏季背景为编辑目标：`public/assets/cats/courtyard-1920.webp`。保持 16:9 俯视构图、摄像机、所有硬景边界和比例；不重新构图；石板形状和苔藓缝隙、木廊前沿、猫窝、水碗、石灯、花盆、爬架坐标不能变。只改植物物候、局部自然积雪和光照。背景没有猫、人物、UI 或文字。

### 春季 / spring-source.png

```text
Use case: lighting-weather. Asset type: production background texture for the existing cat courtyard desktop game.
Edit the attached target painting into a fresh SPRING version. This is the exact same physical courtyard at the exact same camera position; preserve the image's 16:9 aspect ratio, all framing and perspective. Keep every paving stone and moss joint, the porch front edge, all stair edges, wicker cat bed, ceramic water bowl, stone lantern, pots and right-side cat climbing tree at EXACTLY the same image coordinates and sizes. Do not redesign, replace, rotate, move, zoom or crop any hard-surface object.
Change only seasonal plant appearance and gentle daylight: fresh light green tree leaves, early spring foliage and a few soft pink/white blooms among the existing border plants. Keep plants rooted in their existing areas. A handful of delicate petals may rest at the edges, leave the center stone path very clear. The hydrangea bushes should look like spring budding plants rather than full summer bloom. Retain fine translucent Japanese hand-painted watercolor textures, soft luminous sunlight and natural colors.
No cats, people, new furniture, new facilities, text, labels, UI, borders, watermarks. No coarse grain, thick outlines, oversaturated effects. Output one continuous full-bleed courtyard image. Geometry and facility registration to the original painting are the highest priority.
```
## persian

Use case: stylized-concept. Asset type: one individual transparent game character portrait, square.
Image 1 is a style, camera and pose reference, NOT the subject identity to copy. Draw one distinct PERSIAN CAT: compact low cobby body, very round broad face, short flat muzzle, small widely spaced ears buried in thick ivory-white long fur, copper eyes, luxurious mane and rounded fluffy tail. A graceful healthy friendly cat, realistic breed proportions rather than a caricature.
Keep the reference's exquisite clean Japanese watercolor hand-painted fur, softly lit natural colors, no thick outline. Same elevated three-quarter camera looking down, whole cat standing diagonally with its head in lower-left, rump upper-right, tail curving toward top-right; four correctly attached legs, all paws visible enough for interaction. Show the entire single cat including whiskers, toes and tail, fit within square with 6% transparent padding; no cropping. Distinct white Persian appearance, not the ragdoll's pointed bicolor coat.
Transparent background with genuine alpha, no floor, no ground shadow, no scenery, no text, no borders, no grids, no extra cats. Preserve delicate semi-transparent fur edges. This is a standstill canonical portrait used for local coat painting.
## exotic-shorthair

Use case: stylized-concept. Asset type: one individual transparent game character portrait, square.
Image 1 is a style, camera and pose reference only. Draw one distinct EXOTIC SHORTHAIR CAT: compact low round cobby body, broad flat round face, very short nose, small round widely spaced ears, big friendly amber eyes, thick dense plush SHORT fur, thick short rounded tail. Coat is warm pale cream with subtle peach tabby forehead accents and white muzzle, clearly different from the blue British Shorthair reference. Anatomically plausible healthy sweet face, not exaggerated toy or human face.
Match the reference's delicate Japanese watercolor natural painted fur, clear soft daylight, no coarse grain or heavy outline. Same elevated three-quarter view looking down, entire cat standing diagonally head lower-left and rump upper-right, tail curled toward top-right. Four legs and paws anatomically correct; include every ear, whisker, paw and tail with 6% clear margin. No pose rotation or side-lying.
Real transparent alpha background, no ground, floor or cast shadow, no text, no layout grid, no other cats. One canonical standing portrait for local coat painting, preserve fine translucent fur edge.
## bengal

Use case: stylized-concept. Asset type: one individual transparent watercolor game character, square canonical portrait.
Image1 provides painting medium, camera angle and diagonal stance ONLY. Draw a distinct BENGAL CAT with a long athletic muscular yet sleek body, slightly small wedge-rounded head, relatively small rounded ears, green eyes, long strong legs, thick tapering black-tipped tail. SHORT silky golden-brown fur with clearly recognizable dark outlined two-tone ROSETTE spots over its torso, spotted legs and ringed tail. No classic swirl silver tabby like reference; real Bengal rosettes distinguish this breed.
Match the gentle, finely painted Japanese watercolor fur, clean soft natural light and understated colors of reference. Elevated three-quarter camera looking down; full cat upright standing, head lower-left, body toward upper-right and curved tail up toward right. Same angle as reference, not a profile view and never belly-up. Include entire cat, four limbs anatomically correct, tail ears toes whiskers complete, 6% safe transparent margin.
True transparent alpha background, no floor or cast shadow, no scenery, text, props, borders, frames, or second cat. Soft fine fur outlines, no thick black contour or plastic toy style.
## abyssinian

Use case: stylized-concept. Asset type: one individual transparent watercolor game character, square canonical portrait.
Image1 is STYLE, camera and diagonal standing pose reference only. Draw a distinct ABYSSINIAN CAT: elegant slender long-legged body, graceful arched neck, small wedge head, conspicuously large upright pointed ears, almond golden-amber eyes, long fine tapering tail. SHORT close-lying warm ruddy cinnamon/copper TICKED fur with subtle darker dorsal shading, paler warm muzzle/chest/underside, delicate dark eyeliner. NO Siamese dark mask, no colorpoint dark feet, no body stripes, no leopard spots, no silver coat. The coat is warm and natural, not saturated orange.
Same clean delicate Japanese watercolor hand-painted fur as reference with soft daylight. Same elevated three-quarter looking-down camera: whole cat upright standing diagonally head lower-left, rump upper-right, tail curving up-right. Four anatomically attached legs, all ears/feet/tail/whiskers included with 6% transparent padding. Do not rotate the cat sideways or change to side profile.
Real transparent alpha, no scenery, no ground shadow, no floor, no labels or text, no borders, no grid, one cat only. This unique portrait must clearly differ from the reference breed while keeping matching scene perspective.
