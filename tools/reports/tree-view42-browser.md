# 整根照片冠提交压实：有性能收益，转向质量缺陷未关闭

2026-10-28，默认OFF。原treeViewCull已有实现，旧normal四组GPU不可用；本次在CPU合批后重测实际GPU，未把rootOrder/prepass/Batched的否决混称本项否决。

## 服务与性能

独立入口为dist-v2/tree-view42/v2.html，builtPreview原字节提供；实际主chunk2,764,452B，HTTP与磁盘SHA256一致。旧dist-twig-index42等独立顶级目录被Vite二次转换，不用于正式运输成本推断。Worker精确白名单已覆盖treeViewCull，未知地形参数仍拒绝。

1280×800、DPR1、time870，原林溪位置、yaw -29.887941/pitch -10；q0/m0稳定30RAF后每组240RAF丢前60，180帧均值；GPU为最近60完整world/reflection查询。顺序OFF/ON/ON/OFF：

|状态|帧时ms|GPUms|
|---|---:|---:|
|OFF1|46.2233|37.1874|
|ON1|40.5939|31.9250|
|ON2|40.4456|31.4003|
|OFF2|46.2233|37.4774|

原始treeview42-native-built-abba.json；均errors空。当前OFF仍保留proxy full容器，尚不是无proxy干净默认基线，采用前还需干净入口比较。几何/材质/密度未改；每pass仅压实保守可见整根。

## 正确性与已发现缺陷

初始机位off/on/restored全部0像素差。实际W3秒+D2秒、220帧，由[-3611.851169,2329.157271,4805.483400]到[-3611.147222,2329.204181,4795.734932]，错误帧0；末端同yaw三联也0差。新捕获反射完整655360个Uint16通道非零，GL error0，开关及恢复逐值0差；没有把复用旧反射当刷新通过。

但四向转身出现差异。严格90/180度试验对每图依次camera.updateMatrixWorld、csm.update、scene.updateMatrixWorld(true)、全部级联shadow.needsUpdate及renderer.shadowMap.needsUpdate，off-first=off-repeat=restored完全0差，ON分别179018像素/max71、88270像素/max95。setPose本身已经更新camera矩阵，不能仅以遗漏camera.updateMatrixWorld解释。图中主要为远树覆盖差异，仍需源/紧排/full缓冲及原生基线核查。

证据前缀treeview42-frozen、treeview42-native-movement、treeview42-moved、treeview42-reflection、treeview42-strict。上述差异未修复前不采用，不将帧时收益当第三阶段性能完成。与局部阴影窗口同时开启也尚未验收；两候选独立通过不代表组合通过。

## 四向差异已定位为冻结验收接收域遗漏（保留原失败记录）

独立页1839973744复现yaw90：off/on186656像素max92，off/restored0。保持主颜色压实ON、仅shadowMap.render临时关闭压实时与off0差，限定为阴影路径。进一步只补正常environment.update已有的shadowReceivers.update(camera,sun,{additionalCameras:[],shadowType})，yaw90及180的off/on/restored全部0差。原严格脚本虽刷新camera/CSM/全部shadow flags，却遗漏接收者域更新；旧yaw接收域在逐根筛选时误拒绝投影者，不能据此判定候选几何缺失。

随后开启正常RAF，原生鼠标拖动使yaw180→215.20000000000005、pitch-10→-11.599999999999994；hold后不手工更新接收域的off/on/restored仍全0像素，errors=[]。本组viewport1453×814，仅正确性证据，非1280×800性能对照。没有修改tree-view实现。仍缺与干净无proxy入口的性能基线，以及与localShadowWindow42组合验收；默认继续OFF。保存端点本次返回404，数值来自实际CDP返回，未伪称图片或JSON保存成功。


## 完整重载的无proxy原生基线：当前总帧时不通过

同一原字节dist-v2/tree-view42构建，treeViewCull=0实际0代理；=1实际168代理，time870、1280×800/DPR1、原林溪pose，q0/m0后60RAF稳定再采180RAF。全部真实动画/风/更新照常运行。A1/B1/B2/A2如下：

|样本|帧时ms|GPUms|代理数|
|---|---:|---:|---:|
|A1 原生|98.2939|41.2109|0|
|B1 优化|112.6689|36.6345|168|
|B2 优化|102.9017|36.8430|168|
|A2 原生|87.3339|40.6558|0|

两对各自均GPU改善约3.8–4.6ms，但总帧时恶化14–15.6ms。A1/B1采集每帧读取完整snapshot；B2/A2只读terrain队列，末尾读取snapshot，因此按匹配的两对判断，不把四组混称完全相同采集开销，也不与此前代理容器开关样本直接合并。所有场景密度、地形235合批/940源块/705省提交一致、errors空。当前不可默认采用。

B2之后60RAF仅定向包裹proxy.intersectsFrustum，函数总4.055ms/RAF，656.5次/RAF。累计39390queries、12630缓存命中、0 miss/bypass/indexTests，9720 forceCopies/layoutReuses，0 matrixCopies/fullCopies/viewAllocations。说明不是索引缓存未命中或逐帧新分配；剩余提交/上传成本继续定位，不为了GPU单项收益忽略实际总帧率。证据treeview42-clean-a1/b1/b2/a2、treeview42-clean-selection-cpu。
