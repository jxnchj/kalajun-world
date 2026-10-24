# v38 同批树根主相机顺序候选

状态：实际独立 ABAB 整帧验收没有净收益，拒绝默认采用，继续关闭。入口 `treeRootOrder=1`。运行时对照 `debug.ecology.treeRootOrder.enabled = true/false`，由下一次正常生态更新发布；冻结诊断切换后先调用 `debug.ecology.syncTreeDynamics(debug.camera)`。

## 已实现

- 只处理现有 mode 1/5 空间批次；同一 SpruceRootWind 缓冲对应的树干、内冠和照片冠共同保持相同根排列。mode 12 细针与其他生态组不动。
- 根据主相机实际世界前向，对根的有符号视深作稳定近→远排序。平移给全部根加相同深度，不改变次序；旋转和成员 revision 变化才检查排序。
- 原矩阵逐 16 float 原样排列，共享风逐 5 float 原样排列；保留 activeRecords 对象及 activeIndex 正确对应，原 records 不改。静止机位不重复排序/上传矩阵，逐帧风仍由原采样器生成、原共享缓冲提交。
- 发生排列变化才提高一次 treeBatchRevision，让既有阴影状态、视图实例缓存、可选根球缓存正确失效。不新建 pass/draw/geometry，原全部索引、UV、三角、LOD 和根集合不减。
- 运行时关闭恢复单独跟踪的原 swap-removal 顺序；成员进出和新建组仍适用。默认 off 不扫描全部树，不建立排序记录。
- 所有主画面、镜像、CSM 都使用这一主相机顺序。没有声称镜像/太阳视点也近→远：可能因此变慢，需要真实完整帧 A/B，不能只引用主画面净收益。

## 验证

`node --test tree-root-order.test.js spruce-wind.test.js tree-view-batches.test.js`：34/34 通过，日志 tree-root-order-v38-tests.log。
原 ecology-tree-active 中 active-prefix 实际系统回归：1/1 通过。
覆盖默认关闭、矩阵和风逐根一致、同组多部件共享、稳定帧无矩阵上传、风仍更新、相机旋转/平移、真实 active-prefix swap-removal/重入、新建组、原根 records 不变、其他 mode 不误改、冲突数据拒绝，以及 syncTreeDynamics 根准备开关的实际接入。

## 实际浏览器验收：拒绝默认采用

父任务完成独立 ABAB：1280×800、DPR 1、time 870、fullq/m0；测量窗口没有 build、bake 或 CPU 测试。

| 顺序 | 状态 | 整帧 ms | GPU ms |
|---|---|---:|---:|
| 1 | off | 71.2188 | 32.1492 |
| 2 | on | 71.3071 | 32.4643 |
| 3 | off | 70.0655 | 31.5009 |
| 4 | on | 73.2612 | 32.3290 |

两组均值：off 整帧 70.64215 / GPU 31.82505 ms；on 整帧 72.28415 / GPU 32.39665 ms。开启后整帧约 +2.32%，GPU 约 +1.80%；未获净收益，不采用。不同 pass 的根顺序收益不能替代这份完整帧结果。

原始证据：docs/previews/v2-route-craft-38/root-order-{off,on}-{1,2}.json/png。结构化汇总：tools/reports/tree-root-order-v38-result.json。

按父任务决定不继续对负收益候选追加冻结像素验证，不声称浏览器逐像素等价；针对性矩阵/根/风测试的正确性结论保持。停止该候选，不继续扩展各 pass 排序框架。

`debug.ecology.stats.treeRootOrder` 提供 enabled/updates/sorts/groups/roots/changedGroups/matrixUploads/windUploads/cpuMs；groups 与 roots 只统计共享风组的唯一根，非所有树或逐 mesh 根总计。

本次仅更新报告及结果 JSON，没有源码、默认开关、资产变更，没有构建或 CPU 测试。原备份 backups/route-continuity-v38/tree-root-order/ecology.js。
