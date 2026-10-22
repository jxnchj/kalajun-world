# AI 贴图生成要求（方法 1 · 样本：格桑花 + 草）

共 14 张。生成后请放到 `项目文件夹/ref/textures/`，文件名用每条前面的编号，例如 `A1a_cosmos_front_pink.png`。

## 一、通用要求（每张都适用）

1. **尺寸**：正方形，2048×2048；最低 1024×1024。
2. **背景**：
   - 优先输出**透明背景 PNG**。
   - 工具不支持透明时，用**纯蓝色背景 #0000FF**（RGB 0, 0, 255）。必须是完全均匀的一种颜色：不要渐变、阴影、地面、纹理、光晕。
3. **构图**：一张图只有一个主体，居中，约占画面 80%，四周留白，不能被裁切。
4. **视角**：按每条的要求（正俯视或正侧视）。不要夸张透视，不要景深虚化，主体从前到后都要清晰。
5. **光照**：柔和均匀的漫射光，来自上方。不要强烈的投影、高光斑或逆光光晕（光影由我的引擎实时计算）。
6. **画风**：和参考图一致的手绘插画风：柔和笔触、干净利落的轮廓、颜色饱和但不刺眼。
   - 工具支持"参考图/垫图"的话，把 `ref/zelda/02_3D画风/02_暮色花径与山间小屋.png` 作为风格参考。
7. **不要**：文字、水印、边框、花盆、土壤、地面、昆虫、露珠。
8. **植物底部**（A4、A6、B 组）：茎或根的底端正好落在画面底边中间，底端截平。

## 二、通用风格后缀（英文工具请加在每条英文提示词末尾）

```
hand-painted illustration style, painterly fantasy anime game art, soft brush texture, clean crisp silhouette, soft even diffuse lighting from above, no cast shadow, isolated on a flat solid pure blue background (#0000FF), centered, subject fills 80% of the frame, orthographic view, no ground, no text, no watermark, highly detailed, square 2048x2048
```

中文工具用这句：

```
手绘插画风格，奇幻动画游戏美术，柔和笔触，干净清晰的轮廓，来自上方的柔和均匀漫射光，无投影，主体孤立在纯蓝色(#0000FF)平涂背景上，居中，占画面80%，正交视角，无地面，无文字，无水印，高细节，正方形2048x2048
```

---

## 三、A 组：格桑花（Cosmos bipinnatus）

### A1 格桑花花头·正面俯视（4 张，4 种颜色）

- 中文：一朵格桑花的花头，正上方俯视。8 片宽大的舌状花瓣，每片花瓣尖端有 3 个浅浅的小齿，花瓣上有细密的放射状脉络，略带半透明感，靠近花心的颜色稍深。中间是金黄色的圆形花盘，由许多细小的管状小花组成。不带茎和叶。
- 英文：`top-down front view of a single cosmos flower head (Cosmos bipinnatus), 8 broad ray petals each with three small shallow notches at the tip, fine radial veins, slightly translucent petals, deeper color near the center, golden-yellow disc of tiny florets in the middle, no stem, no leaves,`

4 个颜色版本，在上面的描述后分别加：

| 编号 | 中文 | 英文 |
|---|---|---|
| A1a | 花瓣淡粉色，靠近花心变成深粉色 | `petals soft pink fading to deeper pink near the center` |
| A1b | 花瓣洋红色（紫红） | `petals vivid magenta` |
| A1c | 花瓣白色，花心附近带一点淡粉色 | `petals pure white with a faint blush of pink at the base` |
| A1d | 花瓣淡紫色 | `petals pale lilac purple` |

### A2 格桑花花头·侧视（1 张，粉色）

- 中文：一朵粉色格桑花的花头，正侧面 90° 平视。花瓣微微向上呈浅碗状，能看到花盘的侧面，下面连着一小段细茎（约为花头直径的一半）。
- 英文：`exact side view (90 degrees) of a single pink cosmos flower head, petals slightly cupped upward like a shallow bowl, the disc visible in profile, a short piece of thin green stem attached below,`

### A3 单片花瓣（1 张，白色）

- 中文：一片格桑花花瓣，平放，正面，尖端朝上竖直摆放。白色，基部带一点奶油色，尖端有 3 个小齿，有细密的纵向脉络。
- 英文：`a single cosmos ray petal lying flat, front view, pointing straight up, white with a hint of cream at the base, three small notches at the tip, fine longitudinal veins,`

### A4 花苞（1 张）

- 中文：一个闭合的格桑花花苞，侧视。水滴形，顶部露出一点粉色，外面包着绿色萼片，下面连着一小段茎。
- 英文：`side view of a closed cosmos flower bud, teardrop shaped, a little pink showing at the tip, wrapped in green sepals, on a short thin stem,`

### A5 羽状叶枝（1 张）

- 中文：一小枝格桑花的叶子，正面平视，竖直摆放。叶片细裂成许多丝线状的羽毛形小裂片（二回羽状），鲜绿色。
- 英文：`a single sprig of cosmos foliage, finely divided thread-like feathery leaves (bipinnate), bright fresh green, flat front view, vertical orientation,`

### A6 整株格桑花（1 张）

- 中文：一整株格桑花，正侧面平视，从地面一直画到顶端。细长分枝的茎上开着 3 朵花（粉、洋红、白各一朵），还有 1 个花苞，茎上长着羽毛状的细叶。株高约为画面高度的 85%，茎底部落在画面底边中间。
- 英文：`a whole cosmos plant, exact side view, from the ground to the top, slender branching stems carrying three open flowers (one pink, one magenta, one white) and one bud, feathery thread-like leaves along the stems, plant height about 85% of the image, stem base at the bottom center edge,`

---

## 四、B 组：草

### B1 草丛·侧视（2 张，内容相同，分别生成两个不同的版本）

- 中文：一丛野生草甸上的草，正侧面平视。30～40 根细长的草叶，高矮不一，有的挺直，有的弯成弧形。叶片鲜绿色，尖端偏黄绿，根部偏深绿。根部集中在画面底边中间。
- 英文：`a clump of wild alpine meadow grass, exact side view, 30 to 40 slender blades of varying heights, some upright and some arching over, fresh green with lighter yellow-green tips and darker green at the base, the base gathered at the bottom center edge,`
- 编号：B1a、B1b

### B2 单根草叶（1 张）

- 中文：一根细长的草叶，竖直，正面平视。中间有一条细细的中脉，颜色从根部深绿渐变到尖端浅黄绿。
- 英文：`a single long slender grass blade, vertical, front view, a subtle midrib down the center, color gradient from dark green at the base to light yellow-green at the tip,`

### B3 羊茅散穗（1 张）

- 中文：一根带茎的禾草种穗（羊茅的圆锥花序），正侧面平视。小穗疏散地分枝展开，颜色是麦秆金黄色夹带浅绿。茎底部落在画面底边中间。
- 英文：`a single grass seed head (fescue panicle) on its stem, exact side view, open branching spikelets, straw-golden and pale green, stem base at the bottom center edge,`

### B4 针茅长芒（1 张）

- 中文：一小丛针茅（羽茅），正侧面平视。细长柔软的银白色长芒向上舒展，末端微微弯曲，芒上有细密的丝状绒毛，呈半透明感。底部落在画面底边中间。
- 英文：`a small tuft of feather grass (Stipa) with long silky silvery-white awns rising and gently curving at the ends, fine feathery hairs along the awns, semi-translucent, exact side view, base at the bottom center edge,`

---

## 五、生成后

1. 每条多生成几张，挑一张最干净的（背景纯、轮廓完整、没有多余东西）。
2. 按编号命名，放到 `ref/textures/`，告诉我一声，我来抠图、做贴图集和法线贴图，装进场景和方法 2 并排对比。
