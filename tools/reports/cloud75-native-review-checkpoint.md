# Cloud75 原生静态诊断检查点 — 配置已修复，默认 ON 待实景验收

基线 `81995554835581a9c3edbf2a47c94c68e175db18`；截至 2026-10-29 10:20 UTC 的源码检查点；原生已终止结果截至 10:04 UTC。此记录只支持**带已知失败的中间态源码同步**，不是默认采用、部署或第三阶段完成。数值与来源哈希见 [JSON 摘要](cloud75-native-review-checkpoint.json)。

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

## 最小配置修复：专项与构建通过，默认 ON 实景待验

三文件修复已落地：`environment.js`、`near-shadow-detail.js`、`near-shadow-local-contract75.test.js`。沿用原 `localShadowWindow42` 策略，ON 时将最近原生图保证为 4096，保持既有模式选择、级联数量/分割、其他图尺寸、远级联姿态与 bias；OFF 保留旧策略。低于所需 4096/4×MSAA 能力时明确早拒绝，不暗中关闭 owner 或接受尺寸钳制。仅对不同于 CSM 全局尺寸的图进行原有每图像素对齐。

- 实施相邻检查 **88/88** 通过；独立复核 **20/20** 及旧 HEAD **896 组 OFF 差分**通过。这些口径有重叠，不能相加当成全量数量。
- 当前修复较广专项 **379/379、零跳过**通过，耗时 40.39 秒；新 `dist-cloud75-contract-fix` 构建 **9.73 秒通过**。仍不是全量回归。
- 五组正式生成绑定闭包均未受影响，来源签名不变，无需重生；没有手改生成哈希。
- 默认原生近图从 2048 到 4096 的**理论 depth 最低增量为 48 MiB**，不是实测 VRAM、总附件内存或“必定装得下”的保证。

case07 已单独授权用新构建、不带 `localShadowWindow42` 或 `nearShadowDetail` 参数验默认 ON，保持 4 GiB 资源档位和原有限时，仍只取初始三帧。原生 HTTP 字节匹配新构建、1280×800/DPR1/HDR4× 预检已确认；10:19:22 UTC 导航，原外部期限 10:40:03 UTC。**本次检查点冻结于 10:20 UTC**，这些仅是来源/预检证据，后续运行结果另记。**当前终态待定，不能写 GPU 完成、held、默认画质通过或内存验收成功。** 前述 case05/06 均绑定修复前诊断构建，不改写其结果。

新修复尚未重跑全量；最近完整回归仍为之前 **1992/1993**，原地形准备预算失败保留。下一次周期同步可按当时事实保存中间态源码，不等同部署、默认实景已通过或第三阶段完成。
