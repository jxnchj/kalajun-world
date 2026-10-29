# 代表木屋六件木作58：独立OFF源与集成API

状态：源、字段和独立运行模块已准备；未接主入口、未改structures/main、未执行浏览器图审或默认采用。此项保原形体，改善真实构件的木纹方向和端面识别；现有木端纹图案仍规则，不能宣称自然端纹质感已完成。

## 实际范围
代表实体 cabins:-1743,3612:30f9adc9fb584805，asset house_a。六个实际节点：pastoral_house_sleep_platform、pastoral_house_chest_body、pastoral_house_chest_lid、pastoral_house_window_bench、pastoral_house_bench_leg及其.001。
原GLB总10800顶点/5400三角，Blender共50构件（床26、箱16、盖5、凳座1、两腿各1）。bed_foot是红色织物，明确不纳入；金属扣、布料、现有门廊也未改。

轴来自tools/blender/v2_joinery.py的真实构造，而非最长轴PCA：箱体四凹板沿竖直Z，盖两穿带沿Y、三盖板沿X；已有脚/框/床条/榫肩保留。凳座和脚只有原倒角构件相接，不虚称新造榫卯。

## 交付资产
- assets/src/v2/pastoral/furniture58/house-a-furniture58.blend：7,576,996字节，可编辑材质及新增UV层。原几何/UV/AO/角法线保存重开指纹相同，原Blend和GLB不变。
- 同目录house-a-furniture58-coordinates.json：1,746,949字节，50构件显式角色/轴/尺寸/原loop绑定。
- web/public/assets/v2/house-furniture58/fields.json：234,333字节，10800原拆缝顶点全部匹配，0歧义，原GLB SHA未变。
- 源脚本tools/blender/v2_house_furniture58.py；实际字段构建tools/build-house-furniture58.mjs。

复用既有rough wood与wood_end原图；长纹对比度.24/端面.32，normal.07，roughness长纹.44–.66/端面.62。原家具贴图线性均值作为基底，再用同源纹理相对线性均值调制；不改材质diffuse系数、AO或光照。纹理均值与PIL独立sRGB→linear计算最大误差5.24e-8。该均值约束不是所有视角/有限UV区域逐像素平均亮度相等的承诺。

## 独立集成API（尚未接线）
模块 web/src/v2/house-furniture-timber58.js：
- houseFurniture58Enabled(search)：仅houseFurniture58=1开启；默认/0/非法值OFF。
- prepareHouseFurniture58(assetId,scene,world,{timberOwner,...})：在已采用prepareHouseTimber48后、原GLTF组装前调用；精确验证6节点原POSITION/NORMAL/UV/COLOR/index，全部通过后才发布aHouseFurniture58。其余mesh加禁用sentinel，原所有属性与索引不动。
- installHouseFurniture58(material,source,owner)：在installHouseTimber48后调用。材质缓存键须包含该owner资格。现structures的原属性循环能携带新增字段，但仍需整合后真实近/远/门碰撞回归。
- owner借用timber48的同一color array与numeric纹理，不创建/释放额外纹理；两个采样器在shader内仅声明一次，防止既有最重16sampler再超限。候选目前要求接受的timber48 owner；不可把houseTimber48=0组合默默降级。恢复原方案用不启用houseFurniture58重新加载。
- 同一实体anchor限制，其他房屋与未选家具仍走原材质；完整实际邻屋隔离、GPU链接、屋内GI和门态仍待统一构建检验。

不改main、structures、Worker白名单或公共prepared绑定。新增未知参数目前会令Worker安全拒绝，集成时需主协调明确处理；不得拿候选这种回退路径宣称加载收益。真实接入后若需预制字段，沿原正式生成流程处理，不能手改hash。

## 检查与未完成
4/4针对，154ms：真实GLB六节点、损坏最后节点时零半发布；10800顶点全部原buffers保持、借用纹理不错误释放；与已采用48材质链共享sampler/AO与正确覆盖顺序；真实箱板/穿带轴与50构件一致。字段由实际Blender输出，未拿虚构对象构造产品证据。
未做GPU编译、实际近摄、室内GI、邻屋隔离或性能验收。没有新纹理图案或新接合几何，原端图仍规则；若实景只能看出投影正确而质感无明显改善，应保OFF并继续针对端纹资产，不夸大完成。


## 最小structures接入已完成（仍OFF）
已按主线授权接入constructor开关/options、材质缓存资格、prepare48后/assembly前、install48后、stats与释放。houseTimber48=0且houseFurniture58=1在constructor明确报错，不静默降级。main与Worker白名单未改。

当前12/12针对通过，673.6ms，覆盖实际原GLB及已采用48回归：
- 家具6节点10800字段进入真实near/far模板；原index、全部原属性、bounds与原门模板保持；目标与邻屋collisionTriangles完全相同。
- 默认OFF无家具加载；无目标实体时仍走原prepared路径，家具字段/木纹纹理加载均0。
- 共同48的两个sampler仅声明一次，原AO链保留；纹理仍只由48原owner释放一次，家具owner销毁不越权释放借用资源。
- 非法组合在创建资源前失败，关闭后原48流程完整。

新增house-furniture-timber58.js已登记structure-prepared-binding真实依赖。asset_pipeline接手只核对/正式再生实际受影响的structure prepared；本任务不手改hash、不跑11项无关生成，不构建。实际GPU链接、材质观感、门态GI与邻屋画面隔离仍等待统一build61，不能由Node结论代替。

## build61固定机位准备（未做浏览器图审）
`web/public/review/house-furniture61.js` 是纯served helper，无主构建/生产导入。原、候选、恢复复用同一组绝对机位，1280×800/DPR1/time870，3机位各2帧；只有同步render+toDataURL期间hold，保存和等待均正常RAF，finally恢复，失败按runId另存。
- 全室：沿用49已提供机位 `[-1741.3161458968743,2117.468597447125,3610.814826865227]` yaw -128.8693 pitch -11.2819。
- 床架/箱盖共视：`[-1742.6724236494395,2116.973714882025,3610.3560206206166]` yaw -144.2298969276747 pitch -11.83353447106364。
- 长凳：`[-1741.8771579919826,2116.9737009254322,3614.0424853386235]` yaw 81.48847743115763 pitch -29.752733414112768。

新机位由真实实体x=-1743/z=3612/y=2115.868597447125/rot=1.677/scale=1转换。床箱机位起始屋内局部x=1.6/z=.5，朝局部[-.8,.43,-1.65]；凳机位x=-2.15/z=.9，朝[-2.1,.43,2.08]。通过原GLB加载实际WorldStructures+WorldDoors、原WorldCollision Rapier胶囊与地形地板，90×1/60s原重力蹲姿落地后，两点grounded=true且overlaps(crouch)=false。最初床旁x1.75/z-.7及凳前x-.8/z.6被碰撞拒绝，未进入helper。验证脚本位于临时/tmp/house61-poses.mjs；不是用户真实步行验收，最终构图/遮挡仍待根线程实景确认。

正式结构准备包来源已由asset_pipeline再生：总11,712,888B、BIN11,645,696B完整字节不变，仅JSON signature更新，12/12相关验证。记录见structure-bindings61-validation.json；7类manifest及4GI源核对current。

## 2026-10-29 build61 实际电脑横屏验收

1280×800、DPR1、time870，唯一3D页面。原版/候选均三机位各两帧，实际图审确认床架横纹、箱板竖纹与长凳纹向较原版清楚，未调整全局光色。证据 docs/previews/v2-route-craft-38/house-furniture61-*。

原生点击木屋门完成关闭和打开；收敛后同一室内机位保存 door-closed / door-open，实际门态GI分别0°和102.000022°，ready=true、pending=false、errors=[]。这是既有有限阶静态传输随门角插值，不是完整动态GI。

同帧实际GPU隔离：只替换已编译uFurnitureAnchor58的value，不改共用timber48 anchor或原材质。代表屋正控制211373个RGBA分量变化，最大27；恢复0差。饮茶旁屋 cabins:-1972,3678:784f73bf0ba94d17 实际室内启用/禁用/恢复全部0差。两处保存PNG与JSON，证明检查确有敏感性。原生横屏拖动有效，检查结束hold=false。

发现候选URL参数被地形Worker当未知变体拒绝，build61本组加载速度不能用于性能结论。已在62源码将仅houseFurniture58=0/1列为材质参数，真实地形未知参数和非法值仍拒绝；Worker26/26、家具联合检查通过。62独立构建完成，下一步复验Worker实际ready。

家具限定采用条件已满足，尚未更新正式默认49。木端纹、凳接合形体仍中间态；被褥厚白边、箱叠毯层间空隙和硬折正准备独立9节点织物候选，未混入本次家具58验收。
