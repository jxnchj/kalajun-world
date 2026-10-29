# 第38轮：完整普通草源记录与字段缓存候选

默认关闭，浏览器整体冷启动、连续游览与画面对照尚待父任务验收。没有将 Node 数字当成网页冷启动收益。

## 已定位的工作

实际保存的林溪加载记录中 ecologyQueues 为10.18s，远树5.56s、草甸2.65s；brook-lanchuan 初始生态队列6.66s，其中草甸4.33s。这些样本存在明显系统时延波动，不能用单次最好结果作稳定性能结论。

短 Node 诊断使用真实 DEM、地被、河道、栖息地数据，对林溪54瓦片、19403草根执行90次准备；未加载花GLB，不据此判断花耗时。草路径371ms，其中最终根生成265ms、草mesh与字段87ms、基底草池11ms。详见 meadow-parts-v38.json。浏览器 prepareEcologyQueues 增加瓦片/池级分项 grassRoots、grassMeshes、wetMeshes、flowers、nearFlowerPool、basalPool，原 meadow 总项保留；嵌套项目不能和总项相加。

## 候选

- `meadowRootCache=1` 启用；省略或0不请求缓存。新增 `ecology.stats.meadowRootCache`。
- 代表林溪及 brook-lanchuan 共111瓦片、99900原始来源槽、45486完整普通草根。保留空槽、来源ID、所有最终位置/比例/旋转/迁移标记、JS Number精度（含负零），以及12个Float32字段的原始字节。
- 原图元、草根数量、所有LOD距离、近/远/基底布局、风与阴影不变。特殊 brookAsset 来源格保留原算法回退标记；当前覆盖的默认两场景没有这类格子，专门的湿岸变体会旁路缓存。花仍走原过程。
- 不减少90次准备，不改变队列完成条件。载入未完成、瓦片未覆盖或校验失败就完整生成原数据。
- 缓存传输/解码与资产请求并行；只有实际解码世界与两张栖息地数据的哈希匹配后才发布。源码35文件绑定（包含生态草根算法和草叶几何、相关世界/碰撞/地表依赖）；源变动会回退，不能静默套用旧记录。
- 空间试验参数显式旁路。新的 boardwalkTimber 只消费原有冻结路线与地面派生渲染/物理形体，不修改草源路线排除器或world数据；已用真实场景输入和最终草buffer验证兼容。若后续它接入草根计算，相应ecology/排除器源码绑定变化会使旧包失效。
- 原始包10382316 B，gzip4011243 B。新增传输、JSON解析、字段解码和内存必须纳入完整冷载验收，不能只看草生成分项。

## 验证

22项针对与既有回归通过（约2秒），包含：完整槽/空槽、负坐标/负零、字段原字节、损坏与HTTP失败回退、实际输入/源码变更失效、取消释放、HTTP透明解压、早预取不提前发布、移动根使字段缓存失效，以及草字段/延迟上传/准备90轮回归。

生成脚本对111瓦片逐根和Float32字节检查。独立真实 WorldEcology 测试在林溪对比90轮原路径和缓存路径：54瓦片、19403根、近远及基底草实例矩阵与三个字段buffer、边界、数量和castShadow均相同；同时开启并实际构造boardwalkTimber确认世界/栖息地哈希及这些输出保持一致。测试未加载花GLB，花的浏览器正常路径仍需验收。

生成：`node tools/build-meadow-root-cache-v38.mjs`。

针对检查：`node --test web/src/v2/meadow-root-cache*.test.js web/src/v2/grass-root-field.test.js web/src/v2/ecology-deferred-upload.test.js web/src/v2/ecology-preparation.test.js`。

## 实景验收重点

同一林溪/岚川URL各做cache off/on，固定其余参数与浏览器条件；记录 ready、hits、cachedRoots、prefetchMs/decodeMs、initialScene、initialShaders、firstFrame和总cold时间。对照原始根/草数量和同镜头图像；再离开覆盖范围确认原程序完整生成。若启用brookLandform等空间试验，出现bypass是明确的正确保护，不能据此评判缓存速度。

目前仅候选与源/字节验证完成，不宣称加载长尾、整体帧率或大阶段完成。


## 2026-10-24：去除近草建立时被覆盖的实例球计算

默认源码只去除 `addGrassMesh(lod=0)` 中、紧接着会被 `refreshPlantBounds` 完整覆盖的 `InstancedMesh.computeBoundingSphere()` 和半径加1。保留 geometry.boundingSphere 初始化；最终 box/sphere、风包络与所有属性不变。中草 lod=1 原路径保持。没有新增开关或修改队列/90轮/时间预算/密度。

真实生成草几何与137个非均匀缩放、旋转、岸迁移根，4个相机位置（含空范围）及近中两LOD逐字节比较矩阵、全部属性和index；最终对象/几何包围盒与球及多个视锥结果相同。专测确认近草不再遍历实例合并废弃球，中草仍执行原循环。草字段与准备回归合计11/11；实际缓存/程序世界等价与绑定另11/11。日志 `grass-bounds-publication-v38-tests.log`、`grass-bounds-meadow-tests-v38.log`。

由于 ecology.js 属于严格源绑定，已实际执行 `tools/build-meadow-root-cache-v38.mjs` 重生两锚点90轮数据，并对所有解码源格与Float32字段校验。仍111瓦片、45,486根、raw 10,382,316B、gzip 4,011,243B，raw/gzip SHA均与改动前完全一致。见 `grass-bounds-meadow-regeneration-v38.log`、`grass-bounds-meadow-equivalence-v38.json`。未只更新签名。

这里只证明移除了局部CPU无效工作及结果等价，未测整页冷启动收益，不承诺解决约3.6秒生态准备长尾。实际同条件cold对照与统一构建由主任务后续完成。

### 原拒绝条件提前：保留逐根结果，减少法线采样

`ecology._grassAt` 现在先执行原有水覆盖、源格密度与 patch 拒绝条件，再计算坡度法线。所有阈值、cellRandom 坐标/seed/表达式和最终根字段、草岸迁移顺序均保持。cellRandom 是无状态哈希；该改动只是避免为已经注定淘汰的候选执行 normalAt 的四次高度查询。没有新增缓存、减少草密度或更改几何。

冻结旧方法与当前方法在实际 DEM、地表分类、水文和生境数据上逐格比较（`grass-root-rejection.test.js`）：

| 区域 | 源格 | 保留根 | 湿岸根 | 原 normalAt | 新 normalAt |
|---|---:|---:|---:|---:|---:|
| 林溪 | 8,100 | 3,172 | 0 | 9,675 | 5,065 |
| 草甸路线 | 8,100 | 2,070 | 0 | 7,991 | 2,256 |
| 中心草地 | 8,100 | 6,784 | 0 | 8,100 | 6,784 |
| 溪谷湿岸 | 8,100 | 5,803 | 64 | 9,161 | 7,909 |

全部 32,400 源格（包括 null）、17,829 根完整字段、三组 root field 和 64 株湿岸全部叶片属性/index/seating 完全一致；12,913 次无效 normalAt 查询被省去。测试通过 4/4，证据 `grass-root-rejection-v38.log`。这些计数包含实际迁移/根字段过程，不是伪造平地 fixture；仅证明局部 CPU 工作减少，不表示整体冷启动长尾已经解决，也不代表 GPU 帧率改善。

实际重新运行 `build-meadow-root-cache-v38.mjs` 和 `export-meadow-patch-v38.mjs`：111 tile / 45,486 根 / 99,900 source slot、4,011,243 B 草根压缩缓存与旧文件逐字节相同；独立参考 55 根、全部几何/地形/field 数据完全相同，仅实际 ecology 来源签名改变。对应结果见 `grass-root-rejection-regenerated-v38.{json,log}`。没有修改旧 hash 冒充重生。森林缓存不直接绑定 ecology.js，本项没有改变森林根来源。

## 10月27日：新默认林溪完整实测与限入口采用

旧组合没有可靠收益的结论不更改。本次单独草缓存发现参数被地形Worker白名单拒绝，修正后同构建禁HTTP缓存（IndexedDB保留）A/B/B/A：

| 项目 | 原A1 | 缓存B1 | 缓存B2 | 原A2 |
|---|---:|---:|---:|---:|
| 首帧秒 | 21.45 | 17.18 | 17.07 | 19.93 |
| 地形尾部秒 | 82.01 | 76.56 | 66.92 | 79.43 |
| 生态准备秒 | 10.19 | 6.14 | 6.04 | 9.11 |
| 草根计算毫秒 | 4347.40 | 1223.50 | 1219.00 | 4003.70 |
| 加载帧p95毫秒 | 166.70 | 166.60 | 141.90 | 159.50 |

真实浏览器54瓦片19,403根（含84原几何湿根），所有根记录、近中实例矩阵、全部geometry属性/index、wet几何、基底池逐SHA完全相同；errors空。数据见 meadow-cache42-browser.json。

源码将仅已验收初始view=river-forest默认启用，0保留原计算；其他入口不自动下载有限局部包，显式1可对照。离开包覆盖范围继续原算法，强绑定/失败/取消保护保持。仍待采用后默认构建与浏览器复验，不称全世界冷启动或整体FPS已经解决。包约4MB压缩、本地HTTP实测，未推断公网收益。误关Worker的首轮样本已明确排除。

正式默认入口复验完成：无缓存实验参数，cache ready/54 hits、19319缓存根+84原几何湿根；所有tile/base摘要仍与原始相同，errors空。首帧17.45秒、地形尾部78.19秒。完整回归1541/1541与构建通过，故本项限林溪初始入口正式采用；整体帧率与全域加载继续开放。
