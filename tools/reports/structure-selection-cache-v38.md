# v38 静态建筑完整选择复用候选

状态：源码/针对回归完成；独立浏览器ABAB没有净收益，保持默认关闭。URL `structureSelectionCache=1`；同页 `debug.structures.selectionCache.enabled=true/false`，下一次正常 update 生效。冻结检查先 `debug.structures.update(debug.camera,0)`。

## 实际范围

保留原 camera/group 世界矩阵传播、householdLiving.update、householdEntrySteps.update；主循环门、太阳、室内 GI、材质和阴影更新完全不改。只在原静态建筑选择循环的全部实际输入及输出状态相同的情况下复用选择、阴影资格和统计。

精确检查而非几帧检查一次：相机世界位置/视投影/坐标与反向深度、投影尺度、shadowDistance、选择策略；共享实体ID/源矩阵/包围体/尺度/距离；部件role/LOD error/各实例滞回状态；选择缓冲/签名；实际 mesh 的世界矩阵、包围体、几何/索引与顶点数、instanceMatrix identity/version/count、visible/castShadow、活动ID；材质身份、transparent/lodgeThinGlass。输入被拆成独立数组仍检查值。变化立即走原完整路径并重新记录，不改根、LOD条件、阴影距离或任何资产。

材质opacity/color/roughness、光照uniform不参与该选择公式，不添加无效失效；它们由原渲染/GI链实时反映。关闭时释放缓存输入引用。镜头运动会失效，但复用依赖记录的底层数组，避免每移动帧重新分配约33万槽位。

## 回归

38项针对检查通过：`node --test web/src/v2/structure-selection-cache.test.js web/src/v2/structure-selection.test.js`。日志 `tools/reports/structure-selection-cache-v38-tests.log`。

覆盖32类实际输入变化、开关、生活更新不中断、固定帧不重新选择或上传、独立源数组、真实cabin资产近远往返/旋转/材质，以及完整364实体/18类正式资产的原选择对照（3250静态批次）。完整测试使用生产 WorldDoors.captureAsset，包含原3块门槛石迁移；首次测试漏提供WorldDoors，严格 stone AO 源校验失败，补齐真实前处理后通过，没有改资产或放宽校验。完整测试的实体坐标/旋转/尺寸来自当前数据，高度使用测试平面2200m，未声称DEM和浏览器画面验收。

完整静态输入流331400个值/引用、1005份去重源数组。检查开销不是免费；已有structures.update 4.23–4.75ms是原整项耗时，不能直接宣称全部可省。需看 `structures.stats.selectionCache` 的 hits/misses/checks/lastCheckMs/values 及真实整个世界 frame/GPU；新候选也可能没有收益。

## 绑定和交接

修改限定 `structures.js`，新增 `structure-selection-cache.js/.test.js`；备份 `backups/route-continuity-v38/structure-selection-cache/structures.js`。未改main、ecology、资产或默认质量。structures整文件参与prepared来源绑定，需集中真实等价再导出prepared；已通知父任务与world38，不单改hash。没有运行全套或构建，浏览器验收由父任务完成。

## 实际浏览器对照
固定林缘流水、14:30、1280×800/DPR1、全地形队列及形变归零，同页每组20秒，其他代理无CPU任务。关闭/开启/关闭/开启整帧为68.185/94.530/80.891/90.960ms，GPU30.989/32.354/31.544/32.757ms。开启没有整体收益，不能从旧的单组偶然帧率翻倍推断优化成功。当前仍关闭，未删减任何实例或细节。证据`docs/previews/v2-route-craft-38/structure-cache-recheck-{off1,on1,off2,on2}.json`。
