# V38 有界 GPU 分项诊断

开关`gpuPassProfile=1`，默认不安装包装、不改变原profile outer query。启用后main排除原outer query，使用同一EXT_disjoint_timer_query_webgl2 TIME_ELAPSED实际GPU结果，不能与原outer query嵌套。入口为`getSnapshot().gpuPasses`或`debug.gpuPassProfile.snapshot()`。

独立模块包装实际renderer.render和renderer.shadowMap.render（不修改Three核心）：

- main.setup：主renderer.render入口到shadowMap.render之前。
- main.shadow：实际shadowMap.render调用。
- main.color：shadowMap.render返回到主renderer.render返回，包含背景/颜色/该render尾部resolve。
- output：WorldFrame输出quad的renderer.render。
- reflection.setup/shadow/color：反射相机同样边界；未提交反射的帧不虚构查询，汇总均值按完整采样帧以0计入。

此划分来自当前Three WebGLRenderer中shadowMap.render先于background/renderScene的真实生命周期；阴影为空或复用时仍度量实际空调用的query开销。render之外的clear/target切换等GPU操作不在分项总和，不能将分项sum直接声称与原outer scope完全一致。EXT时间为GPU查询结果，不是JS performance.now提交耗时；驱动query开销本身也可能改变诊断帧成本。

同一时刻只允许一个活动query。嵌套renderer.render先结束父段、测子段、再恢复父段；检测外部现存query时整帧拒绝采样，绝不end外部query。最多48pending查询、60完整样本；容量不足/异常/disjoint丢弃整帧，不发布部分sum。disjoint删除所有待取查询；dispose关闭自身活动query、删除pending并恢复仍由自己持有的hook，保留后来其他owner安装的新wrapper。

`node --test web/src/v2/gpu-pass-profile.test.js`：7/7通过。覆盖主/反射/输出真实调用顺序、精确计时分段、默认off、嵌套不重叠、100次满队列有界、disjoint、render异常、外部query所有权、dispose恢复及main互斥接线。无build；实际浏览器结果需主线统一构建后采集，诊断完成即回到针对性优化，不据mock测试声称GPU瓶颈已解决。

## 实际 Chrome 固定林溪对照

1280×800、DPR1、14:30、完整地形队列与形变均0、错误空。每组20秒；分项为末60个有效GPU帧，反射未绘帧以0摊销；整帧均值为整个20秒rAF。顺序样本不是交替重复，不能将波动归因于候选。

|模式|整帧ms|阴影GPUms|主颜色GPUms|输出GPUms|反射颜色摊销GPUms|
|---|---:|---:|---:|---:|---:|
|clean|65.895|9.704|18.08|6.059|5.202|
|close|66.289|12.324|19.553|5.867|6.95|
|solar|61.626|12.484|20.621|7.367|6.927|
|solar-reuse|65.451|14.779|21.657|8.448|7.903|

close含closeShadowOverlap=1；solar在此基础上启用面积太阳过滤，solar-reuse再启用深度读取复用。紧范围增加投影与接收成本，复用没有可靠净收益证据。候选保持关闭；细梢欠采样仍未解决，不能据这些计时称草影完成。主颜色、阴影和反射均有实际负担，继续以不减少细节的候选做冻结像素和交替实测。

## 树冠背光接收端取样候选：视觉等价，未证明净收益

候选 `csmBacklitSkip=1` 仅对带 `ECO_ROOT_WIND` 的 MeshStandard 云杉材质安装共享 uniform。最终扰动后法线与太阳方向点积 ≤ 0 时，Three 原直射 irradiance 为零，因此跳过该片元 CSM 接收端 PCF 查询；保留全部投射几何、深度图、PCF 参数、风、密度及反射。排除 MeshPhysical，避免清漆法线与基层法线不同造成错误。默认无 hook；候选页面可用同一 uniform 切换 0/1，无重编译。针对回归12/12通过。

主任务实际 Chrome 验收（本报告整理者未另跑浏览器）：1280×800、DPR1、time870，q0/m0、errors[]。冻结 off/on/restored PNG 完全相同，证据：[冻结记录](../../docs/previews/v2-route-craft-38/csm-backlit-frozen.json)、[冻结画面](../../docs/previews/v2-route-craft-38/csm-backlit-frozen.png)。随后同页交替四组：

|顺序|主颜色 GPU ms|反射颜色摊销 GPU ms|整帧 ms|原始记录|
|---|---:|---:|---:|---|
|off1|18.040|4.761|61.187|[JSON](../../docs/previews/v2-route-craft-38/csm-backlit-off1.json)|
|on1|17.999|4.769|63.888|[JSON](../../docs/previews/v2-route-craft-38/csm-backlit-on1.json)|
|off2|18.056|4.787|64.047|[JSON](../../docs/previews/v2-route-craft-38/csm-backlit-off2.json)|
|on2|17.868|3.979|55.104|[JSON](../../docs/previews/v2-route-craft-38/csm-backlit-on2.json)|

**默认关闭，不采用。** 主颜色两对差值仅0.041与0.188 ms，不能可靠证明净收益。最后on2反射刷新摊销明显波动；其整帧55.104 ms不能单独作为整体明显提速证据。第一、三组是否与约4.8秒地形测试重叠未能证明，不能宣称采样全程完全没有后台工作。这些限制不影响已记录的冻结视觉等价结果，但削弱性能归因。验收结束已恢复共享 uniform 为0。当前只证明这一机位、时间和冻结状态像素一致，不宣称林溪帧率瓶颈已解决。

### 草叶真实平面覆盖实验（未接世界）

开发入口 `web/grass-shadow-planar.html` 使用原 meadowGeometry、49 个原实例和同一原风变形。每丛245三角，两模式都提交24,012三角（含平面）。深度模式仅模拟最近级26.962mm像素间距，并非完整世界CSM。候选把风后原三角沿太阳投至平面，以屏幕MSAA覆盖替代深度格点状覆盖。

本子任务实际Chrome在1453×814、DPR1、t=4.50验证，证据 `docs/previews/v2-route-craft-38/grass-planar-{geometry-t450,depth-t450,geometry-repeat-t450}.{json,png}`。各60个GPU样本：几何模式0.291/0.308ms；深度模式阴影0.473+颜色0.624=1.097ms；errors/disjoint/discarded均0。候选省了独立4096²深度图，不能外推主世界性能。实景深度模式糊块、几何模式对应长线叶影。另人工观察4/4.25/4.5秒叶影跟随位移，未存完整录像，不能称完整运动验收。源三角保留、射线共线及风shader顺序2/2测试通过。

仅证明覆盖机制；平面、硬太阳、无树建筑遮挡，固定环境色覆盖只在此Lambert平面成立，不能直接接世界。主世界未改，草影仍未解决。

实际坡面下一步可限定林溪小地块，从最终渲染地形三角求交生成同相机草叶可见度mask，只调直射项。不能只拿原heightAt忽略实际LOD/Foundation；非平面上只投顶点再线性连线并不精确，需要残差界和曲率细分/接收面裁切。成本为地块全草另一次绘制、顶点求交与mask resolve/读。低太阳、尖折岸沟、屏幕细线仍有边界。

更关键是原CSM混合草和树建筑：mask相乘仍留原草糊块，直接替换会抹树影。接入前须有不含这片草、保留其余遮挡者的可见度；否则要额外非草阴影绘制。建议先限定真实小地块测接收面误差及遮挡分离成本，不扩成每帧全世界重绘，不宣称平面实验已解决草影。

### 闭合太阳阴影体：真实小地块可渲染，但当前成本拒绝接入

入口 `web/grass-shadow-volume.html`；实现 `grass-shadow-volume.js`、`grass-shadow-volume-preview.js`；fixture可用 `tools/prepare-grass-volume-patch38.mjs` 从现有真实世界再生成。取林溪(-3611.9813,4805.3713)附近最近49根完整regular草矩阵，不改变各丛245三角/色/风；16m地块采实际heightAt，64×64地形网格。石块/树干/树冠明确为局部遮挡验证体，不冒称生产精细资产；这里也不是生产LOD地形网格。

每原草三角使用风后3顶点计算朝向，近帽、远帽和3侧面构成8面闭合棱柱。后续已改6独立顶点+24索引，仍96,040体三角；WebGL2 stencilOpSeparate一次提交正反面，z-fail分别DECR_WRAP/INCR_WRAP。原草不再进入普通深度图；普通图只含树石等其他遮挡。先生成同一地形/石/草深度及环境光，再累计阴影体模板，最后只给模板0像素添加太阳直射（原树石阴影照常）。不是黑色贴片叠加。故绕开坡面求交，也不会保留旧草糊块或删除树影。

子任务实际Chrome验收与PNG/JSON在现有预览目录：

|证据前缀|视口|基础ms|闭合体ms|额外直射ms|
|---|---:|---:|---:|---:|
|grass-volume-depth-t4|1453×814|1.171|—|—|
|grass-volume-outside-t4（原双draw）|1453×814|1.082|3.708|2.466|
|grass-volume-nearclip-t4|1453×814|1.045|2.491|1.925|
|grass-volume-indexed-depth-t4|1453×870|1.414|—|—|
|grass-volume-indexed-single-t4（最终单draw）|1453×870|0.663|4.019|2.592|
|grass-volume-indexed-nearclip-t4|1453×870|0.578|2.456|1.740|

每组60样本，errors/disjoint/discarded均0。两轮视口高度不同，不可据此断言索引优化无效/变慢；但最终同页同视口对照1.414ms与7.274ms，足以否定当前候选可以直接改善主世界性能。重复顶点已去掉，昂贵的模板覆盖及额外直射绘制仍在；不能把“少顶点”写成已提速。

实际截图可见地形上的长叶形影、树干/树冠及石块遮挡同时保留；近地0.25m相机没有整屏反转，另存outside-t450供风后观察。颜色使用线性诊断输出，不是艺术光色调整。拓扑每棱两次反向、源全部顶点/风权重、shader风后绕序与z-fail状态3/3定向通过。

精度边界：近帽向背光侧偏0.2mm防自阴影；24m远帽在本地块和150m相机远裁剪内，不能原样扩大到全世界。z-fail不依赖近裁剪封口，但必须保持远帽不被裁掉。每个三角独立闭合，动态太阳朝向纠正避免正反薄叶抵消；重叠用wrap而非饱和计数。当前8-bit stencil对256倍重叠仍有取模归零风险，未证明所有视点的重叠上界。当前硬太阳无半影，不能冒称真实有限太阳最终解。

当前结论：保留可渲染独立成果，不接主世界。生产context原本stencil:false、HDR使用DEPTH_COMPONENT32F；采用还需depth-stencil/MSAA兼容验证及直射分离，不能拿局部实验成本忽略这些。进一步缩短安全挤出范围/屏幕覆盖需要实际遮挡界，不能直接裁掉可见叶影；此轮不继续无界优化、不默认启用。

### Packed HDR 初次对照混因修正（仍默认关闭，待复验）

本机原生R11F_G11F_B10F×4与Float32深度通过2×2真实FBO/resolve/HDR读回，证据 `packed-hdr-native-4x.json`。root首次真实林溪图片差异max50、mean0.613925，不能归因于颜色量化：原 `supportsWaterRefraction` 只允许RGBA16F，换packed目标会清掉折射有效标记。图中最大差在(278,544)水面，RGB从(107,119,125)变(57,79,89)。原比较函数同步执行，没有animation update；WorldFrame构造不改曝光/toneMapping，反射刷新在主动画loop外侧而非renderFrozenWorld。明确发现的是折射功能不等价，而非已证时间漂移。

现独立review支持 `captureRGBAControl(debug)` 同格式RGBA16F→RGBA16F控制，并记录两次相机、时间、风、曝光、toneMapping、反射capture数、折射active/reason，`equivalentPipeline` 必须成立才可解释量化差。水折射候选接线改为严格packed源匹配packed快照颜色存储；原Float32深度、原4×源、单次颜色/深度resolve、线性采样接口、Snell/水shader不变。RGBA与packed同尺寸切换也真实重建快照，避免MSAA跨格式直接blit。默认仍RGBA16F，候选原生4×不支持会拒绝，不降样本。水折射13/13与world/packed12/12定向通过；修正后实际双图/GL检查及性能尚待root集中验收，旧max50不作为有效格式误差。

### 修后 packed 实图误差离线定位

root保存的 `hdr-fixed-forest-{rgba,packed}-{baseline,candidate}`：同格式RGBA控制逐像素完全相同；两格式比较equivalentPipeline=true、折射均有效，源HDR无负值。离线分析脚本 `tools/analyze-packed-hdr-v38.py` 与 `hdr-fixed-forest-error-analysis.json`、`...-crops.png`、`...-map.png` 可复核。

1024000像素中，仅1像素的RGB最大差超过4：坐标(437,324)，远处树边草地，原(99,116,100)→候选(119,137,104)，红差20绿差21蓝差4。它不在溪流/水深边界，不能把max21解释为水折射大面积错误。其余全部像素最大≤4，99.9%像素最大≤3。通道差值分布：0=1556457、1=1405839、2=106983、3=2709、4=10、20=1、21=1。>1通道总109704。

RGB平均绝对差0.40652/0.42809/0.75525，带符号均值-0.40565/-0.42804/-0.75524，体现广泛向下量化偏移，蓝通道更明显，符合较低尾数精度的特征。近水内部ROI均值0.867/max3，中段水内部0.825/max3，干右草地0.606/max3，前景岩石0.316/max3，树天上部0.460（包含唯一异常点）。这些是人工识别的矩形ROI，不是对象ID分割。

结合源码，主要差异不支持“多层透明叠加导致整体误差”的解释：云杉照片材质transparent=false、alphaTest，远林alphaToCoverage也不是顺序透明颜色层累积。干地和岩石同样有稳定小偏差。水体现在又经packed不透明快照与最终packed合成，确有额外量化机会，与水内部平均差较高相容；这不是水深边界失效的证据。不能由最终PNG唯一反演每个量化阶段贡献。

唯一21色阶点更像细几何覆盖/深度竞争的异常候选，但离线PNG无法证明根因，当前不把它归为普通色阶量化，也不断言是MSAA样本位置变化。必要的最小后续验证是同一冻结状态重复RGBA→packed→RGBA，核对该像素是否稳定，再针对其实际几何/覆盖；无需先重跑全场性能。此轮未操作浏览器/GPU，候选仍未采用。

### Packed HDR 最终决定：不采用，停止重复测试

依据root真实 `hdr-performance-off1/on1/off2/on2.json`，按关/开/关/开顺序：整帧78.593/80.332/95.165/78.119ms；GPU主颜色19.736/19.460/19.726/19.549ms，输出8.157/7.735/7.897/7.586ms。分项仅小幅变化，整帧不稳定，不能把关2长停顿与开2相减当作稳定收益。修正折射匹配后仍有实际量化偏差（mean0.52995、蓝通道向下偏更大），不以此代价换取未证实的整体性能收益。默认继续RGBA16F；packedHDR38仍仅关闭候选，结束本路线重复实验。
