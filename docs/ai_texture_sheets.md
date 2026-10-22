# AI 贴图 · 合版生成（7 版代替 46 张单图）

## 为什么这样能减少出错

上次失败有两个主要原因：
- **对话上下文干扰**：生成时看到了整份 46 项清单和旧的索引拼图，模型就模仿着出总览图，还混进了没要的内容。
- **要求太多太难**：要求模型每张都精确居中、第一瓣朝正上方、2048 正方形等。

这次改成**合版**：让模型在一张图里按固定的格子排 4–6 个主体。这正是它习惯的出图方式，所以不再和它对着干。难做到的要求全部交给我的切图程序（`tools/split_sheet.py`）：
- 自动抠背景：透明背景直接用；纯色背景按键色扣除，花瓣缝里也不留色边。
- 按格子切开，自动去掉网格线和孤立的文字标注。
- 花头自动居中，并按花瓣数旋转到一瓣朝正上方；侧视的植物自动把底部对齐到底边中央。
- 自动检查：花瓣数对不对、蝴蝶是否左右对称、主体有没有被格子边缘裁到。最后出一张审核图，有问题的标红。

所以提示词里不再要求：精确居中、第一瓣朝向、2048 尺寸、文件编号。这些都由程序处理。

## 生成规则（请严格照做）

1. **每一版开一个全新的对话**。只附一张风格参考图 `ref/zelda/02_3D画风/02_暮色花径与山间小屋.png`，其他什么都不要上传：不要上传本文件、旧清单和旧的索引图。
2. 把该版代码块里的英文**整段原样**粘贴，不加任何内容。
3. 优先要**透明背景**。工具做不到透明时，用该版指定的纯色背景（每版的背景色都避开了本版主体的颜色，所以不能换）。
4. 如果出来的格子数或主体不对，**直接在新对话里重新生成整版**，不要在原对话里修改。
5. 保存为 `ref/plant_textures_v3/sheets/sheet_A.png`（B、C… 同理），告诉我哪些版好了。

**材质类（T 组）和树皮（S03）不再需要 AI 画**，改用免费可商用（CC0）的材质库，见最后一节。

---

## 版 A · 花头俯视（纯蓝背景 #0000FF）

```
One single image: a clean botanical reference sheet laid out as a grid of 3 columns and 2 rows of equal square cells. Exactly one subject in each cell, centered, filling about two thirds of its cell, with generous empty space between subjects; no subject touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind. Every subject is seen from directly above, looking straight down.
Top-left cell: a single wild Iceland poppy flower (Papaver nudicaule) with exactly 4 broad rounded petals arranged in a cross, thin crinkled tissue-paper petals with fine radial creases and ruffled rims, soft apricot orange deepening to warm orange at the center; center: a small green seed-pod crown with a radiating star-shaped stigma ringed by many fine golden stamens.
Top-middle cell: a single globeflower (Trollius) seen from above as a nearly closed round golden-orange ball the size of a cherry: 12 to 14 broad incurved sepals overlapping like a rosebud, curling in over the top, only a small opening at the very center; clear shading showing its round form, brightest in the middle, darker toward the rim.
Top-right cell: a single meadow buttercup flower (Ranunculus acris) with exactly 5 separate rounded petals with small gaps between them, glossy lacquer-like golden yellow with a soft highlight near each petal base; a small greenish center dome ringed by many short yellow stamens.
Bottom-left cell: a single fading pink cosmos flower that has lost two of its eight petals: six slightly wrinkled petals remain, paling at their edges, with two empty gaps where the fallen petals were; a darker gold center starting to form seeds.
Bottom-middle cell: a single fading ox-eye daisy flower head: about 20 white ray petals, many drooping, curled or browned at the tips and a few missing; a darker brownish-yellow center disc.
Bottom-right cell: a single fireweed flower (Chamerion angustifolium) with exactly 4 slightly unequal rounded magenta-pink petals, 4 narrow dark red sepals showing between them, 8 stamens and a white four-lobed stigma curling out of the center.
No stems, no leaves in any cell.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture in every petal, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure blue (#0000FF) with no gradient, no texture and no shadow.
```

## 版 B · 俯视与正视（纯品红背景 #FF00FF）

```
One single image: a clean botanical reference sheet laid out as a grid of 3 columns and 2 rows of equal square cells. Exactly one subject in each cell, centered, filling about two thirds of its cell, with generous empty space between subjects; no subject touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind.
Top-left cell: front view of a single wild larkspur flower (Delphinium): 5 deep blue-violet petal-like sepals forming an open five-pointed star; the upper sepal continues into a long straight spur that points straight up behind the flower and shows above it; a small dark center of tightly folded petals with fine hairs. No stem.
Top-middle cell: top-down view of a single basal leaf of meadow buttercup, deeply divided into 5 toothed lobes like a spread hand, fresh green with slightly paler veins; the leaf stalk attaches at the center.
Top-right cell: top-down view of a small rosette of edelweiss leaves: about 12 narrow lance-shaped leaves radiating from the center, covered in dense silvery-grey woolly felt with soft fuzzy edges.
Bottom-left cell: top-down view of a single Apollo butterfly (Parnassius apollo), wings fully spread and perfectly left-right symmetrical, body straight up the middle with the head at the top; semi-translucent creamy white wings with black spots and two red eye-spots ringed in black on each hind wing.
Bottom-middle cell: top-down view of a single common blue butterfly (Polyommatus icarus), wings fully spread and perfectly left-right symmetrical, body straight up the middle with the head at the top; bright violet-blue wings with a thin dark border and a white fringe.
Bottom-right cell: top-down view of a single small tortoiseshell butterfly (Aglais urticae), wings fully spread and perfectly left-right symmetrical, body straight up the middle with the head at the top; orange wings with black and yellow patches and a row of small blue spots along the edges.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure magenta (#FF00FF) with no gradient, no texture and no shadow.
```

## 版 C · 侧视小部件（纯蓝背景 #0000FF）

```
One single image: a clean botanical reference sheet laid out as a grid of 3 columns and 2 rows of equal square cells. Exactly one subject in each cell, filling about two thirds of its cell's height, with generous empty space between subjects; no subject touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind. Every subject is seen exactly from the side.
Top-left cell: a single nodding Iceland poppy bud at the top of its thin curved stalk: an egg-shaped bud about 2 cm long covered in fine brown-green hairs, hanging downward, a crack showing a little yellow petal inside.
Top-middle cell: a single globeflower bud: a tight small green-gold sphere of closed sepals on a short straight upright green stem.
Top-right cell: the forked tip of a meadow cranesbill stem after flowering: two long slender beak-shaped seed heads pointing upward, one faded violet flower with drooping petals, fine hairs, the stem upright.
Bottom-left cell: the top 12 cm of a fireweed flower spike, upright: a tapering spire of closed drooping magenta flower buds on short stalks, the lowest two buds just opening, a few narrow green leaves at the base.
Bottom-middle cell: a single fireweed leaf standing upright, long narrow willow-like lance shape with a pale midrib and fine curved side veins, fresh mid green.
Bottom-right cell: a small upright clump of sun-dried mountain grass, about 40 slender straw-gold and tawny blades with a few green blades at the base and a few dry seed heads.
Every stem or base ends in a clean cut at its lower end.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows, no ground, no soil. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure blue (#0000FF) with no gradient, no texture and no shadow.
```

## 版 D · 侧视花与枝（纯品红背景 #FF00FF）

```
One single image: a clean botanical reference sheet laid out as a grid of 3 columns and 2 rows of equal square cells. Exactly one subject in each cell, filling about two thirds of its cell's height, with generous empty space between subjects; no subject touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind. Every subject is seen exactly from the side.
Top-left cell: a single nodding bellflower (Campanula) hanging downward from a short curved green stalk at its top: a pale lilac-blue bell with fine darker veins along each of its 5 pointed lobes, which curl slightly outward at the rim; a white style just visible inside.
Top-middle cell: a single dragonhead flower (Dracocephalum), horizontal: a two-lipped tubular blue-violet flower with a hooded upper lip and a broad spotted lower lip with darker veins, a short green calyx at its base.
Top-right cell: a single upright stem of smooth brome grass with a nodding open panicle of large flattened purplish-green spikelets on thin arching branches.
Bottom-left cell: a single upright stem of meadow bluegrass with a small pyramid-shaped open panicle of tiny purplish-green spikelets on fine whorled branches.
Bottom-middle cell: a single side branch of Schrenk's spruce (Picea schrenkiana) held upright, about 60 cm long, dense short dark blue-green needles on many small hanging side twigs, a few small red-brown cones, small gaps between the twigs.
Bottom-right cell: the top 1 meter of a Schrenk's spruce tree: a narrow pointed spire with a straight leader shoot at the top and short dense whorls of dark blue-green branches below, getting slightly wider downward.
Every stem or branch ends in a clean cut at its lower end.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows, no ground. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure magenta (#FF00FF) with no gradient, no texture and no shadow.
```

## 版 E · 灌木枝条（纯蓝背景 #0000FF，4 列 1 行）

```
One single image: a clean botanical reference sheet laid out as 4 equal tall columns side by side. Exactly one subject in each column, standing upright, filling about three quarters of the column's height, with generous empty space between subjects; no subject touches another. No lines, no borders, no numbers, no letters, no captions, no text of any kind. Each subject is a single leafy branch sprig laid flat and seen straight from the front, with a clean cut at its lower end.
First column: wild dog rose: a slightly curved green-to-reddish cane with small prickles, 5 pinnate leaves with serrated leaflets, 2 open pale pink five-petal flowers with golden stamens and 1 bud near the tip.
Second column: Spiraea: a thin brown twig with about 15 small oval green leaves and 3 flat clusters of tiny white five-petal flowers along its upper half.
Third column: wild honeysuckle (Lonicera): a thin grey-brown stem with 5 pairs of opposite oval blue-green leaves and 2 pairs of small cream-yellow tubular flowers in the leaf axils.
Fourth column: creeping juniper (Juniperus sabina): a feathery fan of fine scale-like blue-green twigs branching from one short woody stem, with 3 small dark blue berry cones with a pale bloom.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture in every leaf, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure blue (#0000FF) with no gradient, no texture and no shadow.
```

## 版 F · 灌木整株（纯蓝背景 #0000FF，2 列 2 行）

```
One single image: a clean botanical reference sheet laid out as a grid of 2 columns and 2 rows of equal cells. Exactly one whole shrub in each cell, seen exactly from the side, filling about three quarters of its cell, with generous empty space between them; no shrub touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind. The stems of each shrub gather at its base, which ends cleanly; no ground, no grass, no soil under it.
Top-left cell: a wild dog rose shrub about 1.5 m tall: long arching canes spreading like a fountain, a loose airy silhouette with gaps where the background shows through, small pinnate leaves along the canes, about 12 pale pink five-petal flowers and a few red hips.
Top-right cell: a Spiraea shrub about 1 m tall: a rounded mound of thin upright twigs with small oval leaves, covered in flat clusters of tiny white flowers along the upper branches, small gaps between the twigs.
Bottom-left cell: a wild honeysuckle shrub (Lonicera) about 1.5 m tall: upright branching stems, opposite oval blue-green leaves, pairs of small cream-yellow tubular flowers and a few translucent red berries, a loose silhouette with gaps.
Bottom-right cell: a creeping juniper (Juniperus sabina), low and wide, about 50 cm tall and 1.5 m across: dense sprays of scale-like blue-green foliage fanning outward and downward in a slightly irregular low dome, a few dark blue-black berry cones, woody stems visible only at the base.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture in the foliage, clean crisp silhouettes, natural medium-saturation colors (not pastel, not neon), soft even light from above, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure blue (#0000FF) with no gradient, no texture and no shadow.
```

## 版 G · 哈萨克纹样（可选，纯绿背景 #00FF00，1 列 2 行）

```
One single image with two subjects stacked one above the other, each filling most of the image width, with clear empty space between them. No borders, no numbers, no letters, no captions, no text of any kind. Both are seen flat and straight on.
Upper subject: a long horizontal decorative band of a Kazakh yurt: traditional ram's-horn (koshkar muiz) ornaments in deep red and dark blue on a cream felt ground, the same motif repeating evenly from left to right, felt texture visible.
Lower subject: a rectangular traditional Kazakh felt rug (syrmak), about twice as wide as it is tall, with bold ram's-horn motifs in red, dark blue and cream, thick felt texture and stitched edges, the whole rug visible.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, natural medium-saturation colors, soft even light, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure green (#00FF00) with no gradient, no texture and no shadow.
```

---

## 版 H · 牧民生活用品（可选，纯绿背景 #00FF00，3 列 2 行）

```
One single image: a clean reference sheet laid out as a grid of 3 columns and 2 rows of equal square cells. Exactly one subject in each cell, centered, filling about two thirds of its cell, with generous empty space between subjects; no subject touches another or the edge of its cell. No grid lines, no borders, no numbers, no letters, no captions, no text of any kind.
Top-left cell: exact side view of a traditional Kazakh horse saddle: a wooden frame with a tall upright front pommel and a lower curved back, dark leather seat, silver-studded trim, a folded patterned felt saddle cloth underneath, stirrups hanging down.
Top-middle cell: a Kazakh embroidered wall hanging (tus kiiz) seen flat from the front: dark red velvet with large curling floral and ram's-horn motifs embroidered in gold, blue and white, a fringed border.
Top-right cell: a folded quilted blanket (korpe) seen from the front, patchwork of red, blue and ochre cotton with fine quilting stitches, folded in three.
Bottom-left cell: a woven saddle bag (khurzhun) seen flat from the front: two pockets joined by a band, geometric red, black and cream woven patterns, tassels.
Bottom-middle cell: a single sheepskin with the wool side up, cream with brownish edges, the outline of the hide, seen from directly above.
Bottom-right cell: a round felt piece used to cover a yurt's roof opening, off-white, with a stitched red ram's-horn border, seen from directly above.
Style: hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, clean crisp silhouettes, natural medium-saturation colors, soft even light, no cast shadows. Background: fully transparent; if transparency is not possible, a perfectly flat, uniform pure green (#00FF00) with no gradient and no shadow.
```
保存为 `ref/plant_textures_v3/sheets/sheet_H.png`。用途：拴马桩上的马鞍、晾在绳上的被褥和挂毯、毡房门口的羊皮和褡裢。

## 汇总

| 版 | 背景（透明优先，退而用） | 内容 | 数量 |
|---|---|---|---:|
| A | 纯蓝 | 野罂粟橙、金莲花、毛茛、凋谢格桑花、凋谢滨菊、柳兰花 | 6 |
| B | 纯品红 | 翠雀花、毛茛叶、火绒草叶丛、三种蝴蝶 | 6 |
| C | 纯蓝 | 野罂粟花苞、金莲花苞、老鹳草果枝、柳兰花穗顶、柳兰叶、干草丛 | 6 |
| D | 纯品红 | 风铃草、青兰花、雀麦、早熟禾、云杉侧枝、云杉树梢 | 6 |
| E | 纯蓝 | 四种灌木枝条 | 4 |
| F | 纯蓝 | 四种灌木整株 | 4 |
| G（可选） | 纯绿 | 毡房装饰带、花毡 | 2 |

共 32 项（另有 2 项可选），7 次生成。第三批里的 C01 已经合格，不在其中。

**顺序建议**：先生成 A 版试水。我切图验收通过后，再做其余各版。

## 材质类改用 CC0 材质库（不需要生成）

原 T 组和 S03 改为：
- 从 Poly Haven（CC0，可商用）下载写实材质；
- 按场景色调调色，方向和木瓦行距对齐到模型；
- 由 `tools/stylise_texture.py` 处理。

对应关系：

| 原编号 | 内容 | 来源 |
|---|---|---|
| T01 | 原木墙 | rough_wood |
| T04 | 木板 | weathered_planks |
| T03 | 木瓦顶 | roof_09 |
| S03 | 树皮 | pine_bark（项目里已有） |
| T08 | 石砌地基 | stacked_stone_wall |
| T10、T12 | 土地、碎石 | 项目已有的 forest_ground_04、rock 系列 |
| T05 | 毛毡 | 程序生成 |
| T02 | 原木截面 | 程序生成 |
| T07 | 毡房门 | 建模 |
| T11 | 车辙 | 地形着色器里已有 |
