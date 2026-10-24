# 公共楼24把餐椅精细候选 v38（主线实景通过，已默认采用）

原配置依据仍为guesthouses.py公共楼：4张1.9×0.9m餐桌，每桌6椅，共24把，原rattan材质、0.44×0.44m外包络、座高0.44m、最高0.97m。源并无照片可证明的独特椅型，本次是沿原纤细藤编/木作语义的工艺深化，不宣称照片逐件复刻，不换现代软包风格。

## 可审阅交付

目录 `assets/src/v2/settlements/lodge-chairs-v38/`：

- `front.png`、`side.png`、`back.png`：同一个真实模型三角度中性离线预览，900²、Cycles96采样，已逐图检查；不是网页GI验收。
- `chairs-editable.blend`：共享组件的24原位椅子，可编辑；`chairs.glb`为独立椅组。
- `lodge-chairs-complete.blend`、`lodge-chairs-complete.glb`：完整公共楼独立候选，包含已验收沙发/洗烘/门与全部保留原几何，独立public候选资源，后续主线实景通过后已默认采用。
- `complete-metadata.json`：最终来源、尺寸、真实AO与验证；`chair-metadata.json`为椅组制作记录。

最终完整GLB SHA256 `1025f39e99a19324945adfceb1f333514590c11761ea0205941e62635e8c6b3b`，13,995,068B；Blend SHA256 `79ce1ae4c9d78f0943ce180fe5781193e08a55be15a51ed671932565380afb4d`，9,478,867B。原默认父GLB SHA仍为b1b8d584…，未覆盖。

## 实际改变与保全

24个位置/朝向逐个沿用原椅；纤细腿37→27mm收分、轻外撇、围板榫接交会、坐框实体厚度及2–6mm小倒边、轻弧靠背、独立冠梁和浅木销。所有顶点留在原0.44×0.44×0.97m外包络内，不侵占原通路。共有52,128新增椅三角（2172/把）；精确移除144原盒/1728三角，完整楼63,688→114,088，净增50,400。原座面包围盒包含旧腿顶，提取采用完整连通组件精确bounds匹配，未误删邻接面。

整合保留父GLB原binary前缀及原POSITION/NORMAL/UV/COLOR等accessor逐字节相同；只改旧椅indices并追加候选，其他节点和门层级/闭态Quaternion不变。新椅几何accessor在24实例共享，真实上下文AO逐实例储存；64射线/1m局部AO与40m天空遮蔽实际采样，原透明门玻璃排除，未用全白。最后一次整合+AO+Blend导出11.212秒，不是总制作成本；三视图实际约25秒，迭代审查另计。

独立重新打开完整Blend，对114,088个GLB三角核验，最大坐标误差5.96e-8m；24把原外包络、原闭门、父源SHA和所有新mesh非白AO均通过。记录 `tools/reports/lodge-chairs-verify-v38.log`。

## 材质来源与GI边界

首版原plank程序贴图在椅腿呈横向粗斑，自查未接受。最终复用项目已有PolyHaven oak_veneer_01（Jenelle van Heerden，CC0），沿每构件长轴按1.83m真实尺度/稳定偏移映射，端面使用项目已有wood_end，保留温暖细木作风格。没有重新生成木纹，普通木架、端面实际线性均值均为[.2368235,.1161427,.0553481]。原rattan只有颜色因子而非原藤编贴图，更正早期推断；保留[.48,.34,.19]，新增512²颜色及法线纹理表达5mm编织，颜色只含藤条本色/纤维细差，不烘阴影进颜色。木框比原整椅rattan更暗，属于明确材料变化，不能沿用旧GI。

Blender导出曾丢掉图像乘色因子；已明确写入GLB baseColorFactor，并从最终嵌入纹理解码sRGB→linear实际核对均值，见 `lodge-chairs-reflectance-v38.json`。后续GI须用包含纹理的有效反照率，不能只看factor或把图像材料算作白色。

主线已接受离线形体与编织质感，现接入独立 `lodgeChairs38=1` 开关；默认采用新椅；`lodgeChairs38=0`保留原家具版与其GI。新完整源三门态整楼输运与接触已全部真实重采，定向验证完成；不能把离线与Node结果当浏览器通过。新源与 `lodgeWood=1` 或 `lodgeFurniture=0` 明确互斥，避免混源。原144盒、1728三角按原位置逐顶点提取为独立碰撞合同；全部新木框/藤面通过原节点祖先标记室内角色，处理多材质节点会变Group的实际加载形态。当前藤编材质经过一轮近景检查与完善，座面舒适形变与整间餐厅光影仍可继续完善，不能称整体最终美术。

## 藤面第二次审查与完善

首轮藤面像米色板，不能以已有normal贴图称作质感通过。原因是旧法线从任意像素高度差分后再乘0.30，实际斜率过弱。现以40mm纹理边长、5mm藤条、0.20mm微起伏按米制求导，交叉覆盖方向真实交替，颜色用低幅藤条本色与细纤维差异，没有涂黑假缝。两张512²贴图替换原128²微弱normal；最终GLB实际反照率均值[.4799405,.3399780,.1900235]，量化误差范围内保持原藤面均值。几何/24布局/外包络/完整114088三角均不改，完整Blend/GLB再验证通过。

`weave-close.png`是约0.5m局部藤面检查，已查看可辨交织细起伏；`dining-distance.png`是约3m单椅观看，细纹保留为含蓄面感，不夸大成粗网格。`dining-group-distance.png`另使用完整候选中原餐桌真实三角与6把原位新椅，约4m观看，采用中性检查灯并隔离其他楼体，仅用于使用尺度检查，不能当整楼GI或真实餐厅光照。旧默认源和旧GI不变；主线后续已完成实景验收并决定采用，见文末。

## 独立交付传输

最终新源由 `generated/lodge-chairs-source-38.json` 绑定，13,995,068 B 无损压缩至8,186,467 B，真实解压与原始GLB逐字节一致；加载路径先校验新源SHA再交给GLTFLoader，不静默退旧模型。传输工具 `build_glb_transport.py --only gh_lanchuan_lodge_chairs38`，记录 `lodge-chairs-transport-v38.log`。

## 最终三态采样与交付检查

`tools/blender/v2_lodge_whole_bake.py --chairs --index 0/1/2` 读取同一最终完整Blend/GLB，门角0/.875/1.75rad。113,896不透明三角参与天空与太阳采样，原门12玻璃三角保持真实透射；47×5×13网格、96探针射线、32表面二跳、81太阳方向、25mm/64方向接触均未降低。有效点2992/3055（原家具2986），三态闭源有效性逐字段相同，局部和跨室天空/太阳均实际重算。131接触texel改变；一阶/二阶天空数据都与原场不同，见 `tools/reports/lodge-chairs-field-change-v38.json`，不是旧GI改SHA。

新独立key `gh_lanchuan_lodge-chairs-whole`。闭态完整包+三态XOR合9,412,378 B，相比三态分别gzip19,961,357 B下降52.85%，解码后严格等于三个原始采样对象。坏包只允许退同新源完整数据，不能混用旧几何/光场。各门态报告墙钟约737–753秒，包含为主线GPU测量而SIGSTOP的暂停，不作为纯CPU烘焙耗时。

验证：`lodge-chairs-runtime-v38.log` 3/3，真实完整GLTF含有效织纹map/normal与原AO；52,128新椅三角全部正确分类为室内，144旧盒的1,728碰撞三角逐position/index与父源一致。原前12阶、门闭/开、前后通路与返回、椅/沙发/洗衣设备阻挡通过实际Rapier步进。完整渲染114,088三角，原门拆出96、静态113,992；物理碰撞仍父源63,592，不给细编织新增物理负担。

`lodge-chairs-gi-tests-v38.log` 4/4，覆盖新源与三门态绑定、旧源拒绝、无损包、四室接触和最终RGB、夜间清除、离开返回、森林懒加载及默认不选候选。`lodge-chairs-default-regression-v38.log` 10/10，默认原家具、结构复用与其GI继续通过。`lodge-chairs-transport-check-v38.log`再次确认无损字节。没有运行全量或build；最终prepared来源已加入新依赖，交主线统一真实再生。

浏览器入口为 `?view=lodge-dining&time=870&debug=1&profile=1&lodgeChairs38=1`，原版同条件`lodgeChairs38=0`；还应检查后窗、三门态和餐厅实际通路。主线已实际验收并采用新椅，靠背/坐面织纹和木作已离线改善，原餐桌自身材质、整体照明、低频GI与最终艺术协调仍是中间态。

## 主线实际验收与默认采用

主线已检查[餐厅整体](previews/v2-route-craft-38/lodge-chairs-dining-candidate.png)、[过道近景](previews/v2-route-craft-38/lodge-chairs-aisle-close.png)，实际步行[接近](previews/v2-route-craft-38/lodge-chairs-actual-approach.json)与[阻挡后返回](previews/v2-route-craft-38/lodge-chairs-actual-block-return.json)正常；浏览器GI active/ready正确、errors为空，并明确授权默认采用。1234/1234整合通过发生在后续木作表面源码和默认切换之前，不能当成之后版本已全量通过。

`lodgeChairs38`现默认ON，0回此前沙发/洗烘完整楼及其GI。未显式要求新椅时，原`lodgeWood=1`或`lodgeFurniture=0`比较URL继续选择各自旧源；显式同时指定新椅与不兼容旧源报错。真正默认的加载/原门/Rapier与新GI四室路线都继续验证，旧源专测显式关闭新椅，不以关闭候选回避默认路径。

默认影响定向结构87项先86通过，唯一失败是新增测试错误假设plank/pine旧fallback一定不同，实际两者可共用同图；已改为按实际Texture身份判断可合批或隔离，并由木作最终7/7验证，未放宽源/几何/碰撞断言。GI与旧源对照26/26通过。最终结构prepared由真实原house GLB再生成一次、严格7/7通过（`lodge-chairs-default-prepared-v38.log` / `lodge-chairs-default-prepared-tests-v38.log`）。后续统一全量由主线待相关源码稳定后安排。
