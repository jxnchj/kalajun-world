# 公共楼门态输运覆盖修复

浏览器发现 `roomSkyBounce.doors.pending=true` 后，代码及真实烘焙数据复核证实它不只是统计：已成功的 `lodgeDoor.compose` 之后仍执行旧 house/yurt 两端点通道；当公共楼门非全开且旧通道没有对应字段时，它将有效 RGB 清零。第5层开口可见性及 alpha 仍变化，原只验 active、贴图变化的测试不足以发现。失败证据：`tools/reports/lodge-legacy-door-regression-before-v38.log`。

仅当实际 `lodgeDoor.compose` 成功返回 true 时跳过旧端点组合，明确统计 `bypassedBy=lodge-articulated`、旧通道 inactive/pending=false。未 ready 继续等待且不伪报就绪；原餐厅保留独立就绪的闭门东厅贡献，整楼没有此兼容字段，不误用开门本地输运。离开或切回旧门流程时旁路统计清除。

新 `lodge-transport-ownership.test.js` 对原餐厅和整楼两路径分别验证：真实延迟加载、闭/半/开三门态、最终 RGB 每项与实际 articulated 合成严格一致、夜间无日光残留、清理状态。排除 alpha 及第5层开口数据，避免再次以贴图不同误判有效输运。已有原屋/茶屋角度输运、室内接触与照明回归共同运行。

严格 housePrepared 因 asset-occlusion 代码改变真实再生成；有效二进制不变，JSON仅来源签名改变。未调全局光色、未重烘GI、未build或跑全量测试。正确反弹恢复将改变既有实景的室内亮度，需要重新做原机位验收；此前 active/key 验证不等于本项已视觉验收。

全套回归补查：严格 meadow cache 也通过依赖链绑定了 `asset-occlusion.js`，清漆修复导致其来源签名失效（唯一变更源，不是门阶植物减少）。已从真实世界两个锚点分别跑 90 tick 重新生成；111 瓦片、45,486 根、99,900 源槽、10,382,316 原始字节全部保持。新旧 raw 与 gzip 二进制逐字节相同；manifest 除 code 绑定外一致。11/11 草根缓存及真实场景回归通过，包含逐根、近远/基底矩阵和12项字段字节一致性、旧山谷拒用新默认根缓存。证据 `tools/reports/clearcoat-meadow-prepared-equivalence-v38.json`、`clearcoat-meadow-prepared-tests-v38.log`。
