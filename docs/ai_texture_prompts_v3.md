# AI 贴图第三批（共 46 张）：回炉重做 + 后续所有阶段需要的图

第二批里不合格的重做，同时把后续阶段需要的图一次写全：
- 新品种的叶片、花苞和花期变化；
- 草穗、云杉；
- 房屋和毡房的材质、地面材质；
- 蝴蝶。

按第八节的优先级分批生成也可以，但文件名编号要对上。生成后放进新文件夹 `ref/plant_textures_v3/`，文件名用编号开头，例如 `C01_poppy_top_yellow.png`。同编号会自动顶替第二批的旧图，重新运行打包脚本即可，不用改代码。

第二批的 D 组整株不需要重做：整株由我在三维里搭建，D 组只作姿态参考。

---

## 一、每张都必须遵守（请原样贴在每条提示词前面）

**上一批失败的主要原因是工具输出了多格拼图，所以第一句最重要。**

```
Generate exactly ONE image containing ONE single isolated subject. Do NOT make a sheet, grid, collage, multiple views, variations, labels, captions or any text.
```

**通用风格后缀（贴在每条提示词后面）：**

```
hand-painted gouache illustration for a stylized fantasy game, visible soft brush strokes, subtle painterly texture inside every petal and leaf, clean crisp silhouette, natural medium-saturation colors (not pastel, not neon), soft even diffuse light from above, no cast shadow, isolated on a transparent background (or a perfectly flat pure blue #0000FF background if transparency is not supported), orthographic view, no ground, no soil, no pot, no text, no watermark, square 2048x2048, subject fills about 80% of the frame
```

**反向提示词（工具支持 negative prompt 时使用）：**

```
collage, grid, multiple images, multiple views, sprite sheet, text, label, watermark, frame, border, vector clip art, flat shading, 3D render, photo, drop shadow, ground, soil, pot, blurry, cropped
```

有参考图功能的话，把 `ref/zelda/02_3D画风/02_暮色花径与山间小屋.png` 作为风格参考。

---

## 二、花头·正上方俯视（重做 4 张）

共同要求（已写进每条）：花心在正中央，垂直俯视，第一片花瓣指向正上方（12 点钟），花瓣均匀分布。

**C01 野罂粟·黄**（上一版是一团圆块，看不出花瓣）

```
top-down view looking straight down at a single wild Iceland poppy flower (Papaver nudicaule), perfectly centered, exactly 4 broad rounded petals arranged in a cross, the first petal pointing straight up, neighbouring petals overlapping slightly at their edges, thin crinkled tissue-paper petals with fine radial creases and slightly ruffled rims, lemon yellow deepening to warm yellow near the center, center: a small green seed-pod crown with a radiating star-shaped stigma, ringed by many fine golden-yellow stamens, no stem, no leaves
```

**C02 野罂粟·杏橙**：与 C01 完全相同，只把颜色一句换成

```
... soft apricot orange deepening to warm orange near the center ...
```

**C03 金莲花**（上一版是平的，不是球形）

```
top-down view looking straight down at a single globeflower (Trollius), perfectly centered, a nearly closed round ball about the size of a cherry: 12 to 14 broad incurved golden-orange sepals overlapping like the layers of a rosebud, curling inward over the top, only a small opening at the very center showing a few dark orange nectar leaves, clear shading that shows the spherical form (brightest at the top, darker toward the rim), no stem, no leaves
```

**C06 毛茛**（上一版五瓣连成一片）

```
top-down view looking straight down at a single meadow buttercup flower (Ranunculus acris), perfectly centered, exactly 5 separate rounded petals with small gaps between them, the first petal pointing straight up, glossy lacquer-like golden yellow petals each with a bright soft highlight near its base, center: a small greenish dome surrounded by a dense ring of many short yellow stamens, no stem, no leaves
```

---

## 三、灌木·整株侧视（重做 4 张，用于远处的灌丛剪影）

共同要求（已写进每条）：底部落在画面底边中央，形态松散自然，边缘能看到一片片叶子，枝叶之间留有透空的缝隙。

**F01 野蔷薇灌丛**

```
exact side view of a whole wild dog rose shrub (Rosa canina) growing on an alpine meadow, about 1.5 m tall, several long arching canes spreading out like a fountain, loose airy silhouette with gaps where the background shows through, small pinnate leaves visible along the canes, a scattering of about 12 pale pink five-petal flowers and a few red hips, base of the canes gathered at the bottom center edge of the image
```

**F02 绣线菊灌丛**

```
exact side view of a whole Spiraea shrub, about 1 m tall, a rounded mound of thin upright twigs, small oval leaves, covered in flat clusters of tiny white flowers along the upper branches, loose natural silhouette with small gaps between the twigs, base gathered at the bottom center edge
```

**F03 忍冬灌丛**

```
exact side view of a whole wild honeysuckle shrub (Lonicera) of the Tianshan mountains, about 1.5 m tall, upright branching stems with opposite oval blue-green leaves, pairs of small cream-yellow tubular flowers in the leaf axils, a few translucent red berries, loose natural silhouette with gaps, base gathered at the bottom center edge
```

**F04 新疆圆柏（沙地柏）**

```
exact side view of a creeping juniper shrub (Juniperus sabina) on a mountain slope, low and wide, about 50 cm tall and 1.5 m across, many dense sprays of scale-like blue-green foliage fanning outward and downward, a few dark blue-black berry cones, a dome-shaped, slightly irregular silhouette hugging the ground, woody stems visible only at the base, base centered at the bottom edge
```

---

## 四、灌木枝条·正面平视（新增 4 张，用来在三维里拼出立体灌木）

共同要求（已写进每条）：一根带叶的小枝，竖直摆放，平放在纸上从正面看，底部切口在画面底边中央。

**F01s 野蔷薇枝条**

```
a single leafy branch sprig of wild dog rose, laid flat and viewed straight from the front, vertical, a slightly curved green-to-reddish cane with small prickles, 5 pinnate leaves with serrated leaflets, 2 open pale pink five-petal flowers with golden stamens and 1 bud near the tip, cut end at the bottom center edge
```

**F02s 绣线菊枝条**

```
a single leafy branch sprig of Spiraea, laid flat and viewed straight from the front, vertical, a thin brown twig with about 15 small oval green leaves and 3 flat clusters of tiny white five-petal flowers along its upper half, cut end at the bottom center edge
```

**F03s 忍冬枝条**

```
a single leafy branch sprig of wild honeysuckle (Lonicera), laid flat and viewed straight from the front, vertical, a thin grey-brown stem with 5 pairs of opposite oval blue-green leaves, 2 pairs of small cream-yellow tubular flowers in the leaf axils, cut end at the bottom center edge
```

**F04s 圆柏枝条**

```
a single branching spray of creeping juniper foliage (Juniperus sabina), laid flat and viewed straight from the front, vertical, a feathery fan of fine scale-like blue-green twigs branching from one short woody stem, 3 small dark blue berry cones with a pale bloom, cut end at the bottom center edge
```

---

## 五、单朵小花（新增 5 张，用来在三维里搭花穗）

**G01 柳兰·单朵花·俯视**

```
top-down view looking straight down at a single fireweed flower (Chamerion angustifolium), perfectly centered, exactly 4 slightly unequal rounded magenta-pink petals, the first petal pointing straight up, 4 narrow dark red sepals visible between the petals, 8 stamens and a white four-lobed stigma curling out of the center, no stem, no leaves
```

**G02 柳兰·花穗顶端·侧视**

```
exact side view of the tip of a fireweed flower spike, vertical, the top 12 cm: a tapering spire of closed drooping magenta flower buds on short stalks, the lowest 2 buds just opening, a few narrow green leaves at the base of the spike, cut end at the bottom center edge
```

**G03 青兰·单朵唇形花·侧视**

```
exact side view of a single Dracocephalum (dragonhead) flower, horizontal, a two-lipped tubular blue-violet flower about 3 cm long: a hooded upper lip and a broad spotted lower lip with fine darker veins, a short green calyx at its base on the left, no stem beyond the calyx
```

**G04 翠雀·单朵花·正面**

```
front view of a single wild larkspur flower (Delphinium), perfectly centered, 5 deep blue-violet petal-like sepals forming an open star, the top sepal pointing straight up and extending into a long straight spur behind the flower, a small dark center of tightly folded petals ("bee") with fine hairs, no stem
```

**G05 风铃草·单朵铃铛·侧视**

```
exact side view of a single nodding bellflower (Campanula), the bell hanging downward, pale lilac-blue with fine darker veins running down each lobe, 5 pointed lobes curling slightly outward at the rim, a short curved green stalk attached at the top center, white style just visible inside the bell
```

---

## 六、叶片、花苞与花期（新增 8 张，H 组）

用途：新品种的叶子；同一品种出现花苞、凋谢的花，不再朵朵都是盛开的样子。H01–H03 竖直或俯视平放，底部或叶柄在画面底边中央（俯视的除外）。

**H01 柳兰叶**

```
a single fireweed leaf (Chamerion angustifolium), laid flat and viewed from the front, vertical, long narrow willow-like lanceolate leaf with a pale midrib and fine curved side veins that do not reach the margin, fresh mid green, leaf base at the bottom center edge
```

**H02 毛茛基生叶·俯视**

```
top-down view of a single basal leaf of meadow buttercup (Ranunculus acris), centered, deeply divided into 5 toothed lobes like a spread hand, fresh green with slightly paler veins, the leaf stalk attachment point at the exact center
```

**H03 火绒草莲座叶丛·俯视**

```
top-down view of a small rosette of edelweiss leaves (Leontopodium), centered, about 12 narrow lance-shaped leaves radiating from the center, covered in dense silvery-grey woolly felt, soft fuzzy edges
```

**H04 野罂粟花苞·侧视**

```
exact side view of a single nodding Iceland poppy bud on the top of its thin stalk, egg-shaped bud about 2 cm long covered in fine brown-green hairs, hanging downward, a crack showing a little yellow petal inside, the stalk curving up to the top center of the image
```

**H05 金莲花花苞·侧视**

```
exact side view of a single globeflower bud (Trollius), a tight small green-gold sphere of closed sepals on a short straight green stem, the stem ending at the bottom center edge
```

**H06 老鹳草果枝·侧视**

```
exact side view of a small forked stem tip of meadow cranesbill (Geranium pratense) after flowering: two long slender beak-shaped seed heads pointing upward like a crane's bill, one faded violet flower with drooping petals, fine glandular hairs, the stem ending at the bottom center edge
```

**H07 凋谢的滨菊·俯视**

```
top-down view of a single fading ox-eye daisy flower head, perfectly centered, about 20 white ray petals, many of them drooping, curled or browned at the tips and a few missing, a darker brownish-yellow center disc
```

**H08 凋谢的格桑花·俯视**

```
top-down view of a single fading pink cosmos flower head, perfectly centered, 8 petals, two of them missing and the rest slightly wrinkled and paling at the edges, the first petal pointing straight up, a darker gold center disc starting to form seeds
```

---

## 七、草穗与干草（新增 3 张，B 组续）

侧视，底部在画面底边中央。

**B7 雀麦·下垂圆锥花序**

```
exact side view of a single smooth brome grass stem (Bromus inermis) with a nodding open panicle of large flattened purplish-green spikelets on thin arching branches, stem base at the bottom center edge
```

**B8 早熟禾·圆锥花序**

```
exact side view of a single meadow bluegrass stem (Poa pratensis) with a small pyramid-shaped open panicle of tiny purplish-green spikelets on fine whorled branches, stem base at the bottom center edge
```

**B9 晒干的草丛**

```
exact side view of a small clump of sun-dried mountain grass on a dry south-facing slope, about 40 slender blades, straw-gold and tawny with a few green blades still at the base, a few dry seed heads, base gathered at the bottom center edge
```

---

## 八、雪岭云杉（新增 3 张，S 组）

用途：换掉现在程序画的云杉叶片，让近处的树有真实的枝叶。

**S01 云杉侧枝·侧视**

```
exact side view of a single horizontal side branch of Schrenk's spruce (Picea schrenkiana), about 60 cm long, the branch base at the left edge center and the tip pointing right, the tip drooping slightly, dense short dark blue-green needles on many small hanging side twigs, a few small red-brown cones, silhouette with small gaps between the twigs
```

**S02 云杉树梢·侧视**

```
exact side view of the top 1 meter of a Schrenk's spruce tree, a narrow pointed spire: a straight leader shoot at the very top and short dense whorls of dark blue-green branches below it, getting slightly wider downward, base cut at the bottom center edge
```

**S03 云杉树皮·无缝**

```
seamless tileable texture of Schrenk's spruce bark, vertical, grey-brown bark broken into small thin rounded scales, with a few darker cracks and patches of pale green lichen
```

---

## 九、房屋、毡房与地面材质（新增 12 张，T 组，无缝贴图）

**这一组不用前面的"通用风格后缀"，改用下面这句：**

```
seamless tileable texture, flat orthographic view straight at the surface, evenly lit, no perspective, no cast shadows, no objects on it, hand-painted stylized game texture with visible brush strokes, natural colors, square 2048x2048
```

T07 毡房门和 T09 地毯不是无缝贴图，用正常的通用风格后缀，把背景要求去掉即可。

**T01 原木墙**：`horizontal peeled spruce logs stacked in a log cabin wall, each log about 25 cm thick, weathered silver-brown wood with long cracks, knots and a darker line of moss-and-clay chinking between the logs, tiles seamlessly in both directions`

**T02 原木截面**：`end grain of a cut spruce log, single round cross-section filling the square, concentric growth rings, radial cracks, a thin rim of bark, weathered pale wood`（不需要无缝）

**T03 木瓦屋顶**：`roof of overlapping hand-split wooden shingles in staggered rows, weathered grey-brown with warmer brown on some shingles, a few patches of pale lichen, rows running horizontally`

**T04 旧木板**：`weathered wooden boardwalk planks running vertically, grey silvered wood with visible grain, small cracks and nail heads, thin dark gaps between the planks`

**T05 毡房白毡**：`thick white felt of a Kazakh yurt, slightly off-white and creamy, soft matted wool fibers, faint pressing marks and gentle creases`

**T06 毡房装饰带**：`a decorative band of a Kazakh yurt: traditional ram's-horn (koshkar muiz) ornaments in deep red and dark blue on a cream felt background, the pattern repeating left to right and tiling seamlessly horizontally, the band filling the full height of the square`

**T07 毡房门**（单张）：`front view of a traditional Kazakh yurt door, two narrow wooden door panels painted orange-red with symmetrical carved ornaments, a wooden frame around them, filling the frame`

**T08 石砌地基**：`dry-stone foundation wall of rounded grey and brown fieldstones of mixed sizes, fitted tightly, a little earth and moss between the stones`

**T09 哈萨克花毡**（单张）：`a traditional Kazakh felt rug (syrmak), rectangular, bold ram's-horn motifs in red, dark blue and cream, thick felt texture, stitched edges, viewed straight from above, filling the frame`

**T10 草下的土地**：`meadow ground seen from directly above between the grass: dark brown mountain soil with fine roots, a few small pebbles, dead grass stems and tiny green sprouts`

**T11 土路车辙**：`a dirt track seen from above: two compacted wheel ruts of pale brown earth with small stones, a strip of short grass between them, tiling seamlessly in the direction of the track (vertical)`

**T12 碎石坡**：`limestone scree seen from above: angular pale grey stones of mixed sizes, some with orange lichen, fine gravel between them`

---

## 十、蝴蝶（新增 3 张，K 组）

用途：花丛上飞舞，增加生气。要求：正上方俯视，翅膀完全展开、左右对称，身体竖直居中、头朝上（程序会沿身体中线把两边翅膀折起来做扇动动画）。

**K01 阿波罗绢蝶**（天山的代表种）：`top-down view of a single Apollo butterfly (Parnassius apollo), wings fully spread and perfectly symmetrical, body vertical at the exact center, head pointing up, semi-translucent creamy white wings with black spots and two red eye-spots ringed in black on each hind wing`

**K02 灰蝶**：`top-down view of a single common blue butterfly (Polyommatus icarus), wings fully spread and perfectly symmetrical, body vertical at the exact center, head pointing up, bright violet-blue wings with a thin dark border and white fringe`

**K03 荨麻蛱蝶**：`top-down view of a single small tortoiseshell butterfly (Aglais urticae), wings fully spread and perfectly symmetrical, body vertical at the exact center, head pointing up, orange wings with black and yellow patches and a row of small blue spots along the edges`

---

## 十一、生成后

1. 每条多生成几张，挑一张最干净的。挑的标准：只有一个主体；背景是纯透明或纯蓝（T 组除外）；轮廓完整；花瓣数正确；第一片花瓣朝正上方。
2. T 组无缝贴图挑之前先检查接缝：把图左右、上下各拼一次，看拼接处有没有明显的线。
3. 全部放进 `ref/plant_textures_v3/`，文件名以编号开头，告诉我一声。

## 十二、优先级

| 顺序 | 编号 | 数量 | 用途 |
|---|---|---:|---|
| 1 | C01–C03、C06 | 4 | 替换场景里最明显的问题花头 |
| 2 | G01–G05、H01–H08 | 13 | 新品种、花穗、花苞和凋谢的花 |
| 3 | S01–S03 | 3 | 近处云杉 |
| 4 | T01–T12 | 12 | 房屋、毡房、地面材质 |
| 5 | F01–F04、F01s–F04s | 8 | 灌木 |
| 6 | B7–B9、K01–K03 | 6 | 草的多样性、蝴蝶 |

共 46 张。
