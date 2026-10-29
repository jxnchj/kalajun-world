# 跨视图不可变树记录共享：实际总帧时不通过，保持关闭

2026-10-28。候选 `treeViewPassShare42=1` 默认关闭，且只在 `treeViewCull=1` 已安装代理时生效。本轮不接入默认场景，不继续在这一候选上扩大架构。

## 问题、改动与静态验证

旧候选的筛选计时未包含 Three 在正式 draw 之前执行的 `WebGLObjects.update → WebGLGeometries.update → WebGLAttributes.update`。主视图调用点为 WebGLRenderer.js:1916，阴影为 WebGLShadowMap.js:530。源树的 SpruceRootWind 按 `mode:variant:chunk` 共享风缓冲且校验根顺序；代理却按 Frustum 独占缓冲。只读小复现中，同一源与三个选中集合完全相同的 Frustum 产生三个内容相同的 force buffer，每版风复制三次。这证明重复工作存在，未证明其是全部帧时差的根因。

此次只在同一 proxy 的现有 records Set 中查找完全相同的有序根索引、矩阵版本和两个风属性版本，命中后跨 Frustum 复用同一不可变 geometry。原 `frame < frame - 1` 改写保护、单一退休 owner、完整根/矩阵/风数值保持不变；没有实现跨部件 packet 池，没有新 shader、纹理或质量调整。精确渲染参数已加入 terrain Worker 白名单，未知地形参数仍拒绝。

定向检查 `node --test src/v2/tree-view-batches.test.js src/v2/terrain-row-worker-client.test.js` 为 48/48。覆盖默认关闭、不同平面同集合、不同集合与同帧版本隔离、真实 Three 上传缓存和 queued main 不被 shadow 覆写、安全回收、重复引用的单次 disposal。合成八个风版本、三个同集合视图的 forceCopies 从 24 降至 8；这不是浏览器性能证据。

独立完整构建为 `web/dist-v2/tree-view-pass-share42`，未覆盖主入口与 window42/meadow 候选。主 JS `assets/v2-DX4QtefU.js` 为 3,265,057 字节，SHA256 `47f47a8eb8d3fa4dbf13c6929ac993bcc64427ad592edd9159478cb4af91b16c`。HTML 3,115 字节，SHA256 `1eb3c3638805635af81bf19ff79559a46b833db7f631b322398f1f11b911038e`。两者 HTTP 200/no-store，读取字节与磁盘一致。

## 同条件实际动态对照

同一构建、Chrome、1280×800、DPR 1、time 870、原林溪位置 `[-3611.851169467755,2329.157270885741,4805.483400316967]`，yaw -29.88794104541604、pitch -10。全部真实动画与系统更新运行。每次完整重载后，地形 q0/m0 连续稳定 60 RAF，再采 180 RAF；每帧只查地形简表、实际相机与 renderer frame，不读取完整 snapshot。完整 snapshot 仅在结束时读一次。四组使用完全同一 collector，顺序 native → shared → shared → native。

|样本|原生/候选|RAF 均值 ms|RAF p95 ms|GPU 均值 ms|RAF 同步 CPU ms|renderer CPU ms|
|---|---|---:|---:|---:|---:|---:|
|A1|原生，0 proxy|79.4717|119.0000|38.9133|78.6658|47.0100|
|B1|候选，168 proxy，168 启用共享|227.1894|613.4000|42.6713|272.0008|179.8550|
|B2|候选，168 proxy，168 启用共享|113.7728|187.5000|36.6764|116.8592|74.3217|
|A2|原生，0 proxy|78.2289|106.8000|39.2188|79.0892|48.7892|

RAF 统计覆盖完整 180 样本；应用 GPU 为最后 60 个完整查询，rafCPU42 为最后 120 个可见 RAF，因此其窗口不能冒充完全相同。所有四组有效性检查通过、errors=[]，保存端点 `/__review38/evidence` 检查 response.ok 后再报告已保存。

A1/A2 接近；B1 比 A1 慢 147.7178 ms，B2 比 A2 慢 35.5439 ms（45.44%），且两组 p95 都恶化。B1 比 B2 的严重尾部波动仍未独立定位，不能全部归因某一上传机制；较稳定的 B2 也不足以通过采用条件。GPU 单项下降不改变总帧时不通过的结论。

四组场景数量完全一致：235 地形合批 / 940 源块；528 树批次 / 3918 常驻实例 / 3213 活跃实例 / 450 活跃批次 / 1027 风根 / 6 近针叶活跃根。没有降低任何密度或细节。

候选采样区间计数：

|计数|B1 180 RAF|B2 180 RAF|
|---|---:|---:|
|forceCopies|20976|20816|
|matrixCopies|736|822|
|passShareTests|68665|68085|
|passShareHits 增量|0|0|
|index cache misses / index tests|0 / 0|0 / 0|
|新 geometry / 退休 geometry|0 / 0|0 / 0|

两组结束均为 161 view geometries，passShareHits 累计 117（出现在采样前）；采样时已有共享记录可直接从各 view 列表命中，不能以新增 passShareHits 为 0 推断分享未启用。新的稳态 matrixCopies 与旧未共享样本的 0 不同，提示多个 view 列表共享可回收槽后发生布局转换；更少 VBO 导致等待也只是未证实假设。本次没有同构建重测 treeViewCull=1/share=0，因此不得将整体退化全部单独归因新增共享。结论已足以否决本候选默认采用，不再扩展本分支。

## 实际运动与像素验收

原生键鼠 W 900ms 前进约 10.77m，再拖动转向，实际相机为 `[-3617.218084158856,2329.018637370581,4796.145502226161]`，yaw -1.0879410454160356、pitch -11.6。待 q0/m0 后，在冻结的同一真实姿态对比完整代理前缀 / 压实共享 / 完整返回 / 恢复原候选，全部为 0 像素差，errors=[]。

随后继续原生拖动至 yaw 180.03205895458387。途中触发既有公共楼内装准备，待 preparing=false、q0/m0 后再检查；同样全部为 0 像素差。第二次拖动的 AX 回读曾超时，重连后只读确认动作已生效，未盲目重放动作。

每次状态均更新 camera、CSM 和实际 `environment.shadowReceivers`，重新生成阴影图和可见水面反射，避免旧 receiver domain 导致伪差异。两处四次 reflection 都实际 captured。此处是同页代理完整前缀与压实正确性对照，不是无代理原生性能对照，也不代表树冠片感等既有美术问题已完成。两张保存 PNG 已实际打开检查。

证据位于 `docs/previews/v2-route-craft-38/`：

- `tree-pass-share42-clean-a1.json`、`tree-pass-share42-clean-b1.json`、`tree-pass-share42-clean-b2.json`、`tree-pass-share42-clean-a2.json`
- `tree-pass-share42-motion-forward-turn.json/.png`
- `tree-pass-share42-motion-return-facing.json/.png`

采样器为 `tools/browser-tree-view-pass-share42.js`，视觉脚本为 `tools/browser-tree-view-pass-share42-visual.js`。验收结束后候选页先 hold（frame 3821）再关闭，临时 viewport 已恢复，GPU 窗口交还主线程。默认仍关闭；本项属于已否决的性能候选，不计作林溪帧率问题已解决。
