# Atlas44 实际浏览器验收：NO-GO，保持关闭

2026-10-28。正确性通过，整体性能失败；本路线到此停止，不继续增加机制。无根、密度、几何、风数学或全局光色调整。

## 同条件 ABBA

同一冻结构建 `dist-v2/tree-wind-atlas44`，Chrome，1280×800、DPR1、time870、river-forest 原机位。A为 `treeWindAtlas44=0` 且无 treeViewCull；B为 `treeWindAtlas44=1` 自动安装现有 proxy。passShare42 均关闭。

每组独立加载；地形 q=0/m=0 后60稳定RAF，再采180RAF。完全相同collector只逐帧读取地形简表、原机位与实际renderer frame；结束才读取完整snapshot。四组均valid=true、180样本、errors=[]，证据POST检查HTTP成功。

| 组 | RAF均值 ms | RAF p95 ms | GPU均值 ms | 每RAF同步CPU ms | 每RAF renderer合计 ms |
|---|---:|---:|---:|---:|---:|
| A1 native | 96.224 | 121.5 | 40.617 | 94.248 | 52.852 |
| B1 atlas | 115.262 | 158.7 | 36.513 | 117.796 | 69.964 |
| B2 atlas | 123.188 | 172.2 | 36.709 | 119.748 | 71.057 |
| A2 native | 92.965 | 121.6 | 41.050 | 89.459 | 49.198 |

两组等权均值：native94.594ms，候选119.225ms，**增加24.630ms / 26.04%**。GPU减少4.222ms，但每RAF同步CPU增加26.918ms，其中renderer合计增加19.485ms。不能将CPU与GPU相加，也不能以GPU下降判为成功。RAF为180帧，GPU是结束时60样本滚动窗口，rafCPU42为120样本滚动窗口；表内renderer使用每RAF合计，没有混入per-call口径。

每组源规模完全一致：528树批、3918 resident部件实例、3213 active部件实例、450 active批、1027风根、6个近针叶active根；235地形提交组/940源tile。A实际0proxy，B实际168atlas proxy。

B1/B2的180样本内均为：forceCopies=0、fullForceCopies=0、matrixCopies=0、slotCopies=0、viewAllocations=0、indexCacheMisses=0、indexTests=0；实际纹理上传180次，共11,796,480字节。根槽方案确实消除了目标复制，仍未改善用户实际帧率。原始风VBO保留，新增每帧64KiB纹理成本真实计入。

没有取得同构建 `treeViewCull=1 / atlas=0` 的第三路径，因此结论针对当前完整 atlas+compaction 候选相对native，不能把所有退化归因于texelFetch或texture upload。驱动等待、额外材质绑定等仍只是可能解释，没有驱动级证据。

测试前旧诊断页1839973744已由其持有者关闭，GI再生/build与rooms短CPU任务已完成。root报告15:10:55.6–15:10:56.7的一次系统python/xcrun探测；B1正式采样结束15:11:58.063、180帧总20.7471秒，即使预留1秒回调偏差，开始也晚于15:11:36，未覆盖该开销。

## Shader、移动及像素

实际四个atlas链接程序全部成功，vertex/fragment日志为空。颜色/深度活跃sampler槽为9/8/2/2，设备上限vertex16、fragment16、combined32；Three上限16，最大实际unit8，CSM数组unit0/1/2。反射使用这些程序已正常绘制。

正常RAF原生W按住900ms移动约11.94m，再转25.6°；第二视角继续正常拖动回身到yaw179.712°。每一视角冻结wind/camera/CSM后分别full→compact→full-return→restored，每态更新receiver domain、重绘阴影和反射。两视角各三项比较全部0像素差，8次反射重捕获成功，errors=[]。截图已实际查看。此项证明当前候选full/compact一致，不能替代跨构建native/atlas逐像素比较。

## 证据和收尾

`docs/previews/v2-route-craft-38/`：

- `tree-wind-atlas44-clean-{a1,b1,b2,a2}.json`
- `tree-wind-atlas44-samplers.json`
- `tree-wind-atlas44-motion-forward-turn.{json,png}`
- `tree-wind-atlas44-motion-return-facing.{json,png}`

诊断脚本为 `tools/browser-tree-wind-atlas44.js`、`tools/browser-tree-wind-atlas44-visual.js`；候选源码/构建信息及82项定向测试见 `tree-wind-atlas44-candidate.md`。

最终验收页1839973767已停帧并关闭，临时viewport override已reset，GPU/重CPU窗口已通知root及rooms释放。未改变默认入口、主dist或候选源码，atlas44保持默认OFF。
