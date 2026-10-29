# 目的地缓存候选 58

已修复从其他入口进入森林后仍永久 disabled 的启用条件。浏览器实际进入两处既有准备区（各 96 m）时激活；山谷域外不请求，原初始 river-forest 并行预取保留。`meadowRootCache=0` 可完整关闭。没有更改任何根位、密度、几何或主入口。

`updateMeadow` 单一接线调用缓存区域更新。域外中止未完成事务，迟到结果不能覆盖新事务；失败留有 status/reason/lastError，停留同区域不无限重试，离开再进入允许重试。已验证数据重入复用。完整源码、实际世界/生境和压缩/解码校验未放宽。

24/24 定向测试通过。真实数据顺序为山谷 update 无请求 → 森林 update 请求 manifest 与 gzip → 54 块/19,403 根，全部根记录、矩阵与字段字节和原生成器一致。前一帧已生成的根保留；晚到缓存只服务后续块。未把这些 Node 结果当作 Chrome 加载提速。

受 ecology 源签名影响的 meadow 和 reach 包由原正式生成器再生，两份二进制与备份逐字节相同，manifest 除 code 外完全一致；没有再次生成不受影响的 terrain/GI。详情见同名 JSON 与 tests.log。源码已冻结。

60 轮补齐独立 8m 参考：沿 `node tools/export-meadow-patch-v38.mjs` 正式再生，备份 `backups/destination-cache58-reference60`；54 根的全部记录、near/middle 全部属性和索引、ground 完整 payload 与旧包精确相同，仅 sources 改变。单项 5/5 测试通过。此动态 cache 签名收尾包括 meadow、reach 与本独立 8m 参考；本次未重跑其他 11 步、未改全局规则。详见 `destination-cache58-reference60-validation.json`。
