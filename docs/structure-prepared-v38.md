# 第 38 轮：完整木屋离线预处理候选

状态：`structurePrepared=1` opt-in，默认关闭；实际浏览器冷启动/门扇/室内材质验收待主任务完成。不是建筑空间流式加载，也不代表整体加载长尾已经解决。

## 实际范围与原始成本

原始 house_a_lived.glb 为 11,122,824 B，267 个 mesh、269 个 node、21 个材质、39 张嵌入图像（3,576,518 B）。其他完整资产 yurt_lived 为 7,935,268 B，gh_lanchuan_rooms 为 13,427,892 B。当前 structures 在 ready 前并行加载完整资产，然后创建所有建筑与内部物件；本切片保留该就绪顺序，只把 house_a 中反复进行的静态准备搬到离线。

新派生 GLB 为 11,712,456 B，gzip 为 6,025,046 B。增加的是已经存在的远级几何和预处理元数据；全细节近级与原运行时逐字节一致，没有减少树草、建筑或室内细节。运行时只请求派生包，不同时请求原 house_a；其他资产仍走原路径。

Node 真实来源（图片解码使用 Node stub，不能代替浏览器）一次对照：原 house_a prepare 97.79 ms，派生 prepare 1.26 ms；原 load/parse 41.04 ms，派生 load/parse 49.62 ms。这个小切片只证明移走重复 merge/split/AO/远级生成工作；不能把这组数据当作浏览器 4 秒建筑加载全部消失。

## 保留的结构与生命周期

- 离线调用现有 WorldStructures 原准备代码，执行接受的圆木连续法线/AO、门槛石挪移、角色拆分、完整几何 merge 和既有 distantShell。原 Blend/GLB 不覆盖。
- 28 个完整模板、139,936 个静态三角形；原门 hinge 的层级/变换/几何以原 GLB 数据保留，仍由 WorldDoors.captureAsset/place 注册，不静态烘死门扇。
- 原所有材质 JSON、纹理图像字节、采样方式和 UV 保留。运行时仍用正常 _material 注册，因此室内 GI、assetAO、深度阴影材质、光照注册沿用原接口。
- 完整结构与门加载完成后才 ready；后续 householdLiving、门槛阶、WorldCollision 与原主流程相同。没有进入房间才突然补家具的路径。
- 运行时几何所有权明确转移；原 source 与 prepared 集合不重叠。加载失败及晚到 dispose 不留下可见空壳。

## 来源绑定与失效

`web/structure-prepared-binding.js` 对实际 structures/doors/门槛石/资产选择/assetAO/timber 代码及 Three.js GLTFLoader、merge 工具和 meshopt simplifier 绑定 SHA，并绑定原 house_a GLB SHA。Vite build 与 dev 热更新均使用当前来源。

候选只允许 house_a 全体、WorldDoors 可用、默认资产目录且 timberContinuity 未关闭。来源或算法变动时记录明确 fallback，加载完整原 GLB；不使用过期几何。匹配来源后派生包缺失、hash/大小不符、模板缺失或 GLB 解码失败，明确失败，不呈现无家具空壳。HTTP 原始 gzip 与透明解码后的 GLB 都分别校验大小和 SHA；解压后再次验证 raw。

原 GLB SHA：`9601b06e6717a2de3778d71c7983291555000b62786dfd62ec6e559a3cb0c6a2`。新派生包与完整来源清单在 `web/public/data/v2/structure-prepared-38.json`。生成脚本 `tools/build-structure-prepared-v38.mjs`；精确 GLB 打包器 `tools/pack-structure-prepared-v38.mjs`。

## 已完成验证与待验

`node --test web/src/v2/structure-prepared.test.js`：7/7。

真实资产逐项验证：近/远几何所有 attribute 与 index 字节、类型和规范化标志；角色/名字/三角形/边界；PBR 值及法线贴图方向、全部纹理 UV/采样状态；原嵌入图像字节；原门初始矩阵和 0/.52/1.05/1.75 弧度矩阵；完整碰撞数组；门槛石位移记录；资源只释放一次；透明 HTTP 解码；过期来源完整回退；损坏/缺失显式失败；加载中销毁。

待实际浏览器同条件验：冷启动总长尾和 structures 分项，茶屋/山坡木屋室内家具/材质/GI，开关门和步行碰撞；若无净收益，保持 off。后续只有首个完整切片成立才推广 yurt/客房，不提前建立室内异步拆包平台。
