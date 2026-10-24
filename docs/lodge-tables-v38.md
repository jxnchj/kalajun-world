# 公共楼餐桌、前台与茶几木作候选 v38

状态：主线实际验收餐厅、前台、茶几及支脚通过，q0/m0/errors 空；前阶 W、UI 开门、W 入楼和 S 返回真实通过，新 GI key、门角 1.75、occupied 正确。已默认采用；lodgeTables38=0 保留 chairs 对照。下文默认关闭和待验收描述是历史阶段状态。

## 交付与范围

- 完整源：`assets/src/v2/settlements/lodge-tables-v38/lodge-tables-complete.glb`（20,106,596 B），SHA256 `853f5690686eceaa85f00b2df0705343e55b6aea4286f599e07ee121dd170687`。
- 可编辑完整 Blender：`assets/src/v2/settlements/lodge-tables-v38/lodge-tables-complete.blend`（14,990,194 B），SHA256 `df108dbc9b815cf2baf3cc8b8f6337c7eacc86d11f823f151af71903551c57d0`。新构件独立可编辑源为同目录 `joinery-editable.blend`。
- 原源 `web/public/assets/v2/gh_lanchuan_lodge_chairs38.glb` 完整保留，SHA256 `1025f39e99a19324945adfceb1f333514590c11761ea0205941e62635e8c6b3b`。
- 四餐桌保留原台面 1.9 × .9m、厚 .05m、高 .765m 和 16 腿位置；台面 4.5mm 真倒角，腿 .060 → .043m 收分、2.5mm 倒边、内侧围板及小木销。底面落原 .020m 地板。
- 前台保留原占地和顶高 1.145m，台面 5mm 倒角；侧板、三块嵌板、连续框条、内退踢脚与承托板。框条之间不共面重叠，首轮预览暴露的黑斑已通过修正构造消除。
- 原 14 边茶几改 64 段圆周，原台面矩形包络和最高 .456m 不变，50mm 厚、4mm 倒边；使用原 oak 木皮连续弯曲封边，不以法线主轴硬切成异色端纹块。原漂浮圆盘新增三根收分支承和台下承托，全部在原台面水平范围内；三脚底分别精确位于原地毯 .026m，未深穿地面。

## 原几何保留与实际成本

严格验证从两份实际 GLB 用 GLTFLoader 解析。仅删 23 个原连通组件（4 台面、16 腿、前台体/顶、茶几）320 三角，新增 72 构件、14,560 三角。其余 113,768 三角的原顶点属性、原 AO、材质编号、节点和门变换保持；其索引逐项保持原顺序。完整总 128,328 三角，净增 14,240。原完整二进制前缀逐字节一致。

新几何采样 64 个真实 AO 方向，局部距离 1m、天空 40m；使用完整建筑背景遮挡，只排除原透明 glass，非全白填充。没有改原楼其他 AO。

复用既有 Poly Haven Oak Veneer 01（CC0）及既有端纹，不新增图像来源；3 个相同图片 payload 和 texture 索引直接复用原 GLB，避免重复打包。UV 按米制 1.83000004m 与每组件固定偏移；正常长轴纹理/真实端纹分区，茶几侧缘是连续木皮封边。用于后续 GI 的纹理有效线性漫反射均值为 `[.2368234843, .1161427274, .0553480685]`；metadata 区分有效均值与单独 baseColorFactor，不能把纹理颜色因子当反照率。

本次生成约 0.62s，完整精确拼接/真实 AO 约 2.58s，六张 Cycles 64spp 1200×900 中性棚拍预览约 75s。以上为离线 CPU 成本，不是网页性能证据。

## 验证与预览

实际差异证明：`tools/reports/lodge-tables-verified-v38.json`，可复验 `node tools/verify-lodge-tables-v38.mjs`。脚本只验证候选，不 build。

同目录六张图：`dining-group.png`、`dining-joint-close.png`、`reception.png`、`reception-edge-close.png`、`tea-context.png`、`tea-edge-close.png`。这些是中性棚拍，保留原椅/沙发/地毯作为尺度上下文；不是世界光照或浏览器验收。

## 接入前仍需做

候选改变几何/实际遮挡且新增茶几支承，必须使用新完整源 SHA 真正重采全楼三门态 GI、接触及相关开口，不能复制原数据改 hash。碰撞需按新完整源核对新支承、柜体和实际通路；保留有意原椅替代碰撞合同，不把旧完整碰撞 hash 冒充新源。新 stream 必须重新精确分区和验证；当前生产分包完全未改。

还没有实际浏览器近景、完整餐厅行走、前台/茶几碰撞或 GPU 成本证据。美术仍为待审候选；木材磨损与最终整体光色不在本次范围，完整光色仍按原计划。

## 独立接入准备（后续更新）

主线审过六视图后批准进入显式 `lodgeTables38=1` 候选，默认仍关闭；`=0`/不传保留现行 chairs/stream。完整源现发布到 `web/public/assets/v2/gh_lanchuan_lodge_tables38.glb`，仍为上述 853f5690 源，旧源未变。

- 新 definition 导出独立 `gh_lanchuan_lodge-tables-whole` GI 身份、对应 SOURCE/ASSET/DOOR；新 loader 在解析前校验真正解压字节 SHA，不默默回退原源。与显式旧家具/椅关闭请求冲突会拒绝。
- 实际结构静态 128,232 三角、门 96；碰撞 77,832 三角：原 24 椅保留 1,728 三角代理，新桌台/茶几用实际 14,560 三角。没有把原完整碰撞包再次叠加，也没抹掉茶几新脚。
- 原楼前 12 级阶、闭门阻挡、开门进入、前后厅双向行走、退出/返回后门状态、原椅/沙发/洗衣机阻挡，实际 Rapier 回归通过。额外使用新桌/前台/茶几真实三角和生产尺寸胶囊测试其扫掠阻挡，中央餐厅走道可通过。此项为程序物理验收，尚非浏览器实际步行。
- 真实精确分包：shell 38,012 + interior 90,316 = 128,328 三角。原属性/节点/三角一次且仅一次，无几何删减；新几何只放内装包但沿原 body 角色安装，未缩成短距离 interior。余下原木作 348 三角保持原米制字段，仅重新绑定实际剩余 index。新几何自带正确 UV/PBR。
- 全包及真实增量安装后的分包运行时，全部角色三角数、完整木纹和碰撞相同；尚未 complete 时碰撞拒绝。原默认分包和全包未被覆盖。
- 完整 GLB 无损 gzip 20,106,596 → 13,610,106 B；独立 shell gzip 1,608,608 B，interior gzip 12,307,725 B。真实解压字节与原始 SHA 一致，不能把这些体积当冷启动耗时收益。

相关定向 **16/16**：loader 4、真实 route/全包分包运行时 2、新分包 3、原 wood 回归 7。日志 `tools/reports/lodge-tables-{loader,route,stream-tests}-v38.log`。没有重复全量或 build；整楼三门态新 GI 的真实重采与独立回归见下文；尚无本候选浏览器验收。

生成入口：

```sh
python3 tools/prepare_lodge_tables_source_v38.py
node tools/build-lodge-tables-wood-v38.mjs
node tools/build-lodge-interior-stream-v38.mjs --tables
python3 tools/build_glb_transport.py --only gh_lanchuan_lodge_tables38
node --test web/src/v2/lodge-tables-loader.test.js web/src/v2/lodge-tables-route.test.js web/src/v2/lodge-tables-stream.test.js web/src/v2/lodge-interior-wood.test.js
```

主线整合仍须最后统一 prepared 真实再生、build 和同机位浏览器/真实步行验收后决定采用；本项不提前改变默认。

## 新完整源三门态 GI 与严格独立交付

从上述最终 GLB/Blend 实际几何重采，使用新 `gh_lanchuan_lodge-tables-whole` key；没有复制旧 chairs 数据后改 SHA。闭态有效性先实算，2992 / 3055 探针，首天空单项 6.34s。随后三进程各 2 线程、独立输出，闭/半/开角度 0 / .875 / 1.75 rad，实耗分别 405.662 / 381.649 / 378.989s；这些是并行各任务耗时，不能相加声称墙钟时间。

每态均有完整 local/cross 天空一二阶、81 方向太阳一二阶与开口；真实 128136 不透明三角参与计算，透明原玻璃仍按原 .9 透射处理。采样保持原 96 射线、32 表面方向、81 太阳方向。闭态另重采 .025m / 64 方向接触表，并实际验证其与旧 chairs 接触数据不同。纹理有效漫反射来自最终绑定的 materialReflectance，不把 baseColorFactor 冒充平均反照率。原采样属于静态低频近似，不是完整动态全局照明。

独立文件 `lodge-tables-data/{0,1,2}.js` 与 `lodge-tables-package.json`；闭态 gzip 6,633,435B，门态无损 XOR gzip 2,793,157B，共 9,426,592B。实际解码后与三个原始状态对象逐项一致。旧源 fallback 被校验拒绝；损坏交付仅允许回退同一个新源的完整字段。

针对回归 **17/17** 通过：新源与 Blend 实际 SHA、三态实际叶轴/玻璃透射/原采样、实际 RGB 合成、四室 key/接触一致、夜间归零、离开/返回、数据包损坏、新旧 stream sourceBinding 隔离、默认仍 chairs 和准备闸/失败重试。该 RGB 为运行时代码的数据验证，不能替代浏览器视觉验收。日志 `tools/reports/lodge-tables-gi-tests-v38.log`；烘焙日志及实采摘要为 `tools/reports/lodge-tables-bake-{0,1,2}-v38.log`、`lodge-tables-gi-{0,1,2}-v38.json`，无损结果 `lodge-tables-package-v38.json`。

复现烘焙需 Blender 的 Python 模块路径显式包含 `tools/blender`，重设 `sys.argv` 后用 `runpy.run_path('tools/blender/v2_lodge_whole_bake.py',run_name='__main__')`。先 `--tables --index 0 --validity-only`，再三态 `--tables --index 0/1/2`；打包 `node tools/build-lodge-whole-package-v38.mjs --tables`。

## 默认采用收口

空 query 默认新源的加载、GI、真实 Rapier 通路以及全包/分包一致性均继续验证，旧源专测显式选择 tables=0。10 文件 46/46 通过；随后 prepared 真实再生及严格回归 7/7 通过。源码冻结，未全套或应用 build。新 GLB 额外约 5.247 MB roughness 本次不改源，它只在内装包，不增加林溪初始 shell 内装请求。低频 GI 与完整光色仍须按原计划完善。

## 主线实际浏览器验收与默认入口

固定5174、1280×800/DPR1、time870，检查餐厅、前台、休息厅、茶几整体和支脚。证据lodge-tables-candidate-{dining,reception,lounge,tea-context,tea-feet}；全部q0/m0、errors空。前阶真实W登阶、UI开门、W穿过门洞进入、S沿原门返回均通过，grounded持续有效，未使用setPose跨越门洞；入口证据lodge-tables-front-stairs-walk、lodge-tables-real-door-entry/return。实走时新GI key、实际sourceSHA、门1.75rad和occupied正确。

主线据此默认采用，未宣称整室最终美术或完整动态GI。采用前整合1294/1294通过；采用后46项默认/旧源及7项prepared针对通过，真实prepared再生。最终默认build通过，无tables参数的lodge-tables-default-dining q0/m0/errors空、新源GI ready；默认林溪lodge-tables-default-forest q0/m0/errors空，内装stream仍shell且attempts0，没有为了细化家具将新内装提前送入林溪。

新粗糙度图虽导致完整源增加5,246,713B图像，原未使用的几何不可达数据不进入默认stream。主线已核实来源；后续仅考虑严格无损压缩，不缩小贴图、不削掉新几何细节。木纹反弹仍低频均值、墙面与软包细节及完整全局光色仍中间态。

## 后续无损纹理机会（未采用）

仅离线验证新增 roughness PNG 的精确调色板编码：2048×2048，5,246,713 → 3,810,292 B，减少 1,436,421 B（27.38%）；单图 gzip 5,248,319 → 3,811,378 B。全部 4,194,304 像素 RGB 逐字节相等，index G 精确映射 RGB(255,G,255)，无量化/缩放。报告 tools/reports/lodge-tables-roughness-palette-v38.json。主线决定本轮不采用，不为此修改刚验收的完整 GLB/Blend/三态 GI 或重新采样；生产源 SHA 不变，默认森林只请求 shell，不加载这张内装图。GPU 解码大小不变，不能声称帧率收益。
