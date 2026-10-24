# 第38轮：近树 world sphere GPU 剔除候选验收

候选保持全部几何、实例、风包络、阴影与反射精度；逐顶点保守球剔除并没有在真实林溪路线获得收益，维持默认关闭，仅 `treeFrustumCull=world` 可启用。不得视为林溪主绘制瓶颈已解决。

同页 1280×800、pixelRatio 1，每组约20秒，真实浏览器由主协调任务采集。下面直接由完整 samples 求均值（不能用末尾60帧摘要替代整个测量窗口）。

|文件|整帧样本|平均帧间隔 ms|平均 GPU ms|
|---|---:|---:|---:|
|world-cull-off-1.json|205|97.787|32.532|
|world-cull-off-2.json|203|99.066|33.481|
|world-cull-on-1.json|198|101.283|34.427|
|world-cull-on-2.json|194|103.244|33.532|

原始证据：`docs/previews/v2-route-craft-38/world-cull-*.json`。不同 pass 的 elapsed query 诊断存在扰动/resolve 归属，分项时间不能直接相加替代 whole query。整帧约100ms而 GPU 约33ms，下一步继续处理场景矩阵传播和生态准备实际 CPU 热点；不通过降低植被密度/材质精度换时间。
