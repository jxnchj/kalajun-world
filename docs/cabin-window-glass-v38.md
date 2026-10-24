# 原木步道终点小木屋窗玻璃（已默认采用）

最新状态：主线已完成同机位屋内/屋外浏览器验收，现默认采用；`cabinWindowGlass=0` 保留原黑窗对照。仍只修改route0目标实体，另外8栋同asset不扩展。以下候选描述为实施过程记录。

实景 `boardwalk-0-cabin-inside.png` 的黑窗确认来自原 `cabin_small.glb` 中独立 `cabin_small_glass` 节点。实际 glTF 材质为 OPAQUE、alpha=1、RGB约(.05,.06,.07)、roughness=.9、doubleSided；原 `tools/blender/cabin.py` 将前后左右6个窗建成4cm厚玻璃盒（72三角），并分别制作木框、十字窗棂和外百叶。黑块不是需要保留的不透明窗板，也不是完整GI缺失才产生的间接现象。

运行时候选 `?cabinWindowGlass=1` 只为 route0 终点实体 `cabins:-1999.5,3372.6:0f598bcbed84e01b` 派生薄玻璃材质，保留所有原72玻璃三角及框、百叶、门和家具。其余8栋同asset及其他建筑材质不变。开启前核对原节点/材质、6窗位置包络与各12三角数量，失败明确报错，不将所有黑材质透明化。

新材质 FrontSide、透明、depthWrite=false，保留已有AO shader并附视角Fresnel覆盖率，使正视主要透视、斜视反射占比增大。当前是透明薄玻璃近似，没有新屏幕折射/模糊通道。实体窗格仍参加原碰撞；因transparent，原阴影状态更新不会将它当作不透明太阳遮挡。木窗框/百叶继续投影。没有改变全局曝光/太阳/室内GI，也不声称室内已有完整间接光。

隔离只拆分原玻璃实例批次，其他所有原建筑材质批次保持原共享关系，避免为了单栋窗户复制整栋绘制。候选源码为 `web/src/v2/cabin-window-glass.js`，只在structures中添加隔离接线；原GLB SHA `949072066eaa4afc88f4689be2e2f394a8c4e444c1045bc87e7c6b1d6df096c4` 保持不变。

验收要求：默认/开启后同一室内窗边机位看外景，检查六窗内外可见、木框窗棂/百叶未透明、窗玻璃不投实体黑影；以浏览器结果判断透视与透明排序。Node测试只能确认原源、材质/几何/碰撞/阴影状态与shader接线，不代替真实像素验收。结构准备源码发生变化，最终须真实重新生成housePrepared，不能仅更新其hash。

验证完成：实际玻璃源、精确实体隔离、全部9实例几何/碰撞保持、只增加一个玻璃绘制批次、透明/不投实体阴影及家具加载碰撞共5项通过；原结构默认及prepared严格绑定14项通过。已将候选模块纳入prepared来源清单，并真实重新生成完整housePrepared。未build，候选未默认启用，等待主任务原机位浏览器验收。日志 `tools/reports/cabin-window-glass-v38.log` 与 `cabin-window-glass-regression-v38.log`。


默认采用收口：主线证据 `docs/previews/v2-route-craft-38/cabin-window-glass-same-inside.{json,png}` 与 `cabin-window-glass-outside.{json,png}` 确认内窗透出真实草坡、屋外透窗可见原家具/后窗，无墙体穿透排序，加载/准备归零且errors为空。默认契约已从显式1改为非0；测试真正走无参数默认路径，同时保留0对照。原结构/玻璃/新家具12项通过，housePrepared真实再次生成，严格缓存7项通过。未build。
