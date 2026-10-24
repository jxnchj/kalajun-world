# V38 远林 albedo 无损传输：浏览器验证后采用

当前结论：真实浏览器恢复RGBA完全一致、两图实际传输减少1,235,785字节，已默认采用green planar；`farLossless38=0`保留原传输对照。拒绝Sub/Up预测。下文保留离线评估与初始候选阶段证据，最终采用依据见末节。本节为离线评估时的状态；随后已实现默认关闭候选，见文末。该方案仅减少传输，不能解决主画面 GPU 绘制负担，也不代表加载长尾已经解决。

## 已验证结果

来源：`web/public/assets/v2/spruce/far-v14/impostor-manifest.json` 中原始 albedo。128×384×120 RGBA8，原始 23,592,960 字节，gzip 9,622,991 字节。SHA256 `c873510df91566847274975feff59f8072d4105edc5b20071878466f8a6ace93`。

| 编码候选 | gzip 字节 | 节省 | inflate 中位 ms | 逆变换中位 ms | 合计中位 ms | 同轮原 gzip 中位 ms |
|---|---:|---:|---:|---:|---:|---:|
| G, R−G, B−G, A 四平面 | 8,387,206 | 12.84% | 37.77 | 12.56 | 51.01 | 43.89 |
| 上述 + 行内左邻预测 | 8,833,302 | 8.21% | 40.16 | 53.32 | 92.46 | 44.62 |
| 上述 + 层内上一行预测 | 9,291,494 | 3.44% | 40.43 | 45.48 | 85.47 | 44.21 |

合计中位是每次完整解码合计的中位，不是各项中位相加。每个候选一次预热、三次观测，基线/候选交替次序；源 SHA 校验不计入计时。Node v24.15.0 / zlib 1.3.1-e00f703，level 9。所有解码均与全部原始 RGBA 逐字节比较，并逐轮验证 SHA，包括 alpha=0 下的 RGB。差分使用 Uint8 模 256，可逆，不修改颜色、法线、分辨率、层数或透明边界。

现行 v27 normal 单独平面 gzip 8,827,005 字节无需改变；两张图总传输可由18,449,996降至17,214,211字节（约6.70%）。green方案额外占用一个23,592,960字节输出RGBA缓冲，inflate平面与输出在重排阶段同时存在。Node 本次CPU合计增加约7.12ms，不能忽略移动设备/主线程成本。

## 采用建议和限制

先只考虑最简单的四平面 green 候选。后续接入前，需要在真实 Chrome 以现行 DecompressionStream 路径及冷缓存重复测量，纳入分配/GC、并行normal加载、纹理上传和首帧尾延迟。Node zlib时间不等于浏览器耗时。理论1.236MB节省在100Mbps网络约省99ms、1Gbps约10ms，均未扣协议与并行资源影响；localhost通常不会因此明显改善。不得以包体下降宣称整段冷启动已优化。

不继续增加空间预测解码器：两个实际候选都更大、更慢。没有测试Paeth，也不凭既有normal报告断言albedo Paeth结果；本轮收益已足以明确简洁候选，避免扩大研究范围。

现行`spruce-far-transport.js`只还原 normal RGB 平面并复用albedo alpha。若未来实现albedo green格式，应独立版本、保持原格式回退和长度/SHA离线检验；normal必须等待已经还原的RGBA alpha。离线评估阶段未修改运行模块；后续候选只接入transport/loader，未改ecology或浏览器。

## 复现

单次命令只做一个候选，先避开浏览器性能窗口：

```sh
node tools/probe_far_albedo_lossless_v38.mjs green tools/reports/far-albedo-green-v38.json
node tools/probe_far_albedo_lossless_v38.mjs green-sub tools/reports/far-albedo-green-sub-v38.json
node tools/probe_far_albedo_lossless_v38.mjs green-up tools/reports/far-albedo-green-up-v38.json
```

脚本不输出或发布gzip资产，只写指定报告。原始数据/候选SHA、每次样本及环境版本见上述JSON。不同zlib实现压缩字节可能不同，应以RGBA逐字节一致和指定环境复现为准。

## 后续默认关闭候选（已完成源码和定向验证，未构建/未浏览器采用）

`farLossless38=1` 选择独立 `albedo-lossless-v38.json` 和8,387,206字节gzip包，默认仍原albedo文件。原capture manifest未变；normal v26/v27皆兼容。候选描述验证capture SHA、源RGBA SHA、尺寸、版本、编码与固定URL。应用gzip先验证包长/SHA；HTTP已解压则验证平面长/SHA，防止同长度旧RGBA或缓存错包被静默解释。需要Web Crypto；缺失明确失败，不静默回退混包。

恢复函数不修改输入（含偏移视图），分配新RGBA，再让normal共享恢复后的alpha。stats增加farLossless38/albedoRestoreMs/payloadVerificationMs；rgbaRestoreMs包含两种恢复成本。SHA校验成本不在前述离线CPU数字中，浏览器必须计入。

发布工具 `node tools/build_far_albedo_lossless_v38.mjs` 进行原SHA、完整字节恢复验证，并读回已发布gzip/JSON；`--check`不写文件但重新计算比对。包SHA `955b315ac0ca92529e8b2bf230aad3797fa6d74d172fd68a784e77996b5f4ab9`；平面SHA `e8e44632991f21f65d1fb8b70aa2dd5ad2526ae430896857c86e48e2fa89cd12`。

已跑 `node --test web/src/v2/spruce-far-albedo-v38.test.js web/src/v2/spruce-far-transport.test.js`：9/9通过，约1.22s。覆盖完整数组字节、输入所有权、零alpha隐藏RGB、错误版本/同长度错包拒绝、HTTP/应用gzip × normal v26/v27四组合GPU纹理一致，以及原格式回归。实际浏览器性能与首帧验收交由统一构建后进行；未据此默认启用。

## 实际浏览器冷缓存验收与默认采用

证据均位于`docs/previews/v2-route-craft-38/`：`far-lossless-cold-{off1,on1,off2,on2}.json`及`far-lossless-browser-restored-hashes.json`。

| 次序 | 首帧 ms | far load ms |
|---|---:|---:|
| off1 | 9527.7 | 2821.4 |
| on1 | 9023.4 | 2728.1 |
| off2 | 9135.3 | 2805.2 |
| on2 | 9297.1 | 2748.8 |

实际两图encoded由18,449,996降至17,214,211字节，精确减少1,235,785字节（6.70%）。on两轮恢复13.9/14.0ms，校验10.5/10.2ms。浏览器恢复后albedo SHA为c873510df91566847274975feff59f8072d4105edc5b20071878466f8a6ace93，normal SHA为01987b18c085ce98937c933cfdac540e59a0c720d33fb543e0f843d323edb3d6；每图23,592,960字节，128×384×120，与原资产完全一致。

依据确定的带宽收益、完整字节一致性采用默认，而不是声称整页首帧稳定改善。四次首帧波动交叠，尚未证明整页冷启动长尾解决。GPU几何、分辨率、密度、alpha、normal均不变。

当前源码默认使用green；URL `farLossless38=0`或显式loader参数false使用原albedo。旧v26/v27传输测试明确关闭green继续覆盖旧格式；新增测试通过实际loader验证默认、URL 0/1及全图SHA。四个相关suite总22/22通过（约1.55s）。本agent未build，默认采用需下一次统一构建覆盖。
