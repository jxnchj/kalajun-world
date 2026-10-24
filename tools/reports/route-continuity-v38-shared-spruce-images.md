# v38 云杉共同图像无损传输候选

状态：父任务实际浏览器已确认完整林溪画面、errors[]、imageRequests/imageDecodes均3、hi/mid均shared且没有请求原包；已默认启用，`spruceSharedImages=0` 保留完整原路径对照。确定收益是传输字节减少18.58%；尚不声称冷启动总时长改善。

## 实际改变

保留原 `schrenk-spruce-hi.glb`、`schrenk-spruce-mid.glb` 编辑源及原交付路径。新 `shared-v38` 包仅把 GLB 中原始 PNG 字节移到外部共同文件，原网格、属性、索引、UV、节点、材质和采样器不变。两 LOD 中重复的树皮、冠片图像各请求/解码一次；针叶法线原图照常保留。没有重新编码或降分辨率。

原两个 gzip 包共 9,267,198 B；新两个网格 gzip + 三张原 PNG 共 7,545,533 B，净少 1,721,665 B（18.58%，不含 HTTP 头）。正常成功路径只加载新包，不同时加载原 GLB。图像解码次数 5 → 3。原始编辑文件未改。

原生 GLTFLoader 仍设置每个 Texture 的 sampler、UV、channel、colorSpace 和材质关联。仅对相同 bitmap 共享 Source，Texture 对象独立；GPU 能否减少上传应由浏览器实际验证。ImageBitmap 解码参数与 Three 原加载器一致：premultiplyAlpha=none，colorSpaceConversion=none。

## 失败与生命周期

新 PNG 或网格请求/验证失败时，相关 LOD 回退完整原 GLB，避免加载成功但无贴图。外部取消中止新请求，不自动重启原请求；解码晚返回的 bitmap 关闭。生态系统销毁时释放共同图像池，单个 LOD 不提前关闭另一 LOD 需要的图像。未启用、浏览器无 ImageBitmap、原源绑定发生变化时直接走原路径。候选不更改全局 Three Cache 或 Three 内核。

## 已验证与边界

`node --test web/src/v2/spruce-shared-images.test.js web/src/v2/ecology-loading.test.js web/src/v2/spruce-canopy-cache.test.js web/src/v2/spruce-textures.test.js web/src/v2/meadow-root-cache.test.js`：28 项通过。

真实 Three GLTFLoader 分别解析原包与新包，比较所有源几何属性/索引字节、节点变换、材质与 Texture 状态、canopySourceDigests，均一致。PNG 本身逐字节及 SHA 一致；Node 测试中的 ImageBitmap 解码为记录原 PNG 的测试替身，因此并不构成 GPU 像素验收。失败、取消和 late bitmap 释放均覆盖。

森林 root cache 源绑定仍匹配，无需重生成。草甸缓存因完整 ecology.js 绑定变化，已刷新绑定；二进制内容 SHA 仍为 `2389785391c959907dc4ef98212eb4aebb64cd199c3480e29eab46985d6e88da`，gzip SHA 仍为 `f8496dd98db4ecb2c0357ddcdf025fdb3a0bfd64893c5d5580f9b35e4833a6c6`。canopy 输入源和真实几何 digest 均不变，不需要重做针叶/冠片缓存。

## 浏览器验收要求

冻结同一相机、风时刻与阴影/反射状态，对比开关后画布；检查 hi/mid 实际 map/normalMap 的 UV、sampler、色彩空间及纹理缺失；确认网络成功路径不请求旧 hi/mid。查看 `ecology.spruceSharedImages` 的 imageRequests=3、imageDecodes=3、byLod 均 shared。同条件冷启动 A/B 比较总时间与 initialScene，不只以节约字节推断启动收益。静态源码测试不能证明这些浏览器结果。

## 默认采用与最新重生成验证

共享图像默认开启后的相关测试25项通过（shared-default-prepared-v38-tests.log）。成功路径测试不再显式传入开关，以检验默认行为；=0、ImageBitmap不支持、源变化、失败和取消继续保持完整回退/清理语义。

world38河谷源码稳定后实际重生成草甸111tiles/45486roots，二进制SHA保持上述值；显式valleyMeanders旁路缓存。house_a prepared包通过真实加载原源、整理、完整导出重生成，28模板/139936三角；对照原流程全部near/far几何属性与索引字节、材质图像、门角矩阵、碰撞三角精确一致，原house_a源不变。不是只改manifest哈希。结构绑定追踪新增lodge-opening.js实际依赖。森林缓存的后续维护交由close_shadow38，避免并发编辑。
