# 局部草影：完整根与完整静态源离线核算

2026-10-28。只核算既存真实记录，不实施新候选，不改变 index15 OFF 结论。

依据 `docs/previews/v2-route-craft-38/shadow-window42-executable-budget.json`，该次实际近级370源、38组GPU brush、294个其他源。这是旧捕获姿态，不等于后续约13万三角/当前合批地形姿态；不可把两次数据混作收益比较。

| 光柱宽度 | 既有精细静态选取 | 完整命中静态源的最低成本 | 所有静态源均保留的安全上界 |
|---|---:|---:|---:|
| 4m | 159,651 | 191,365 | 892,749 |
| 4.5m | 222,243 | 252,983 | 954,367 |
| 6m | 521,776 | 561,673 | 1,249,233 |
| 8m | 1,045,295 | 1,095,719 | 1,764,847 |
| 12m | 1,573,397 | 1,626,807 | 2,278,717 |

4m组成：GPU完整brush100,548 + 已按完整根筛选的实例55,653 + 全部静态地形695,808 + 全部非实例其他源40,740 = 892,749。地形沿用现预算的双面两次提交计数；没有只按单面缩小数字。安全上界把该次捕获中的每一个静态源都算进来，甚至无需静态bbox拒绝，因而不会漏掉bbox交叉但实际三角未命中的源。

191,365不是可直接宣称的保守bbox成本：旧记录的 `wholeRootKept` 对非实例对象仅在至少一个三角真正命中后才计完整源。实际bbox选择还可能加入三角未命中的源，因此这里只当下界。它包含三块完整地形13,824、两块岸根垫21,340；精细选择分别只有3,354与96。最大的两块静态垫是 brook-root-mat-0（10,780）和 brook-root-mat-2（10,560），此捕获中没有单个巨大静态世界mesh导致整源路线必然爆炸。

结论：已有实际记录足以证明该姿态4m完整根+保守整静态源上界小于100万（892,749），约为原159,651的5.59倍；不是原全影约1100万的重复森林pass。完整根/GPU brush本来就已完整保留，能删除的是静态逐三角投影/选index以及对应私有index准备，不能声称整个selection/views 20–40ms全消失。根/brush筛选、动态版本验证、视图生命周期、mask绘制及driver成本仍在；之前10–36ms甚至更高mask成本可能随多余地形增加。

可行性为“值得下一次真实预算确认”，不是采用。当前地形已合批且移动姿态不同，旧370源不能证明当前任何位置都低于100万。无需重开完整实验：恢复浏览器后从当前实际近级源统计完整静态drawRange总量和原完整根/brush选取即可得到新保守上界；保持风包络、所有新增源和未知源兜底。没有提高预算或减少密度。

## 浏览器CPU诊断状态

独立review页面实际已显示API存在、ready、q0/m0、1280×800 DPR1，无shader错误；但Mac锁屏使原生点击不可用，尚未触发采样。状态为 pending-browser，等待用户解锁；未生成或宣称三组CPU结果，不另建工具绕过锁屏。

## 2026-10-28 解锁后实际CPU结论

锁屏阻塞已解除，`shadow42-native-cpu-stages.json` 已实际保存。原始pass两组均值1.450/1.275 ms，detail组4.200 ms；约7364节点和每pass两万余时钟调用导致明显计时侵入，不能将detail独占遍历2.4625 ms当可省成本。detail直接绘制0.550、objects.update 0.4125、frustum 0.450、深度材质0.1125 ms/pass，没有证据支持大规模新提交框架。样本未保存每级camera身份/三角量，不能证明三组级联比例相同。

主线随后同条件 `forest42-unlocked-current-baseline` 给出CPU14.58 ms、GPU34.09 ms；不能把昨日高CPU状态当今天瓶颈，当前优先真实GPU分项。报告此前 pending-browser 为历史状态，现已完成该次采样，但不代表帧率问题解决。

新增独立只读 `captureWholeSourceBudget42(api)` helper，复用原近级submission观察器，默认4/4.5/6m，计全部静态与蒙皮源、完整风包络实例根和brush；没有mask/window/controller。调用须在已hold的主线页面，函数恢复shadow标记并注销观察器，不安装新绘制方案。

## 当前捕获与独立整源候选

主线实际 `shadow42-current-whole-source-budget.json`：最近级287来源，全部静态预算1,147,276三角；4/4.5/6m完整上界1,210,063 / 1,218,041 / 1,283,844。旧capture小于100万并未在新capture复现。静态大头包含未命名源 id8331 212,352、id8330 27,880及多块完整9,216三角地形合批（预算两次18,432）。因此仅全保留静态不足以决定采用。

新增独立controller选项 `wholeStaticSources:true`（默认false）。复用既有完整wind/morph光柱包围盒与严格源版本索引；非实例普通源仅用完整光空间AABB相交筛选，命中即保留完整原始index/drawRange，借用所有原VBO/形变属性；视图销毁前移除借用index/attributes，避免删除原共享GPU缓冲。原完整实例根、needle/twig brush、原始风/材质、蒙皮保守保留不变。选择路径不创建静态三角投影缓存、不复制三角子集index。首次完整顶点wind/morph区间和源版本验证仍存在，不宣称零准备成本。

此选项继续使用原4m/512补充mask、原4096原影、选择4.5m及32ms warm预算；不加预算，不改生产main。原index15默认路径保持false。37项相关针对回归通过，涵盖完整形变/高处光柱、全索引共享和安全销毁，以及既有预算/控制器/空间索引；独立包构建成功。下一步仍须当前实际全源覆盖oracle、真实W运动连续性与CPU/GPU成本，未在浏览器验收，不采用。

## 当前 output≈8.99ms 的调用范围（只读核查）

`gpu-pass-profile.js:14` 把所有非主scene都归为output，并非严格只认OutputPass。理论可混入 `meadow-root-wind41.js:36`、`meadow-cluster-wind42.js:37` 的GPU风缓存，以及 `grass-shadow-world41.js:77` 的reference/mask。当前 `forest42-unlocked-main-gpu-passes.json` 中两风缓存均enabled=false/updates0，coverage也enabled=false/frames0，故这些没有参与本次output。

`world-frame.js:133` 绘制主scene，154执行OutputPass；Three `examples/jsm/postprocessing/OutputPass.js:122–123`先切屏幕target再绘制全屏三角。实际frameTarget.output为1call/1triangle。`water-reflection.js:178`使用同主scene+镜像相机，归reflection；`room-shadow-atlas42.js:60–66`只包装原阴影direct提交，无独立renderer.render；`water-refraction.js:75`起在原主透明pass内blit，落main.color；云缓存在 `environment.js:150` 更新，针叶预计算在 `main.js:440`，都先于443的beginFrame，不计入该output。

所以本次8.99ms很可能主要来自屏幕OutputPass的query边界，不能无证据归因其它离屏；也不能称纯fragment算术成本，它含该render的自动clear/提交及驱动计时边界影响。屏幕target切换在output render query之前，主MSAA resolve在原主render尾部，不能再次计入output。当前分项不能与此前单query直接相加比较。

修正复验建议：只在已有GPUPassProfile非主scene入口临时记录scene/camera/target身份、材质名和次数，不增加query，确认output确实仅OutputShader。`tools/reports/output-no-clear-v38.md` 已有第38轮四组真实GPU结果：关闭输出6.113/6.187ms，开启6.702/6.620ms，虽画面逐字节一致但GPU没有收益。没有具体新假设，不重复此开关A/B，不重新开启已否决分支。只读调用范围结论仍有效；没有实现新诊断框架、修改默认或调整曝光色彩。

## 整源实际验收与shader准备缺口

`shadow42-whole-static-initial/native-move/abba`：初末全源遮挡oracle均0差，真实移动4.74m，120帧119 ready；唯一首帧ready=false。selection/views通常已低于3ms，但此项不等于帧率优化。稳态ABBA整帧21.00/22.03/21.89/21.34ms，GPU17.44/17.99/17.99/18.28ms，仅支持额外稳态成本较小，未采用。

三个历史尖峰区别：revision454耗时100ms，其中selection0.6、views0.9、mask98.5，program96→99；revision514耗时93.7，其中0.5/0.4/92.8，program99→100。这两次确有新program在mask渲染首次创建，但记录不能精确拆分全部编译、上传和driver等待。revision349耗时44.5，其中3.1/1/40.4，0新视图、108复用，program94→94；该次不支持新program创建解释，保留为未细分mask/driver尖峰。

明确代码遗漏是旧preparePrograms仅覆盖所选窗口视图，并仅在异步prepare调用；同步移动引入未选中过的shader变体没有预编译。独立修复仅在wholeStaticSources候选开启时，冷/异步准备额外以CURRENT完整原生阴影registry制作compile-only实际源代表（普通整源、完整根地址模式、needle/twig brush地址模式和蒙皮），在相同reference/mask target下执行compileAsync；不绘制、不改真实源、编译后销毁私有容器且保留借用VBO/index。它不能保证尚未加载/进入registry的新LOD，明确记录compileNativeSources/Views/Skipped；renderTiming.unpreparedMaterials记录材质id/version尚未经准备的情况，不等同精确shader program签名。

19项覆盖/控制器/整源/compile代表回归通过，独立包已构建；新的实景首次及移动shader峰值尚待验证。44.5ms既有程序尖峰没有用该修复冒充解决，不加预算、不删投影者，不改生产默认。

## 完整来源预热后的真实移动与重复准备修复

`shadow42-whole-static-prewarm-move.json` 专属当轮history为18次同步，全部命中，最大28.6ms；120/120帧valid且ready，真实移动4.45m，各帧program106→106、unpreparedMaterials空，初末全源oracle0。应使用文件顶层history（18项）；settle.controller累计history还含移动前90.3ms等准备记录，不能混称当轮移动峰值。当前证据支持预热消除了这段路线的新增program尖峰，不等于所有路线或总性能已通过。

同时确认重复工作：compileNativeSources307、compileNativeViews375、compileSubmit/Wall182.8ms，而program106保持不变。旧实现每次异步prepare都为完整registry创建代表并调用compileAsync。独立候选增加已完成compile证书：按同一源geometry、具体material身份/version/编译hook/cacheKey、完整属性与morph布局、实例/蒙皮/颜色/形变模式、kind/address、目标纹理及renderer编译设置匹配；不跨不同geometry复用，不只看material id。风buffer内容version变化不改变shader变体，不触发无谓重编译；属性替换/布局、morph、材质或target变化仍失效。只有成功await后发布证书；未知代表保留原选中scene编译兜底。已命中的代表在创建私有视图之前跳过，没有新draw。

新增compileNativeReused统计；compileNativeViews现在是本次真正需要准备的代表数。21项针对回归通过，独立包构建成功。证书修复本身尚待浏览器再验，没有将182.8ms宣称已经实测消失；默认仍OFF。

## 变体缓存复验：304.5ms尖峰位置与归因边界

`shadow42-whole-static-cache-move.json` 120条rows全部valid+ready，最终oracle0。累计21次sync全命中；最大304.5ms位于第一条warm rev375、atMs2081938.6，紧接冷prepare在2081852.7结束。该warm结束后至第二条warm开始相隔25,117ms；后续20次最大26.1ms、均值11.51ms。rows只保存位置/ready/valid，无时间戳，因此不能仅凭此JSON证明304.5ms属于120帧运动区间，也不能抹掉它作为冷进入阶段真实停顿的事实。

304.5ms拆分selection21.4、views16、mask267.1；0新视图/110复用，reference39、maskDraw226.3，program106→106、unpreparedMaterials空。没有证据支持新shader或变体缓存漏编译解释；renderer.render边界可能含首次GPU资源提交、driver等待或系统调度，现有trace不能再细分。既有程序和复用视图并不保证没有底层上传/首次实际使用成本。32ms为可检查工作片预算而非能中断WebGL调用的硬界，不提高该预算。

尾部owner.stats确认375个代表命中、0新代表、compileSubmit/Wall4.3ms、program108保持不变，证明冗余全registry预编译已避免；它并不解释此前首次实际绘制267ms。此次未再修改代码或增加候选：没有足够证据将未知driver尖峰改成另一套编译路径。后续若需细分，只在既有首次冷settle与运动采集分别记录开始/结束performance时间、实际draw/upload/compile的有限计数，避免累计历史混入移动最大值；不占用当前主线GPU窗口。

## 加载阶段真实绘制预热适配（默认关闭，待接入实景验收）

主线随后核实工具执行顺序：initial settle及第二次preparePrograms完成后，另一次工具调用才开始cacheMoveDone42和W。因此304.5ms明确属于初次settle，后续20次移动同步最大26.1ms；保留首次停顿证据，不能称其消失。

新增 `web/src/v2/shadow-window-runtime42.js`，生产依赖显式传入，不依赖晚初始化的window.kalajunV2。默认enabled=false时不创建Controller、不装原生提交钩子、不修改材质。开启后prepare在调用方已有loading门内依次yield、原生同路径绘制采集、await现有异步几何/compile准备、再次真实原生及局部reference/MSAA绘制；只有owner实际ready且完整证书有效才返回ready。nativePassMs、localDraw、compileWallMs和totalMs明确保留首次使用成本；这不是gl.finish或GPU完成时间。无近地接收面返回native-only。取消立即禁用旧receiver，旧异步工作结束后才更换controller；跨区新来源重新采集，正常移动仍使用原完整证书失效与PCF回退。错误向上传递并禁用候选，不静默宣称成功。

最小主入口接法（本批未编辑main，也未正式采用）：在具备world/renderer/environment/camera/terrain/ecology和renderWorld闭包后创建runtime，renderNative传()=>renderWorld(scene,camera)。初始firstFrame之前及prepareDestination的compileDestination之后、preparing=false之前await runtime.prepare({yieldToInput,isCurrent:()=>generation===viewGeneration})；初始同样捕获generation。snapshot列runtime.stats，pagehide先runtime.dispose再生态/renderer销毁。不得从普通RAF每帧调用prepare，也不要只compile而省略真实draw；保持显式flag默认OFF。

本批同时补充coverage compile/render的target恢复：保存cube face、mip level以及renderer自定义viewport/scissor/scissorTest，finally恢复；原clear/autoClear/shadow/info状态恢复仍保留。runtime原生预热pass也恢复调用方target及光栅边界。现有owner.dispose负责独享target/材质/视图与退休队列；源共享VBO不销毁。17项针对回归通过；仍需实际加载、跨区取消、W运动和原场景回归，不能把适配模块或单元测试当产品验收完成。

随后主线授权已落地上述main接线：显式 `localShadowWindow42=1` 开启，默认OFF；初始加载和跨区compile之后await真实预热，snapshot.localShadowWindow42暴露完整准备统计，pagehide先销毁runtime。`localShadowWindow42` 和 `treeViewCull` 仅改变渲染，已加入terrain worker精确安全名单；0/1、显式worker0和未知地形参数仍拒绝的用例通过。本批40/40定向回归与main语法检查通过，未执行主构建，正式初始/跨区浏览器验收由主线后续进行。默认OFF仍无controller实例、原生提交钩子或receiver修改。


## 2026-10-28 运行入口实际初始/移动/跨区验收

独立原字节静态入口dist-v2/shadow-runtime42，localShadowWindow42=1、treeView默认OFF、time870；1280×800/DPR1。首次准备真实两次原生pass866.8/199.4ms，局部预热总2752.7ms，最后mask/reference58.2ms，未准备材质列表为空。导航至首帧提交23919.6ms；不将该单次、HTTP缓存未关闭的结果称冷启动改善。

地形q0/m0后，首次hold后直接oracle时owner刚完成异步重选、尚未真实绘制，27,213像素差无效；补同源实际阴影提交后owner ready/valid、完整覆盖0差（fullCovered=selectedCovered=29,086,783）。保留旧证据以说明测试前置条件，正确证据shadow42-runtime-settled-oracle。

**正常移动未通过。** 原生W按键2.4秒、速度2.8、自由飞行方式（不称步行碰撞验收），位移约6.51m，180个实际RAF中43帧ready/valid，137帧native-source-revision-changed回退。对应异步索引准备13,749ms，active288ms，126次yield等待13,404.9ms；更早后台地形改变也出现约42秒重建等待。无运行异常不等于视觉连续。末端原生提交后完整覆盖仍0差，说明缺口在来源更新准备期间。证据shadow42-runtime-native-movement.json/png。不提高预算或降低密度掩盖，默认OFF，继续修复缓存更新。

**跨区未通过。** 通过实际地点按钮林缘流水→岚川草坡，10次预热后报Local shadow loading preparation did not settle，preparing仍true。原生采集实际原因Coverage source has incompatible native depth groups: boardwalk-timber-post，captures0/failures10/owner为空。必须完整支持该对象多组深度绘制，不能跳过遮挡对象。证据shadow42-runtime-crosszone-failure.json/png。未完成返回路线，不宣称跨区通过。

## 正式入口实际转场与移动：新阻塞及有界修复

`shadow42-runtime-native-movement.json`实际180帧仅43帧ready，137帧因native-source-revision-changed回退。异步轮34总42.110s（index42.011s、active982ms、wait41.064s/442yield）；移动轮35总13.749s（index13.453s、active288ms、wait13.405s/126yield）。两次warm miss名称为空，missing/changed-geometry-interval；旧证据未记录具体id和源类型，故只能称来源变化，不能归因新地形。曾据调用点猜测index重复构建三角，完整定义核实selection默认false后已排除；未作无效开关修改，也未提高预算。

草坡转场的 `boardwalk-timber-post` 实际有不同原生材质group，旧采集按对象合并depth状态因而明确拒绝。修复按实际group.start/count/materialIndex建立稳定facade，原drawRange与group取交集、共享原全部属性/index，选择真实group材质并保存各自depth状态；不会将多组折成单材质或跳过投影者。同一个group出现互相冲突的depth仍明确拒绝。runtime十次准备未就绪错误现在携带底层submissions原因和具体对象，失败禁用候选而非宣称ready。

新增有界sourceWork末64条和maxSourceWork，记录具体id/uuid/type/geometryId/顶点/索引/实例数/风/形变、source版本、active/wait及interval/root/triangle构建计数；index warm miss也携带这些身份数据，完成轮次存controller.stats.indexWork。此为下一次实际采集定位，不是移动回退已修复。38/38针对回归通过，包含多group区间不变、共享属性保留、独立材质/depth状态、同group冲突拒绝及具体失败透传。等待主线统一build后草坡→林溪和W真实再验；默认OFF。

### 43：首次岸草来源的 bounds-only 候选（默认关闭，待冷路径浏览器复验）

`shadow43-native-movement.json` 是先草坡再返回林溪的热状态，实际移动约 6.37 m、180/180 ready；不能覆盖首次页面。`shadow43-fresh-native-movement.json` 虽输入 W 2.4 秒，实际仅移动约 0.187 m，173/180 ready，不作同路线通过。其实际慢来源是 `reach39-rooted-bank-community` 普通 Mesh（34850 和 121344 顶点），并非地形。121344 顶点源的完整风 interval 首建 active 48.2 ms、wait 2523.6 ms；437.8 ms selection 仍需新版复测，不将全部时间无证据归给某单函数。

`forest-reach-cover39.js` 的实际接地更新逐根写 `aBrookSeat`、增加 attribute version。旧完整 interval 将 seat 与每顶点静态风/形变包络绑定，seat 变动会重复风公式。新实现仅对 `wholeStaticSources` 的该真实来源类别使用独立 WeakMap：完整静态属性身份、数组、版本、格式及 morph 配置严格绑定；原 interval 风与形变数学在 seat=0 时累计一个完整 AABB。seat 版本改变只重新扫描实际 min/max，保守加到该 AABB 的 Y 范围。当前 matrixWorld、太阳投影、材质 displacement 仍实时使用。选中后仍提交全部原顶点/索引、真实风和 seat；没有经验 1.5 m 扩张，也没有改变预算、分辨率、密度或默认开关。

旧逐顶点/三角路径仍使用原缓存，bounds-only 不向其发布缺失 data 的对象。冷静态包围构建仍分片；暖 seat 扫描每 1024 顶点检查原 deadline，异常/版本变化不发布半成品；新静态属性必须重新异步准备。sourceWork 增加 `bankBaseBuilds`/`bankSeatScans`，便于区别首建与 seat 更新。

`shadow-bank-bounds43.test.js` 从当前真实 world + WorldEcology 重建两份源，明确断言 34850/121344 顶点，对每份 4 个增量 seat 状态逐顶点、逐 8 角验证原完整风/形变 oracle 包含，并确认静态 base 只构建一次；另覆盖 transform、风/position/morph 版本、unload、准备中 seat 改变、deadline 中止及旧算法隔离。连同 index/controller/runtime/submissions/whole-static 定向 **45/45 通过**。这证明保守范围与生命周期，不代表 GPU 形态、冷移动回退或帧时已验收；候选继续 OFF。

### 44：来源流入后的视图竞争与新变体预热衔接（候选 OFF）

43 的实际冷新页同机位 6.37 m 移动（`shadow43-bank-native-movement`）180/180 ready，新增 22 次同步全部成功、max22.2ms；121344 顶点源接地更新 baseBuilds0/seatScans1/vertexBuilds0/active0.6ms，最终完整遮挡0差。但移动前已有一次后台准备 #34 失败：t60397.9ms、phase views、`Native source changed while preparing views`；此前 t53834.8 新岸草进入，准备6563.4ms中 active73.9ms、wait6467.4ms、33yield。两份首次 base 构建分别17.6/45.4ms，期间 seat 改版被正确拒绝。初始入口本身 total2441.6ms 成功，不把后台首次来源长尾藏入“启动通过”。

同一实际记录 t60479 暖链直接画了未显式预热的1321/1322两材质，program105→106、mask17.1ms；后续program106不再增加，`unpreparedMaterials`仅表示未经过显式preparePrograms，不能当每帧编译。这条具体缺口已在44修改：

- views提交遇到真实来源版本过期，在同一个prepare中重新同步索引/选取，保留已完成的bank base缓存；只保留最新一轮、仍满足来源/形状/属性合同的暂存view，旧项沿既有分帧释放，不提交过期视图。
- 每次提交重新检查完整 source geometry/attribute layout/material/target 的编译证书。暖链遇到新variant禁止直接render，进入已有真实compileAsync流程；即使源证书已更新可复用，也必须完成所需预热后恢复。没有靠清空unprepared标记通过。
- 原预算、密度、完整选中索引、原4096、默认OFF保持。取消/异常仍恢复原PCF，不把无效旧mask当有效。

新增针对：异步版本竞争重新选择且局部顶点缓存不重建；旧临时view在最新合同满足时复用；相同材质换新geometry仍必须显式目标compile；暖提交后当前源可复用也不能跳过compile。完整相关 **57/57** 通过（`/tmp/shadow44-target.log`）。独立构建 `web/dist-v2/shadow44`，保留主dist、shadow43和其它候选。该修改未证明首次base分片等待已消失；下一验收必须在新页刚能交互、来源继续流入时实际移动，记录真实位移、ready、viewReconciliations、lastViewReconciliation、program-preparation-required、compile/native差分及最终全源oracle，不能只等q0后验证。

### 44 早期原生移动复验：预热链有效，首次新来源长尾仍未通过

证据 `docs/previews/v2-route-craft-38/shadow44-early-native-movement.json`：首帧约23213ms、armed23214.6ms，W按下23717.1、松开26509.4ms，480次RAF到69350.1ms，队列146→66。按记录的 inputPosition 到 end.position 计算水平位移约6.74m，确为能交互后立即移动，并非等q0。W按住期间记录17帧，均有效。

全480帧仅 **445 ready/valid（92.71%）**，35帧 pending：33帧 `native-source-revision-changed`，2帧 `program-preparation-required`。回退连续发生在第93–127帧，t33869.3→37094.1ms（采样首末间3224.8ms），第128帧37201.6ms恢复；当时玩家已松键停留。阶段为index27帧、selection5、views1、compile2。不能据移动时稳定或failures0判连续性通过。

准备#34总3175.9ms，active65.9ms、yieldWait2936.7ms、31次yield；index2427.2、selection496.3、views79.0、compile154.8ms（提交15.2ms）。121344顶点岸草第一次base构建active40ms、wall1821.6ms、wait1781.6ms，期间seat改版正确拒绝；稍后同源重试baseBuilds0/seatScans1、active3ms，证明base已保留而非重复全算。仍存在首次base工作被慢帧切片拉长的明确尾部，44没有消除此问题。

预热链有实际支持：最终unpreparedMaterials为空，新program105→106发生在compileAsync阶段，之后mask保持106→106；没有43那种首次mask直接编译新variant。controller failures0/lastFailure null，但viewReconciliations=0，因此本次没有触发views过期重选，不能用本样本证明该竞争分支已在浏览器执行（仅已有定向版本竞争测试）。

唯一超过80ms的同步准备在t23088.8：selection13.8、views8.9、mask58.7，总81.5ms。它发生在首帧/armed之前，属于已纳入初始加载的真实首次mask绘制，program101→101，不能归因漏shader预热，也不是交互后同步81ms。armed后34次同步尝试中30成功，最大22.6ms；3次因新变体进入预热，1次缺bank base。整480帧dt mean95.07/p95145.4/max426.6ms只是该早期加载样本，无对照，不归因全给局部窗或宣称帧率改善。

下一项应限定为首次bank base的前置有界准备：利用现有岸草生成/恢复阶段已经读取的真实静态属性，完成同一原风/形变box计算，并由严格属性签名认证后交给影窗；在它首次被native提交前尽量完成，seat继续独立按真实min/max。不能暂时漏画未准备岸草、增预算、或仅以更长loading遮蔽尾部；先定位现有生成/恢复的逐vertex步骤是否能共享计算，随后用相同全顶点oracle及新页早期W路径验证。首次mask58.7ms保留为加载开销待单独同条件诊断，不在本轮追加新的渲染架构。

### 45：岸草原组装循环前置完整包围（OFF，待早期移动）

时序核查：`ReachBankCover39.generate()`先恢复/生成根，再在最后的 `createBrookWetBatch` 逐顶点写最终 Float32 世界 position/height/scale/drop，完成两池后才暴露对应 Mesh。45将该原函数提成共享 `createBrookWetBatchSteps45` 生成器，原函数继续同步消费，默认不调用bounds、无新增yield；只有显式 `localShadowWindow42=1` 的代表岸草，才在同一顶点写入循环共算原风/形变完整包围，并每64顶点yield交回已有生成4ms预算。不另起平台、不再做第二次完整风扫描、不增加预算，也没有复制原组装算法。

最终merge与辅助字段删除后，以实际静态属性身份、数组、版本、格式、morph配置封存到私有WeakMap；必须完整逐顶点且计数匹配才能发布。影窗读到该真实geometry且签名吻合才采用，seat仍以真实当前min/max独立扫描；静态变动使producer证书失效，回原安全准备。源Mesh创建前完成封存，选中仍绘制全部原index。统计 `reachBankCover39.stats.shadowBounds45` 为pools2/vertices156194，sourceWork的 `bankBaseAdoptions45` 区别生成阶段移交和后建 `bankBaseBuilds`。

真实默认205丛sedge/316丛mat，两份34850/121344顶点，候选与默认同步组装的全部attribute/index数组逐位相等；实际 `ReachBankCover39` 候选开关也已覆盖，发布即能无冷base采用。每源3组seat增量对原全顶点oracle包含，静态变更、非完整生产、默认无额外工作、此前版本竞争/预热回归通过。20项producer/controller/coverage（`/tmp/shadow45-target.log`）与8项producer/bank（`/tmp/shadow45-real-target.log`，有重叠）通过，最终producer全buffer加强断言另3/3通过。

修改共享brook源码触发既有绑定，已正式执行 `tools/build-meadow-root-cache-v38.mjs` 和 `tools/build-reach-cover-prepared42.mjs`，未手改hash。前后压缩payload完全相同：meadow `031a0d2c9e599275b27aecd059c68cf591920f4a14991a966a16cebb9195f71e`；岸草 `9e62e8d16168db6be5b669e5e79d395b74eac384b76685a4d76724796916d877`。生成工具保留其全根/Float32/接地oracle断言。独立完整构建 `web/dist-v2/shadow45` 成功，主dist、shadow43/44和tree-wind-atlas44仍保留。

尚未浏览器验收：需在刚能交互后真实W移动及后续新岸草流入期间观察ready/回退、首次source的bankBaseAdoptions45、实际box冷计算次数，以及岸草首次出现时间/首帧与单帧生成负担。不能通过把细节长期推迟或把同等长帧前移来宣布修复。旧treeView诊断页1839973744本轮已关闭，未建立新的GPU测试页。

### 45 首次早期飞行样本：33.72m，不能与44的6.7m直接对照

`shadow45-early-flight34m.json` 实际默认14m/s、前移约33.72m；不能按请求输入时长认作2.8m/s路线。记录480帧，454 ready、26 not-ready。其中4帧真实 `native-source-revision-changed`/pending（2次新spruce几何：1800顶点、缺原始interval）；另外22帧valid=null/pending=false但ready=false、reason=`unchanged-light-column-reused`，是新variant预热完成后尚未再次提交局部mask的帧，不能把valid=null算有效阴影。首次慢选取#36 total217.6ms，active7.2/wait198.2ms、3yield，selection198.8ms；与44首次岸草3秒尾不同，已有新近树来源进入。

两次明确交互期长同步：t14571.3ms总81.6、mask80.8（draw80.5）；t14878.4ms总158.0、selection0.6/views0.8/mask156.6（draw156.4）。两次均program106→106、unpreparedMaterials=[]，不能归因漏shader预热；目前只定位到实际mask renderer.render调用，未证实为驱动、GPU等待或对象提交的哪一段。禁止以增32ms准备预算解决这个draw阶段尖峰。该样本不同路线，不直接比较44整体帧时。

初始岸草built=true、pools2/156194vertices的producer发布记录存在，buildWork293.4ms、buildwall1816.2ms、prepared ready6800.2ms、入口局部准备684.3ms。说明生成阶段box已发布；但本JSON初始index的sourceWork只有末64项（总301source），未保留两池的adoption记录，遍历全文无非零bankBaseAdoptions45。因此不能仅凭本文件声称浏览器实际adoption计数已直接采到；需同条件页读取两池当前index.boundsCache中的producer记录，或在首次capture保留该两源的统计。源码和实际全顶点Node验证支持预期，但不同于这项浏览器直接证据。

下一步先等root的2.8m/s同路线。另开放两项：新几何变体频繁预热造成一帧mask缺口（22帧，未漏遮挡但回原PCF）；program稳定的mask draw80–156ms尖峰。此次仅只读分析及报告记录，未更改源码或运行重测试。

### 单世界50续行与编译布局证书修复（仍OFF）

`shadow50-single-move-34m.json` 为同页续行33.67008m，不是新页早期移动。900观察帧805有效、95回退：62帧(65.3%)为新视图要求预热后`unchanged-light-column-reused`、idle且pending=false；33帧(34.7%)为真实来源证书变化，index23、selection7、views3。无hidden、无controller failure。同步失败原因62次new-variant、一次新`spruce-12-0--38,49-31`1800顶点缺原interval、一次32ms准备预算超限；未记录独立anchor越界失败。不能把混合来源变化的33帧都归于树或地形。末次compile programs108→108，成功mask记录107→107或108→108；缺少每轮compile前后数据，不能称62次全部没有真实新程序。

核查Three `WebGLPrograms.js` 的geometry/object编译参数：属性存在/格式、normal/tangent/color大小、morph通道与数量、实例/蒙皮模式影响shader；geometry/attribute JavaScript对象身份本身不决定program。原NativeProgramCache严格绑定每个geometry及attribute地址，导致相同材质和布局的新批次也必须再进入异步预热。

最小修复保留原精确geometry证书，增加同一个实际depth material对象的已完成编译布局证书。仍绑定material version/onBeforeCompile函数/customProgramCacheKey函数与返回值、defines、所有原材质参数/纹理、renderer/target/camera flags；布局保留attribute名字、类型、itemSize/normalized/gpuType、交错offset/stride、数组类型/count、实例divisor及morph完整配置。不会跨另一个material复制的闭包复用，不共享VBO或任何source/风/遮挡证书。只在原compileAsync成功完成后发布；新真实布局仍阻止mask直到原预热完成。32ms/2ms预算、原4096与密度均不变。

涉及runtime仅`shadow-window-programs42.js`；针对测试`shadow-window-programs42.test.js`和`shadow-window-coverage42.test.js`。原“clone geometry就是新variant”测试改为先验证等价clone复用，再删除normal构成真实shader变体，保留绘制阻断/异步完成所有断言。四模块28/28通过，包含故障、跨区取消与源版本竞争。尚未实际浏览器验证收益；33帧中真实新几何interval等待仍开放，不能称整体连续性已解决。无需生态或资产来源绑定再生，主线下一次构建即可包含，未改主dist。

### 57：缺失interval来源的完整保守提交（OFF，待实际验收）

仅wholeStaticSources候选的warm索引路径开启。新来源明确缺`missing-geometry-interval`时，将该真实原生来源加入现有always集合；未知风包围不用于剔除。普通静态源保留原drawRange，实例源使用现有完整root视图保留当前全部root/原属性/风；原生多材质已拆出的facade继续保留各自区间。GPU packet、已准备来源和原冷启动路径不改；蒙皮、特殊实例geometry及morphTexture不冒充普通来源，保持原安全准备。

完整窗口成功提交后即启动已有后台prepare，即使owner持续valid也会精化。精化插入先准备索引keys、最后原子替换；不会在yield前删掉仍有效的完整来源。后台完成必须重新选择旧provisional预算，不能因source证书有效而提前return。源版本、plan与commit检查保持；变化时旧mask仍拒绝使用。2ms/32ms预算不变，没有新增场景扫描。

owner.stats.provisional57记录当前来源id/name、完整提交三角量、持续毫秒与有provisional的mask提交次数frames。extraTrianglesUpperBound是额外三角上界，不冒充精化前未知的精确额外值。实际RAF持续性仍从observer逐帧ready与owner统计判断。

修改仅shadow-window-index42/budget42/controller42/coverage42，加shadow-window-provisional57.test.js。50/50受影响回归通过：未知全风来源两个root完整原index/矩阵/风属性，与精化后光柱oracle选择一致；原drawRange、yield期间版本改变/删除、取消、精化期间证书有效、valid窗口自动后台精化及原runtime取消/故障回归。没有运行GPU或构建；真实完整遮挡oracle、原生连续路线和临时额外draw成本须主线下一包验收，不能称22pending已解决。

## Round 58/60: equal-depth ordering, not missing grass roots

The two real mode 7/2 sources had identical fresh and live selected roots (36/45). Complete-root copies with both original and address shaders matched native output, but this alone did **not** prove omitted geometry: the oracle allocated newer caster materials while selected views reused older materials. Three sorts opaque draws by `renderOrder`, then `material.id`; with the default equal-depth test, rooted grass/ground ties could therefore be resolved in opposite orders. The earlier isolated silhouettes could not expose this ground-depth interaction.

Actual evidence `shadow58-stable-depth-order.json` gives zero selected/native differences for both sources when both sides explicitly draw receivers first. `shadow58-stable-order-global.json` gives zero againstFull for all three caster/receiver combinations; all differed from the old production mask by the same 55 pixels. This isolates the difference to ordering, with no evidence requiring an enlarged envelope or added roots.

The OFF candidate now sets receiver/reference `renderOrder=-1` and caster `renderOrder=1` on every committed view, including reused views. `compareFullCoverage42` applies the same order to its private complete-source clones, matching the prior world41 contract. Original source order, root density, geometry, wind, bounds, selection, GI and the 4096 native map are unchanged. The asset pipeline confirmed neither changed runtime module belongs to the generated meadow/reach/forest/structures/terrain/GI binding lists, so this fix requires no asset regeneration.

Targeted regression: 22/22 across depth-order58, coverage42, geometry42 and provisional57. New tests execute the actual Three opaque sorter to reproduce opposite equal-depth winners with cached/new material creation order, then verify invariant winners. The real window commit/reuse and full oracle scene paths are exercised, preserving original source geometry/instance buffers/renderOrder. This is logic validation, not a substitute for the forthcoming canonical60 natural-wind full-source oracle and 1000-frame movement review. Candidate remains OFF pending those checks.

### Round 60 source retirement during selection

The real 40.4601 m / 1000-frame run reached 973 ready and 26 pending frames but reported `Cannot read properties of undefined (reading 'since')` in selection. Root cause: after an awaited checkpoint retired a candidate source, both `records.get(source)?.version` and `provisional.get(source)?.version` became undefined. Their equality incorrectly entered the provisional branch, which then dereferenced the absent record. This was not a reason to relax source certificates or synthesize a timestamp.

`windowBudgetSteps42` now detects a missing native record before constructing its plan and raises the existing source-change reconciliation signal. The provisional branch also requires an actual captured provisional record, whose `since` is retained unchanged. A deterministic asynchronous regression removes the second native source and provisional entry at a real awaited checkpoint, verifies the old certificate becomes invalid, and verifies exactly one reconciliation publishes only the live source with a valid complete certificate. Budget/coverage/provisional/order targeted tests: 21/21. Runtime candidate remains OFF; this logic fix alone does not certify the remaining 26-frame readiness deficit.

### Round 61 resident mode-12 readiness before native submission

The remaining round60 program misses named two real `spruce-12-0--38,49` parts. `rebuildNearTrees` already shares each loaded template's original customDepthMaterial, but the loading prewarm only visited the near cascade's actual registry; the real prefetched batches can have count=0 until `syncActiveTrees` activates their LOD prefix. `nativeProgramViews42` skipped those batches, so source residency alone did not establish program readiness.

The OFF window now also prepares actual resident mode12 batches with nonempty prefetch records. Their exact geometry already contains per-root wind attributes. A private count=1 representative is used only for compileAsync, with the existing idempotent projected-depth contract and the same source material/hook. Original count/visibility/instances and the native/index/source certificate population are unchanged. Same-layout requests within one preparation are deduplicated in a private requested set; the real completed cache is still published only after every compile promise succeeds. Stats `compilePrefetchSources61` enumerate these sources. Cost is extra compilation of genuinely not-yet-prepared resident layouts, paid by the existing preparation flow, not an extra steady-state draw; page-load cost and actual movement readiness still require the unified61 browser run.

The new owner-level async test proves no certificate before completion or after compile rejection, then exact certificate reuse when that same source becomes a real caster. It also exposed a source-generation gap: a newly created coverage material could otherwise reuse an old same-family layout after source.version changed. Layout certificates now retain the original family's version/hook/key identities in addition to existing strict attributes/material/target flags. Real changed source generations require recompile. Four affected test files pass 26/26. This does not claim the remaining real route pending frames are eliminated until browser validation.

### Round 63 fixed loaded templates for absent initial tree forms

Round62 still had the same two form0 mode12 misses (41.44346 m, 1000 frames, 938 ready / 63 pending, no failures). This was not a dormant-batch filter error: the unchanged 28 m root prefetch radius contained no form0 at the initial position, so no corresponding batch existed. Actual batch rebuild remains driven by the existing 12 m movement threshold. A 40 m route can introduce a loaded tree form for the first time.

Preparation now also covers only the finite, already-loaded `nearParts` mode12 templates lacking a corresponding source representative. It calls the original `createTreeWindGeometry(template.geometry,1)` to retain exactly the future native attribute layout, using the original material/depth closure and a private one-instance compile source. No root radius or scene population changes. The private container is disposed with `disposeTreeWindGeometry` after compilation; original geometry/index/attributes and template count remain untouched. A real future batch created by the same original constructor reuses the completed exact layout certificate; a different source depth object/closure is rejected. Stats `compileTemplateSources63` expose the bounded missing templates.

Targeted regression: 23/23 (template63, prefetch61, programs42, coverage42). Tests exercise the actual constructor, release ownership, real owner async publication, later native batch arrival, and different-closure rejection. No build or GPU sampling was performed by this branch. Initial compilation cost and route readiness still require the next unified browser acceptance; candidate remains OFF.
