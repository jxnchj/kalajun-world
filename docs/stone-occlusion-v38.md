# 原木屋地基石遮蔽连续性修复

状态：实景AB确认后默认开启，`stoneOcclusion=0`回退旧遮蔽。`tea-foundation-shadow-isolation-1.png` 与 `tea-stone-occlusion-candidate.png` 在同机位、time870、DPR1、地形q0/m0且errors空时对照：原黑白三角变为连续自然阴暗，保留石块硬面与完整几何。不称地基石最终材质完成；完整光色仍阶段5。

实际关闭全局阴影后，地基石仍呈黑白三角。原`house_a.glb`的1900个近地物理顶点跨面AO/sky差为0；`house_a_lived.glb`有1642处AO跨面差>0.2、1732处sky跨面差>0.2，最大AO差0.69946。`v2_pastoral.py`先导入已按硬法线/UV拆点的旧GLB，再逐拆点法线重烘；同一位置因每面法线而得到强烈不同遮蔽。runtime正确将COLOR_0作为AO/sky而非颜色；石材没有法线图。3374个近地三角全部硬法线，未发现法线与面绕序相反。

修复只作用于48块原地基环石。`tools/blender/v2_stone_occlusion.py`以共享边建立真实连通组件，排除烟囱、基座盒和台阶；组件内同位置使用面积加权连续采样法线，256方向对完整原房屋真实重烘2m AO与40m天空遮蔽。连续法线仅用于射线采样，渲染硬法线完全不变。2016个物理采样点对应11520个原拆分顶点；其余stone节点顶点沿用原数据。

`tools/build-stone-placement-v38.mjs`调用真实`clearThresholdStones`记录已有三块门口石迁移（240三角/720顶点）。重烘射线和采样位置使用这些既有最终位置，候选准备严格验证实际迁移后position、原normal/index/UV。没有再次移动任何石块或生成替代盒。

原Blend/GLB完整保留。可编辑派生源`assets/src/v2/pastoral/house_a-lived-stone-38.blend`仅写所选AO/sky，其石块原坐标保留，遮蔽按上述既有运行位置烘焙；保存后重新打开验证全场几何、硬法线、UV、材料与其他网格颜色不变。运行时使用原GLB加`stone-occlusion-data.js`严格绑定的局部字段。AO范围仍约0.3–0.91，sky为0–1，未涂白或均匀化。

21项针对检查通过（`stone-glass-tests-v38.log`）：原源和派生源hash、全位置/索引/UV/硬法线、未选顶点逐值保持、组件内连续AO、错误输入拒绝、真实生产WorldStructures接入，以及静态/运动玻璃与既有门回归。实现与物理数据检查及上述实景AB均已确认。

薄玻璃同步修复：原静态structures已按transparent排除不透明投影，新增真实lodgeThinGlass标记保护；动态WorldDoors初始和update均不再让thinGlass pane投全黑片，门框/把手保持真实投影。不是彩色玻璃透射阴影系统，现与清透玻璃近似保持一致。

采用时housePrepared实验包从新默认完整重新生成，携带修复后的真实AO/sky；默认源提取与预处理恢复逐属性、材质、碰撞严格等价。`stoneOcclusion=0`绕过新默认包，保留旧AO回退。原包备份于`backups/route-continuity-v38/lodge-stone-adoption/`。没有改生态根输入，不重做森林/草甸缓存。室内GI使用原几何与反照率而不把AO当光能；本项不改二者、原源或外部地形，因此没有无关重烘GI或伪改绑定。

证据：`tools/reports/stone-occlusion-v38.json`、`stone-placement-v38.json`、`stone-glass-tests-v38.log`、`stone-glass-house-{regeneration,tests,equivalence}-v38.*`。备份`backups/route-continuity-v38/stone-occlusion/`。
