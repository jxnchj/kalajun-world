# 普通中草完整风摆包络提交候选41

仅独立候选，默认 OFF (`meadowVisible41=1`)，尚待主线接入与真实浏览器同相位图像/GPU验收。没有新增传输文件或预制数据。不是远草完整解法。

## 方法与边界

原根、每根全部原叶、根字段和源几何均保留。按完整原叶局部盒加风力最坏幅度，再乘原根旋转/缩放建立世界盒；每块先判断完整世界盒，只有跨视锥边界的块检查逐根盒。主视角和实际水面反射摄像机取并集。在任何 render 之前统一紧排原普通 middle 私有 instanceMatrix 和三组根字段，每块仍只一次 draw；原完整数组保留，位置不动、次序不改、不设置新的远距裁剪。

`ecology.addGrassMesh` 中 `mesh.castShadow=lod===0`，普通 middle 明确不投影；near、湿岸和其他投影者不参与。本候选仍检查 middle 的 castShadow，一旦将来变为 true 就恢复该块完整数据，避免遗漏离屏投影到屏内的阴影。不能把主视锥裁剪推广给 near。

风包络来自当前 `ecoBend`：normalized RGBA field、current+returning 最大1.32、flex最大1.25、eddy绝对值最大.5，保留完整位置与aPlantWind输入，并加入下弯位移。测试覆盖全部原近/中源顶点、字段极值、多个风方向；此候选只对已知普通草源成立，新增位移公式需同步更新包络。

主线接法：`const meadowViews=new MeadowMiddleVisibility41(ecology)`，`ecology.stats.meadowVisible41=meadowViews.stats`。在 `syncShadowState` 内根据现有 water reflection patch 得到 actual mirror，**在 shadowReceivers.enabled 早退之前**调用 `meadowViews.update([camera,...(mirror?[mirror]:[])])`；其他直接渲染路径也要先更新。暴露 `setEnabled(bool)` 可同页开关；关闭立即恢复全部原始矩阵/字段/count。禁用时没有 root bbox/副本创建。对象退出驻留时移除 CPU 记录。材料、原几何、wind uniforms、GPU buffer 所有权及生命周期不变。

## 实源成本，不冒充浏览器帧率

`tools/measure-meadow-root-visibility41.mjs` 使用原DEM/生境/真实根和已有两条路线相机。完整结果 `tools/reports/meadow-root-visibility41.json`。同样保守风摆 tile box 下仅主视角：

| 路线/距离 | 整tile提交根 | 逐根保守提交根 | CPU筛选ms | 压实后非零三角 |
|---|---:|---:|---:|---:|
| 林溪78m |6175|4201|.18|189045|
| 林溪140m |13697|10404|.34|468180|
| 林溪200m |24768|20624|.53|928080|
| 林溪320m |70334|62824|1.64|2827080|
| 草甸78m |12623|7726|.22|347670|
| 草甸140m |24223|17277|.37|777465|
| 草甸200m |41486|31675|.54|1425375|
| 草甸320m |86818|71497|1.10|3217365|

这是 Node 单次CPU测量，不是浏览器中位值，不含字段紧排上传或反射并集增加的根。原生产使用sphere提交，表中整tile基准使用更紧且保守的box，因此不能直接当实际渲染器收益。320m保留原源需要25万/43万常驻根，源准备约2.04/3.00秒，仍然过重；此方案可压低当前绘制负担，但不能宣称解决远坡覆盖。没有因性能数据难看而缩短可见范围或减少原草密度。

## 回归与下一步

`meadow-root-visibility41.test.js` + `meadow-middle-visibility41.test.js` 3/3通过 (`/tmp/meadow-middle-visibility41-tests.log`)：完整源极值风包络；main/reflection并集与逐根穷举一致；字段/矩阵按相同根紧排；同相位不重复上传；同页关闭精确恢复；投影者保护。主线还需验证真实镜像、阴影接收、主视图冻结像素、移动边缘、关闭恢复，以及 CPU/GPU计时。完整远近衔接仍需要保原轮廓/覆盖的远距表示或真实遮挡路线，不能再次把140m当消失点。
