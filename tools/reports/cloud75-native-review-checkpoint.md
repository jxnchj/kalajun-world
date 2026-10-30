# Cloud75 原生静态诊断检查点 — 木屋默认 ON 与显式 OFF 均获三静帧验证

源码提交 `4e1d6f251ff979760f7020c4d940489cba091c36`；本次文档补记截至 2026-10-29 10:57 UTC 的终态证据。10:20 UTC 冻结并已同步的上一检查点当时仍为 case07 待定；以下不追改该历史状态。现在仅确认**指定木屋默认启动配置故障修复及同构建显式 OFF 回退，各初始三静帧**，不是全画质验收、部署或第三阶段完成。数值与来源哈希见 [JSON 摘要](cloud75-native-review-checkpoint.json)。

## 验证状态

- **修复前诊断版本的 192/192 受影响测试与构建通过**，用于 case05/06；这些不是新的全量回归，不作为配置修复的验证。另有下述新修复 379 项专项与构建结果。
- 最近完整回归仍为 **1992/1993，一项失败、零跳过**。原 `terrain.test.js` 的 2500 ms 准备预算与断言未修改；专项通过不覆盖这一未解决项。
- 新增的是只读故障快照与可见诊断文本导出，不改变默认开关、原几何/密度/渲染精度，也不增加原 10 次局部阴影预热上限。

## case04：默认局部草影路径失败

原默认 `localShadowWindow42` ON 路径在有限预热后报 `Local shadow loading preparation did not settle: captured`。世界帧完成/提交 **0/0**，准备 fence 完成 **11**。错误层后已出现木屋像素，但没有合格完成帧，不能记为场景通过；`captured` 是旧错误字符串中的原生提交状态，不能直接当作根因。

4 GiB 采样 RSS 上限和 4.5 GB 系统可用内存底线未触发；峰值采样 RSS 为 **3,532,908 KiB**。正常关闭后，已观测所属进程 remaining/unknown/signal failures 均为空。此清理结果不代表世界成功，不证明所有未观测分离进程不存在，也不把应用失败或短暂工具中断归因为 OOM。

## case05：仅显式 0 回退取得三静帧

使用 `localShadowWindow42=0`，保留原生级联阴影；`houseTextiles62=0`、`boardwalkContactIndex74=0`。机位 `pastoral-house_a-entry`，时间 870 分钟，1280×800/DPR1。实际 JSON 与最终原生截图共同记录：

| 项目 | 已确认值 |
|---|---|
| 调度器 | held，世界 GPU 完成/提交 3/3，准备 fence 2 |
| 模拟时间 | 0 秒；未追加运动或清队列帧 |
| 渲染目标 | RGBA16F、DEPTH_COMPONENT32F、4× MSAA、reversed-float32 |
| 姿态关联 | completed generation/view/pose/time/viewport 与当前快照一致 |
| 错误 | `errors=[]`，`preparing=false` |
| 地形 | queue/near queue/morph/worker pending 全部 0，worker ready |
| 生态 | **pending=43**；grass、wet contact、forest floor pending 为 0 |
| 水与室内准备 | water/doors/room-indirect 待办为 0 |

`WorldEcology.update` 的计数定义与其他零待办字段，将余下 43 项定位到远树瓦片队列；远树批次保持 `castShadow=false`。**这仍是未完成队列，不能改写为“全队列清空”或完整画质验收。** 本机位没有可见近水，局部反射未激活；准备包另有已记录 fallback，亦不以静帧成功抹除。

“显示诊断JSON”通过原生选择/复制和编辑器另存取得有效完整 JSON；浏览器文本的逐字节身份未独立证明。最终截图确实显示木屋与 held3/3，无错误层，属于包含浏览器/桌面 UI 的原生 JPEG，不是同机位 framebuffer PNG 差分。原始证据保留本地，不随源码同步。

峰值采样 RSS **3,522,668 KiB**，最低系统可用内存 **5,233,356,800 bytes**。09:44:11.572958 UTC 正常关闭完成：root rc0，remaining/unknown/signal failures 为空；最终原生窗口清单不再有本次浏览器或编辑器。该清理证明限于已观测所属进程。

## 比较边界与后续

case04 使用加入故障诊断前的构建，case05 使用新诊断构建；两者**不是同构建 ON/OFF 性能或因果对照**。case05 只建立明确 OFF 回退路径的三静帧证据，不能推断默认 ON 已修复、默认画质达标、帧率/加载收益或第三阶段完成。

## case06：同诊断构建 ON 定位到默认配置不匹配

case06 只将 case05 的 `localShadowWindow42=0` 改为 `1`，保留同诊断构建、机位、时间、完整精度与既定资源/超时限制。10 次预热的实际启动导出均记录：

- `lastFailure.phase=views`，错误 **`Original 4096 shadow required`**；
- 原生提交 ready，revision 恒为 **76**，原生 failures 为 0、changedCount 为 0；
- owner 始终为 null，beforeColor 为 no-owner；世界帧 **0/0**，准备 fence **11**。

因此原生捕获已成功，而局部 owner 在构建 views 时拒绝配置。屏幕仍有错误层；导出只含 `loadTimings` 与 `softwareReview75`，**不是完整 ready-world 快照**，没有 lastCompleted 或全队列证据。不能把它归因为 OOM、context loss、fence 超时或源 revision 不稳定。

源码对照进一步确认：`environment.js` 无参数采用 `nearShadowDetail=auto`；在已观测 32 采样器能力下，`near-shadow-detail.js` 自动选择 **2048 cascade**；但默认开启的局部草影 owner 在 `shadow-window-coverage42.js` 要求原生首图 **4096×4096**。这些互不兼容的默认条件在 `8ea4753` 已同时存在。**既定无 nearShadowDetail 参数入口不是漏填必要参数。** case06 直接证明 4096 拒绝与 owner=null；自动选择的解释来自源码，并由 case05 同构建能力/级联快照佐证。

case06 峰值采样 RSS **3,457,032 KiB**，最低系统可用内存 **5,300,285,440 bytes**。10:04:16.392461 UTC 正常关闭，root rc0、remaining/unknown/signal failures 均为空；实际启动 JSON 为 32,594 bytes，来源哈希保存在摘要。关闭证明仍限于已观测所属进程。

## 最小配置修复：专项、构建与限定木屋启动验证通过

三文件修复已落地：`environment.js`、`near-shadow-detail.js`、`near-shadow-local-contract75.test.js`。沿用原 `localShadowWindow42` 策略，ON 时将最近原生图保证为 4096，保持既有模式选择、级联数量/分割、其他图尺寸、远级联姿态与 bias；OFF 保留旧策略。低于所需 4096/4×MSAA 能力时明确早拒绝，不暗中关闭 owner 或接受尺寸钳制。仅对不同于 CSM 全局尺寸的图进行原有每图像素对齐。

- 实施相邻检查 **88/88** 通过；独立复核 **20/20** 及旧 HEAD **896 组 OFF 差分**通过。这些口径有重叠，不能相加当成全量数量。
- 当前修复较广专项 **379/379、零跳过**通过，耗时 40.39 秒；新 `dist-cloud75-contract-fix` 构建 **9.73 秒通过**。仍不是全量回归。
- 五组正式生成绑定闭包均未受影响，来源签名不变，无需重生；没有手改生成哈希。
- 默认原生近图从 2048 到 4096 的**理论 depth 最低增量为 48 MiB**，不是实测 VRAM、总附件内存或“必定装得下”的保证。

## case07：无局部/近级联覆盖参数的默认启动取得三静帧

使用新配置修复构建，URL **不带 `localShadowWindow42` 或 `nearShadowDetail` 参数**；保留 `houseTextiles62=0`、`boardwalkContactIndex74=0`，机位 `pastoral-house_a-entry`、时间 870。原生 HTTP 字节匹配构建，1280×800/DPR1 与 HDR4× 预检通过；10:19:22 UTC 导航，仍按原 4 GiB 档位、watchdog/fence/外部期限运行，未补运动或额外清队列帧。

实际保存 JSON、最终原生图与已终止报告共同确认：

| 项目 | 已确认值 |
|---|---|
| 世界绘制 | held，GPU 完成/提交 **3/3**，模拟推进 0 秒，准备 fence **5** |
| 帧关联 | lastCompleted 的 generation/view/pose/time/query/viewport 与当前快照匹配 |
| 渲染目标 | 1280×800/DPR1，RGBA16F、DEPTH_COMPONENT32F、4× MSAA、reversed-float32 |
| 默认近阴影 | auto→cascade，四图 **4096/2048/2048/2048**，分割 **20/60/180/500** |
| 局部草影 | enabled/ready 为 true，三次局部原生准备 pass，最终 owner ready/viewsReady |
| 最终准备诊断 | native/owner revision **94** 一致，controller failures 0；beforeColor ready=true、valid=null、uniform=1、calls=23、triangles=148674 |
| 世界状态 | ready=true、preparing=false、errors=[]；terrain queue/near queue/morph/worker pending 均 0，worker ready |
| 未完成项 | **ecology.pending=43**，不是全队列清空 |

`valid=null` 是 `ShadowWindowCoverage42.valid()` 的**无失效原因**约定，由 `captureDrawState70()` 原样记录，不是 boolean true，也不是缺失检测。上述 owner/controller/beforeColor/revision 值来自**保留的最后准备 pass**，不能冒称每个最终完成帧的新采样；早期准备 pass 曾未 ready。局部准备 pass 3、准备 fence 5、完成世界帧 3 是三种不同计数。三个世界绘制仍为原初始 main draw 加两次原 world/reflection 路径，不把准备绘制混入。

余下 43 项仍按生态计数定义与其他零待办字段归于远树瓦片；`castShadow=false` 不会让这些未完成工作消失。实际快照还保留溪岸准备 fallback；本机位不是户外完整草影、动态自然风或近水反射验收。最终图亲核有木屋、held3/3 和预热 fence5，无错误层；它是包含浏览器 UI 的原生 JPEG，**不是 framebuffer PNG 像素差分或整屋最终美术通过**。有效完整 JSON 通过可见原生选择/复制/编辑器另存取得，浏览器文本逐字节身份仍未独立证明。

峰值采样所属进程 RSS **3,606,688 KiB**，最低系统可用内存 **5,078,380,544 bytes**，本次没有触发 RSS/内存底线。**10:36:23.415157 UTC** 正常关闭完成，root rc0、remaining/unknown/signal failures 均为空；最终原生清单中本次浏览器和编辑器均消失。只覆盖已观测所属进程；采样 RSS 不是实测 VRAM、硬上限、ON/OFF 内存差值或通用容量保证。

因此 case04/06 的默认配置拒绝现在是**修复前失败历史**，case07 验证该木屋缺省入口能完成初始三帧，不再把此配置故障写作当前未修复。case05 仍仅是旧诊断构建 OFF 回退证据；随后完成的修复后同构建显式 0 回退见 case08；不将旧构建 case05 替换成这一新对照。

## case08：同构建、同姿态显式 0 回退取得三静帧

使用与 case07 **逐字节相同的 HTML 与 bundle**，URL 仅追加 `localShadowWindow42=0`。实际两份 JSON 核对 view/position/yaw/pitch/time/viewport/generation 相同，渲染 backend、RGBA16F/Float32 深度/4× MSAA 一致；各自 lastCompleted 亦与本次快照匹配。原生最终图亲核有同木屋与 held3/3、准备 fence2，无错误层。

| 项目 | case07 默认 ON | case08 显式 OFF |
|---|---|---|
| 世界 GPU 完成/提交 | 3/3，held | 3/3，held |
| 准备 fence | 5 | 2 |
| 原生级联尺寸 | 4096/2048/2048/2048 | 2048/2048/2048/2048 |
| 局部窗口 | enabled/ready=true | enabled/ready=false，idle、preparations=0、last=null |
| 级联分割 | 20/60/180/500 | 20/60/180/500 |
| 地形 queue/near queue/morph/worker pending | 0 | 0 |
| ecology.pending | **43** | **43** |
| 错误与模拟推进 | errors=[]，0 秒 | errors=[]，0 秒 |

OFF 保留原生级联阴影，观测到原 2048×4 策略与零局部准备；没有为回退额外提交运动或清队列帧。两条入口均取得限定木屋启动证据，**不是画面逐像素等价、户外/动态草影或全画质验收**。两张原生 JPEG 的浏览器窗口位置不同；不把墙钟耗时、准备 fence、frameTarget.frames、draw 数或采样 RSS 差值当成 FPS、加载、显存收益。案例顺序不是正常加载 ABBA。

case08 峰值采样所属进程 RSS **3,529,996 KiB**，最低系统可用内存 **5,196,709,888 bytes**，无资源 guard 触发。**10:56:25.932899 UTC** 正常关闭完成，root rc0，remaining/unknown/signal failures 均为空；原生清单中本次浏览器和编辑器消失。清理范围及 RSS 采样限制与 case07 相同。实际完整 JSON 为 116,620 bytes，证据哈希见摘要；原始下载、图片、profile 与日志仍只保留本地。

## 地形临时数组/拷贝候选：实测不采纳

独立 staging 候选通过 **5 类固定输入字节等价**，但 **16 样本、4 组固定工作 ABBA** 仅 1 组较快，没有稳定收益。原 **2500 ms** 用例 A/B/B/A 四次均在首个 ready 断言失败；其中一次队列临时为 0 仍有 morph，不能替代完整 ready。生产 terrain、原测试、prepared/GI 绑定均未改，也未为拒绝候选执行再生成。此 CPU 对照不是新全量通过，既有失败仍保留。详见 [拒绝候选记录](terrain75-copy-candidate-evaluation.md) 与 [数值摘要](terrain75-copy-candidate-evaluation.json)。

新修复尚未重跑全量；最近完整回归仍为之前 **1992/1993**，原地形准备预算失败保留。379/379 较广专项和构建通过不覆盖这一项。动态/户外草影、完整队列、全画质、正常加载 ABBA 与实时性能、第三阶段仍待各自验收。下一步织物仅限忽略目录内的一轮几何可行性验证，未生产采用、未做 AO/GI 再生成或取得验收结果。本次仅本地补记新证据，留待下一次周期同步，不立即重复 push。
