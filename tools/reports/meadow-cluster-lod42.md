# 同源簇级远草几何层42（独立中间态）

现有distanceCanopy只改地面法线，不产生群落高度；普通中草62–78m退去，原根tile驻留范围也随78m结束。不能通过该法线修复远近体积。140m仅延迟缝，失败双卡和高fetch atlas不重做。

先对真实8m两坡作空间/法线聚簇：0.2m分桶理想三角减少仅草甸6.4%、西坡2.5%；放至0.8m才35.6%/21.7%，320m会产生约2px位移，因此不直接跨root合并微面遮掩分布。

当前独立候选由8m群落簇组织，所有root保留原位置/尺度/旋转/群落属性，24片单独叶与种穗全保留。8片长叶原三个有效三角变一个保原根中心、原尖、总面积、平均朝向的几何叶；其余16叶及种穗不改。每root有效三角45→29，约35.6%，没有atlas传输。不以面积统计守恒冒充覆盖或光响应通过。

模块meadow-cluster-lod42.js，独立浏览器页meadow-cluster-lod42.html。未接生态、主线或更改原密度。两项针对回归通过：原source不变、24叶/尖/面积、非零三角计数、距离误差响应。静态源三角到候选的距离上界最大0.147962m；反向仅采样最大0.133986m，不冒称严格双向界；需要乘实际root尺度。尺度1.7在320m约0.65px，故不能无依据宣布200m换层。真正阈值需实际风相位/多方位图像和覆盖/材质响应验收。

下一步先两坡320m正反向真实MSAA对照；若通过再多个距离/高度/时间。该层只解决远草几何表示，原78m到可接受换层距离还需要保留完整中草，并单独验证总驻留/真实遮挡成本、匹配渐隐与地形过渡，才可接生产。不能因独立模块通过宣称整个远近衔接已解决。

## 首批真实浏览器结果

Chrome页1839973444，320m、10°、风3.04、两坡各0°/180°，全部真实根。4组coverage相对误差分别+14.33%、-4.72%、-7.49%、+2.15%；单位光响应+49.41%、+12.80%、-45.18%、-11.48%，未通过，不能采用。没有GL错误，实际PNG核实为有限8m坡面投影（仅几十像素），不是全坡效果。证据meadow-cluster42-{meadow,west}-320-{0,180}-10-304-{source,candidate}.json/png。

定位到生成器错误：重新computeVertexNormals把原弯叶的平滑法线变成单片平面法线。已保留source原法线，几何和root均不改变，2/2回归通过；后续使用meadow-cluster42-normals-*独立证据，尚未实际运行，不能据此声称光响应已修复。几何压平导致的覆盖变化独立存在，保留法线不解决覆盖；必要时保原曲率的更高三角层，而不调alpha补密度。

## 真实24m群落与保守39三角层

导出器export-meadow-clusters42.mjs实际生成连续24m草甸458根、西坡770根，各447,124/503,117B gzip（含实际0.25m网格地形），不是8m复制。保法线29tri层在24m四例coverage -3.42%至+2.74%，但西坡正向response仍-26.24%，否决当前29tri作为可采用层。

按每片原叶的真实几何偏移筛选：只允许源→候选上界小于0.09m的叶0/5/6简化，另外21叶及种穗保原始几何/属性；每根45→39有效三角，根密度、所有叶数量不变。最大静态偏移0.0882m乘root尺度；零误差预算逐属性/索引完全恢复原source，4/4针对回归通过。仍是独立候选，不修改原62–78m主线范围。

实际Chrome3456，24m两坡、320m、10°、风3.04、正反向：

|坡/向|coverage误差|response误差|albedo误差|
|---|---:|---:|---:|
|草甸0°|+1.53%|+3.58%|+1.72%|
|草甸180°|+0.51%|-0.65%|-0.71%|
|西坡0°|+0.36%|-0.18%|-0.40%|
|西坡180°|+0.015%|-0.66%|-0.73%|

证据mc42-selective-24-{meadow,west}-320-{0,180}-10-304-{source,candidate}.json/png。这只是初步数值筛查，尚非美术验收/可采用结论；下一步需多方位、高度、距离、风相位和同尺寸轮廓检查，实际簇驻留、近中远匹配渐隐与成本尚未接入。测试页关闭，GPU交shore。

## 144组扩展筛查与实际图审

Chrome3464真实运行2坡×3距离(200/320/640m)×4方位×2仰角×3风相位，全部保存原/候选PNG，证据汇总mc42-selective-24-grid.json，无GL错误。coverage平均绝对误差分别0.77%/1.08%/2.00%，最大2.22%/4.56%/5.84%；单位response平均绝对1.70%/1.90%/3.42%，最大6.08%/5.82%/8.38%。各距coverage平均偏差约±0.2%，没有发现群落整体密度被系统削减。

随后实际浏览器打开meadow-cluster-lod42-review.html检查最差5组原PNG中央区域（4倍最近邻，仅显示放大，不改色值）：200/320m群落分块、空隙、上缘与种穗保留，局部像素变化可辨，没有新增整片或条带；640m是稀疏子像素点变化，不能称完全相同。图审页与3D页均已关闭。上述通过的是有限原材质/单个光方向/三风时刻的独立保真筛查，仍未证明整景所有光条件，更未证明性能和远近衔接完成。

## 独立运行候选准备

MeadowClusterRuntime42未接main，默认关闭；保原普通近/中草、湿岸与阴影所有权不动。自有group以原62–78m渐隐互补覆盖补出完整中草，屏幕误差预算0.5px按root最大缩放、当前绘制高度/FOV决定39tri层进入距离，原/简化层共用阈值互补，不重复密度。普通middle一致castShadow=false，保receiveShadow。只生成原grassAt根，原12字段与矩阵原样；借用既有湿根不释放其资产，自行生成但不使用的湿资产正确释放。

主+反射水平视域并集用于候选生成；64m源cell halo涵盖24m tile半对角、四段最多4.8m接触移动、根叶风包络与相机锚格余量，不按猜测terrain高度剔除。半径320m是有限路线测试边界而非远草消失距离，外侧24m淡出仍需整景检视；不宣称完整远坡已解决。每帧1tile、2.5ms软预算（单tile可能超出，须实测），首次驻留长尾和成本需实际运行。setEnabled可逆，dispose完整释放；与sourceRange39同时开启会拒绝，但默认关闭不影响该旧实验。9项针对回归通过。

## 默认OFF主线接点（待整体浏览器验收）

已按主线授权接入meadowCluster42=1、debug.meadowCluster、ecology统计与pagehide释放；远簇材料加入environment.register获得原CSM/云影处理。syncShadowState复用既有主/反射相机准备，每真实frame最多推进一次，不在反射/主render重复生成队列。worker safe参数已加入，原地形源未改。远簇自有原ecoField材质，既不复用普通grassMaterials也不进入meadowRootWind41缓存地址池，组合不会读取缺失root索引。原生态高空grassGroup隐藏时远簇同步隐藏，不留下孤立远环。共23项相关回归覆盖（11几何/runtime+12worker），最终源码freeze。

未完成：实际正式构建/完整代表路线图审、原与候选同条件GPU/CPU成本、远簇首次驻留长尾、转向新增簇的真实体验。这些不能用144组有限patch图替代；当前默认仍OFF。

## 主线整景结果与提交优化候选

主线已实际检查西坡on/off：meadow42-west-on.png/off.png，原78m外突然变平明显改善；真实279tile、206,539根、首次build累计5.339s，pending/q/m为0且无错误。原动态路径14秒ABBA证据meadow42-west-perf-{a1,b1,b2,a2}.json：最近60有效GPU样本均值10.548/37.744/37.863/10.625ms；实际帧间隔47.20/42.09/44.15/47.10ms，CPU存在顺序漂移不能归因GPU优化。候选增加420次draw和13,041,924三角，质量方向可继续但当前提交成本过高。

已实现meadow-cluster-submission42.js与可逆original/early/pool模式，默认original，不默认采用。meadowCluster42=1&meadowClusterPool42=1或debug.meadowCluster.setSubmissionMode('pool')：原tile全部root记录保留，只从scene暂时移出mesh用于回退。主+实际反射视锥并集使用完整风包络；原62m内/320m外与原45/简39层恒零区才可剔除，0.05m浮点保护边界只多保留原本不显示的工作。连续区间复制原Float32实例矩阵和12字段到两份共享池，所有有贡献root与渐隐重叠保持。池自己不投影，与原middle一致；若源材料/投影所有权改变明确拒绝，不能丢离屏阴影。

冻结同页切pool使用最后真实相机并立即准备，不推进风/根队列。相机、viewport、root集合不变时不重排和上传；移动才重选，记录updateMs/packMs/uploadBytes、容量与被共享几何所有者保留的字段内存。退休tile清掉bounds记录，回退原tile后仍可再次启用。针对主反射保留、Float32字节、静止0上传、移动重排、LOD任意有效阈值、阴影所有权与worker安全等26项相关回归通过。

源码已freeze；下一门槛是同一候选原提交→共享池→恢复原提交完整像素0差、原动态GPU净成本，以及实际移动时CPU重排/上传/GC。测试通过之前不能把理论2draw/通道当成实际帧率改善。

## Moving-view submission follow-up (2026-10-27)

The integrated pool has now passed the coordinator's same-page original/early/pool/original frozen image comparison with zero pixel differences at 1280×800 DPR1. Its dynamic GPU ABBA measured 38.935 / 21.571 / 21.289 / 38.879 ms; all 210,243 resident roots were retained. This is evidence for the ordered pool, not yet for stable slots.

`tools/benchmark-meadow-pool-movement42.mjs` regenerates actual west-slope roots with the formal DEM/habitat generator. Its fixed main-camera residency contains 279 tiles / 206,539 roots, rather than the browser's 284 tiles / 210,243 roots accumulated with its actual mirror/residency history. It tests 90 moving poses each for translation, rotation, and combined motion. It does not time GL uploads, actual mirror rendering, new tile generation, GC pauses in Chrome, or final frame rate.

Ordered differential packing preserves exact root order and bytes but is insufficient: deleting an early root shifts a long packed suffix. Upload remains 9.97–10.55 MB per pose versus 11.16–11.18 MB full packing. The new independent, default-OFF stable-slot option keeps surviving roots in their slots, fills removed slots from the tail, and writes only new or moved slots. No root, field, source geometry, wind, view union, or LOD transition is reduced.

The 270-pose actual-root test finds identical selected root-ID-sorted matrix and all 12 field bytes in full, differential, and stable modes. Stable upload is 7.25 KB / 12.09 KB / 19.33 KB per pose, with 2.86 / 2.78 / 2.71 ms Node selection+packing and approximately 0.56 ms packing. These are diagnostic CPU results, not browser performance acceptance. JSON includes all raw pose samples. Full/differential benchmark paths maintain root identity bookkeeping for comparison, so their CPU cost is not an exact reproduction of the pre-differential implementation.

The stable option changes opaque instance order. Zero source-data differences do not prove zero pixel differences where equal-depth surfaces overlap. It remains OFF pending actual same-phase image comparison after movement and actual dynamic GPU/CPU/upload validation. Use `submission.setStableSlots(true)` / `false`, followed by `submission.update(runtime.lastViews)`; perform a short move and return before comparing so the stable buffer has genuinely reordered. If pixel differences fail acceptance, retain the ordered path and evaluate fixed spatial sub-pools instead of lowering density.

Pending GPU update ranges are retained until renderer consumption; changing view without changing selected root identities produces no upload. Regression coverage includes this case, full source-field preservation during swaps, restoring ordered packing, main/mirror union, and rejection of new shadow-caster ownership. Runtime/submission targeted suite: 12/12 passed. No browser page was opened for this follow-up.

## Block selection and movement CPU follow-up

The coordinator subsequently verified stable-slot round-trip pixel equality and moving GPU ABBA with no loss: ordered 22.12 / 21.89 ms, stable 21.85 / 21.99 ms. Moving uploads fell from 10.72 MB to 39–42 KB. However, actual Chrome submission CPU remained 15.59 / 15.13 ms versus ordered 26.84 / 24.24 ms. The last sampled stable frames spent about 3.3–3.4 ms in packing, leaving selection as a material unresolved cost. These results do not justify adopting the candidate by default.

`submission.setBlockSelection(true)` is now a separate default-OFF candidate. Immutable source roots are grouped in consecutive blocks of at most 32. Cached union wind bounds and root-position/scale intervals establish whether every root has the same visibility and LOD mask; uncertain blocks fall back to the original exact per-root rules. A mixed-LOD block fully inside a view may reuse its masks only while the viewer displacement is strictly less than the minimum distance of every root from every original LOD threshold. Range/error-scale changes invalidate this cache. This is a conservative geometric test on every frame, not delayed or reduced-frequency visibility updates. Main/mirror unions and all original thresholds remain unchanged.

The candidate also reuses camera numeric state, frusta, and contiguous-run objects, avoiding matrix string joins and thousands of fresh run objects per movement update. `tools/reports/meadow-pool-block42.json` records 270 actual-source poses comparing selection sets and root-ID-sorted matrix plus all field bytes; every digest matches. The original ~145,000 per-root checks fall to ~26,389 for translation, ~18,007 for rotation, and ~26,228 combined. Node total selection+packing is 2.04 / 1.87 / 1.97 ms versus 2.85 / 2.74 / 2.77 ms without blocks. Upload volume is unchanged. These are CPU diagnostics on fixed main-view residency; actual Chrome main+reflection motion and end-to-end frame acceptance are still required.

Targeted runtime/submission tests: 14/14 passed, including exact endpoint constant-mask checks, safe-cache movement across thresholds, changed range/error scale, main+mirror union, and selection restoration. Source is frozen for coordinator browser verification. No GPU page was opened by this follow-up.

## Stable-slot interval delta (default OFF)

Coordinator Chrome tests confirmed block selection reduces submission CPU from 16–17 ms to 9.1–9.4 ms while GPU remains about 22 ms. The remaining pack stage sampled 3.5–4 ms; its full visible-root passes were therefore addressed separately, after rejecting the slower structure-matrix reuse experiment.

`submission.setDeltaPacking(true)` uses old/new ordered source-ID intervals to find additions and removals. It touches changed roots, rather than stamping every wanted root, scanning every occupied slot, and scanning all selected roots again. Removal preserves the original stable packer's exact ascending-slot/tail-swap sequence, including an unwanted tail swapped into an existing hole. Added roots retain original source order. Initial packing, capacity growth, unordered runs, or state transitions fall back to the established complete packer. Inactive range state is invalidated when another packing mode runs. Pending GPU ranges remain intact.

Actual west 279 tiles / 206,539 roots, 270 moving poses: EXACT slot-order matrix and all 12 field bytes match the original stable packer on every pose. No root-ID sorting is used to hide draw-order differences in this comparison. Upload bytes and range counts are identical. Node pack time is 0.164–0.200 ms versus 0.526–0.615 ms, total selection+pack 1.11–1.29 ms versus 1.48–1.81 ms. Evidence: `tools/reports/meadow-pool-delta42.json`; reproduce with `node tools/benchmark-meadow-pool-movement42.mjs --delta`.

15 targeted tests passed, including moving main/mirror views, retiring and replacing tiles, adding another tile, exact slot and attribute comparisons, and toggling the candidate. New source module: `web/src/v2/meadow-cluster-delta42.js`. No main changes, no GPU page. Default remains OFF until coordinator actual-browser pixel and moving CPU/GPU validation; Node improvement does not establish browser frame-rate completion.
