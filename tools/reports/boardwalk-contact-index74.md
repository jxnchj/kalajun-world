# 木屋草根冷准备74：板道精确碰撞重复工作

真实浏览器来源 house-textiles74-candidate-whole-room-0.json：首帧20.2135s；grassRoots56次累计6.1166s/max1.8815s，meadow累计7.2977s。meadowRootCache dormant/area=-1/attempts=0，木屋不在现两准备域；不是校验失败。湿根0，不能把成本归于岸草资产恢复。

离线同真实pose、90次原队列：40043根/56tile。带嵌套诊断原tile1.140s，其中boardwalk.relocate876.5ms，threshold118ms；第二次细分hits843ms、ensure53ms，嵌套不能相加。重复工作在route大AABB内对远木料反复扫描，以及多个实际木料重叠时重复生成同一根placedSlabs。

默认OFF参数boardwalkContactIndex74=1：
1. 每route复用既有真实collider.box建立4m桶，只作保守AABB宽阶段，按原collider.index顺序执行原plantIntersectsStone。
2. 每次hits首次真正AABB重叠时仅计算一次原placedSlabs，再传给所有精确swept相交。复用shore-contact中原函数，未改公式/原顺序/碰撞判据/迁移搜索。
3. 不删根、不改叶片/密度/接地，不改主入口；0/缺省原路径。合法参数保持Worker，非法/冲突参数仍拒绝。

针对15/15通过，日志boardwalk-contact-index74-regression.log。含真实木屋全部root列表、near/far/basal矩阵和全部属性字节相等；真实板道边界/缩放/多桶ordered hits相等；原全线路草花迁移及岸石回归。两次无诊断源对照1316→1035ms、最终回归1479→1141ms（约21–23%），都是局部离线CPU，不是浏览器首帧/FPS结论。候选尚需正式来源绑定再生和同入口A/B，不能称冷启动长尾已解决。

变更：boardwalk-plant-contact39.js、shore-contact.js（仅导出原placedSlabs）、terrain-row-worker-client.js、boardwalk-contact-index74.test.js。影响递归准备来源绑定，主线构建前需统一再生，不手改hash；没有生产默认采用。

## 正式再生与收口（2026-10-29）

已完成默认、69、73各自 meadow/reach 六套正式生成器；备份 `backups/contact74-binding-1793236647191`，逐项结果 `contact74-regeneration.json`。六份gzip逐字节相同；六份manifest仅移除code字段后完全相同。候选只消除精确计算重复，不改变空间来源；ON/OFF可使用同一已验证payload。木屋域外仍走完整原草根生成，不扩大缓存域。

forest/structure固定源清单、terrain递归源码树不包含本次boardwalk/shore改动，因此未重复再生或重烘GI。直接相关原算法九文件47/47通过（`contact74-related-regression.log`）；准备绑定及默认/69/73真实源38/38通过（`contact74-binding-regression.log`），均0失败、0跳过。未主构建、未浏览器ABBA、未采用默认。当前源码和产物冻结；下一步可统一构建75，以唯一浏览器木屋同条件OFF/ON验收。按用户暂停要求本小任务结束，不继续新优化。
