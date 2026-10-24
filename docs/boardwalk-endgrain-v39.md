# 四条原木步道端面接合候选

状态：主线已实际检查 route3 近侧/整体与 route0 整体，通过端纹与长面协调验收；源码默认启用，`boardwalkEndGrain39=0` 保留原材质对照。最终默认构建由主线统一进行，尚不能记作已通过。没有改变全局光色，也没有新增纹理；四条路线共用同一材质设置，所有原构件、位置、高度、几何、碰撞和源文件保留。

## 真实问题

已检查 `courtyard39-side-off.png`。原踏板长轴为 X，端面材质分组正确；端面UV使用两横轴、不退化，色彩贴图也正确采用SRGB。不能把问题归为法线朝错或错误色彩空间。

但原 UV 系数0.9/m，0.29×0.075m端面仅截取256² `wood_end.png` 中约67×17像素，加(.67,.62)偏移，只剩少量宽缓颜色变化。该图是项目原人工树干端纹，与Poly Haven rough_wood侧面扫描的色相及线性平均反照率不同，因此近景金色平块并非单纯太阳照亮。

## 最小修复及限度

独立 `boardwalk-endgrain39.js` 仅改变端面纹理transform与材质线性因子：采用0.42m参考原木直径，两横轴保留等比例，映射中心(.5,.55)；端面宽覆盖约177像素，不再是67像素局部。线性因子通过实际端面映射采样均值对齐当前长纹扫描乘原木材因子的均值，不用目测加亮或调全局曝光。元数据在 `generated/boardwalk-endgrain-39.json`，记录原图SHA、映射与实际平均数。

可编辑派生 `assets/src/v2/boardwalk/endgrain39/boardwalk-endgrain39.blend`；原Blend不动。运行时通过纹理transform完成同等UV转换，完全不修改共享geometry。没有额外GPU绘制、纹理请求或构件数量变化。

离线已看 `side.png` 与 `close.png`：端面和长面色彩接近，年轮弧线可辨，但原256px人工端纹仍模糊、各踏板木心重复。该候选是源映射和反照率接合修正，不是写实端纹最终资产；没有为掩饰分辨率凭空造新随机纹理。预览仅隔离踏板形体和材质，不替代实际四条路线浏览器验收。

## 验证

`tools/verify-boardwalk-endgrain39.py` 重开原和派生Blend，逐对象核对原positions、triangles、normals、材质分组、对象变换完全相同，只有端面UV/材质接线变化。报告 `tools/reports/boardwalk-endgrain39-source.json`。

`node --test web/src/v2/boardwalk-endgrain39.test.js web/src/v2/boardwalk-material.test.js`：4/4通过，覆盖默认ON及显式0回退、原几何/index/groups不变、端面物理尺度、色彩空间、原长面与加载错误行为。未运行应用build或全套测试。未改 ecology/world-data/terrain/main；未生成任何草根/室内GI数据。

主线实际画面确认原金黄色平块改善、构件几何保持。原端纹低分辨率和重复仍是中间态，不宣称最终写实端面。
