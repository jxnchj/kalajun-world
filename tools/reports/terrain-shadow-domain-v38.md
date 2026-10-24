# 受控地形阴影域候选（默认关闭）

`terrainShadowDomain38=1` 同时启用 WorldTerrain 写入发布和 SunShadowCasters 域复用；默认保留原逐对象路径。没有改变阴影cadence、分辨率、LOD、密度、覆盖、矩阵传播和非地形动态追踪。未build、未完成浏览器像素或性能验收，不宣称已提速。

真实发布入口：初始可见、_attachMesh（新建与CPU缓存恢复）、_activate父子切换、_morphWeight值变化、_release移除、_merge、dispose。WorldShadowDepth首次赋标准projected customDepthMaterial亦通知。未知直接或嵌套子节点加入使域旁路；terrainBatches开启、非标准深度、alpha/displacement及关闭terrainDepthCapture也走原路径。

候选只在自有tile安装可恢复本地描述符，监听visible/castShadow/receiveShadow/frustumCulled、layers.mask、姿态、customDepthMaterial及原position/index/morph-position的version。原深度输入布局/引用、材质或geometry替换视为不再受控，旁路。没有全局prototype monkeypatch，没有包所有BufferAttribute方法，没有每帧递归Set发现；任意未通知的底层array元素写不在Three版本合同内，手工改matrix.elements等非现有生产写法也没有扩成通用追踪平台。

命中条件为域revision、group世界矩阵、相机层/姿态/投影、该级联独立frustum、shadowType、原共享材质深度签名全部不变。命中只复用已捕获caster membership/state，依然按原entryReuse/Map方式处理入集/移除，不跳非地形，也不跳全场矩阵更新。共享材质每帧仍使用原_material签名。

38/38候选与原tracker/idle定向回归通过，包括真实WorldTerrain attach/activate/morph/merge/release/缓存恢复/dispose、逐帧原tracker差分、未知节点/层/相机/太阳/材质/skip切换，以及深度输入替换旁路。实际生成geometry全部attribute/index快照在跟踪操作前后保持。日志 `terrain-shadow-domain-targeted.log`。

一次性安装成本必须纳入首启动：Node小世界73次tile登记、2336描述符（32/tile，该场景无远morph position）、最后2208活跃；安装累计1.264ms，dispose后activeDescriptors=0并验证恢复普通数据描述符。此数字不是Chrome启动耗时，也不外推实际1000+tiles内存/GC。浏览器可读 `terrain.stats.shadowDomain` 的installedTiles/installedDescriptors/activeDescriptors/installMs，以及shadowCasters.terrainDomainHits/Misses。更高LOD/远morph可能更多描述符；候选可能因安装/GC或域频繁失效而无净收益。

来源收口：terrain.js改变使四类室外GI需主线统一真实导出/重采。room-shadow.js与新模块进入meadow来源依赖，草甸根包及55根参考需真实再生；forest根绑定未变。主线同时有glb-transport-manifest来源变化，应一起收口。未改存量hash或自行再生/build。

另修正farTerrainIdle38默认关闭stats.reason被main finally stop覆盖的小问题，现在保持disabled；功能仍默认off。

逐级联缓存补充：每个级联独立保留最近一次观察，skip 不参与其他级联签名。某一级联 miss 时只对 miss 级联执行原捕获，其他级联复用；一次域遍历可同时处理多个 miss。两种 entryReuse 均以原 tracker 为逐帧 oracle 测试反复交替 skip、单灯变化（1 miss/2 hits）、跳过期间写入以及之后各级联陆续恢复。terrainDomainHits 指全部本次有效级联命中，terrainDomainMisses 指本次至少一个 miss；新增 terrainDomainCascadeHits/Misses 给出级联数。最终定向 38/38，669.733ms；仍待真实浏览器净收益验收。

## 实际浏览器结论：关闭、不采用

同页冻结 off/on/off 像素对比为 0 差，证据 `docs/previews/v2-route-craft-38/terrain-domain-frozen-*`。四组各 20 秒完整帧均值依次 off1 33.4127、on1 35.5300、off2 32.3417、on2 32.6961 ms，证据 `terrain-domain-whole-{off1,on1,off2,on2}.json`（同目录）。两轮均没有净收益，因此保持默认 OFF，结束该候选，不以扫描数降低代替整帧成果。实际安装 1628 tiles / 52480 descriptors / 23.2 ms；这是候选安装统计，不是冷启动 AB。因为稳态已经没有收益，没有再做冷启动额外成本 AB。
