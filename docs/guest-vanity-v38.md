# 岚川三客房洗手柜精细资产 v38（已采用）

已根据最终三房实际浏览器验收授权默认采用；`guestVanity38=0`保留原卫浴源与原GI对照。新可编辑家具、35°固定内开淋浴玻璃、完整八表GI与无损gzip作为同源组合采用。原通路/柜体有效碰撞保留，既有堵路屏风错误已修复。未改公共楼/木屋/整体光色；仍是阶段3进展，非整体美术或完整动态GI定稿。

## 来源与交付

源依据：tools/blender/v2_lanchuan.py 与现有 lanchuan-freedom.blend；原盆是扁椭球、龙头为两根直杆，镜面无框，柜体为实心盒。照片依据沿用原源房型资料；本次工艺细节为设计，不宣称实测复原。

- 可编辑源：assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend，SHA256 `0418790225b7113dec526e3ae176325dd589323a57f6e194789ae5a7ca794f2e`。
- 完整候选：web/public/assets/v2/gh_lanchuan_rooms_vanity38.glb，SHA256 `201190ad2bd3886783c2dfc9b81099ba944740bccb7973bd95102981720b7f10`，14,780,020 B。
- 原GLB SHA `b89c00c4c27dd181e8a1bc0f8be3845e74eae471a00ee59b78f4ed816604cd6a`；原Blend SHA `31b42bf4c641fb55da6535ace265633ef696005aa628695c32ebd14e977119a6`，读回均未改变。
- 完整原楼167930→199856三角，替换原21家具3552三角，新72部件35478三角，净增31926三角。所有其他几何/密度保留。

柜体改为实际侧板、背板、底板、上下横框、双抽面与抽盘，原4把手/套保留；台面有真正连通的凹盆、口沿与排水口，龙头具有弯曲管体、底座和阀柄，原镜面与镜灯保留，新增连续薄镜框。柜体原1.12×0.50×0.78m、台面1.19×0.55m占地不扩张，原通路和建筑尺度不变。

根据首轮实际预览，进一步把台面外轮廓改为35mm真实圆角、6mm实体上下倒边，外缘使用解析连续法线；镜框改为封闭圆环及正确朝外绕序。没有涂白或改变金属反射值掩盖问题。同机位128samples预览已重新查看：圆周连续，原24samples金属噪点消除，台面薄边高光连续。before.png / candidate.png 在候选源目录，属于中性检查灯离线形体审查，不能替代网页GI验收。

新19200顶点在完整原楼遮挡几何下48射线采样AO，均值0.483788、范围0.300–0.934070。原AO不改、新AO不是全白。32既有材质与31原纹理复用，无新贴图或Aholo。最新生成、真实AO与完整导出共9.05秒；这只是工具耗时，不含人工审查、后续GI与浏览器成本。

## 实际验证与接线

569个未改导出节点（另3个原淋浴玻璃仅改变明确列出的旋转/位置）的POSITION/NORMAL/UV/COLOR/index等accessor字节、材质名称、transform、父子关系完全相同；31纹理图像字节完全相同，原文件SHA均不变。验证：tools/verify-guest-vanity-v38.py，报告tools/reports/guest-vanity-verify-v38.json。

独立definition/loader默认启用，guestVanity38=0选择原源及匹配GI；实际字节SHA校验失败直接报错，不回退旧几何配新GI。structures候选跳过旧prepared包，纹理由原管线管理；prepared来源清单已加入新依赖，最终缓存由主线统一真实再生成。未改settlement-assets.js。

原碰撞保留：tools/build-guest-vanity-binding-v38.mjs从未改原GLB实际提取21被替换家具、3552三角。新render部件单独标记，collisionPartsFor排除新部件，再追加原家具；因此新凹盆/面板间空隙不会让角色穿透旧阻挡。原柜体碰撞保留；除明确修复的三处淋浴屏风/支点外，完整楼候选/默认碰撞三角集合逐个比较完全相同，不仅三角数量相同。结构默认/木屋/公共楼与候选相关10/10通过，报告tools/reports/guest-vanity-integrated-tests-v38.log；此为早期结构回归；最终实走和默认验证见下文。

生成：`tools/.bpy/bin/python tools/blender/v2_guest_vanity_v38.py`；随后 `node tools/build-guest-vanity-binding-v38.mjs` 更新真实SHA及原碰撞提取；预览：`tools/.bpy/bin/python tools/blender/preview_guest_vanity_v38.py`。任意源变更后必须重新生成GI，不可只改来源哈希。

## GI与中间态

wood_finish38负责三房独立新key `lanchuan-freedom-{1,2,3}-vanity38` 的天空/太阳/灯具一二阶、开口与接触重烘及按需加载。原字段曾excludedBounds排除整卫浴，新定义已移除此排除并实际覆盖洗手区；旧版定义保持不变，开口/灯具/房间总体范围不改。最终35°开态源八表真实重采、三房浏览器及默认契约验证均已通过，仍不得将旧表配新几何。

木纹仍原程序纹理，淋浴/WC与衣柜未精细替换；镜面仍原材质，未新增真实镜面反射。浏览器渲染与三号房碰撞实走已完成；完整动态GI与后续全域推广仍未完成，完整光照色彩仍按原顺序。

## 浏览器实走暴露并修复的原卫浴堵路

主线实际W从三号房入口走入后，在世界[-1975.8798903,2122.0944804,3407.8884662]停住；逆变换local[14.012431,1.625492,-1.742729]。原固定玻璃x13.77、z[-2.56,-1.60]挤占卫浴入口，与WC座圈之间净隙不足角色直径0.44m。原屏风本来没有交互铰链，不能声称按F能开门。真实原几何Rapier复现local[14.012258,1.625495,-1.743025]，因此不是浏览器操作失误，也不能靠setPose跳过去当走通。

限定修复经主线确认：三套玻璃保持原尺寸，仅绕后端竖轴向淋浴内侧打开35°，加真实支点柱及双铰链；托盘/WC/柜/墙/灯位全部原位。当前是明确的静态35°开态，不具有F交互；GI重烘使用此真实开态。没有保留旧0°玻璃碰撞，原柜体21部件碰撞仍原样。3个被改原节点与9个新增支点/铰链及精确轴心列于metadata.reposedShowerScreens；新增1308三角。

3/3针对验证通过（guest-vanity-runtime-tests-v38.log）：全部三房从原入口连续走至柜前，再向柜体前进被挡，之后连续返回原入口，过程中无setPose跨越障碍、无交叠；非淋浴区域旧碰撞集合不变。此为真实源码几何与Rapier逻辑验证，其后的主线浏览器W正反通行证据见下文；不能用单测代替最终实景。已将最终源传递GI负责人重新真实采样八表，旧一轮GI不可沿用哈希。

## 无损传输接入

最终源通过既有 tools/build_glb_transport.py 的 `--only gh_lanchuan_rooms_vanity38` 精确模式生成同名`.glb.gz`并注册glb-transport-manifest.json，保留其他条目。原工具整包模式包含已经迁移的旧云杉源引用，因此此次只验证/生成卫浴，不宣称全包重建通过。单项`--check`验证确定性重建、读回解压逐字节相等、源SHA/大小/mtime未变。

原14780020 B → gzip 6152672 B，减少8627348 B（58.3717%）；gzip SHA `ee9d549c9fbdab3ded4d1edb4ec40392179d870164e4eac7b32410596264ccbc`，解压后SHA仍 `201190ad2bd3886783c2dfc9b81099ba944740bccb7973bd95102981720b7f10`。文件为 `web/public/assets/v2/gh_lanchuan_rooms_vanity38.glb.gz`。这只是传输字节收益，不声称首帧时间按比例下降。

候选loader调用既有loadWorldGLB，保留其fetch/body/decode/parse绝对计时；parse包装器对解压后完整bytes校验SOURCE SHA，匹配后才交GLTFLoader。assetTransport=raw对照也校验相同SHA；损坏压缩或解压后源不符均报错，不回退。真实gzip候选加载、伪造同长度解压内容拒绝、原碰撞/通路与共用传输31/31通过（guest-vanity-transport-tests-v38.log）。其后主线已构建并确认浏览器实际请求.gz，见下文Resource Timing；没有据此宣称整体首帧改善。

## 最终源三号房实际浏览器验收

证据：[真实往返JSON](./previews/v2-route-craft-38/guest-vanity-final-real-roundtrip.json)、[台盆近景](./previews/v2-route-craft-38/guest-vanity-final-basin-close.png)。主线已实际查看真凹盆、薄圆边、龙头与接触表现；最新构建使用35°开态源SHA201190ad…，不是首轮被堵的旧玻璃。

从原入口通过真实Rapier移动到柜前：初始目标距离5.05167m，62帧/2.1069秒后剩余1.253cm；继续W1.1233秒被原柜体挡住（2次碰撞），随后54帧/2.2737秒返回入口、剩距3.048cm。全过程没有setPose跨障碍，最终ready=true、walk/grounded=true、errors=[]，接触字段为lanchuan-freedom-3-vanity38（108870 B），原被屏风堵死的问题在真实入口路径上已修复。

同份Resource Timing确认请求的是gh_lanchuan_rooms_vanity38.glb.gz：encodedBytes=6152672、decodedBytes=14780020、transferBytes=6152972。浏览器HTTP层已解压，因此运行诊断responseBytes显示14780020不能误读为实际线传原包；线上压缩收益由encodedBytes确认。

最终三房八表重采及18/18针对回归已完成并交主线。其他两房与灯具开关随后也已复验通过，并授权默认采用，见下节；这些成果不代表阶段3完成。

## 默认采用与最终三房复验

最终另外两房：[一号房](./previews/v2-route-craft-38/guest-vanity-final-room-one.json)、[二号房](./previews/v2-route-craft-38/guest-vanity-final-room-two.json)，均ready、q0/m0、errors=[]，接触分别选择新的1/2号vanity38字段。三房最终source SHA一致为201190ad…。二号房真实UI开/关灯证据 [on](./previews/v2-route-craft-38/guest-vanity-final-room-two-lamp-on.json) / [off](./previews/v2-route-craft-38/guest-vanity-final-room-two-lamp-off.json)：灯具一二阶由active=true/各3灯切为false/各0灯，接触仍为二号新字段；并非关灯同时误清全部室内数据。

definition默认已改为on，显式0才选择原版。默认完整源/实际碰撞通路测试使用真正空query及新源，不用显式开启绕过默认；旧源不变性专用测试显式false，完整世界步行回归则补充新源实际gzip读取，保留真实物理断言。默认结构、碰撞、纹理/距离复用及全世界步道/逐户通路69/69通过（guest-vanity-default-tests-v38.log）；GI默认契约25/25通过：真正空query验证默认新源三房日夜，旧源专用回归显式选择0。未修改legacyRoomLazy默认；主线正在统一构建与默认入口复验，以上实际浏览器证据是采用前显式候选，不冒充默认入口复验已完成。

仍为中间态：GI是有限分辨率/有限阶次的静态输运，镜面仍原材质且没有新增真实镜面反射；淋浴玻璃当前固定35°开态，没有F开关交互。原程序木纹、其他卫浴设施和全域室内协调仍需逐步完善。
