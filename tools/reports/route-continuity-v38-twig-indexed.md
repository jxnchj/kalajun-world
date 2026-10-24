# v38 近针叶木枝严格索引候选

状态：默认关闭，`twigIndexed=1` 启用。源码与10项针对测试通过，实际浏览器画布/阴影/性能验收待进行。没有减少针叶、木枝、三角数、LOD范围或物理尺寸，没有量化。

## 实施内容

只处理 stations 路径中的 woody twig 模板。原模板木枝尾段156三角、468个非索引corner；以原模板全部attribute的原始字节为身份进行精确索引去重，得到312个独立顶点及468个Uint16索引。保留117个木表源顶点的全部UV接缝，三角序、每个corner的原属性字节逐一相同。

针叶15顶点/五针station、原帧VBO、variation texture、木参数表、根集合/矩阵/风、法线、AO、材质与阴影算法全部不变。主画面、反射、阴影均使用同一索引几何。twig shader只按aBrushCode取原木表，并不使用gl_VertexID，所以索引重排不改变计算输入。现有LOD/branchFade和实际光照逻辑均保留。

几何wrapper共享原生同一IndexBufferAttribute，沿用真实Three ownership释放，避免逐树复制index或提前释放仍被其他树引用的索引。启用时不再保留完整含针叶占位的twig源模板，仅保留312顶点派生模板。成功加载仍走既有资产，没有新增缓存下载。

## 验证与性能边界

`spruce-twig-indexed.test.js` + `spruce-gpu-stations.test.js`：10项通过。新增验证覆盖468个corner全部属性字节、四角UV接缝、原始三角数、两根/多个brush的风与矩阵、完整投影边界、阴影材质、真实Three WebGLGeometries索引最后释放与幂等清理。

理论顶点复用上限：木枝468→312，减少33.33%重复顶点shader输入；每brush全部针叶+木枝4788→4632，约3.26%。这不是整帧GPU时间承诺，实际post-transform cache命中由硬件决定；尤其主成本仍可能在冠片和全场阴影。不得称林溪主要帧率问题已经解决。

统计 `ecology` 中现有station runtime stats新增 twigIndexed、twigTemplateVertices、twigCornerIndices、twigPotentialVertexExecutions、twigCornerSubmissions；完整triangles统计不变。开关需要重建场景，避免运行时替换共享VBO生命周期干扰验收。
