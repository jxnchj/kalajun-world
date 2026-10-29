# 草影单遍矩分布候选（第 41 轮，研究中）

目前没有采用。原 coverage 方案增加约 697 万三角形的树冠重复绘制，不适合默认林溪。新方向是在原最近级阴影投影者绘制中直接写入可 MSAA resolve 的深度矩，再由接收面重构遮挡。全部投影者仍在原 pass，不能在主世界另绘完整森林。

## 已核实

- 本地 Three r186 的内置 VSM 在单采样深度之后做两遍模糊，保存均值和标准差。仅切 `VSMShadowMap` 无法恢复细草未被采到的覆盖；该实现还会把 receiveShadow 物体加入投影者，不能假定成本不变。
- 原 CSM 光相机 near=1 / far=8000。`tools/audit-shadow-moments41.mjs` 用此范围、三种深度位置、七组四样本遮挡做离线反证；结果在 `tools/reports/shadow-moments41-numeric.json`。测试含 0.1–0.5 m 草、3 m 屋顶、40 m 跨层遮挡以及无遮挡地表。
- 普通二矩即使不计量化，混合近草和远遮挡仍会漏光。四矩可更好约束分布，但偏置与量化不能忽略。原论文示例 moment bias=3e-5 直接用于 7999 m 范围，会把近草阴影抹掉。
- 数值探针独立使用通用线性方程求解，不照搬原论文 HLSL；接收数学仍为 double，实际 GPU float 可能更差。64 m 储存范围、无量化、1e-12 bias 的最坏可见性误差约 0.00134；同条件 raw32 量化后最坏约 0.322。不能把理论精度当成实景可用。
- 论文优化矩变换针对 16-bit UNORM，不等于 RGBA16F。WebGL2 是否提供可渲染、可 MSAA 的 UNORM16/浮点格式需要实际查询和 framebuffer 验证。

## 下一独立小样

`web/shadow-moments41.html` 先做 16×16 格式探针：RG16F / RGBA16F / RGBA32F / 可用时的 UNORM16，分别检查 4x sample count、完整 framebuffer、resolve、readback；结束销毁 context。此页不加载主世界，也不属于主构建入口。等待主线正式 GPU 对照结束后运行。

独立原型 `web/shadow-moments-native41.html` 已实现并通过 JS 语法检查，但尚未浏览器编译：使用原 49 丛实际草几何、原风、实际 DEM，直接替换该隔离场景原单级 caster target 的写入方式，不增加第二遍投影者绘制。格式探针通过后比较真实风时域和树/屋顶全遮挡。默认参数 RGBA32F / 4x / 64 m 储存范围；不支持时明确失败，不静默降级。可用 URL `?format=half&samples=4&range=64&bias=1e-10` 做参数对照。储存深度可围绕近地范围重映射并饱和，硬件深度仍原始完整范围，前方远遮挡仍必须覆盖；接收点超出可用范围须显式报告，不能偷偷漏阴影。完整世界的近远交接仍需另验。

## 预算与否决条件

仅附件理论下限（不含驱动副本、保留 resolved depth 与临时资源）：4096² RGBA16F + Depth32F，4x MSAA + color resolve 约 896 MiB；2048² 约 224 MiB。RGBA16F 不是“免费加抗锯齿”。2048 只能作为独立对照，未证明同等细草形态前不能用于降低默认阴影细节。

出现明显屋顶/树下漏光、近草消失或偏色、数值无效、仍有大幅膨缩、格式无法 resolve、显存/带宽不合理，即否决该组合。格式探针通过不等于阴影方案通过，隔离小样通过也不等于第三阶段草影问题解决。

依据：[Peters/Klein 四矩原论文与补充资料](https://www.momentsingraphics.de/I3D2015.html)、[GPU Gems VSM 原理与漏光限制](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-8-summed-area-variance-shadow-maps)。未复制其程序实现；变换矩阵为论文数值系数。

## 实际浏览器小样（2026-10-27）

本机 RG16F、RGBA16F、RGBA32F 均真实支持 4x，完整 FBO、resolve 与 float readback 无 GL 错误。UNORM16 的 FBO/resolve 通过，但初版探针用 FLOAT readback 导致 1282；已改成实际 implementation read type，尚未复测，不能称其读回已通过。

原型首次直接替换 Three 阴影 target 后，发现原 `WebGLShadowMap` 不会自动 resolve 自定义 MSAA target，读回全零。现使用原 caster pass 后零几何 empty render 触发 Three resolve，没有重复画草或树。此时原型实际编译、渲染无 shader 错误。

单位区间四矩（64 m / RGBA32F / 4x / bias=1e-10）满地数值噪点，否决。随后增加带符号中心化深度：离线近地样本误差降到约 0.0001，实景中心区可见草、屋顶、树影，但离开中心仍有明显斑点，仍否决。不能把中心区成功冒充整个世界可用。采样数、草密度及原 245 面几何没有削减。

PCF 同目标对照暴露原型初版 normalBias=0 导致自阴影条纹；源码现已恢复 .008 / depth bias -.000002，待下一次复核。不能据此宣称当前矩方案优于生产基线。下一次先验证稳定因式分解与真实偏置，再决定是否值得做时域对照；目前尚无可用的草影修复结论。

证据摘要：`tools/reports/shadow-moments41-browser.json`。两页均已关闭，正式主线 GPU 对照可继续。上述截图仅工具内实际检查，未宣称导出图片文件。

### 稳定重构继续推进

已用带符号深度、方差归一化的 Cholesky 与量化尺度退化处理代替通用矩阵逆；真实浏览器满地数值斑点已消失，保持原 normalBias=.008 / depth bias=-.000002。四矩在原 caster pass 写入，未删减投影者或另绘森林。地面诊断改在线性色彩处理之后输出太阳可见性，避免 gamma 把时域数值混淆。

48 个原风时刻（4～4.7833 秒）下：同 600 网格时平方帧差 117.98→82.14，总运动差 639.85→724.90；300 四样本对 600 单样本的等总覆盖样本对照为 71.30 / 678.50。两者都没有把运动冻结。面积分别减少约 6.9% / 9%，尚需检查细草/边缘损失，不能把“更平滑”直接当合格。

屋顶和树冠实际向 DEM 投影的核心分别取 25 / 23 个可见地面像素：原 PCF 和四矩均为太阳可见性 0，核心无漏光。这仅代表两个实测核心，不代表所有边缘和建筑都通过。

600 网格小场景 GPU A/B/B/A 为 0.899 / 0.944 / 1.444 / 1.016 ms，每组 60 个有效查询、disjoint=0。浮动明显，不能外推完整林溪或称已提速。300 版本未取得完成的 GPU 结果，仍待复测。证据摘要 `tools/reports/shadow-moments41-stable.json`；窗口已关闭供主线正式 terrain A/B 使用。后续继续 half、坡深范围、边缘细节和成本，不启用生产默认。

### 局部地形深度预条件与完整世界独立入口

仅全局中心化仍然失败：只把存储原点偏移 16 m、保持几何/太阳/风完全相同，float 四矩平方帧差涨至 5771.84，出现 3838.57 个大幅跳变像素。因此此路线不能按中心区小样采用，证据为 `shadow-moments41-depth-range.json`。

现使用同一 DEM 在光空间的 17×17 CPU 深度预测，每个 texel 储存相对当地地面的矩；接收端对四个邻居分别解算可见性再插值，不把不同参考系的矩直接混合。RGBA16F 分通道缩放后，在 300² 四样本对原 600² 单样本的 48 个真实风时刻中，总阴影面积 43034.96 对 43040.78（约 -0.014%），平方帧差 73.02 对 117.98，未出现大跳变；屋顶 25 / 树下 23 个可见核心像素两者均全遮挡。浮点版本移原点 16 m 后仍保持稳定。此为真实草几何的小样进展，尚未证明完整世界可用。

实际近级尺寸 2048 四样本 vs 原 4096 单样本仍有明确成本：完整 color/depth resolve 约 2.44 ms；改成 512² 局部 color resolve、完整原生 depth resolve 后，A/B/B/A 总 GPU 为 1.980 / 4.380 / 3.782 / 2.017 ms，每组 60 样本、disjoint=0，候选 resolve 仍约 1.30～1.50 ms。不能称为性能优化。附件容量估算原 128 MiB / 候选 240 MiB，非系统 VRAM 实测。详见 `shadow-moments41-local-reference.json`。

新增 `shadow-moments-world41.html` 独立完整林溪入口，不接生产 main，不改变默认；原最近级 caster pass 原位保留全部投影者，地形接收面仅在局部窗口用矩表示，其他接收物保留原生 PCF，窗口边界平滑回到原生深度。必须额外验证近级深度尺寸变更对草、树、建筑自身阴影解析度的影响，不能因所有物体仍存在就称细节合格。完整实景的编译、遮挡、时域、边界和成本目前未通过，仍是实验中间态。

完整林溪静态构建现已实际编译与显示，无 shader/error，88 个同源 depth 变体，未额外绘制投影场景。实际 150 帧预热后每组 60 个 GPU query 的 A/B/B/A 为 **43.764 / 46.423 / 46.968 / 44.465 ms**，disjoint=0、errors=0；候选 output（含 resolve）3.63～3.71 ms，原 1.20～1.24 ms。完整场景仍慢约 2.6 ms，保持不采用。首末原模式绘制数存在小幅流送差异，不能称严格等几何性能终验。地形预测残差小于 0.000001 m，但参考更新 CPU 15.5～20.3 ms，移动时也需优化。实际画面确认非黑屏/满地数值噪点；完整风时域、窗口移动连续、树叶/屋顶自身阴影细节与室内回归尚未完成。证据 `shadow-moments41-world.json`，临时页 1839973384 已关闭。

### 严格真实时域画面与质量否决项

已保存 `docs/previews/v2-route-craft-38/mom41-sunlit-fixed-{native,moments}-00..23.png` 及逐帧 JSON：固定相机、太阳和 4.00～5.84 s 真实风时间，全部 5690 个 source mesh 的 geometry 身份和实例数量逐帧相同，两模式每帧绘制均为 2270 次 / 54,265,041 三角形。首次未稳定采集被原断言拒绝，稳定后不改断言再次完整通过。较早 `*-motion-*` 序列仍会在 update(0)中流送少量根，只作诊断，不冒充严格同几何证据。

可播放对照：`mom41-motion-review.html`；严格日照动图 `mom41-sunlit-fixed-compare.webp`、原像素地表裁切 `mom41-sunlit-fixed-ground-crop.webp`，四时刻接触表 `mom41-fixed-ground-filmstrip.png`。直接看图发现：当前 half 2048 四样本配置在灌木下把小叶投影明显变淡，局部轮廓丢失；不能把更平滑称为草影问题已解决。加上完整林溪多约 2.6 ms，此配置不通过，不启用默认。

下一步仅独立定位：现预测网格从铺整段约 119 m 的近级，改为仅覆盖实际 30 m 接收窗（17×17不增加uniform）；加入 float32 格式对照，区分预测插值/half量化与四矩模型本身的漏光。改变的是实验表示，未改世界太阳、色彩、植物密度或投影者。新的局部网格版本尚未取得浏览器结果。

### 多层遮挡的离线反证与同 pass CDF 候选

补充多层叶片后，当前 Hamburger 四矩的上界漏光不是 half 精度问题：即 exact double，在 `[-0.1,-0.4,0,0]m`、接收深度 `-0.008m` 时，真实可见率 0.5 得到 0.59894；四层完全遮挡 `[-0.1,-0.2,-0.4,-0.8]m` 得到 0.10451。较大偏置接收深度 -0.04m 的低叶例更达 0.69959 对真实0.25。-0.04m 是敏感性样例，不是本页实测 bias；当前近级源码 normalBias=.008、基础 depthBias=.5e-6，还需考虑方向和坡度。`shadow-moments41-numeric.json` 已保留全部格式样例。

使用额外已知地面端点的 Gauss-Radau 重构也只改善部分情形：低叶例降至0.26976，但四层全遮挡仍漏0.09574，另一跨阈值例真0.5估0.6752，且half可出现负权重。见 `shadow-moments41-bounded.json`。故不能继续靠改变常数让图片变暗，也不能承诺换float即可修好。

新增 `shadow-ground-cdf41.js` 独立候选（仅独立入口 `groundCDF=1`）：在同一原caster pass写入四个相近物理接收深度的可见率，RGBA8四样本resolve直接保存覆盖，原生depth仍供其他接收物；不重复绘制森林，不添加草影叠乘。实际normalBias与depthBias由shadow对象读取，利用同源地表在光空间的梯度推导法线偏置距离。地表预测与接收深度不在6mm带内时明确回原PCF，诊断色可显示真正应用范围，防止全部回退的假通过。

离线多层例0.25→0.25098、全遮挡0→0，仅为8bit覆盖量化证据。**尚无这个CDF候选的浏览器编译、覆盖率、动态形态或GPU证据**，未采用。6项针对测试通过，包括真实斜面法线偏移与光线交点的一致性、同源草风/alpha保留、参考不可信时的原生回退。

CDF 已完成一次真实世界编译、显示与24张固定风/固定几何画面（`cdf41-sunlit-fixed-*`，首批候选后缀沿旧工具叫 moments，但 JSON 明确 encoding=cdf）。所有6579源mesh的geometry/count固定，每帧2678次绘制 / 55,205,073三角形，无shader错误；`shadow-ground-cdf41-world.json`已记录。这些值只与同页原模式对比，不与早先构建的5690mesh场景混作性能结论。

首次应用范围诊断读不到精确蓝色：WorldFrame 的 OutputPass 在材质诊断之后仍做ACES映射，故“0个纯蓝像素”不能解释为全回退或全应用。已准备仅诊断时关闭输出toneMapping、完成后立即恢复原值的读回方法，尚未复测。因此当前还不能称CDF确实覆盖了目标草影，更不能宣称问题解决或性能改善。当前实验页均已关闭，GPU归还主线与其他子任务。


### CDF 实际全回退与接收面滤波修正（尚未实景复验）

修正诊断输出映射后，`cdf41-short-application` 实测 1,808,376 个地形像素中应用像素 **0**；先前叶影看似恢复只能归因于原生回退，不能算候选修复。后续短序列被源几何尚未稳定断言拒绝，未放宽断言。临时页已关闭。

独立 CPU 重建相同实际 DEM、CSM、太阳、相机和原生偏置（`shadow-ground-cdf41-reference.json`）：289 个窗内采样，217 个中心深度预测在原 6 mm 带内，但原四邻域查询全部有效的点为 0。原因是用同一个接收深度查询斜面上不同 texel，其地表深度差超出带宽。改为沿局部接收面搬移每个邻域查询深度，保留实际接收点的预测残差、normalBias 和 depthBias，217 点四邻域重新有效；没有扩大 6 mm 阈值。独立 shader 已加入此修正，数值测试同时验证 12 mm 的真实预测误差仍回退。CPU 地表法线由 DEM 差分估计，与实际三角面法线仍有差异，故不能替代浏览器应用率证据。候选仍未通过、未接默认；下一项是短实景应用率与同风草影序列。


### 接收面修正后的实际短批（未采用）

实际浏览器应用率已从 0 提升到 800,876 / 1,854,924 地形像素（43.18%），其中799,561全权重；原6 mm阈值与全部源几何保留。`cdf41-plane-fixed-*` 保存两模式8个相同风时刻，共16张真实画面；5610个source mesh的geometry身份和实例数量逐帧严格相同。短批前等待133帧准备，其中连续90帧源签名稳定，未放宽序列断言。

实际查看整图、诊断图与四时刻接触表后，CDF应用区域仍呈不规则块状，中央灌木下主要是蓝色原生回退，不能把该处较柔的影子当成CDF成功；非地面叶片自身阴影也受近级4096→2048影响，有可见差异。原生每帧2166次/54,052,837三角，候选2165次/54,050,533三角：源数量固定但有1次/2304三角提交差异，尚未捕获投影者身份定位，不能称完整同绘制验证通过。此批没有GPU计时、窗口移动或室内验收。

报告`shadow-ground-cdf41-plane-world.json`，动图`cdf41-plane-motion.webp`、接触表`cdf41-plane-filmstrip.jpg`。两个临时页均已关闭，GPU归还主线全量回归。下一项应先改善真实地形预测的一致性、定位单次绘制差异和保留非地面细节，不能以43%局部启用宣布草影问题解决。

### 2026-10-27：保留原 4096 阴影的 4 m 局部覆盖候选（未采用）

四矩/CDF 路线仍不采用。新候选保留原近级 4096 原生阴影纹理与完整投影者，仅对局部地面太阳可见性做替换；树、草自身及建筑继续使用原阴影。独立源码 `shadow-window-coverage42.js`、`shadow-window-geometry42.js` 未接生产入口，不能视为草影问题解决。

实际默认林溪根页读取原近级 CSM 注册表 370 个源，完整 brush 使用真实驻留 station stream 的全风包络，普通草保整根全部三角。只读预算运行 1.99 秒，保存于 `docs/previews/v2-route-craft-38/shadow-window42-executable-budget.json`。包含原实际注册表全部来源，无未支持来源；羊未出现在该原生近级注册表中，不是按静态骨骼姿态裁掉。

|选择光柱宽度|完整额外三角|完整 brush 三角|估算 draw|
|---|---:|---:|---:|
|4 m|159,651|100,548|79|
|4.5 m（4 m 接收窗的移动包络）|222,243|161,196|105|
|6 m|521,776|450,072|159|
|8 m|1,045,295|956,004|196|
|12 m|1,573,397|1,433,208|163|

4.5 m 包络另含整根草与树体 56,623、地形双 pass 4,080、静态物体 344 三角。以上为准备提交的几何预算，**不是已测 GPU 成本**。旧保存帧离线逐三角筛选低估完整 brush；已改为完整 brush 核算，不能继续引用旧 58,958 树/针叶理论数作为实际提交量。

独立小包由 `node tools/build-shadow-window42.mjs` 写入 `web/dist-v2/window42/window42.js`，不清主构建。当前候选使用固定源快照，源数量、索引、根矩阵或观察位置变化会明确禁用旧选择，尚未实现可用的持续移动重选。定向 9 项通过只证明数据寻址、完整根/brush 复用和接收器替换契约；实际编译、动态草影形态、树/屋顶遮挡、窗口连续性及完整林溪 GPU 验收仍待完成。

#### 局部覆盖第二次实际验收：有可见进展，尚未采用

首轮同页重建候选暴露了真实错误：Three 在同材质 program key 命中时不再调用 `onBeforeCompile`，新 owner 沿用了已关闭 owner 的 uniforms。已改为每个 owner 唯一 key，移动重选则保留同一 owner 与 uniforms，避免每次重选重编译；同时拒绝空原生注册表，关闭统计清零。首轮 `window42-fixed-*` / `window42-down-*` 不用作效果通过证据。

第二轮已关闭临时页 1839973579。实际固定 1280×800、DPR 1（同时核实 canvas 1280×800），保存 `window42-v2-application` 和 `window42-v2-down-{native,local}-00..07`。同风时刻 4.00–4.84 秒，固定源几何与加载淡入状态，原近级 map 对象/4096 尺寸不变、shader 0 错误。

- 该俯视点局部实际提交 227,031 三角 / 107 draw。
- 单个实际风状态的完整源遮挡参考提交 11,418,255 三角 / 409 draw；其 512×512、4x 遮挡 mask 与局部筛选 **逐像素 0 差**，遮挡积分 38,712,056，非空图。这是额外覆盖 pass 的完整源对照，不是原整个世界绘制负担被减少的证明，也不代替全风/移动证明。
- 应用诊断确认下部可见地面实际使用覆盖。8 帧各有约 99,828–101,982 像素变化，画面上部 300 行各为 0 差。地面原有糊斑在局部窗口中呈现可辨认叶片边缘，并随同一风时刻变化，树影主体保留。
- 对照图 `window42-v2-filmstrip.jpg`、动画 `window42-v2-motion.webp`、统计 `tools/reports/shadow-window42-v2-pixel.json` 可复核。尚未测这套候选的完整 GPU ABBA，不报告帧率收益。

随后仅做了独立移动候选源码：可见下部视线的真实地形交点、世界固定光空间网格、保全部风/morph 包络的有版本几何缓存、完整根包围盒查询，以及同一 owner 的 `replaceBudget`。源几何、索引、实例版本、父世界矩阵、morph/风包络属性、材质变化会失效。16 项针对测试通过；这一更新尚未浏览器验收，不能把上面的固定窗口形态证据扩大到移动版本。下一步为正常视线锚点、暖查询成本、移动边界、多个风状态的完整遮挡对照，以及屋顶/多房灯光和完整林溪 GPU 回归。

### 第 42 轮：原阴影提交观测与移动窗口候选（尚未实景验收）

固定机位 v2 的 8 帧证据仍只证明局部形态，不代表移动/成本完成。新增独立 `shadow-window-submissions42.js` 与 `shadow-window-controller42.js`，均不由 main 导入，默认不启用。

- `shadowDueScan` 对必重绘 cascade 跳过状态扫描是原设计；近级 `_entries` 空不表示原阴影缺失。候选改为观察原最近级 `renderBufferDirect` 的实际提交，不调用额外场景扫描。缓存未重绘保留原提交，真实空级重绘才清空；原调用异常不发布半份列表。
- `treeViewSource` 代理仍用完整原始属性和实例，世界矩阵取实际代理父链；原始源及代理均不改写。原 `onAfterShadow` 与临时 index 恢复结束后才进入局部 mask 更新。捕获实际 depth side、alpha、displacement 等字段，保留门板特殊背面策略。
- 锚点取画面下部视线的真实近地交点，不再永久放在相机脚下。无可见近地交点走原阴影。选择 halo 外移或源几何/实例版本/父矩阵/真实投影状态变化才重新准备；准备期间保留原生阴影。准备耗时和切换连续性尚待浏览器测量，不宣称已解决走动卡顿。
- 全时风/所有 morph 顶点包络按源属性版本缓存；普通实例选择完整 root，不删叶。准备过程中源变化则拒绝过期结果。接收材质 owner 和已编译局部 depth 材质复用。
- 树木 world-frustum depth 平面是各级共用的动态 uniform；局部 clone 使用自己的局部相机平面，避免误借最后远级平面而漏遮挡，原生 uniform 不变。

此组源码定向测试 **22/22** 通过。仍需实际原提交源预算、暖选择成本、正常视角/移动边界/树屋遮挡和同条件 GPU ABBA；本节源码验证不替代这些验收。

### 第 42 轮：实际原提交与正常平视验证 v3

`window42-v3-normal-native/local.json/png` 已落盘并实际看图。1280×800、DPR1、原林溪 time870：tracker 最近级仍为 0，原 shadow pass 实际捕获 **372** 源；下部可见地面交点在前方 **3.963 m**。4.5 m 选择、4 m 接收窗提交 **141,874 triangles /80 draws**，对完整源 **10,834,303 triangles /372 draws** 的同相机 mask 为 **0 像素差**，覆盖积分 **30,868,832**，GL error 0。正常平视脚下花叶影可辨具体轮廓，远树区域未动；不再仅俯视可见。

这组仍**不能采用**：冷/暖准备测得 **211.3 /128.5 /76.6 ms**，走动时同步重选会卡顿；没有移动连续性或正式 GPU ABBA 结论。另外反射路径会调用未重绘的 shadow wrapper，v3 mask 可能重复更新，不能将单次 80 draws 当完整每帧成本。

后续源码已修为仅实际近级重绘后更新 mask；无阴影的局部 pass 暂时跳过全部 shadow wrapper 并 finally 恢复，避免嵌套无灯 pass 改写房屋 shadow atlas 的槽位统计/上下文。新增完整 root 光空间包络缓存，以及静态三角 64 项块查询，源/实例/父矩阵/太阳/index 变化严格失效。跨多个锚点与 uncached 结果的完整索引逐项相等测试已通过，相关 **25/25**。这些更新尚未重跑浏览器暖耗时；v3 图证只对应改动之前的固定机位结果。

### 第 42 轮：移动缓存实景 v4（质量局部成立，成本仍不合格）

`window42-v4-move-cached.json/png`：相机在原林溪正常视角向侧面分 0 /0.25 /0.5 /0.75 /1 m 五步移动，每步原生提交捕获、异步重选、下一次原 pass 后更新均恢复 ready；GL0。末点 **360,727 triangles /112 draws** 对完整 **10,834,303 /372** 的同风 mask 仍 **0 像素差**，积分 **33,618,965**，说明扩大后真实树/花遮挡未丢失。单主渲染中 mask 更新次数为 **1**，反射空调用重复更新已消除。

但这只是五个离散位置与完整遮挡核对，**不是连续走动无跳变或性能通过**。缓存后的首次预算 **1385.6 ms**，随后纯预算 **26.6 /62.8 /95.8 ms**；控制器移动重准备含分片等待为 **126.8–155.8 ms**，仍不可接受，且冷成本更高。未采用，仍保持 OFF。下一步已加每源 queryMs、brushMs 与几何/root/triangle 缓存命中计数以定位真实耗时，不能只凭理论缓存宣布优化。必须完成连续边界画面、预准备衔接和正式 GPU ABBA 后才可讨论采用。

### 第 42 轮：分类采样确认暖成本不是缓存失效

根复用 held 林溪页保存 `window42-budget-profile3.json`。三次完整预算 **1494.1 /32.3 /31.8 ms**；两次暖态都是 **135 root hits、11 triangle hits，vertex/root/triangle builds 全为0**。所以不再把残余成本归因于无依据的缓存持续失效。初次最大源 212352 tri 花437.2 ms，27880 tri 花137.8 ms，岸草合并源也显著；暖态没有单个大重建，成本散在 setup、372源校验与查询。

针对修复只在独立候选内：投影直接写 Float64 buffer，取消每顶点/三角的多层临时数组；完整 brush 支持函数用仿射中心/半径公式代替八角点临时对象（24组旋转/缩放/剪切对照，边界仅外扩1e-8）；源状态与包络签名重用 scratch，原版本、属性、父矩阵检查没有删除。相关 **27 项**通过。独立包新增 initial/final source-state 与 brush 分项耗时、真实 position/index/drawRange/风属性规模，等待 `profile4b` 实景复验。

Node离线合成分布粗基准（仅匹配部分实景数量，**不是原资产、不是浏览器性能**）：212352 tri 冷52.7 ms/暖0.35–0.48 ms；27880 tri 风草冷12.0 ms/暖0.03–0.07 ms；1726 roots/414240 tri 冷1.98 ms/暖0.07–0.14 ms。均非空选中。这里只说明查询核心在这些数据下可低成本，不能与旧Chrome耗时直接做速度比，也不证明实际完整场景已达标。main/environment/terrain 均未导入候选，默认路径无观察器、缓存或额外绘制。

### 第 42 轮：profile4b 与索引/分帧预取候选（等待实景）

根在默认林溪 held 页保存 `window42-budget-profile4b.json`：完整源372，原几何选择仍125896 triangles。冷准备 **997.2 ms**，暖 **19.1 /13.9 ms**；暖brush仅1.0 /0.6 ms，初/末源状态校验合计约3.5–3.7 ms。已比profile3下降，但仍不适合每0.25 m同步重选。两个大合并源实际都含风权重，212352 tri 对应121344 vertices、27880 tri 对应34850 vertices；并不是误把巨大未使用VBO当有效drawRange。

最新独立候选增加：

- 在既有原生提交记录内维护源变更版本（包含原始几何/实例/父矩阵/真实depth字段），预算和接收器复用该版本，避免重复全源字段扫描。
- 将同一套全风光空间包络放入4 m格子查询；仅查询目标窗口候选，未知/过大源仍完整保留，GPU针叶仍按原完整brush选择。不改原geometry/VBO、实例数、分辨率或材质颜色。
- 包络与完整三角投影缓存采用目标2 ms的协作片段准备；只在全源版本一致后发布完整缓存，记录实际maxSliceMs供验收。此为目标预算，不能在未实测前称硬实时保证。
- 目标锚点出halo时旧有效mask继续留在原世界锚点并随真实风更新，不再立即全关。新选择就绪后在共同覆盖内平滑移锚；真实源失效仍回原4096投影直至验证完成。

相关34项针对测试覆盖全风源、30 m高同太阳光柱遮挡、全源预算/原索引相等、源变动拒绝部分缓存、旧窗口保持与共同覆盖锚点。最新索引候选尚未经过实际运动、完整mask oracle和GPU成本验收，仍OFF、main未导入。

补充旧v4证据范围：此前直接移动相机后调用renderFrozenWorld，没有主动推进CSM相机布置；它证明离散接收位置与固定原投影下的遮挡一致，**不算完整移动CSM验收**。最新 `settleWindowCoverage42` 明确更新真实CSM再触发原shadow pass，用于补齐该验收缺口。


### Window42 indexed real movement and animated source evidence (candidate OFF)

Root captured `window42-indexed-initial.json`, `window42-indexed-move-quarter.json` and `window42-indexed-wind.json` at 1280×800 / DPR1 with real CSM updates. All three preserve native 4096 and compare exactly against complete-source coverage (0 differing pixels). Initial 372 sources select 125,896 triangles / 76 calls; after a real 0.25 m movement and then 1.5 seconds of live animation, 376 sources select 156,166 triangles / 86 calls. This proves conservative selection for those samples, not complete dynamic visual or performance acceptance.

Preparation remains unacceptable: initial 116.5 ms, move 39 ms, animated 189.4 ms; reported selection wall times 21 / 6.4 / 107.1 ms. The animated query rebuilt zero vertex/root/triangle caches, so repeated geometry-cache reconstruction is not the explanation. These are elapsed times across yields, not continuous CPU measurements. The old view stage nevertheless synchronously destroyed and rebuilt every private selection view outside the cooperative budget.

The next independent revision reuses views with identical source/layout/selected indices, stages changed views with checkpoints, atomically commits only a current source revision and sun basis, and retires old private buffers with checkpoints. Original source VBOs remain borrowed and untouched. Preparation starts after the enclosing native frame; diagnostics now separate active work from yield wait and report view creation/reuse, commit, preparation and retirement costs. Targeted tests verify unchanged-view identity, old-window retention during staging, rejection when source revision changes during preparation, and no original-buffer disposal. Actual browser cost and motion for this revision remain unverified; no production adoption.

### index2 retirement follow-up (still OFF)

Root `window42-index2-ground` at pitch -42 selects 277,409 triangles / 105 calls, creates 96 views and reuses 9; 67 retired views cost 49.2 ms in aggregate. Source inspection confirms Three WebGLGeometries deletes the geometry's *current* index and attributes, and WebGLObjects deletes an InstancedMesh's own matrix/color. Before private-view disposal, borrowed attributes are detached; borrowed brush/root indices are nulled. Static views own their replacement index; compact root attributes and matrix/color are private. Morph texture and VAOs are geometry-specific. An added listener-level regression verifies no borrowed buffer remains visible to these disposal handlers. This excludes an identified source-level shared-VBO deletion error; it does not prove absence of browser/driver stalls.

The former cooperative retirement checked budget only after each indivisible disposal; it could not preempt a slow driver call. The next candidate moves retirement outside preparation, waits two animation frames after detachment, then disposes at most one private view per frame. It reports pending count, cumulative CPU, maximum individual call/frame, last source and disposed count. New windows do not wait for this queue. Explicit owner cleanup cancels scheduled callbacks and drains remaining private resources. A single slow driver deletion can still stall one frame; two-frame delay is not a GPU completion fence and is not claimed to eliminate that risk. Actual per-item browser evidence is still required. Default scene is unchanged.

### Unrelated native membership changes and selection certificates

Root's 8 m selection halo (still 4 m receiver, 512 mask, native 4096) did not prevent reselection after a 0.5 m move: global native membership changed from 372 to 373. The current owner treats every global source revision as stale, even if the source is outside the entire light column. The independent revision now records the existing conservative index's candidate source/version set for the *complete selected halo*. A known outside removal can refresh the owner revision directly. Unknown additions or changed outside sources remain unsafe until their complete wind envelopes are indexed; if the current indexed candidate set and all relevant versions are unchanged, the owner retains the same views and window rather than rebuilding. GPU brush sources remain conservatively always included; this revision does not pretend their distant membership is proven irrelevant. Relevant changes still trigger native fallback and full reselection.

Target tests cover outside removal, unclassified addition, newly proven outside addition, a 30 m high sun-aligned newcomer, outside-to-inside motion and relevant same-membership state changes. The latter four unsafe cases are never accepted from stale bounds. This may prevent unnecessary rebuilds but does not eliminate temporary native fallback while unknown changes are classified; actual browser movement/oracle acceptance remains pending.

Root subsequently measured delayed retirement: `aerial42-default-forest-final.json` reports 79 disposed views over 79 frames, total CPU 20.1 ms, max individual/frame 0.6 ms, pending 0. The original default forest was restored with q0 and no errors. This verifies that sample's split peak, not removal of cumulative cost or full shadow-candidate adoption.

### index4 real walking and incremental native-index convergence

Root's `window42-index4-normal120` retained valid local coverage in all 120 ordinary-wind frames with no failures and zero oracle difference. Actual W movement travelled 4.28 m: `window42-index4-native-move.json` retained it in only 74/120 frames and had four failures. The persisted failure identified the index's global-revision rejection, with spruce changes and terrain additions. Final preparation had roughly 40 ms of active work and 2.55 s waiting; neither 120-frame stationary coverage nor final oracle zero proves continuous walking acceptance.

Source inspection shows the old index already retained per-source caches, but returned false whenever any native revision changed during its asynchronous snapshot. This aborted the controller preparation even after unaffected source work had completed. The next revision keeps that same index and continuously reconciles only mismatched/new versions within the existing pending operation. It removes departed sources, retries a source changed during its own interval preparation, and publishes only after an uninterrupted final comparison matches every current native source and version. Unknown additions are never treated as safe. Diagnostics count reconciliation rounds, prepared/reused sources and per-source retries. Tests mutate membership, add a 30 m elevated occluder, move an outside source into the light column, and mutate actual vertex data mid-slice; unchanged completed sources are processed once, while changed geometry converges to its real current version. Browser movement and complete-source oracle remain required. Selection/view-stage relevant mutations still intentionally reject; this revision specifically removes the evidenced index-stage global abort without weakening those checks.

### index5 actual scheduler wait and index6 bounded task candidate

`window42-index5-native-move.json` records 4.17 m walking, no preparation failures but only 41/120 frames using valid local coverage. Final preparation took 1102 ms, with 22.4 ms active and 1073.3 ms waiting across nine yields. The default terrain batching differs from index4, so these coverage ratios are not a controlled performance trend. Index reconciliation retained 417 unchanged source visits and prepared 58 sources; final oracle remained zero.

The actual old yield mechanism was `setTimeout(0)`, not requestAnimationFrame. The measured waits therefore reflect task scheduling under slow frames, rather than an explicit requirement to wait a frame. The independent index6 candidate uses one MessageChannel task at a time, not a microtask chain. It accounts active preparation and throttles after 4 ms in a 16 ms window; pending input triggers an additional task deferral. Each geometric slice retains the 2 ms target, with checks every 64 vertices / 128 triangles / 32 roots. Scheduler statistics expose total/max wait, task count, throttle and input-deferral count. View statistics now include complete iterator-plus-view preparation time and maximum indivisible step. A slow source operation still cannot be preempted by JavaScript; actual maxSlice/maxViewStep must prove the 2 ms goal rather than claiming the scheduler guarantees it. Tests verify real task yielding, aggregate cap, input deferral and cancellation. No default integration or density/detail change; actual W movement, input response and complete-source oracle are pending.

### index6 scheduler startup failure and index6b repair

Root observed ten startup failures (`Preparation scheduler already pending`) after only two completed tasks and one throttle. Source inspection identified a concrete poisoned-slot path: calling a stored native timer as `this.timer(...)` gives it the scheduler receiver; if the host rejects that receiver, the promise rejects after setting `pending`, without clearing it. All subsequent yields then fail as already pending. A strict host-callback regression reproduced the wrong receiver and failed before repair. The actual first browser error was overwritten, so native Illegal invocation remains a supported explanation rather than a recovered Chrome stack trace.

The repair invokes global timers with their proper global receiver, calls injected functions without a scheduler receiver, and atomically clears/rejects pending on timer or postMessage failure. Both scheduler and controller retain firstFailure as well as lastFailure. Target tests verify failed posting cannot strand the slot and a later yield succeeds. Independent index6b build is ready; forced first throttled browser yield and normal startup/movement remain to be confirmed. No production change.

### Warm preparation entry, index7 candidate

Root's explicit 32 ms slice trial (`window42-index6b-slice32-native-move`) achieved 105/120 valid frames with zero failures/oracle difference, but recorded frame mean 101.8 ms, p95 142.7 ms, max 583 ms. The previous trial lacks equivalent frame data, so this does not establish a performance improvement. A final 3 ms preparation still waited 213 ms before starting.

Index7 removes the mandatory initial *task* only when an existing owner has completed views. It first awaits a microtask to let the original render call stack finish, then starts the unchanged preparation budget; cold owners still defer through the scheduler. The result cannot affect the already-completed color draw and is not called same-frame readiness. It does not change source completeness or increase the configured slice budget (the 32 ms option remains explicit). Controller statistics retain the last 128 individual preparations with active/defer/yield/maxSlice, phase timings and failure/revision, plus cumulative totals and all-time peaks beyond that history. Target tests prove no work enters the original render stack, cold versus warm scheduling, and retained cumulative totals. Actual movement, frame cost and oracle acceptance remain pending; default remains unchanged.

### index8 shared synchronous warm path (OFF candidate)

Index7 still had 105/120 valid frames, with almost one native fallback frame per asynchronous preparation. The next candidate does not add another task scheduler. The existing executable budget is now a shared generator: async consumption prepares missing complete caches cooperatively; synchronous consumption only accepts signature-matching interval/root/triangle caches. Index cell insertion likewise shares one generator between the original asynchronous and cached synchronous paths. Initial owner creation and any missing/changed geometry cache still follow asynchronous preparation. Cold cache checks are tested to perform zero vertex/root/triangle builds.

Within the original afterShadow callback, a prepared owner may now reconcile cached source versions, consume that same full-source selection algorithm, stage views through the existing plans/planView/commit, and render the mask before returning to main color. Deadline checks use explicit `warmSynchronousMilliseconds` (candidate default 32; set 0 to disable this path). Expiry never commits partial views; fresh uncommitted private views retire through the existing queue and asynchronous preparation resumes. This is a cooperative deadline, not a hard preemption guarantee for one JavaScript operation or render submission. `stats.synchronous` records attempts/hits/misses, last/total/max elapsed including mask rendering and miss reason; successful preparations are also retained in preparationHistory. Real scene CPU, long frames, coverage and shader behavior still require browser acceptance.

Target tests verify exact selected source indices against the unchanged async algorithm, zero cold cache construction, changed vertex versions refusing synchronous work, deadline rejection preserving old views, and callback order commit → mask → main-color. No source density, shadow resolution, complete wind envelope, original 4096 self-shadow or production default changed.

### index8 evidence and index9 source reuse

`window42-index8-native-move.json` has 106/120 valid frames, oracle zero and one selection-stage failure after thirty source changes. The synchronous path hit only 3/15 attempts and one successful attempt took 109.2 ms. Existing evidence has no per-attempt miss source or mask-stage timing, so it does not identify why all twelve attempts missed or prove a driver/compile cause for 109.2 ms. A successful hit passed the pre-commit 32 ms deadline; work after that check, including commit and mask rendering, was not separately measured.

Index9 adds persistent per-attempt selection/views/mask timings, source-name/cache-miss detail, created/reused counts and outcome. It also fixes two demonstrated source-code limitations without weakening coverage: (1) repeated instanceMatrix version updates can reuse root projections only after full exact matrix-array equality against the stored input snapshot; real value/count/parent/geometry changes remain invalid; (2) asynchronous selection now retains per-source results with exact source version, anchor, span and sun basis while reconciling changed membership in the same pending operation. Unchanged rows are reused, changed/new rows are prepared afresh, and the complete final live-source certificate remains mandatory. Tests move a real source out of the column and add a 30 m sun-aligned source during a yield, then compare every selected source/index with the full oracle. No budget increase or density change. Real moving appearance and CPU/GPU cost remain unaccepted; default OFF.

### index10 complete-root refresh and redundant upload removal

Index9's trace confirms 106/120 valid frames, oracle zero and no failure. Most synchronous misses were `changed-root-projection`; other misses included new terrain interval data. The projection signature excludes receiver anchor: it includes source interval identity, instance matrix identity/data/version, root count, displacement, world matrix and sun basis. Index10 permits the existing projection function to recompute root rectangles from already complete cached geometry intervals under the same deadline; missing or changed vertex intervals still use asynchronous preparation. `rootRefreshes` records the actual changed signature categories, so the next browser trial can distinguish matrix/count/world/sun changes. Tests change real instance and parent transforms, verify no vertex interval rebuild, and compare complete root selections with the uncached oracle.

The 120.6 ms hit contained 98.9 ms in mask rendering despite zero created views / 107 reused. The second contained 59.1 ms in mask rendering. Source tracing confirms exactly one reference-scene render and one mask-scene render, with native shadow rendering disabled/no-op inside these two passes; this is not a full original-scene repeat. Reused view sync previously marked every private matrix/color/root stream for upload each frame. Index10 compares exact values and increments upload versions only when data changes, retaining every actual wind/matrix update. Only currently active depth materials now receive local frustum plane updates, not all historically cached materials. `renderTiming` splits camera/planes/view-sync/reference/mask-draw/restore CPU and program counts; it does not claim to distinguish driver stall from GPU execution without the actual next evidence. Forty-one targeted tests pass. Independent candidate remains OFF and is not accepted for continuity or frame cost.

### index11 strict shared intervals and actual asynchronous shader preparation

Index10's 108/120 valid-frame result still has oracle zero and one failure. The 76.8 ms mask sample did grow program count from 96 to 99; other 17–25 ms samples did not, so compilation is only part of the remaining cost. All recorded synchronous misses were absent geometry intervals, including new tree LODs and terrain groups.

Index11 adds a secondary weak interval lookup keyed by the actual shared position-attribute object. Reuse additionally requires the complete interval signature: wind/seat/shape/morph attributes, referenced arrays/interleaving, count, offset and versions. Independent clones or altered wind attributes do not share merely because they look alike. Index buffers are not an input to per-vertex intervals; projected triangle caches still retain their exact index/draw-range/version checks. Tests demonstrate identical shared input reuses the existing interval without a vertex rebuild and independent/changed data is rejected.

Asynchronous view preparation now calls the renderer's actual compileAsync for reference and mask scenes under their respective render targets and the same camera/depth/shadow-disabled settings. Global renderer target and shadow state are restored immediately after issuing the calls, before awaiting completion. The owner remains program-preparation-pending until ready, so the first render cannot bypass the compile wait. Compile submit CPU and total wall time are reported separately rather than added to geometric preparation active CPU. Tests cover exact target/state invocation, immediate restoration, failure restoration and readiness blocking. This warms the actual prepared scene; it does not assert all future unseen shader variants are already compiled. Thirty-seven targeted tests pass. Candidate remains OFF pending settled-pose and actual moving-source acceptance.

### index12 bounded first preparation for small static terrain

Root's settled-pose index11 movement reached 116/120 valid frames, twelve synchronous hits and one miss, with oracle zero. The remaining miss was a new `Settled terrain sibling group` with its own geometry; asynchronous view preparation then encountered further live-source changes. Actual merge source confirms these groups contain newly combined position arrays, so treating them as already-shared data would be incorrect.

Index12 extracts the existing complete interval/root/triangle preparation into one generator consumed by both asynchronous preparation and a narrowly eligible static-terrain warm path. Eligibility requires an actual current terrain material, ordinary non-instanced/non-skinned mesh, no position morphs/wind/shape attributes or displacement texture, at most 20,000 vertices and 40,000 triangles. These are execution guards, not reduced scene content: rejected sources remain fully handled by the original async path. The same total 32 ms warm deadline is checked every 64 vertices / 128 triangles; complete interval and triangle caches publish only after source-signature validation. A deadline cannot publish half a cache or a partial mask. New-terrain diagnostics report the processed source and exact vertex/triangle counts.

Target tests compare new terrain selection/index records exactly to the full oracle, retain non-terrain cold-cache rejection, and verify deadline, large-geometry, morph and wind cases. This updates only the independent OFF candidate; the root full-project run started from index11 and is not claimed to cover this later independent change. Mask cost at stable program counts remains unresolved, and no performance acceptance is inferred from continuity tests.

### index13 first terrain triangle projection

Index12 actual movement reached 119/120 valid frames with zero failures and oracle difference. The one miss was a static sibling group's first triangle projection, although its interval bounds were already cached. Index-level readiness intentionally checks only full source boxes, so it bypassed the newly added cold-terrain path; selection-level readiness then rejected the missing projected triangles.

Index13 invokes the exact same narrowly eligible static-terrain preparation at this selection boundary, using the same original deadline and no additional budget. It retains the vertex/triangle size and deformation exclusions. A targeted test begins with interval-only data, forces deadline expiry during triangle preparation, then verifies the complete resumed result against full-source indices. Twenty affected tests pass. The reported synchronous maximum around 142 ms includes mask cost and is still unresolved; continuity improvements do not establish performance acceptance. Default remains OFF.

### index14 static point preparation without general wind work

Index13 still reached 119/120 valid frames. Its single miss had 30.7 ms selection plus 3.8 ms view preparation, exceeding the unchanged 32 ms cooperative deadline. The trace had three identically named 4,868-vertex / 9,216-triangle terrain entries; names alone do not establish duplicate work. New diagnostics include source id and geometry id for each entry.

For geometry proved to have point intervals (no position morph, seat offset or wind), index14 writes the same Float64 lower/upper coordinates directly without per-vertex temporary arrays. With zero displacement and finite matrices/bounds, per-vertex projection skips only the identically zero radius terms; coordinate transform and light-space dot-product order remain unchanged. General wind/morph and non-finite paths remain as before, and all source indices/triangles are retained. The old synchronous generic implementation is retained as the test oracle: complete interval arrays, projected triangle bounds, chunk bounds and indices match byte for byte under translated/rotated/nonuniformly scaled real-coordinate-sized geometry. Twenty-seven affected tests pass. This is an implementation reduction, not a raised deadline; whether three actual new groups fit reliably still requires the next browser trial. Mask rendering cost remains unresolved and the candidate stays OFF.

### index15 final bounded conservative-box trial

Index14 still reached 119/120 valid frames with oracle zero. Revision 375 spent 25.4 ms selecting already-prepared data and 11.2 ms staging views, with no terrain prepared; this cannot be explained away as cold terrain. Revision 464 exceeded the deadline while preparing a new static triangle projection. The remaining trial addresses only a demonstrated avoidable path: the spatial index returns coarse 4 m cell candidates, and index-stage static preparation previously built triangle projections even before exact column intersection was known.

Index15 retains each complete projected source box and rejects single-box candidates only when that exact conservative box is outside the requested light column (including the existing guard). Unknown/multiple-root boxes remain conservative; elevated sources on the sun ray remain included. Index-stage cold static preparation now builds only full intervals/source boxes. Exact intersecting sources receive all triangle projections at selection time under the unchanged shared 32 ms deadline. Diagnostics distinguish coarse candidates, exact box rejections and index-versus-selection preparation using source/geometry ids. A regression proves a grid-cell false positive never gets triangle preparation, a 30 m high occluder stays selected, and complete selected indices match the full oracle. Twenty-eight affected tests pass.

This is the last authorized narrow coverage-candidate refinement for this iteration. If actual movement still falls back or the extra mask materially increases frame time, retain the candidate as unadopted and return to the main renderer CPU bottleneck; do not keep raising budgets or extending this experiment. Default remains OFF.

### index15 final actual decision — OFF, narrow branch stopped

`window42-index15-focused-native-move.json` records real native W movement over 3.14 m: 119/120 active frames, zero failures, full-source coverage oracle zero. Synchronous history totals ten attempts, seven hits, three misses, maximum 78.3 ms. One fallback frame and substantial synchronous/mask cost remain, so this candidate is not adopted and this narrow refinement branch is stopped. No density, shadow resolution, or preparation budget is relaxed. Earlier `window42-index15-native-move.json` had movement range zero because the button retained focus; it is explicitly excluded as movement evidence. Work returns to measured main-renderer CPU costs.
