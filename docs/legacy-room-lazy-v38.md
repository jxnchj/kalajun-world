# 旧五房间 GI 按需加载候选

开关 `?legacyRoomLazy=1`；默认关闭。关闭时模块入口使用顶层 await 预载全部旧房间，保持原同步读取语义；开启时林溪和无室内视角不请求这五个房间的数据，进入/朝窗看到实际选中的房间才加载完整 bundle。新公共楼家具 GI 的数据、三门态与算法没有变化，只把共享表 import 改为同一 registry 入口。

原 `room-*-data.js` 完整烘焙表保留供 Blender 脚本读取；运行时通过对应 `room-*-registry.js` 保持五个可变对象的身份，所有消费者共享。`node tools/split-legacy-room-gi-v38.mjs` 从原五表重生逐房间包；今后重新烘焙原表后执行该命令。包包含 base sky、second sky、solar、apertures、contact，所有五表完整验证后原子发布。既有二次太阳、灯具和门态按原 prepare 路径等待，不以缺少室内间接光换取首帧。

RoomBounceField 保存待选 room/asset/rotation，prepare 等待后仅为仍选中的房间激活。切到室外或其他房间时旧请求不能重新激活旧室内。相同 key 共用请求；错误不发布部分表、setLighting 明示，显式 prepare 可重试 loader。未知 key 和无房间不发请求，已有公共楼/逐户字段仍沿原分支。

验证：相关179/179通过，含原全部烘焙值相等、五房间完整载入、无房间零请求、同 key 并发、失败/重试、室内起步与离开再入、旧/新公共楼与三门态回归。报告 `tools/reports/legacy-room-lazy-regression-v38.log`。尚未构建和浏览器冷启动 AB，不默认采用。

加载诊断同时新增 GLB fetch/body/decode/parse 各阶段的绝对 performance.now 起止时间，并保留总开始/结束。WorldStructures 的 assetPreparation 每个资产包含 transport.timing 及 loadStartMs/loadEndMs。原始/自定义加载分支保留返回语义；无缓存绕过、无解析降级或新平台。

性能边界：先前林溪冷启动模块起点135ms，旧静态GI约1.68MB确为无关入口负担；然而 initialScene 的3606ms中 GI 为0ms，主要是3483ms生态生成。此候选不能据包体大小声称解决该长尾。必须同条件冷启动对比，且室内起步/切换第一可交互帧仍需完整GI实际验收。

实际浏览器首轮：林溪ready、无错误，旧房间requests=0；直接pastoral-house_a-entry启动发现undefined.data错误，页面尚未进入可用态。此缺口正在按实际set/update/prepare顺序修复，默认候选仍关闭；1177项集成通过不能替代这项浏览器验收。

浏览器首启补漏：`pastoral-house_a-entry` 实际选择逐户 `house_a-living-*`，其 `reusePayload=house_a` 需要先取得基础五表；直接house_a测试未覆盖该依赖，真实启动暴露 undefined.data。已在 prepareHouseholdRoom 并发等待本户包与完整house_a基础包，两者就绪才验证/发布。新增独立冷态 SettlementRuntime 真实代表实体与入口机位 update→prepare→update 回归，确认 sky/closed/solar/contact 齐备、仅请求house_a、离开清除；相关18/18通过。浏览器修复复验交主线，未凭单测宣称真实首启已验收。

时间证据更正：`legacy-lazy-household-midnight-cold.json` 与 `legacy-lazy-household-night-one.json` 的实际 `time` 均为540，太阳高度+17.226356°，属于上午；文件名不能作为午夜/夜间验收。main.js 将入口时间限于540–1305。按现有2026-07-25、42.95°N/82.19°E太阳算法，最晚1305（21:45）太阳高度仍+1.654007°，室内daylight=0.301693，不能用合法UI时段验证daylight=0。实际最晚入口可验暮色，不扩午夜UI、不修改光色。

独立 RoomIndirectLight 已修复零日光冷态接触数据依赖：即使sky/solar保持关闭，也对选中房间加载完整接触来源，并接入原field.prepare等待。加载完成只给仍选中的房间启用contact；离开、销毁不会装回旧房间，失败在pending结束后仍可观察，重新setRoom可重试。独立daylight=0回归与真实上午首启等35/35通过（legacy-room-night-contact-targeted-v38.log）；这属于运行组件逻辑验证，不能称作UI午夜实景验收。扩大相关回归154/156通过，2失败为并行terrain-material.js修改导致室外GI严格来源过期，需源码稳定后另行处理。

## 实际浏览器切换与灯具证据核查（2026-10-24）

逐一读取 `docs/previews/v2-route-craft-38/legacy-lazy-*.json` 中下列九份实景记录。九份均 `ready=true`、`errors=[]`、地形与近景队列均为0；旧房间加载失败数均为0。表内“二阶天空”指运行时 skyBounceOrder=2 且 active=true；太阳开启记录均 solarBounceOrder=2、secondBounceWeight=1、directionSamples=4。这是实际数据就绪/激活证据，不等于完整动态GI或逐像素数值正确性的证明。

| JSON 后缀 | 实际视角 / 分钟 | 旧基础包累计请求=完成 | 天空 / 孔径 | 灯具一阶 / 二阶 | 太阳 | 接触 |
| --- | --- | ---: | --- | --- | --- | --- |
| yurt-transition | pastoral-yurt-entry / 870 | 1（仅yurt） | 二阶开启 / yurt | 均关闭，未请求客房灯具 | 开启 | yurt，129032 B |
| guestroom-one | lanchuan-freedom-1 / 540 | 2（house_a及客房1） | 二阶开启 / 客房1 | 均开启，各3灯 | 开启 | 客房1，累计237240 B |
| guestroom-two | lanchuan-freedom-2 / 540 | 3（追加客房2） | 二阶开启 / 客房2 | 均开启，各3灯 | 开启 | 客房2，累计360930 B |
| guestroom-three | lanchuan-freedom-3 / 540 | 4（追加客房3） | 二阶开启 / 客房3 | 均开启，各3灯 | 开启 | 客房3，累计469800 B |
| guestroom-three-lamp-on | lanchuan-freedom-3 / 540 | 4，无重复基础请求 | 二阶开启 / 客房3 | 均开启，各3灯 | 开启 | 客房3，累计469800 B |
| guestroom-three-lamp-off | lanchuan-freedom-3 / 540 | 4，无重复基础请求 | 二阶开启 / 客房3 | 均关闭，各0灯 | 仍开启 | 客房3，仍开启 |
| lodge-transition | lodge-lounge / 540 | 4，无额外旧房间请求 | 二阶开启 / 新家具整楼 | 均关闭，各0灯 | 开启 | 新家具整楼，累计1000330 B |
| return-forest | river-forest / 540 | 4，已加载4包保留 | 均关闭，孔径field=null | 均关闭，各0灯 | 关闭 | 关闭，field=null |
| yurt-latest-dusk | pastoral-yurt-entry / 1305 | 1（独立冷态，仅yurt） | 二阶开启 / yurt | 均关闭 | 地形遮阳而关闭 | yurt，129032 B，开启 |

客房1→2→3、灯具开关、公共楼、回林溪是一条保留缓存的切换链；两份毡房记录属于各自仅加载yurt的会话，不能将九份请求数串成同一条累计链。三间客房的灯具一阶与二阶分别累计58320→116640→174960 B，开关灯只改变激活状态，不损失对应已加载表。客房时刻540是上午，灯具开关证明手动控制与日光共存，不能称为夜间灯光验收。

公共楼使用 `gh_lanchuan_lodge-furniture-whole`，sourceSHA256=`b1b8d584d20a55916ff9b6f5d3938d733d10751aada2456bab5b8df82572daee`；lodge.ready=true/pending=false，三门态lodgeDoor.ready=true/active=true/pending=false（实际角0，邻态0/1、权重0）。这次旧房间懒加载没有把公共楼切回旧家具GI，接触场和孔径字段也均为新源key。

最晚合法时刻1305的太阳高度为+1.654006832°；yurt二次太阳表已经加载（loadedSecondRooms=1），但 terrainSun.active=true，18/18采样射线受地形遮挡，包含朝阳屋顶孔径9/9被挡，故太阳间接光active=false、directionSamples=0。天空二阶与接触仍开启。这是暮色/地形遮阳路径，既不是缺少太阳包，也不是daylight=0的午夜路径；独立零日光修复仍需最终构建纳入。

回林溪时天空、孔径、太阳、两阶灯具、接触以及公共楼门态均active=false；已加载公共楼ready仍true。孔径22920 B、太阳缓存1250880 B、两阶灯具各174960 B、接触1000330 B/5纹理仍保留。这里只能称“停用室内计算/应用并复用缓存”，不能称释放上述内存。

采用判断：真实旧五房间（此前逐户house_a冷首启修复证据，加本次yurt及三间客房）、灯具开关、公共楼切入和离开路径已具备采用依据；目前仍保持默认关闭。最后需主线统一构建纳入零日光冷态接触修复，并做同条件冷启动AB，核实入口请求减少没有引入室内首帧缺项或切换等待回退，再决定默认采用。不能从拆包字节直接推断整体冷启动加速；生态生成长尾并未因此消失。无需为本次文档核查重烘数据，室外GI严格来源重采由主线待最终材料稳定统一执行。

## 四次林溪冷启动：on2 长尾定位，暂不据此采用

读取实际 `previews/v2-route-craft-38/legacy-lazy-cold-{off1,on1,off2,on2}.json`；四次 errors=[]。下列为 performance.now 阶段墙钟时长，不是排除线程调度/GC后的纯CPU时间。

|组|导航至首帧提交 ms|模块起点 ms|initialScene ms|生态队列 ms|初次shader ms|首帧阶段 ms|记录时地形队列|
|---|---:|---:|---:|---:|---:|---:|---:|
|off1|7352.2|335.6|1075.0|1013.0|142.3|290.9|0|
|on1|7503.5|258.4|1084.5|1022.9|164.8|260.4|0|
|off2|7488.9|293.2|1072.8|1012.8|174.6|238.3|0|
|on2|11150.0|220.9|4282.2|4142.9|234.6|521.1|205|

on2 对 off2 多出的3661.1ms中，initialScene 多3209.4ms；内部生态队列多3130.1ms，是主要发生位置。farTiles为1523.8ms（其余270.6–282.6）、meadow为1652.5ms（其余453.4–462.9）、forestFloor为606.7ms（其余约137），连草网格、风场和基底处理也共同变慢。工作量记录仍为90轮、剩余44、far/meadow各90次、grassRoots54次、grassMeshes73次；未见lazy使生态增加迭代的证据。

室内准备 on2 仅0.5ms，legacy requests=0/loadedRooms=0/failures=0；on1也为0请求，off两次均5请求。四次森林/草甸root缓存都disabled，树冠准备都local hit、18,244,324B/15parts，未见on2改变缓存命中路径。on2树冠localRead98.3ms、schedulerDelay12.3ms，比其他样本慢，但不足解释约3秒的后续生态差额。structures/assets阶段没有对应数秒的新增等待。源码 `legacy-room-loader.js` 开关只控制启动前五表加载，未接入生态生成逻辑。

q205不是初始准备失败的充分证据：四次initialPreparation均reason=near-ready、17轮、近队列0、一般队列197–200；记录截取时on2地形仅711resident/547visible，其余1628/1237，说明后续细化进度尚未达到相同状态。不能把这些时点当等完成度的最终ready对照。

**确定收益仅为移除无关入口负担**：on两次均未请求旧五表，off两次实际旧五个JS合计1,677,596 decoded bytes。模块起点on较早，但总体首帧未证明改善。长尾可排除“正在等待旧GI包请求”和“生态迭代数增加”这两种直接解释；当前记录无法确定线程竞争、GC、后台工作或其它调度外因，也不足以完全排除更早启动引起间接调度变化。因此保持原默认，不把on2归咎lazy，也不宣称已彻底排除它。若继续评估采用，只需无后台、同一完整队列完成判据的有界交替复测，不重烘GI或新增诊断平台。
