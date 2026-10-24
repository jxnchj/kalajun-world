# v38 远树零权重 elevation 层采样候选

状态：默认关闭，针对测试通过，待实际浏览器冻结像素与 GPU 验收；未宣称性能收益。

`vFarSelection = (yawIndex, elevationIndex, yawMix, elevationMix)`。第四分量来自 `farElevation - farE0`，是 elevation 权重。仅在启用且 `w <= 0` 时读取较低 elevation 的两幅方位图，`w >= 1` 时读取较高两幅；任何中间值仍读取全部四幅并使用原来的混合表达式，没有 epsilon 范围裁掉小贡献。

每幅各采 albedo 与 normal：端点从 4+4 次采样减为 2+2；中间仍为 4+4。树数量、几何、120 层纹理及分辨率、预乘颜色解码、alphaToCoverage、非 MSAA 噪声覆盖、法线变换、风与生态 LOD 均保持。

`dFdx(vFarPlane)` / `dFdy(vFarPlane)` 在 fragment main 第一行、所有 clipping/discard/动态分支之前执行。开启路径按当前 frame rect 尺寸缩放这两个梯度后使用 `textureGrad(sampler2DArray, vec3(st,layer), dx,dy)`；因此非一致 elevation 分支不依赖分支内隐式导数。关闭路径保留原 `texture` 隐式采样，供 A/B 检查 explicit gradient 的实际浮点/mip 差异。尚不承诺逐像素数学一致，须以目标 GPU 冻结图验证。

入口：`?farZeroWeightLayers=1`。运行切换：`systems.ecology.farMaterial.userData.farImpostorUniforms.uFarZeroWeightLayers.value = 1`，恢复 `0`。uniform 改值不需要重编译，不触碰 main 调试入口。主画面和反射使用相同材质，因此一起切换；单次冻结主画面实验只反映保留旧反射时的主画面净成本。

文件：`web/src/v2/spruce-far-impostor.js`，针对测试 `web/src/v2/spruce-far-zero-weight.test.js`。备份 `backups/route-continuity-v38/far-zero-weight/web/src/v2/spruce-far-impostor.js`。

验证：`node --test src/v2/spruce-far-zero-weight.test.js src/v2/spruce-far-impostor.test.js` 全部 13 项通过。包括全部五形八方位、0/22.5/45 度及边界两侧、严格不丢非零小权重、主/深度 shader 梯度位置、运行切换、原始捕获覆盖/纹理装载回归。此为源码生成/数值测试，不代替真实 WebGL 编译和 GPU 计时。
