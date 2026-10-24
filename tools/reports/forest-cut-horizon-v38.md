# 代表林溪切削面土壤候选（默认关闭，待实景）

现行细分修复了底部亮脊，细沉积替换了强制岩板，rootSurface恢复已有根垫的森林材质，但三项没有改变主要以水位/径向河床权重划分土层的方式。`hydrology.js sampleAt`产生径向riverBed/bank，`terrain-material.js:390–402`用离水2–12cm裁床，493用riverBed抑制森林；`shore-material.js`的有机资格也按水位。真实中心断面侵蚀侧离岸2→5cm上升7.8cm，而沉积侧离岸50cm仅高水2.8cm。相同水位的带并不代表相同土层。这是候选要替换的分类依据，尚不能声称它一定改善画面。

9cm抬肩仍不采用；没有改变河床、岸线、水位、几何、LOD、根ID、数量或位置，没有铺石、加浮层、加噪声或整体调亮。原自然岩比例非零的点不进入本候选。

新增独立模块 `web/src/v2/forest-cut-horizon-v38.js`。原 `surface.uncarvedHeightAt` 已提供切削前DEM+authored detail（`world-data.js:247`）；候选一次读取该函数，不调用最终heightAt，不修改hydrology或world，无循环。128m方形、0.25m网格513²相对高程R32F=1,052,676B，GPU手动双线性4fetch，局部60m外与关闭分支不取样。新增1个fragment sampler，0个draw、0个mesh、0个几何属性，没有逐帧CPU扫描。该额外sampler仍须真实Chrome编译确认（不能仅靠Node证明设备上限）。

基于precut−当前worldY划分原地表、暴露腐殖面与更深土壤；15–60mm/80–220mm过渡是明确的艺术设定，并非当地土层实测。颜色、法线、粗糙度使用同一资格与层位。湿度和水内原床保持，其他光照/色彩流程保持；地形实际高度来自当前LOD，因此不能承诺LOD过程中像素完全相同。候选不在生产入口导入，install后也默认off。

浏览器挂载方式（使用当前world与terrain引用）：

```js
const mod=await import('/src/v2/forest-cut-horizon-v38.js');
const field=await mod.buildForestCutField38(world.surface);
const horizon=mod.installForestCutHorizon38(terrain.material,field);
horizon.setEnabled(true); // 同页原机位开/关；完全退出用horizon.dispose()
```

原onBeforeCompile及program cache key保留并在dispose恢复；source锚点改变明确抛错，不静默部分接线。恢复时若第三方已换hook也明确拒绝覆盖。默认世界/GI绑定源完全未改；先真实同页低视点、对岸、俯视、干/湿对照，视觉通过后才讨论正式接入与全GI重采。

验证入口：`node --test src/v2/forest-cut-horizon-v38.test.js`（web目录）；`node tools/check_forest_cut_field_v38.mjs`（仓库目录），后者检查实际原高程插值误差不超过2mm并输出真实剖面层位。目前等待主线程GPU窗口后运行，未声称通过。

定向结果：4/4通过。第一版场以视点中心小数坐标为原点，跨10m DEM折线产生3.278mm最大误差；该林溪位于detail栅格外。一次将0.25m场的原点对齐原DEM整数子格后，全128m范围5476个错开网格的实际样点最大误差0.0000002086m、平均0.0000000178m，2mm断言保持。真实字段生成8.58ms，1,052,676B；`forest-cut-field-v38.json`含逐断面结果。没有缩减测试范围或改变原高程。实景画面、额外sampler设备兼容性及近/远LOD观感仍待根线程浏览器验收。

实际浏览器第一轮：`cut-horizon-low-{off,on}.png`及overview对照显示新腐殖窄带仍连续，右岸细黑横线更明显，**暂不采用**。离线检查发现候选法线混合位于原terrainSwardHeight微高度导数累加之后，候选会额外削弱这项原地表梯度；这是接线缺口，尚未证明它就是横线根因。候选没有改阴影坐标、shadowmap或bias，截图不能据此排除原有阴影被新材质对比强化。下一步需分离材质法线与真实阴影后再判断；不得通过抬亮/模糊或改变shadow bias掩盖。切深本身沿连续河岸亦连续，当前土层参数产生的暗窄带不等于打破原连续灰槽。

最后一次接线修正（v2）：仅将候选材质梯度混合移到原微高度导数累加前，保留原有terrainSwardHeight梯度及最后footprint滤波，不改任何土层参数或颜色。4/4定向测试通过，新增断言验证混合→原导数（且仅一份）→滤波的严格顺序。供一次真实同页复验；即使横线改善，若连续灰带只是转为暗带，也不采用。结构性结论是：原断面和原岸线实体连续，换成按切深的土层分类只能改变该连续实体的材料身份，无法凭材质创造缺失的局部河岸形态。此次不以伪随机打断或调色伪装形态改善。
