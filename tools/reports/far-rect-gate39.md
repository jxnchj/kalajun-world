# 远树 frame 矩形外读取跳过候选39（默认关闭）

入口 `farRectGate39=1`，创建同一份材质uniform：`ecology.farMaterial.userData.farImpostorUniforms.uFarRectGate39.value`。

- 0：原有采样路径。其他远树实验参数仍照其原值执行。
- 1：显式gradient控制，全部层仍读取，只把原隐式路径换成使用分支前 `dFdx/dFdy(vFarPlane)` 的 textureGrad。
- 2：同样显式gradient；每层 st 严格小于0或大于1时，在读取前返回原先inside遮罩已经确定的 vec4(0)/vec3(0)。初始值2，验收时先切0→1→0，再1→2→1。

默认无新uniform/hook；候选模式切换不重新编译、更换材质或改变原几何/密度/alpha/法线/风/阴影。独立实现 `spruce-far-rect-gate39.js` 只在现有远树impostor完成shader组装后接线。所有原层混合权重保留，不与zero-weight分支逻辑混同。

矩形边界inclusive：st=0/1照原采样并保留原纹理clamp；只有原mask为0的位置可提前返回。显示法线与deferred法线的两个采样函数都处理。导数保持在fragment main第一行，早于clip/discard/任意非一致分支；进入动态分支的路径一律textureGrad，不在分支内求导。继续使用当前WebGL2 sampler2DArray/vec3坐标/vec2梯度，不引入WebGL1扩展名或新GLSL版本。

120层矩形相对形态矩形的空域比例为2.95%～33.58%，均14.45%，仅几何区域比例，不代表实际GPU时间。仅可能减少无贡献texture fetch，不能减少主draw、顶点工作或影图。分支/quad执行成本可能抵消收益。

定向20/20通过：standard/depth实际ShaderLib拼接、默认无hook、同uniform三模式、120层inclusive边界、原alpha/混合/遮盖保持，deferred/zero-weight组合与旧远树资产/加载测试。日志 `tools/reports/far-rect-gate39-tests.log`。尚无真实WebGL编译、freeze像素、GPU结果；这些由主线统一浏览器验证，不能用源码测试替代。

实测复用已有冻结/GPU接口：关闭其他未采用远树实验，先0/1检查显式梯度是否本机像素相同，再1/2隔离真正跳读收益；冻结主画面须对应冻结反射，反射单独刷新验证。既有GPU分pass分别看main.color、reflection.color及总量。一次AB无稳定收益即结束，不扩展诊断平台。

## 实际浏览器结论：不采用

统一构建1280×800/DPR1、river-forest相同绝对机位、time870、q0/m0。冻结原采样→gradient→gate→原采样：原版重复0像素差；gradient/gate互相0差，但相对原版784像素变化、最大103通道级。因此不能宣称候选对原版像素完全一致。

随后完整动态20秒控制1/候选2：帧间隔31.5258/31.6201ms，GPU main.color19.3974/19.4748ms、main.shadow9.1652/9.1478ms、reflection.color2.8410/2.8397ms、output7.3336/7.3103ms，635/633个GPU帧样本。没有可用净收益，保持默认OFF；不继续为无收益方案优化分支或花时间修显式梯度微差。此对照隔离跳读部分，不把旧资料不同机况帧率拿来宣称加速。证据previews/v2-route-craft-38/far-rect39-{gradient1,gate1}.json及frozen四PNG。
