# 岚川客房原台阶草花避让 v38

主线实际完成route3全7点双向33.83m木道，并沿原台阶登门廊、转向local x8真实门心进入客房；直接延长木道轴线撞门旁墙是正确碰撞，不改原门或原路线。证据：`previews/v2-route-craft-38/route3-actual-walk-roundtrip.json`、`route3-guest-door-entry.json/png`。返回画面暴露x7.5台阶草花穿插，本修复仅处理此问题，不动楼体与室内GI。

从原assets/gh_lanchuan.glb提取19个真实连通组件、228三角：9块踏板（7级名义阶加2级原埋地延续）、9个石支撑、1块相邻落脚板；按真实三角建立碰撞场，不用整栋或整个院子的排除框。原材质组件名gh_lanchuan_*对应已采用新卫浴源lanchuan_shell_*；测试核对每个障碍三角实际存在于新源，坐标按原验证器1e-6m键值比较，没有用名称相同替代几何核验。

默认启用，`guestStairPlants=0`保留原草花位置对照。完整风摆包络沿既有ThresholdPlantField逐环寻找适宜落点，身份仍归原源格。实际945草源中7根相交并迁移，2714花源中4株相交并迁移；数量、id、尺寸、旋转及花池/源格身份保持，未受影响根全部数值严格相同，剩余相交0、未解决0。重新进入花区重生成记录相同。公共楼既有31草/19花迁移回归保持。

`guest-stair-plants-v38-tests.log`7/7通过；`guest-stair-cache-v38-tests.log`11/11通过。meadow根缓存已真实重新生成111块、45486根、99900源槽；所有解码源槽、原JS根字段与12个Float32字段逐字节一致。源码绑定递归包括新增GuestStair模块/真实几何数据，`guestStairPlants`加入缓存空间配置；关闭对照不会误命中默认缓存。原forest/structure-prepared源依赖未变，不重复重生。

实际浏览器验收现已完成：同pose、1280×800、time870且q0/m0的[修复前](./previews/v2-route-craft-38/guest-stair-plants-before-complete-1280.png)（guestStairPlants=0）与[修复后](./previews/v2-route-craft-38/guest-stair-plants-after-1280.png)对照，原阶面穿插草花已让到两侧；对应同名JSON记录完整准备状态。[修复后实走](./previews/v2-route-craft-38/guest-stair-plants-after-real-entry.json)经3个真实waypoint进入客房，原碰撞正常。此项默认修复已通过实景，不代表完整室内/景观艺术完成。

最新完整回归是1214/1215，唯一失败为独立meadow参考hash，已由forest真实重新生成并7/7针对修复；尚不能记为最新全套全部通过。主线将进行相关集成检查，不为每次文档更新重跑全量。

完整光照色彩、屋顶有意草皮与route3院地候选不在本修复范围。route3Courtyard38仍默认关闭，尚待固定机位地表细看，不因原路实走通过就采用其外观。
