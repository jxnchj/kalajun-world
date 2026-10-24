# v38 岚川公共楼餐厅玻璃与开口照明

状态：源码和 35 项针对/实际建筑回归通过，待实际浏览器窗口、桌面及门槛视图验收。此项属于真实材料与房间照明注册缺陷修复，不是完整光照色彩专项前移。

## 已核实缺口

`gh_lanchuan_lodge.glb` 的 `glass` 为默认 OPAQUE，baseColor alpha=1、roughness≈0.9。原 structures 忠实保留该材质，因此玻璃实际是蓝灰不透明板并投实心影。该公共楼也未进入 SettlementRuntime guestRooms/pastoralPoses，没有绑定室内开口/间接光。截图所示暗室因此不能归因于尚未开始的调色。

## 修复范围

只对该 asset 的运行时私有 loader 材质派生薄玻璃：原网格、窗框、几何属性、节点与碰撞不变；透明、depthWrite=false、FrontSide，粗糙度 .08。Fresnel 角度项由正视约 .04 至掠射提高表面贡献，保留窗外实际世界；不是额外折射 framebuffer 或模糊玻璃。现有 structures 透明材质规则不再将玻璃作为实心 caster，窗框与实体家具/墙面仍投影。原编辑 GLB 不变，SHA `21d20750939a5915f33211eb3f68d5c9a691307589756fa68055b85c90f85997`。

餐厅单独注册实际有限体积：x[-12.5,-3.7]、z[-3.3,3.3]，高3m，按建筑 pose 转换。六处外部开口逐项来自 guesthouses.py：3扇前落地窗、后小窗、后常开门洞、西侧窗。扩展 RoomIndirectLight 可配置 openingCapacity；默认其他运行时仍3，在有餐厅的世界容纳6，其他房间额外3槽归零。原前3个烘焙 aperture visibility 采样保持；新餐厅没有伪造或套用别房字段。

不新增 portal 聚光灯，不提全局曝光/灯强。餐厅天空输运只在真实房间体积和开口内贡献，窗外近看仍由现有可视房间选择器保持，远离则释放。没改 paths/collision/main/ecology；不改源 Blend/GLB。

## 仍为中间态

这里接入的是现有有限开口解析天空光及反射近似，尚不是完整烘焙 GI。餐厅家具遮挡的专用 aperture field、多次反弹、通过通厅的输运，以及东侧休息区/服务房独立字段仍待制作；不能声称已经完成整栋室内 GI。透明薄玻璃为保持原网格的局部运行时近似，尚无真实折射或有色透射阴影。

## 验证

- lodge-opening、settlements、room-lighting、room-view-selection：28 项通过。
- structures：7 项通过，全场24,881,643完整细节三角保留，750次外壳采样射线无新洞。
- 原全场材质168 → 169，仅增加独立lodge薄玻璃材质；测试确认只1个此材质、其他资产glass保持原合同。
- 实际GLTFLoader解析原lodge后测试派生路径；Node图像解码替身不代表浏览器像素验收。
- structures源绑定变更使house_a prepared缓存需实际等价重导出，由协调者统一处理；本次未伪改hash或准备资产。
