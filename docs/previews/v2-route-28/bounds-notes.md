# 28轮世界包围盒缓存候选

新增 `world-bounds-cache.js`，近树/草 `refreshPlantBounds` 与远林原 `intersectsFrustum` hook 共用。每次查询读取并比较矩阵16值、本地包围盒6值；相同才复用上一世界包围盒，任一数值改变立即执行原 `Box3.copy().applyMatrix4()`。不依赖对象身份、frame号或matrixWorldNeedsUpdate，因此支持原地修改、父世界矩阵更新、原点重定位及对象替换。

保留原包围盒、wind margin、LOD、count=0/empty早退、原球体fallback和frustum判定，不减少任何几何/密度/细节。状态是每mesh单独缓存，并在mesh释放后自然回收；全局control只保存计数。

最终采用决定：默认关闭；`boundsCache=1` 实验启用，`boundsCache=0` 显式关闭。实时任何已安装hook的 `mesh.userData.worldBoundsCacheControl.enabled=false/true`，所有hook共享此对象；该对象 `.stats` 为查询/重算/复用总数。`mesh.userData.worldBoundsCache.stats` 为单体计数。关闭会每次执行原转换，并使重启后首次转换重新计算。

`bounds-tests.log` 16项通过。1200随机变换含旋转、负比例、剪切和非仿射矩阵，5个实际透视/正交视锥6000次得到精确相同box及可见性；1200重算、4800复用。测试覆盖矩阵全部16元素与box全部6元素原地变更，替换、实时切换、empty、count=0、近树/草hook、远林原球体fallback，以及既有实际根/矩阵/风/边界回归。

数学/计数通过不等于实机整帧改善；待主线同条件浏览器对照决定默认采用。备份：`backups/route-continuity-v28/land/bounds/`。该备份可能包含其他agent本轮已存在代码，不能整文件回滚ecology；如需撤回只撤本候选import和refreshPlantBounds片段。

主线最终实测：冻结PNG逐像素一致；关闭整帧70.85/68.67ms，开启71.96/74.04ms，没有净收益，因此默认关闭。开启时复用逻辑保留，关闭直接执行原转换且不检查22个值。最终正式四组性能在 ../v2-route-craft-28/performance-summary.json，不能与本候选时段混合。
