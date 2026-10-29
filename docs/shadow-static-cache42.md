# 中远级联静态深度候选42（No-go，默认关闭）

生产入口没有导入此候选。入口为 `/review/shadow-static-cache42.js` 的 `ShadowStaticCache42(kalajunV2)`，默认OFF，显式setEnabled(true)才运行。实际初始同相画面零差通过，但完整ABBA性能明确退化，已判No-go，不接入生产，不继续用第二扫描缓存包装该退化。

## 实际依据

`shadow-static-cpu42-abba.json`：保留遍历，只跳标准类draw时，影图CPU中位34.8/35.9→25.8/26.4ms，完整frozen CPU69.8/70.0→59.1/59.0ms；GPU11.14/11.18→10.83/10.82ms。每帧1207标准+654动态draw。标准类本身不是稳定静态的证明。

`shadow-depth-blit42-actual.json`：原4096/2048/2048，type1014/format1026/compareFunction518，实际shadow.camera.reversedDepth=true，不能沿用旧“非反向”假设。原生depth复制往返后4,096,000个RGBA分量0差、GL0，255→261→255资源恢复；restore-only CPU0.1/GPU1.541ms，roundtrip GPU10.488ms。没有读取原生depth逐bit，不作该声称。

`shadow-static-stability42-actual.json`：正常静止、真实flight WASD约1.03m、再停（不是physical walk）。mid/far静止实际投影416/417、200/201稳定；移动时5/10、2/7；停后38/38、20/20。实际渲染currentSourceObserved近乎0，环境due-scan跳过的旧_entries绝不能用作缓存命中。

## 限定实现

- 只缓存原中远两张2048，近4096保持原样。额外depth为32MiB；clone完整render target还含原color附件，其显存不包含在stats.bytes这个depth字段里。
- 从原运行中的SunShadowCasters构造器实例化专用当前扫描，保留原membership、geometry/index/attribute版本、material/alpha/displacement、instance、morph、transform失效契约。非合格源不做额外完整属性捕获，但仍原样动态绘制。扫描耗时明确计入lastSourceScanMs及整个shadow调用。
- 门dynamicDoor、非零morph、skinned、未知shadow前后hook及非标准projected depth全部动态。标准类发生变化即时原图回退；不保留旧影子。
- 投影变化当次原full一次，不copy、不双绘制；连续3个due投影稳定后才允许warm，每帧最多构建1级联。源变更同样先原full回退。
- warm原生绘制静态→复制缓存→原生clear后恢复→完整动态叠加。hits只恢复缓存并绘制全部动态。原receiver、PCF、图尺寸、实际反向深度比较以及scheduler时机保持。
- OFF释放缓存，dispose恢复shadowMap.render/renderBufferDirect/clear。异常自动dispose并完整原生回退；原源数据/网格不修改。

4项针对测试通过：近级联始终原样、完整静/动态深度叠加、移动miss不copy、所有指定源变更失效、异常释放并恢复hooks。不能替代实际浏览器验收。

## 实景收口

先held固定风/时间机位，原3CSM强制更新获得基线；开启候选后强制更新7–8次得到暖缓存，same-phase最终RGBA逐像素比较。再比较包含完整独立扫描的ABBA整帧/影图CPU、GPU；warm成本单独列出。最后真实位移、停后恢复、门/terrain morph、source变更与dispose验证。若不计额外扫描或仅固定机位收益，不能采用。


## 实际ABBA结论：No-go

证据：`docs/previews/v2-route-craft-38/shadow-static-cache42-abba.json`。A已dispose候选、无候选hook/扫描；B包含完整同源失效扫描及深度复制，始终完整正确影图。每组预热10、测30帧。

| 顺序 | shadow CPU median ms | frozen full CPU median ms | whole shadow GPU median ms | 额外源扫描均值 ms |
|---|---:|---:|---:|---:|
| A1 | 23.2 | 58.8 | 11.079 | 0 |
| B1 | 37.5 | 74.3 | 11.189 | 9.587 |
| B2 | 31.8 | 67.1 | 11.366 | 9.843 |
| A2 | 26.0 | 60.8 | 11.052 | 0 |

平均shadow CPU从24.6增加到34.65ms；完整frozen CPU从59.8增加到70.7ms。不能拿早先“只跳draw”的9–11ms上界宣称真实缓存收益。GPU无改善。B2 warm full峰值237.1ms也是额外构建代价，未隐藏进平均。每组纹理255→259→255，释放通过。

初始`shadow-static-cache42-initial.json`同相最终RGBA changed0/max0、10帧11hits/2builds、1053静态源、32MiB额外depth，只证明初始画面正确，不改变No-go性能结论。资源/hook已恢复，候选保持OFF。下一步若优化，只针对生产唯一SunShadowCasters自身已存在的矩阵传播/遍历/完整签名成本，不重复增加第二套扫描或把未观察的旧_entries当稳定源。
