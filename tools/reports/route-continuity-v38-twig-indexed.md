# v38 近针叶木枝严格索引候选

状态：默认关闭，`twigIndexed=1` 启用。2026-10-28真实完整场景ABBA没有性能收益，不采用；下方早期待验为历史。没有减少针叶、木枝、三角数、LOD范围或物理尺寸，没有量化。

## 实施内容

只处理 stations 路径中的 woody twig 模板。原模板木枝尾段156三角、468个非索引corner；以原模板全部attribute的原始字节为身份进行精确索引去重，得到312个独立顶点及468个Uint16索引。保留117个木表源顶点的全部UV接缝，三角序、每个corner的原属性字节逐一相同。

针叶15顶点/五针station、原帧VBO、variation texture、木参数表、根集合/矩阵/风、法线、AO、材质与阴影算法全部不变。主画面、反射、阴影均使用同一索引几何。twig shader只按aBrushCode取原木表，并不使用gl_VertexID，所以索引重排不改变计算输入。现有LOD/branchFade和实际光照逻辑均保留。

几何wrapper共享原生同一IndexBufferAttribute，沿用真实Three ownership释放，避免逐树复制index或提前释放仍被其他树引用的索引。启用时不再保留完整含针叶占位的twig源模板，仅保留312顶点派生模板。成功加载仍走既有资产，没有新增缓存下载。

## 验证与性能边界

`spruce-twig-indexed.test.js` + `spruce-gpu-stations.test.js`：10项通过。新增验证覆盖468个corner全部属性字节、四角UV接缝、原始三角数、两根/多个brush的风与矩阵、完整投影边界、阴影材质、真实Three WebGLGeometries索引最后释放与幂等清理。

理论顶点复用上限：木枝468→312，减少33.33%重复顶点shader输入；每brush全部针叶+木枝4788→4632，约3.26%。这不是整帧GPU时间承诺，实际post-transform cache命中由硬件决定；尤其主成本仍可能在冠片和全场阴影。不得称林溪主要帧率问题已经解决。

统计 `ecology` 中现有station runtime stats新增 twigIndexed、twigTemplateVertices、twigCornerIndices、twigPotentialVertexExecutions、twigCornerSubmissions；完整triangles统计不变。开关需要重建场景，避免运行时替换共享VBO生命周期干扰验收。

## 第42轮同条件验收准备（2026-10-28）

确认原terrainRowWorkerPolicy安全名单漏掉twigIndexed，导致URL显式`twigIndexed=0`和`=1`均被视为未知参数而关闭Worker。该参数只在SpruceGpuStationBrushes构造中选择木枝模板索引，不改地形输入。已精确加入该键；两种值保持原Worker启用，显式terrainWorker38=0仍关闭，任何额外未知surface参数仍拒绝。Worker policy与twig/station针对回归33项通过。未改变twig默认，未执行主构建或覆盖其他独立候选包。

验收应使用相同主构建两个完整场景入口，仅twigIndexed=0/1不同；核对Worker enabled/ready、terrain q0/m0、needleGPU.twigIndexed、brush/root/triangle数与相同姿态风时刻。旧twig-indexed-pixel-0/1两个JSON均twigIndexed=true且GPU unavailable，不能作为有效原/索引性能对照。真实ABBA与采用由主线继续；理论小幅重复顶点减少不是已实现整帧收益。

## 2026-10-28 实际完整重载 ABBA：不采用

同一 dist-twig-index42 构建，仅 twigIndexed=0/1 不同；四组均 1280×800/DPR1、time870、原林溪机位 yaw -29.88794°/pitch -10°，terrain q0/m0、Worker ready=true、errors=[]。每组在地形稳定30 RAF后采240 RAF、丢前60帧，180帧计平均；GPU用应用最近60帧完整world/reflection查询。完整重新加载防止共享VBO切换污染。

| 顺序 | 平均帧时 ms | GPU平均 ms | 近针叶根/brush/三角 |
| --- | ---: | ---: | --- |
| 原A1 | 44.5933 | 36.0687 | 6/1846/2946216 |
| 索引B1 | 46.0011 | 37.0589 | 6/1846/2946216 |
| 索引B2 | 46.2122 | 36.7612 | 6/1846/2946216 |
| 原A2 | 46.0050 | 36.5606 | 6/1846/2946216 |

原组均45.2992ms、候选46.1067ms；GPU原36.3146ms、候选36.9100ms。没有支持净收益，不采用，不把理论重复顶点减少当帧率改善；无需为不采用方案继续扩大图像测试。未降低任何根数、brush或三角。原始证据 docs/previews/v2-route-craft-38/twig42-abba-{a1,b1,b2,a2}.json。当前固定视点约22fps，林溪GPU瓶颈仍开放。

服务范围补充：本轮 dist-twig-index42 不在 builtPreview 静态前缀内，Vite 二次转换了构建JS（磁盘约2.6MB，资源记录约13.95MB含开发转换）。四组使用相同服务路径/构建，所以未见收益的决定保留，但不将这些值冒称正式dist-v2入口或冷启动运输性能。后续独立入口放入 dist-v2 子目录并以HTTP/本地原字节一致核实，避免重复开发转换。
