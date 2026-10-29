# 普通草逐根GPU风场缓存41（生产可逆候选，默认OFF）

把原ecoField(root.xz,time)从每个草叶顶点重复执行，移为每根每帧一次GPU点绘制。RGBA32F目标保存原四维风场；原草材质以每根稳定索引读取一个texel。原两张风纹理、时间、远场fallback、边缘blend公式逐字一致；seed/flex、逐叶local相位、实例方向变换、完整草根/叶几何及颜色、LOD、阴影仍由原shader处理，不调整幅度、不改风。

同一hook可装原颜色与MeshDepthMaterial，需在任何颜色/深度/反射绘制之前更新缓存。当前只有独立页meadow-root-wind41.html安装，不修改ecology/main，不宣称生产收益。缓存目标每根16B，输入位置每根12B，实例索引每根4B；32位float纹理，不能用half节省时把误差隐去。源代码测试保证原公式未漂移、全部Float32实例根索引一致、恢复原编译回调，1/1通过。

独立实际验收准备：两坡全部真实根；原MeadowWindField纹理；0/3.04/9.09三个相位、纹理内与外；五通道原色/coverage/normal/response/packed-depth。必须在实际GPU运行后填写结果。缓存更新额外draw/带宽及读取纹理的净成本尚未测量，不能从减少纹理或sin次数直接推断帧率提高。后续若准确性成立，仍需完整代表路线同条件GPU计时，并涵盖每帧cache更新和驻留根变化，不只计草本身draw。

## 实际Chrome数值复核

两坡×三时间×风纹理内外的12组，五通道共60次颜色/coverage/normal/response/packed-depth对照，全部0像素差、0通道误差，无GL/GLSL错误。显式检查非空：普通颜色/覆盖/深度每组约4.7k–10.2k非黑像素，响应至少4,174；sourceSum随相位和风纹理内外改变，排除空画面或静态风假通过。证据docs/previews/v2-route-craft-38/meadow-root-wind41-numerics.json/png。相同平台的这些有限样本通过，不代表所有驱动位级等价，也不是性能验收。

## 整景可逆候选接点

MeadowRootWindRuntime41默认meadowRootWind41=1才启用。拥有普通near/middle两份材质与near草深度hook；仅私有实例geometry加当前slot索引，不触及湿岸、树、花或源几何。缓存按当前紧排后instanceMatrix前缀对应槽位生成，矩阵version变更同步上传；同风相位/同矩阵避免重复draw。草tile驻留集合变化才重建地址池。setEnabled(false)恢复编译回调并移除索引，原根/数量/属性不改。新增2项源公式、槽位紧排/同相位/回退回归全部通过。

必须在主/反射visibility并集紧排后、任何阴影/反射/主颜色渲染前调用update(renderer)。在renderWorld内调用，现有整帧GPU计时会包含float纹理生成；GPUPassProfile目前将该单独render归为output。stats.updateMs只表示CPU提交时间，不能冒充GPU更新成本。main接线交主线程，当前未修改main/ecology。整景同相位与GPU含更新成本仍待验。


## 生产接线与实际整景验收（2026-10-27）

已接 main 的 renderWorld：主/反射可见槽位紧排之后，草影、折射、反射和颜色之前更新。debug 暴露 meadowRootWind，pagehide 释放；terrain worker safe flag 已加入。默认 OFF，仅 meadowRootWind41=1 启用；没有改变默认密度、LOD、原根/叶形态。针对回归共15/15通过。首次完整构建发现 reversed-depth renderer 要求缓存场景 camera.updateProjectionMatrix；已由基础 Camera 改成 OrthographicCamera，保留手写 clip 坐标，增加针对回归。实际修复构建为 v2-CaZjfzj8.js。

实际 Chrome 完整林溪，1280×800、DPR1，相机 [-3611.851169467755,2329.157270885741,4805.483400316967]，风时间80.03410000000012，真实加载队列归零后固定。分别在 meadowVisible41 OFF 与 ON 下，原/候选/候选/原（ABBA）完整颜色读回：AB、AA恢复、BB重复均为0像素差；PNG肉眼核对为实际非空林溪完整场景，未见GL/GLSL错误。普通根池26,113槽位、73 mesh；vis ON 后实际提交10,978槽位，缓存仍保留全部池，输入不做密度删减。池纹理421,888B、根输入313,356B、slot索引104,452B。

GPU按每组32次EXT timer真实采样，另16次cache-only；每次候选都强制更新cache，未利用冻结时间跳过额外成本。

| 提交模式 | 原A1 | 候选B1 | 候选B2 | 恢复A2 | cache-only |
|---|---:|---:|---:|---:|---:|
| 普通原tile |19.728ms|19.727ms|19.508ms|19.684ms|0.488ms|
| 可见并集紧排 |19.221ms|19.076ms|19.291ms|19.631ms|0.487ms|

阶段结论：像素等价样本通过，冻结路径尚无可靠净性能收益；不能据此否决动态候选。当前保持OFF，继续原动态frame计时后决定。第一组候选约低0.088ms（0.45%），第二组约低0.242ms（1.25%），第二组A自身漂移0.410ms；不能据此宣称林溪帧率已改善。计时覆盖renderFrozenWorld和每帧cache更新，但其他世界状态仍冻结，不包含动态生态update或动态阴影失效节奏；不能把本组19ms与此前动态整帧31ms直接比较。CPU提交stats.updateMs不是GPU时间。更多颜色样本通过也不能替代完整动态性能采用依据。

证据：docs/previews/v2-route-craft-38/meadow-root-wind41-vis{0,1}-{a1,b1,b2,a2,summary,gpu}.json 与同名PNG；其中summary/gpu仅JSON。独立验收壳public/meadow-root-wind41-scene-static.html，内页public/meadow-root-wind41-world-static.html引用正式dist，避免HMR重载污染长加载；所有输出检查服务器成功响应。测试页1839973432已关闭，释放GPU给主线。

动态验收壳已补：time870，原frame持续更新风、阴影、反射；14秒ABBA、每段前2秒剔除。旁录原生GPU query结果和真实controls.update dt，结束恢复原方法，不嵌套计时、不替换更新路径。等待主线GPU窗口后执行。


## 原动态frame补验（2026-10-27）

实际Chrome页1839973436，time870、默认river-forest、1280×800 DPR1、meadowVisible41 OFF，地形与生态队列均归零后运行原frame。每段14秒、前2秒剔除；不冻结风和阴影，沿用主线原GPU query（render-world-and-reflection），按查询开始时间过滤；controls.update实际dt用于帧间隔。没有额外嵌套GPU计时。

| 顺序 | GPU均值 | 有效GPU样本 | 实际frame均值 | frame样本 | P50 | P95 |
|---|---:|---:|---:|---:|---:|---:|
| 原A1 |32.066ms|113|105.337ms|114|100ms|133.4ms|
| 候选B1 |31.885ms|117|102.564ms|117|99.9ms|125ms|
| 候选B2 |32.055ms|119|100.140ms|120|100ms|133.3ms|
| 恢复A2 |32.183ms|118|100.842ms|119|100ms|125.1ms|

本轮动态候选平均仅约低0.154ms（0.48%）；B自身差0.170ms、原A差0.117ms，实际frame随顺序改善，不能把帧间隔改善归因于候选。动态补验后仍没有足够可靠的采用收益，维持默认OFF，保留精确候选。无GL/GLSL错误，结束关闭页并释放窗口。证据 meadow-root-wind41-vis0-dynamic.json。

证据限制：该首轮before/after直接保留getSnapshot的浅嵌套对象，风cache等嵌套stats在最终恢复OFF时发生引用变化，不能作为逐段状态证据；独立row.on、GPU samples、真实dt、均值数值与时间为即时值，不受影响。壳已将before/after改为structuredClone，后续不再产生此问题；未伪造重写原JSON。当前仅完成默认提交动态组，紧排组合只完成此前冻结像素与GPU，不冒称完成动态组。
