# Boardwalk74 同构建浏览器 ABBA — 76恢复后待验收计划

状态：**NOT RUN / 未运行**。2026-10-30 UTC，只读源分析形成计划；未启动浏览器、未执行测试。本文写入仅为任务文档，不改运行时或默认开关。此 stage3 gate 不得因 textile 进展被跳过。

## 固定来源

- 核对本地 HEAD：`450a2c0be9d7c1731058b991933d3167befcc147`。
- 冻结构建：`web/dist-cloud76-recovery`；四次不得重新构建。
- `v2.html` SHA256：`42b9359dcdfa469a6bd3414f781a6f2659efb99eb17d3581bd09e6e95166db1f`。
- `assets/v2-0l2TWQV9.js` SHA256：`ea4a32d3ef2201dd493cedf56a707a4b3edd6dff05538863a08267214f36fac1`。
- 以上是当前读取的文件哈希，不是新浏览器通过证明。运行前再次核对，并留存所服务资产清单/manifest和哈希。
- 源码依据：`web/src/v2/boardwalk-plant-contact39.js`、`terrain-row-worker-client.js`、`ecology-preparation.js`、`main.js`、`forest-root-source.js`、`boardwalk-contact-index74.test.js`。
- 运行约束依据：`tools/cloud-review75/{README.md,scheduler.md,monitor/README.md}`及`monitor/native_owned_monitor.py`。
- 历史证据：`tools/reports/boardwalk-contact-index74.md`，`backups/cloud75-baseline/native-world-static-07-default-contract-fix/kalajun-software-review75-case07-default-held3.json`。历史case07/08不得计入本轮ABBA样本。

## 固定输入

A / explicit OFF：

```text
http://127.0.0.1:5174/v2.html?view=pastoral-house_a-entry&time=870&softwareReview75=1&profile=1&houseTextiles62=0&boardwalkContactIndex74=0
```

B / explicit ON：只将最后的`boardwalkContactIndex74=0`改为`boardwalkContactIndex74=1`。

不添加`localShadowWindow42`或`nearShadowDetail`，保留默认local shadow ON；`boardwalkPlantContact39`缺省启用。保持全部密度、几何、LOD、接地、反射、源和缓存域不变，不添加其他候选参数。候选生产默认仍OFF，结果也不能触发自动默认ON。

实际固定viewport **1280×800 / DPR1**，不移动、不点simulation step、不运行自动60帧、不在加载后调整窗口。期望原入口pose：

- position `[-1741.3161458968743,2117.468597447125,3610.814826865227]`
- yaw `-128.8693031093039`、pitch `-11.281928628668062`
- time `870`、view `pastoral-house_a-entry`

无需seed参数：草根由`cellRandom(x,z,salt)`固定坐标散列及真实world/assets决定；不要添加不存在的seed URL参数（未知空间参数可能改变Worker兼容性）。

## 执行顺序及启动

**仅云端，不转移到Mac。** 等待其他构建、生成器、测试完成；本轮不并行CPU重任务或其他世界浏览器。四次顺序`A1 → B1 → B2 → A2`；每次全新profile，确认前一owned browser清理结束。全部使用新profile冷浏览器缓存；OS文件缓存不保证冷，不称磁盘冷启动。若有资源干扰、守卫失败或输入不一致，标记无效/阻碍，不选择性删除慢样本冒充改善。

在native Terminal分别服务冻结build和preflight（先确认端口无冲突）：

```bash
python3 -u -m http.server 5174 --bind 127.0.0.1 \
  --directory "$REPO/web/dist-cloud76-recovery"
python3 -u -m http.server 5175 --bind 127.0.0.1 \
  --directory "$REPO/tools/cloud-review75"
```

每次采用全新未存在run-dir，依次替换A1/B1/B2/A2：

```bash
python3 -u "$REPO/tools/cloud-review75/monitor/native_owned_monitor.py" \
  --run-dir "$REPO/backups/cloud-review75/contact74-A1" \
  --url http://127.0.0.1:5175/preflight.html \
  --window-size 1288,891 \
  --memory-tier software-world \
  --outer-seconds 1320 --cleanup-seconds 10 --poll-seconds 1
```

**`--window-size 1288,891`仅是前一机器窗口装饰尺寸的历史起点，绝不证明当前viewport。** 在轻量preflight以真实页面输出核对/调整至1280×800/DPR1后，再进入世界；当前窗口装饰不同就使用实际所需外框尺寸，记录四次一致的最终viewport。加载世界后resize会中止QA，不以resize后的画面冒充有效样本。

核对实际native页面WebGL2、ANGLE/SwiftShader、HDR RGBA16F/DEPTH_COMPONENT32F/4×MSAA；保持相同default compositor，不添加`--full-world-cpu-compositing`。不绕过sandbox/watchdog，不使用CDP或隐藏浏览器控制。不要从HTTP200/进程存在推断加载成功。

启动前及立即启动前MemAvailable≥8,000,000,000字节；runtime≥4,500,000,000字节；sampled sumRSS≤4GiB。sumRSS不是实际VRAM，包含共享内存重复计数。watchdog180s、fence210s、outer1320s包含设置/观测/清理，cleanup10s；不因未完成临时扩额。守卫终止/超时不是通过。

## 原始证据与等工作量门槛

每次初始held3/3后，用现有可见“显示诊断JSON”手动保存真实JSON，关闭textarea后拍native screenshot；记录monitor terminal结果和owned cleanup。不得仅凭signaled fence推断像素正确。不记录浏览器profile/cache/凭据为成果。

既有JSON已足够，无需新增前端诊断：

- `initialPreparation.ecologyPreparation.timings.grassRoots.{calls,totalMs,maxMs}`
- 同级`meadow`、`grassMeshes`等timings（**嵌套，不可相加**）
- `initialPreparation.ecologyQueuesMs/terrainPrepareMs/ecologyIterations`
- `loadTimings.phases.*`、`loadTimings.totalMs`
- `loadTimings.navigationToFirstFrameSubmittedMs/navigationToFirstFrameGPUCompletedMs`
- `assetTransfers`、backend、pose、viewport、Worker、生成/缓存源状态、pending、errors、完成frame记录

检查相同grassRoots56calls、grassTufts40043、grassChunks56。历史同入口还有basalGrassTufts3774、flowerPlants1050、flowerNearPlants97，作为当前比较的预期值；若不符应解释而非减少任务量。资产路径/encodedBytes对齐，transfer/duration只作缓存/IO诊断。Worker必须同样ready；源、几何、密度、阴影、HDR/AA不得变动。原离线测试覆盖全40043roots及完整near/far/basal实例属性字节相等；浏览器JSON总数/截图不能替代该字节等价证明。

检查initialPreparation迭代/各pending及held最终pending，不将held误认为完整场景ready。历史case07初始ecology90iterations/pending45，held pending43为far-tree，grassPending0、水pending0；terrain queue/morph/worker pending0。若四次相同残余工作，可报告等工作量局部CPU加载诊断，**不能通过all-queues-settled/full-quality**。

## 指标、通过边界及阻碍

列出四次原始grassRoots total/max、meadow、ecologyQueuesMs及加载各阶段；给A/B均值、范围和A1/B1、A2/B2差异。每组仅两次，不宣称统计显著；无一致优势则保留默认OFF并记录未证实改善。

软件QA `loadTimings.totalMs`含GPU完成等待。独立列为软件浏览器整体加载时间，不能将全部差值归因于boardwalk，也不能与历史Mac首帧/硬件FPS直接比较。`completedFrameSimulationSeconds`不是FPS。**相同软件backend仅控制比较条件，绝不证明目标GPU FPS、VRAM收益或实时性能。**

待办必须持续保留：本轮新ABBA、页面加载长尾是否改善、all-queues/full-quality、目标硬件FPS、最终1080p桌面验收。1280×800只是诊断条件。历史nativecase07/08仅特定初始静态三帧证据，非新验收。

回归状态独立记录：恢复后focused391通过；full未重跑，最近完整1992/1993仍有原terrain2500ms readiness失败，不放宽断言、不标全通过。执行前依据当前代码变更选择检查；不得将此计划视为批准忽略已知失败。若浏览器能力/资源门槛或同构建条件不成立，记录具体阻碍并保持NOT RUN或FAILED/INCONCLUSIVE，不擅自降低密度/质量或自动采用候选。
