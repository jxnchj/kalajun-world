# Canonical 默认准备资产再生

2026-10-29。原始证据 shadow57-oracle-failure-and-settled.json 中 meadow/source 和 reach/source 均失配，57不能作为默认缓存正常命中的冷启动基线。其首帧22.344秒中 initialScene 9.215秒、生态准备8.739秒，grassRoots 3.439秒已包含在 meadow 4.289秒内；岸草累计重新构建工作10.605秒、实际接触重新验证521根。shader仅0.241秒、firstFrame0.044秒。默认49记录此前两包ready，草命中54tile、19319缓存根+84湿地程序根，岸草preparedHits521。不同运行/旧页争用使这些时间不能直接相减当收益。

按既有生成器完成11步：forest根 → meadow根/字段 → reach席位/接触 → terrain完整1628行 → priority148行 → demand1564行 → 木屋室外地形导出 → GI terrain / aperture / ground / ground-bounce。使用fresh Node默认参数，bank50/profile48/高冠候选均OFF；没有手改hash，也没有将候选旧岸源码隔离回默认。生成前完整备份在 backups/canonical-bindings-20261029，包含实际payload及manifest、四GI和被覆盖报告。

源依赖：forest绑定24源；meadow65源；reach80源；terrain39源。bank50/world-data变更进入各树；room-shadow→shadow-program-family52递归进入meadow/reach/terrain；reach另含forest-reach-surface41/reach-root-face50。四GI绑定同一次外地形导出所列29个源和原室内/外部资产。GI代理确认本轮只改独立oracle58诊断，生产源未改。structurePrepared独立43源列表仍匹配，未重生。完整变更路径及签名记于同名JSON currentSourceBindings。

再生结果：三根manifest除code完全一致；priority/demand除code完全一致；full每行属性、parentHash及压缩rowSHA一致；外地形全部位置/颜色/三角/pose一致。进一步逐字节比较432个真实二进制payload，共139,407,492 bytes，全相同。四GI全部辐射states相同；只明确排除terrain.states中open/closed的sky.second.seconds与groundSky.second.seconds四个烘焙耗时字段。未排除任何辐射数值。

原10文件针对回归42/42，0失败/跳过，31.14秒：forest/meadow全字段及真实实例恢复、521岸草席位/全部属性/实际接触回放、priority+demand每行与实际kernel全量比较、四GI来源与组成、profile绑定。生成/测试全部结束，已冻结；未构建主app、未改main/生产算法、未改变默认植被密度与几何。

待主线程使用同一canonical构建验收cache ON/OFF，读取grassRoots、initialScene、521接触ready、自然terrain q0与首帧。预期是恢复已接受离线包的作用，尚无新浏览器提速结论。首次从valley切forest还有独立缺口：MeadowRootCache只在构造时URL view=river-forest自动启用，reason=disabled后prefetch/prepare始终早退；本次未混入目的地动态激活。资源并发I/O、地形长尾和近针后台任务也仍需分别衡量，不能称整体加载已解决。
