# AI 贴图生成要求 · 第二批：植物多样性（共 52 张）

目标：从"格桑花 + 一种草"扩展到喀拉峻夏季草甸常见的约 20 种植物。每种植物有多种姿态和花期，草有 6 种，另有灌木和叶片。

生成后放到 `ref/textures/`，文件名用每条前面的编号加英文名，例如 `C01_poppy_top_yellow.png`。

**通用要求和风格后缀**：和第一批完全相同，见 `docs/ai_texture_prompts.md` 第一、二节：
- 2048×2048；
- 透明背景，或纯蓝 #0000FF 背景；
- 单个主体居中，占画面 80%；
- 柔和的顶光，无投影；
- 手绘插画风格，风格参考图为 `ref/zelda/02_3D画风/02_暮色花径与山间小屋.png`。

## 这一批的三条额外要求（很重要）

1. **花头俯视图（C 组）的花瓣数量必须准确、均匀分布**：
   - 我会把每片手绘花瓣一片一片地贴到 3D 建模的花瓣上（就是你认可的"结合版"做法）；
   - 数量不对或者歪斜就贴不上；
   - 花心放在画面正中，正上方垂直俯视，**第一片花瓣朝正上方（12 点方向）**。
2. **颜色要比第一批的格桑花更"收"**：
   - 自然、柔和、略带粉彩感；
   - 不要荧光般的饱和色，不要每朵都一样饱满。
   - 你说过第一批 A1 花头太大太满、看多了千篇一律，这批请让 AI 画得更轻盈，花瓣薄、有透光感。
3. **整株图（D 组）同一种植物要两个不同姿态**：
   - 一个挺直、一个倾斜或弯曲；
   - 花的数量不同，含花苞或凋谢的花。
   - 我会在场景里混用，并做随机缩放、旋转和弯曲，这样同一品种也不会长得一模一样。

---

## C 组：花头·正上方俯视（16 张）

英文基础句（每条前面都加）：`top-down front view of a single flower head, perfectly centered, petals evenly spaced, the first petal pointing straight up (12 o'clock), no stem, no leaves, thin delicate slightly translucent petals, soft natural colors,`

| 编号 | 植物 | 中文描述 | 英文（接在基础句后） |
|---|---|---|---|
| C01 | 野罂粟·黄 | 4 片宽大圆润、皱纸质感的花瓣，柠檬黄色，花心有一圈黄绿色的雄蕊和绿色柱头 | `Papaver nudicaule wild poppy, exactly 4 broad rounded crinkled papery petals, lemon yellow, a ring of yellow-green stamens around a green stigma disc` |
| C02 | 野罂粟·橙 | 同上，杏橙色 | `same poppy, exactly 4 petals, soft apricot orange` |
| C03 | 金莲花 | 半开的球形花，约 12 片橙黄色萼片层层包裹，顶部微开露出花心 | `Trollius globeflower, about 12 cupped orange-yellow sepals forming a half-open globe, center just visible` |
| C04 | 老鹳草 | 5 片圆形花瓣，蓝紫色，花瓣上有深紫色细脉纹，花心浅色 | `wild geranium (Geranium pratense), exactly 5 rounded violet-blue petals with fine darker purple veins, pale center` |
| C05 | 勿忘我 | 一小簇 7 朵小花，每朵 5 片天蓝色花瓣、黄白色小花心 | `forget-me-not (Myosotis) cluster of 7 tiny flowers, each with 5 sky-blue petals and a small yellow-white eye` |
| C06 | 毛茛 | 5 片圆形花瓣，金黄色，有油亮光泽，花心有一圈雄蕊 | `buttercup (Ranunculus), exactly 5 rounded glossy golden-yellow petals, ring of stamens in the center` |
| C07 | 滨菊（大白菊） | 约 20 片细长白色舌状花瓣，黄色圆形花盘 | `ox-eye daisy (Leucanthemum), about 20 slender white ray petals, round golden disc` |
| C08 | 蒲公英·花 | 重瓣，许多层细窄的黄色小舌瓣 | `dandelion flower, many layers of narrow yellow ligules` |
| C09 | 蒲公英·种球 | 白色半透明的绒球，由许多带冠毛的种子组成 | `dandelion seed clock, a translucent white sphere of fine pappus parachutes` |
| C10 | 蓍草 | 伞房花序，由几十朵白色带一点奶油色的小花组成平顶的一团 | `yarrow (Achillea) flat-topped umbel of dozens of tiny creamy-white flowers` |
| C11 | 红三叶 | 球形头状花序，粉紫色，由许多小管状花组成 | `red clover (Trifolium pratense) round flower head of many small tubular pink-purple florets` |
| C12 | 野蔷薇 | 5 片心形花瓣，淡粉色，花心有金黄色雄蕊 | `wild dog rose, exactly 5 heart-shaped pale pink petals, golden stamens` |
| C13 | 龙胆 | 从上往下看的喇叭花，5 裂，深宝蓝色，喉部有浅色斑点 | `alpine gentian seen from above, trumpet with exactly 5 deep royal-blue lobes, speckled pale throat` |
| C14 | 火绒草（雪绒花） | 星形，约 8 片毛茸茸的银白色苞片，中间一团小花 | `edelweiss (Leontopodium), star of about 8 woolly silvery-white bracts around a cluster of tiny florets` |
| C15 | 野葱 | 球形伞形花序，粉紫色，由许多星状小花组成 | `wild chive (Allium) spherical umbel of many small star-shaped pink-lilac flowers` |
| C16 | 格桑花·半开 | 8 片花瓣，只开了一半，边缘向内卷，淡粉色 | `cosmos flower half-open, exactly 8 pale pink petals still curled inward at the edges` |

## D 组：整株·正侧面平视（22 张）

英文基础句：`a whole wild plant, exact side view, from the ground to the top, stem base at the bottom center edge, delicate natural proportions, plant height about 85% of the image,`

每种两个版本：a 挺直、花多；b 倾斜或弯曲、花少，带花苞或凋谢的花。

| 编号 | 植物 | 中文描述 | 英文（接在基础句后） |
|---|---|---|---|
| D01a/b | 野罂粟 | 基部一丛灰绿色羽裂叶，伸出 3 根（b：1 根）无叶细长花葶，顶端各一朵黄花或下垂的花苞 | `wild poppy: basal rosette of grey-green lobed leaves, 3 (b: 1) slender leafless hairy stalks each with a yellow poppy or a nodding bud` |
| D02a/b | 金莲花 | 直立的茎，掌状深裂的叶，顶端 2～3 朵橙黄色球形花 | `Trollius: upright stems, deeply palmate leaves, 2 to 3 orange globe flowers on top` |
| D03a/b | 老鹳草 | 分枝的茎，掌状 7 裂的叶，多朵蓝紫色花 | `meadow geranium: branching stems, palmate 7-lobed leaves, several violet-blue flowers` |
| D04a/b | 翠雀（飞燕草） | 高挑的穗状花序，许多深蓝色带距的花，下部掌状裂叶 | `Delphinium: tall spike of many deep blue spurred flowers, finely palmate leaves below` |
| D05a/b | 风铃草 | 细长的茎上挂着一串下垂的淡紫色铃铛花 | `bellflower (Campanula): slender stem with a row of nodding pale lilac bells` |
| D06a/b | 蓍草 | 直立的茎，羽毛状细裂叶，顶端一个白色平顶花序 | `yarrow: upright stem, feathery finely divided leaves, flat white umbel on top` |
| D07a/b | 柳兰 | 高挑的粉紫色穗状花序，柳叶形的叶，下部已结细长荚果 | `fireweed (Chamerion): tall magenta-pink flower spike, willow-like leaves, slender seed pods lower down` |
| D08a/b | 毛茛 | 细长分枝的茎，几朵金黄色小花，基部掌状裂叶 | `buttercup: thin branching stems, a few golden flowers, palmately divided basal leaves` |
| D09a/b | 青兰（紫花鼠尾草类） | 方茎，轮生的蓝紫色唇形花组成花穗 | `Dracocephalum dragonhead: square stem, whorls of blue-violet lipped flowers forming a spike` |
| D10a/b | 滨菊 | 细长的茎，1～2 朵白色雏菊状花，叶片狭长有齿 | `ox-eye daisy: slender stems, 1 to 2 white daisy flowers, narrow toothed leaves` |
| D11a/b | 勿忘我 | 低矮的一小丛，多根短茎顶端是蓝色小花簇 | `forget-me-not: low mound, many short stems tipped with clusters of tiny blue flowers` |

## E 组：叶片与低矮地被（6 张，正上方俯视或正面平视）

| 编号 | 中文 | 英文 |
|---|---|---|
| E01 | 羽衣草叶，圆形扇状、边缘有细齿、叶面有褶，叶缘挂一颗小露珠（仅此张允许露珠） | `lady's mantle (Alchemilla) leaf, top-down, round pleated fan with finely toothed edge, one tiny dew drop on the rim` |
| E02 | 三叶草叶，三片心形小叶，带浅色 V 形斑 | `clover leaf, top-down, three heart-shaped leaflets with a pale V mark` |
| E03 | 老鹳草叶，掌状 7 深裂 | `geranium leaf, top-down, deeply palmate with 7 lobes` |
| E04 | 蒲公英莲座叶丛，锯齿状长叶 | `dandelion basal rosette, top-down, long jagged toothed leaves` |
| E05 | 蕨类叶片一枝，二回羽状，竖直 | `a single fern frond, front view, vertical, bipinnate` |
| E06 | 苔藓和小地衣的一小片，圆形 | `a small round patch of soft green moss with tiny lichen, top-down` |

## F 组：灌木（4 张，正侧面平视，底部落在画面底边中间）

| 编号 | 中文 | 英文 |
|---|---|---|
| F01 | 野蔷薇灌丛，拱形枝条，零星淡粉色五瓣花和红色果子 | `wild rose shrub, arching canes, scattered pale pink five-petal flowers and a few red hips` |
| F02 | 绣线菊灌丛，枝条上开满一团团白色小花 | `Spiraea shrub, branches covered in clusters of tiny white flowers` |
| F03 | 忍冬灌丛，对生卵形叶，成对的黄白色小花 | `honeysuckle (Lonicera) shrub, opposite oval leaves, paired small cream-yellow flowers` |
| F04 | 匍匐的新疆圆柏（沙地柏），低矮、贴地铺开，蓝绿色鳞叶 | `creeping juniper (Juniperus sabina), low spreading mat, blue-green scale-like foliage, side view` |

## B 组补齐（第一批缺的 4 张 + 2 种新草，共 6 张）

- 第一批的 **B1b、B2、B3、B4** 请按 `docs/ai_texture_prompts.md` 第四节补齐。
- 另加两种新草：

| 编号 | 中文 | 英文 |
|---|---|---|
| B5 | 猫尾草（梯牧草），细长茎顶一根圆柱形毛茸茸的绿色穗，正侧面 | `timothy grass (Phleum) stems each topped with a slim cylindrical fuzzy green seed spike, exact side view, base at bottom center` |
| B6 | 苔草一丛，宽而弯的深绿色叶，几根褐色小穗 | `a clump of sedge (Carex), broad arching dark green leaves, a few small brown spikelets, exact side view, base at bottom center` |

---

## 优先级

如果一次生成不完，按这个顺序来：
1. **C01、C03、C04、C06、C07、C12**：远景主色调的几种花。
2. **D01～D05**：整株姿态多样性。
3. **B 组补齐**：草的多样性。
4. 其余。

生成好一部分就可以先放进 `ref/textures/` 告诉我，我边收边装。
