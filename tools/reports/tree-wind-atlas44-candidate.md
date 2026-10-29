# Tree wind atlas44 — 默认关闭，浏览器性能 NO-GO

2026-10-28。本轮完成 source、针对测试和独立静态构建；浏览器 shader/sampler 与移动像素验收通过，但ABBA整体RAF退化，明确NO-GO、保持默认关闭。完整结果见 `tree-wind-atlas44-browser.md`。失败的 passShare42 保持原状、关闭，BatchedMesh 未启用。

## 可复现入口

- 原生对照：`http://127.0.0.1:5174/dist-v2/tree-wind-atlas44/v2.html?view=river-forest&time=870&treeWindAtlas44=0`
- atlas 候选：`http://127.0.0.1:5174/dist-v2/tree-wind-atlas44/v2.html?view=river-forest&time=870&treeWindAtlas44=1`
- 必要时的定位对照：同入口 `treeWindAtlas44=0&treeViewCull=1`，不能带 `treeViewPassShare42=1`。

`treeWindAtlas44=1` 自动启用现有 mode1/5 cutout tree-view proxy；独立的 `treeWindAtlas44=0` 保持原生路径。atlas 与 passShare42 明确互斥。仅切换运行时 `treeViewCull.value=0` 会得到 atlas 的完整前缀，不是原生对照，不能据此报告 native A/B。

## 实现范围

- `SpruceRootWind` 可选持有单一 `TreeWindAtlas44`。2048 根硬上限，128×32 RGBA32F，64 KiB；容量不足明确报错，不少画根、不扩容。root.id 跨缓存对象重建保持身份。
- 槽表只在已有 tree/layout revision 边界更新；保留仍在场根的 slot，回收离场 slot。每个源 mesh 的压实 slot 前缀跟随现有 swap-remove 顺序。
- 在原始风采样完成后直接复制每根 5 个 Float32 值到两个相邻 texel，无重新计算、量化、颜色空间转换、插值或 mipmap。原生树干/近针叶的源 VBO 及 CPU 填充全部保留。
- 标准与原 custom depth 的 view 材质保留既有 source、CSM、投影深度包装链，共享同一个纹理和 uniform；两次顶点 `texelFetch` 放在已有 LOD/frustum 提前剔除后，风位移及法线计算不变。
- atlas view 不含 force VBO，record 有效性检查矩阵、选中源索引、slot/layout 版本；风更新不再轮换 record 或复制 force。矩阵和 slot 的可变复用仍保留原 `frame < frame - 1` 条件。
- 捕获后布局变化会在绘制前明确拒绝旧 renderItem。源前缀未发布时不能绘制。view 释放 binding，统一 owner 最后单次 dispose texture。
- 新 flag 加入 terrain Worker 精确白名单；未知地表 flag 仍被拒绝。默认全局光色、根密度、几何/LOD、shader 风数学均未改变。

## 计量与不能省略的成本

`ecology.stats.treeWindAtlas44` 暴露 `publications/requestedUploadBytes` 与真实 `Texture.onUpdate` 的 `gpuUploads/gpuUploadBytes`；后者不等于请求次数。每次实际纹理上传为完整有界 64 KiB。

源 `treeRootWindUploadBytes` 继续存在；它是原代码的源风缓冲发布字节口径，不能将新增 atlas 视为替代整个世界的源 VBO。atlas 开启时 `stats.treeViews` 额外提供 force/slot/matrix copies。普通 native getter 不增加这些字段的逐批扫描。

新增每个存活顶点每个 pass 的两次纹理取样；共享纹理也可能随材质/程序/单元变化发生 sampler 绑定，更新正在使用的纹理仍可能导致驱动等待。随后实际 sampler 检查通过，但RAF均值与p95退化；详情见浏览器报告，不根据声明数或GPU单项推定采用。

## 验证

针对命令：

```sh
node --test src/v2/tree-wind-atlas44.test.js src/v2/tree-view-batches.test.js src/v2/spruce-wind.test.js src/v2/spruce-wind-exact42.test.js src/v2/terrain-row-worker-client.test.js src/v2/ecology-tree-active.test.js src/v2/ecology-preparation.test.js src/v2/visual-time.test.js
```

结果 **82/82 通过**，其中 atlas 新增 13 项；涵盖五个 Float32 位一致、负零、跨部件/世界资源隔离、更新后原 record 复用、main/shadow/mirror 精确根选择、旧 renderItem、槽回收、swap-remove、容量失败不改表、标准/深度/投影链、单次销毁、完整前缀、实际 `finishPreparation` 及 `roots:false` 分支。现有真实森林根、原生 VBO、精确风缓存与时间行为回归通过。rooms42 独立只读检查未发现正常路径必须阻止原型验证的错误；安装失败的 binding 释放已补。

构建：`npm run build:v2 -- --outDir dist-v2/tree-wind-atlas44 --emptyOutDir` 成功。已验证候选 HTML/主 JS 经 HTTP 200、`no-store` 返回原字节：

| 文件 | 字节 | SHA-256 |
|---|---:|---|
| `tree-wind-atlas44/v2.html` | 3115 | `f4f74730309bf668bf708f70ebc9a3236a710ae4f087ecf9122df1bbef461f46` |
| `tree-wind-atlas44/assets/v2-BceGzYcA.js` | 3276695 | `523c2d6de45dc7874fbc9d995cd95d234d236caaa863fcd854fc81b89dccd897` |

主入口及 shadow44 HTML/主 JS 构建前后哈希一致。输出仅在新增子目录，window42 与 meadow-dynamic-cover42 未编辑。

## 下一步与否决条件

### 已完成的实际浏览器正确性检查

独立 Chrome 页 1839973767，1280×800、DPR1、time870，确认实际 168 个 atlas proxy、1027 个风根、应用 errors=[]。

- 实际链接的 4 个 atlas 程序（颜色 22/25、深度 56/59）全部 link/vertex/fragment compile 成功，日志为空。活跃 sampler 槽分别 9、8、2、2；设备 vertex=16、fragment=16、combined=32、Three=16。最大实际单元为8，CSM数组实际单元为0/1/2。总活跃槽上界已小于任一单阶段限制，无需从声明猜测。
- 正常 RAF 下原生 W 持续900ms，位置从 `[-3611.851169467755,2329.157270885741,4805.483400316967]` 到 `[-3617.8014225490347,2329.008480903616,4795.130551411127]`，随后拖动转向25.6°。同一冻结 wind/camera/CSM 的 full/compact/full-return/restored 四态全部零像素差。
- 继续原生拖动回身至 yaw179.71205895458397，期间正常完成视角触发的内装准备；第二视角的四态也全部零差。两个视角均为每态先更新 receiver domain，再强制重绘阴影和反射；8次反射重捕获成功。截图已实际查看。
- 证据位于 `docs/previews/v2-route-craft-38/tree-wind-atlas44-samplers.json`、`tree-wind-atlas44-motion-forward-turn.{json,png}`、`tree-wind-atlas44-motion-return-facing.{json,png}`，保存端点均检查 HTTP 成功。

正确性检查后主动 hold，等待并行资产再生/build结束和旧诊断页关闭，然后才开始清洁性能计时。ABBA已完成：native两组94.594ms均值，atlas两组119.225ms，增加26.04%；即使采样内force/matrix/slot复制全部为0，仍不采用。

源码与候选构建已冻结，实际验收已结束。不得将本中间候选开启到默认版本。本路线停止，验收页关闭，GPU已释放。

缺根、任一风值/矩阵差异、槽复用错读、shader/sampler 超限或移动恢复不能零差，均保持关闭。RAF 均值或 p95 持续退化也保持关闭，不能仅凭 GPU 单项、复制次数或 buffer 数减少采用。若要判断 atlas 本身与旧 compaction 的成本，再使用同 build 的 `treeViewCull=1 / treeWindAtlas44=0 / passShare42=0` 对照。
