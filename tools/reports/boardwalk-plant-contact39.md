# 四条原木步道：同一接触修复已扩展

原route3经主线实际验收默认采用后，主线在route0实图发现同类穿板，因此将同一真实几何/完整风包络规则扩至原四条步道。默认ON，`boardwalkPlantContact39=0`回退原位。逐route bounds广相筛选，仅对触及的路线构建/查询实际木件collider；不是全清整带。

|路线|踏板|风包络冲突草/花|零风真实三角交点根|
|---|---:|---:|---:|
|0|92|88 / 11|32|
|1|139|112 / 2|17|
|2|43|34 / 1|8|
|3|116|90 / 0|14|

完整源回归3/3通过（日志 boardwalk-plants39-all-tests.log）：4052草根、3913花根全部保留，只有324草+14花移位；ID/种类/s/sy/rot/所属tile保持，未碰撞者原位，迁移后四路所有真实木件的完整风包络0冲突。最大4.551702m；route3原90个最终位置保持，原门槛/楼梯避让规则未改。源码和数据诊断分别为 boardwalk-plants39-all-audit.json、boardwalk-plants39-all-moves.json。原路3实图已验收；扩展的0/1/2仍须主线浏览器审图，不将CPU通过冒称实际外观通过。

本次未regen/build。主线统一真实重生meadow默认根；forest绑定无本次改动。farRect候选仍OFF。

以下保留route3先前验收和核查：

# Route3 草木接触39：当前已默认采用

主线已实际查看 boardwalk39-side-candidate、fixed-side、top、max-move-context 对应画面；90 moved / 0 unresolved / q0 / m0 / errors空，完整群落未出现新环状堆根。证据在 docs/previews/v2-route-craft-38/。这是主线实际验收，本子任务未重复浏览器。

默认ON；boardwalkPlantContact39=0保留原位对照。最长4.253722m源坐标为路线中段(-1992.322,3432.250)，仅能归于实际既有碰撞和地表合法条件，未证实是端部门槛原因。仍不代表整体草影或草甸远近衔接完成。

默认根位置现在真实采用这90处迁移；主线须真实重生meadow缓存并核对ID/数量/尺度保持及位置变化，不能沿用旧默认payload。当前尚未regen/build，按主线统一安排。

以下保留原候选核查经过（其中“默认关闭/未实景验收”为历史状态，以上当前结论取代）：

# Route3 原木步阶与草花接触候选39

已查看 `docs/previews/v2-route-craft-38/courtyard39-side-off.png`。不以屏幕投影定论：核对了 `boardwalkTimber(world)` 的实际路线3、116踏板、394构件、42552三角及其真实放置矩阵。

## 确证

`tools/reports/boardwalk-plants39-audit.json` 保存全90个冲突草根的ID、位置/尺度/旋转、具体构件索引和14个静态三角交点。使用原 near/middle/basal 全几何高度分层及现有风扫上界；木件同样用实际几何高度切片，沿用已验收 guest-stair/shore-contact 方法。风包络是保守范围，90不代表同一帧90根实际穿板。

另外逐叶三角与实际木件三角做线段-三角形双向求交，14根有零风真实交点。该静态核查排除了可能被14%规则隐藏的穗头，避免把不可见穗头作为实证。例：`grass:-2479:4272` 对踏板1，`grass:-2483:4274` 对踏板10，`grass:-2480:4274` 对踏板7。

近/远完整花资产的包络本次无木件冲突。图中数根花茎在屏幕上跨过踏板不能证明三维穿插，不搬走这些花。

## 候选行为与验证

显式参数 `boardwalkPlantContact39=1`，默认关闭。仅路线3。只对原有冲突根搜索附近侧缘，保留身份、根所属tile、全部叶片、种类、s/sy/rot，沿实际地面恢复原根座深度；原纵向相对位置及ID稳定偏移避免不同根被堆到同一点。不清空一条带，不生成替代根。新位置同时避开原门槛/楼梯与岸石条件，不能找到合法位置就明确报错，不删除或静默留穿。

真实源测试：1063草根中90移位，1523花根全部原位；全部原ID/数量/尺度/旋转/花种保持，未冲突根逐字段相同，迁移后完整包络与全部394木件0冲突。最大位移4.253722m，受实际既有碰撞与地表约束（未证实端部门槛原因），未超既有4.8m侧缘搜索界限；全位移清单 `tools/reports/boardwalk-plants39-moves.json`。确定性再生成与座位不重合通过。

`boardwalk-plant-contact39.test.js` + `meadow-source-range39.test.js` 合计6/6，原 `ecology.test.js` 回归通过。日志 `boardwalk-plants39-tests.log` / `boardwalk-plants39-ecology-regression.log`。未做本候选浏览器实景验收，尤其最长移位的局部群落外观仍需检查，不称已采用。

## 源/缓存边界

修改 ecology 的普通草最终座位和花最终座位，新增独立 `boardwalk-plant-contact39.js`；world-data/main/terrain及其他代理源未改。`meadow-root-cache.js` 明确把候选参数列入旧根缓存旁路；`web/meadow-root-binding.js` 增加新模块种子，并递归绑定真实步阶kit/布置实现，避免以后木件变化但缓存仍声称有效。

默认根生成结果保持，meadow绑定已变化，必须在主线统一时点真实重生并验证默认payload相同，不能仅改SHA。forest固定源集合不包含本次修改，无需因本候选重生forest。尚未重生缓存/构建，由主线统一进行。
