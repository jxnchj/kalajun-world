# 溪岸接地校验长帧修复（42）

实际来源 `terrain42-ecology-spike-a.json`：3241.8ms 帧内 reach.update 3191.6ms，ecology 3197.6ms；已 built 且无 generate.next。因此定位为地形细化后的同步接地/包络重验，不是上传、着色器编译或 worker 回包。

实现保留全部 521 根、240232 三角和原逐叶接地、水体/石材包络、burial 修复逻辑。变化的 binding 立即令原位置不可见，按轮转顺序验证后才显示；未验证状态绝不提前显示穿插。接地 Float32 位移输入逐值完全相同时复用该根上一次完整 verdict 和输出（包括 burial 修复），不按容差合并、不重复叠加修复。不同位移仍执行原校验。

默认 2.5ms 只是批间预算，至少处理一个根，不是单根硬上限。真实 v3 Node 测试 521 根累计校验 2512.04ms，单根最大13.89ms、update最大14.11ms，所有根最终 ready。这是局部 Node 证据，不冒充浏览器帧率；冷启动实际复验尚待主线。地形变化后可能暂时隐藏待验根，这是明确的中间加载状态，根/叶不会删除。`stats.contact42` 报当帧 validated/reused/queued/maxRootMs，`stats.contactTotals42` 报生命周期累计及最大更新耗时。

轻量测试验证521根同时失效、未验证隐藏、逐根公平处理、相同输入缓存、burial不累加、变化后全部重验；排空结果逐值等于同一边界 oracle 的无限预算结果。既有真实几何断言保留，仅在判断最终结果前排空待处理队列。

正式再生：`node tools/build-reach-cover-prepared42.mjs`。备份在 `tools/backups/reach-contact42/`，压缩485353字节及解压2067069字节均与原包完全相同；仅 manifest 的真实源码绑定变化。meadowRootSourcePaths、forest binding 以及8m/24m参考源均不含此次 owner，未再生它们。无 main 改动。

## 浏览器单根长帧的第二次修复

浏览器首轮实测 `terrain42-adaptive-rule-slow.json` 中累计 validation10538ms、maxRoot286.8ms/maxUpdate287.4ms，不能用前述 Node 14ms 宣称完成。该次 CDP 网络限速未覆盖 Worker，亦不能称慢网测试。

本轮优化保留原水体 clip/SAT 作为导出 oracle：对未按水面高度裁切的完整三角，先使用原水条带边法线做保守投影排除。拒绝范围另加1e-7m裕量，最终原裁切和 SAT 阈值完全不变。没有直接用 XZ bounds 加 padding，因为原 SAT 的法线 padding 在锐角处不保证被这样的盒子包住。条带仅在单次同根验证/恢复中复用；每次查询仍使用原 radius 的 nearSegments。

临时接地几何仅复制发生变动的 position；原索引、wind及其余只读属性共享。逐叶 burial 恢复按源 index/version 缓存精确叶索引，不再每叶复制整株所有属性。恢复依然对全部叶执行原水界并修改相同真实位置。新增 contactPhases42 分别统计 cloneSeat/envelope/water/stone/recovery，便于实际浏览器辨别首次石壳构建等剩余成本；这些分项可能嵌套，不能直接相加。

Node 实际521根及同根下沉2cm，共1042个原SAT结果逐一一致；4个完整mat恢复后的叶分组和position数组与旧完整算法一致。该批原水界累计4001.8ms、新740.0ms；完整521根接地累计1265.9ms，maxRoot8.47ms、maxUpdate8.77ms。这仍是局部Node结果，最终Chrome冷载需主线重新验收，不承诺硬帧预算。三个修改模块均不在meadow/forest根或8m/24m参考绑定，仅prepared包真实再生。

## 实际三角输入的 prepared 精确判定

只读采集 `reach42-contact-observed.json`：521根、11069叶组、全部与当页缓存input逐位一致；正在运行source code为6f4efdc...，不是新源码伪造的hash。可复现原始输入保存在 `tools/fixtures/reach-contact-observed42.json.gz`，gzip解压保持原证据字节；旁置当时的prepared manifest。原生成器核实两者旧code一致、world inputs与当前一致、全部root变换及seat点/level一致，每个sample.height与原三角weights×vertexHeights精确回放一致；随后重新调用完整validateContact42得出新verdict，浏览器verdict未用作真值。

每组保存input/output的Float32位模式，不把JSON小数或容差当匹配。并入同一prepared记录、原网络请求、原当前source hash机制；不单独下载contact数据。首次runtime真实samples全部ready且每个位置input逐位相同才复用，粗网格、morphing、不同root、1 ULP变化或未匹配输入继续原增量验证，不先显示。观测样本只有一次实际视点，不预保证新冷加载过程全部命中。

包gzip615243B（原485353B，增加129890B），解压2819569B。离线521根完整重验全部ready；9项回归通过，含真实捕获521根prepared命中与完整runtime重验的全部seat/ready/失败/burial字段一致，以及1 ULP/morphing/notready/不同root回退。主线应复核新冷加载 `contactTotals42.preparedHits/validated` 和真实最慢帧；最终合批/binding及其它模块的长帧不因本项而视为解决。

## 正式冷入口及浏览器完整算法复核

`terrain42-contact-verdict-cold` 实际默认入口521/521 preparedHits、validated0、pending0，累计77.9ms/maxRoot4.5ms/maxUpdate15ms。随后 `reach42-contact-verdict-browser-oracle` 在同页held状态以每根原input执行完整validateContact42，156194个Float32位值、521根全部ready/failure/recovery均0差；这是实际浏览器结果。保全部240232三角与原根叶。整合1718/1718通过、主build通过。其它加载阶段和整体帧率仍未结案。
