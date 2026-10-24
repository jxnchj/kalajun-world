# 第 38 轮：近草有限太阳半影候选

`nearShadowDetail=close&closeSolarShadow=1`，默认关闭。启用后替代该材质的 `closeShadowFootprint`；关闭后原四点像素积分保持不变。尚待实际浏览器编译、草影运动、客房 16 sampler 和 GPU 成本验收，不是已接受修复。

## 为什么不能从原 PCF 值直接估距离

当前 Three r186 的 PCF 深度附件是 DepthTexture/UnsignedIntType；但原 `sampler2DShadow` 与比较模式返回双线性覆盖率，不返回遮挡深度。把这个值作为深度会产生没有几何意义的半影。本候选只把最近级替为一个 raw `sampler2D`，远三级仍为硬件比较 sampler 数组，共 4 个采样器，无 4096² 深度复制，也不额外占室内 sampler。

安装在当前 LightShadow.updateMatrices 包装层：Three 在创建附件后、初始化渲染目标前调用该方法，最近级 compareFunction 设 null、NearestFilter，然后正常绘制原全部投影物。着色器 texelFetch 读真实深度，其余三级设置不动。没有修改 Three 源码或全局 ShaderChunk。

## 物理尺度与近似边界

正交相机的 normalized depth 与沿光轴距离为线性关系。普通深度间距为 `(receiver - blocker) × (far - near)`，reversed depth 符号相反；真实 Three shadow matrix 的正反模式已测试，不对反向深度错误使用透视线性化公式。

太阳角半径 0.266°，平行面近似半影半径 `间距 × tan(0.266°)`。0.1 m 间距约 0.464 mm；1 m 约 4.643 mm；接触时为 0。无手拍最小模糊半径，也不修改草叶粗细、密度、风、投影偏移或阴影分辨率。

半影估计思想参考 Fernando 的原始 [Percentage-Closer Soft Shadows 演示](https://download.nvidia.com/developer/presentations/2005/GDC/Sponsored_Day/Percentage_Closer_Soft_Shadows.pdf)。这里特意只实现局部草影候选：最近 3×3 深度 texel 找到局部 blockers，平均真实距离估太阳圆盘支持域；它不是遍历完整光锥的 PCSS blocker search。较远树木、错过邻域的 blockers、阴影贴图已漏掉的细叶仍会出错，不能将之称完整物理太阳可见性或保证点断消失。

12 个等权太阳圆盘样点与 4 个接收像素象限联合积分，逐 texel 手工双线性比较。所有屏幕导数在 discard/级联分支前计算；接收面梯度同时用于深度比较，减少斜地表自遮挡。太阳/接收面均为有限样点与局部平面近似，不是光线追踪。

## 成本和验证

每个受最近级影响的片元：9 次原始 blocker fetch + 12×4 次比较所需的原始 depth fetch = 57 次。原四点像素版本是 4 次硬件 PCF 请求、16 个比较；两者不能按 JS 时间换算 GPU 收益。该候选成本明显更高，必须实测，默认不采用。

14/14 针对和原回归通过，包括实际 Three 正交/reversed shadow matrix 的毫米到十米间距、深度附件创建/切换时序、远三级附件和比较方式不变、4 sampler 声明、原 CSM 淡入淡出、遮挡/裁剪前导数、材质类型注入、原 footprint 与 near-shadow tests。Node 不提供实际 GPU GLSL 链接或画面证据，这两项待浏览器。

## 第二候选：只复用已经读取的深度

`closeSolarReuse=1` 需与 `nearShadowDetail=close&closeSolarShadow=1` 同用，仍默认关闭。9 个 blocker 深度暂存于 shader 局部数组；12×4 过滤 tap 若坐标恰好在这 3×3 窗口中，复用其原始值，其他 tap 照旧读取。太阳样点/角度、接收像素、每个 texel 的斜面深度修正、比较方向与权重均不改。不是减少滤波采样或缩小核。

有效纹理读取理论范围由固定 57 变为 9–57；代价是至少 9 个局部 float、动态数组索引和条件判断，可能增加寄存器压力或被编译器展开成较多指令。实际 GPU 收益必须测，不能只凭 fetch 数采用。

不能在当前 Three 公共接口和 16 sampler 限制下，直接用 12 次硬件 PCF 替代 48 次手工读取：比较模式属于 WebGL texture 状态，Three r186 WebGLRenderer 不暴露独立 WebGLSampler；同一深度同时 raw 和比较读取需要不同绑定及采样状态。clone 不等于合法共享带不同状态的深度附件。即便提供独立比较采样器，硬件 PCF 的四格只有一个参考深度，也不等价于当前逐 texel 的接收面校正。故未复制深度、未修改 Three 核心、未用裸 GL 共享句柄。

`close-solar-reuse.test.js` 与原太阳候选测试 7/7：480 个合成移动相位、0/0.13/1.3/8/30 texel 半影半径、斜面、边缘与正反深度案例输出逐值相等；合成最少 9、最多 57 次读取。该计数是测试分布，不能作为实景统计。GPU GLSL 链接、实际寄存器代价和录像待主任务验收。

## 本轮实际浏览器证据

原太阳候选与深度复用候选已在真实Chrome/WebGL编译，包含客房采样器兼容检查，错误为空。相同冻结世界下两版本1280×800共1,024,000像素完全一致；这只证明复用版本没有改变当前画面，不证明GPU提速。

`previews/v2-route-craft-38/grass-solar-reuse-motion.webm` 为8.08秒/253帧真实采集；另对当前构建采集7.17秒12帧局部时间序列 `grass-solar-reuse-timeline.png`，检查到宽叶阴影随草叶位移保持线状轮廓，细梢仍有细线断续。没有把单张静态图当动态验收。原膨缩问题有改善方向，但尚未闭环，仍默认关闭，整片林溪成本继续测。
