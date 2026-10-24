# 岚川公共楼前后生活路线（实景验收后默认启用）

本项将已走通的后木步阶/餐厅延伸到原大厅、接待和休息区、玻璃正门及前方原12级楼梯。既有建筑身份、房间/家具、门框、植被、尺寸和地理不变，不新铺道路。默认入口 `?view=walk-lodge-front`，`lodgeDoor=0`保持原静态关闭玻璃门。完整光色仍在阶段5。

## 原源与运动合同

公共楼唯一实体 `guesthouses:-1993.1,3453.7:5b4988c14b5aecdb`，asset `gh_lanchuan_lodge`。`-1990,3407.8` 是另一栋客房楼，不能混用。原源 `tools/blender/guesthouses.py::lanchuan_lodge` 已定义前门、12级楼梯与后方开放门洞；前阶生成器含额外入土延伸踏板，所有原几何保留。

`web/public/assets/gh_lanchuan_lodge.glb` 原件未改，SHA256 `21d20750939a5915f33211eb3f68d5c9a691307589756fa68055b85c90f85997`。可复现的运行派生合同为 `web/src/v2/lodge-door.js`，WorldDoors从原GLB提取并克隆完整门网格；没有重建盒子代门，亦未把动态门同时留在静态碰撞中。

- 原铰链 `gh_lanchuan_lodge_door0`，局部位置 `[-2.890000104904175,0,3.5]`，原初始角为0。
- 绕本地Y轴正向打开至1.75 rad（约100.27°），门叶进入室内。不开反方向门，也不改原铰链。
- 真实状态沿既有 `doors.angles(entityId)` 读取，返回 `{name,angle,open}`。GI使用实际angle；`openness`的原90°归一化会饱和，不足以表达100.27°状态。
- 原门96三角从静态建筑移到运动门；静态40456+门96=原40552三角。所有门玻璃、框、把手保留。沿用玻璃局部薄透明材质。
- 原完整门与原建筑几何用于Rapier。运动沿用原旋转扫掠身体保护；关门受阻不推移人物，身体离开后继续。
- 近场碰撞卸载不删除WorldDoors逻辑状态；再次返回恢复同一角度。

旧 `doors.js`、`collision.js` 备份在 `backups/route-continuity-v38/lodge-door/`。只作用于该代表实体；未来出现同名资产的其他实例时显式拒绝扩大候选，不静默去掉其原门。

## 针对验证

`tools/reports/lodge-door-regression-v38.log`：26/26，包含新2项以及原木屋/毡房门、碰撞与已采用木阶。Node真实原GLB+DEM走通前阶上行、闭门阻挡、开门穿过大厅到餐厅后方、返程与前阶下行；身体挡门后退自动续关、离开200m卸载碰撞后返回门角保持。前阶最终地面高2113.3490m、足底约2113.3663m。原门全部世界顶点在旋转/非均匀缩放实例下与源匹配；原源SHA和全部三角数保持。

实际浏览器已完成双向前后路线：`docs/previews/v2-route-craft-38/lodge-route-final-{front-up,closed,front-to-rear,return-door,body-guard,exit-stairs}.json`，均无错误、地形 ready。离开到林溪再返回餐厅，`lodge-door-return-preserved.json` 记录门角1.75 rad保持，GI active且角度插值weight=1。现默认启用门与同源三态GI，保留 `lodgeDoor=0` 静态原门回退。此项是代表路线结构/交互闭环，不代表全场景最终艺术完成。

门默认合同与同期采用的地基石AO使实验预处理包来源变化；现已运行既有生成器完整再生housePrepared，并验证与新默认原源提取的全部几何属性、材质和碰撞一致。预处理实验本身仍默认关闭；旧包保存在`backups/route-continuity-v38/lodge-stone-adoption/`。forest/meadow实际依赖签名均未变化，不重复生成根缓存。

## 前阶植物穿插修复

实际`lodge-front-stair-before.png`显示原前阶踏板被草花穿过。现仅精确公共楼实体接入`LodgeStairPlantField`，默认生效，`lodgeStairPlants=0`保留原对照。它不依赖门是否启用，原前阶本就存在。

`tools/build-lodge-stair-obstacle-v38.mjs`从原GLB完整提取前阶/支撑/平台99个连通构件、1212三角（含名义12阶之外原先入土延伸的2块踏板），来源SHA与manifest严格匹配；无新渲染网格，不修改建筑或碰撞几何。运行仅在邻近草花首次查询时创建真实几何的高度切片包络，复用溪石的三维投影相交及完整植物风摆包络，不用整院矩形清空。

原ThresholdPlantField的确定性适生迁移保留根ID、源格归属、种类、尺寸、旋转及数量，仅修穿插的根位；花仅新增该精确实体判断，不扩展历史门口行为。实际附近794草根/1328花源全部保持，31草/19花迁移后与完整阶体的扫掠交错0、未解决0。未碰阶的草花坐标不变；草重复生成、花跨tile卸载返回记录一致。22项前阶/门槛/院落/溪石回归通过，见`tools/reports/lodge-stair-plants-regression-v38.log`。

草甸缓存从最新源码完整再生，9项通过；两原缓存范围均在此局部之外，全部10,382,316字节及45,486根逐字节相同，真实code签名更新，旧包保存在`backups/route-continuity-v38/lodge-stair-plants/meadow/`。显式`lodgeStairPlants`参数绕过默认缓存；未改门GI及其原来源，没有无关重烘。前阶画面与双向步行已由上述实际浏览器记录复验通过。
