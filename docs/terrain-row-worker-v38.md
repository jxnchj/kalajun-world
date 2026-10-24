# 第38批：同源地形行计算 Worker

2026-10-24。本文记录浏览器证据；源码已默认采用，最终统一构建及无参数入口复验待做；本次没有降低地形精度、植被密度或阴影/反射质量，也不代表稳态 GPU 帧率已改善。

## 实现范围与等价约束

`terrain-row-kernel.js` 直接复用 `WorldTerrain._job/_buildRow` 和同源世界输入，不另写一套近似高度或颜色算法。Worker 只计算 CPU 数组，主线程仍按原队首安装，每帧至多 2 次上传，兄弟块齐全前保留父块。最多 2 个待完成任务；原缓存命中及已开始的 CPU 行计算不转移给 Worker。主线程输入使用结构化复制，结果 ArrayBuffer 转移而非再次复制。

`terrainWorker38=1` 是本轮验收入口，源码现由 `terrainRowWorkerPolicy` 默认启用，`=0` 保留原 CPU 路径；未知或未核验地表实验参数走原 CPU，防止主线程/Worker 模块常量不一致。最终统一构建及无参数入口复验仍待做，不能把源码默认变更等同于最终浏览器通过。

## 同构建、禁浏览器缓存、原机位自然加载

证据目录：`docs/previews/v2-route-craft-38/`。四次均为 river-forest、1280×800、时间 870、同相机，正常渲染期间观察队列自然清空，没有用强制同步 prepare 代替尾部。表中完整完成使用 `naturalTail.doneAt`（持续清空确认），首帧使用 `navigationToFirstFrameSubmittedMs`。队列首次清空与确认之间约 0.9–1.0 秒，两个组一致保留确认条件。

| 运行 / JSON | 导航至首帧提交（秒） | 首次 q0/m0（秒） | 完整尾部确认（秒） | 最终驻留块 |
|---|---:|---:|---:|---:|
| terrain-worker-off1 | 12.3617 | 171.3434 | 172.3671 | 1628 |
| terrain-worker-on1 | 11.4906 | 48.0127 | 49.0177 | 1628 |
| terrain-worker-off2 | 11.5014 | 168.7562 | 169.7195 | 1628 |
| terrain-worker-on2 | 11.5814 | 43.5108 | 44.4353 | 1628 |

完整确认均值从 171.0433 秒到 46.7265 秒，减少 72.68%（3.66 倍）。首帧均值 11.93155→11.5360 秒；尤其第二对 11.5014→11.5814 秒没有首帧收益，不能把尾部改善表述为首屏快了 3.66 倍。四次最终 q0、m0、应用 errors=[]。这证明后台计算明显缩短本机自然细化尾部，不是 GPU pass 加速结论。

## 完整数组与切场景

`terrain-worker-all-geometry-exact.json`：实际浏览器在相同相机构造原 CPU oracle，1628/1628 块、19920 个数组、269610928 字节逐字节比较，差异数 0。此 oracle 仅用于核对最终数据，不计入前述自然尾部计时。原五种真实地形、20 子块核对另见 `tools/verify-terrain-row-kernel-v38.mjs`。

`terrain-worker-west-entry.json` / `terrain-worker-west-complete.json` 验证跨西坡场景；最终 q0/m0、Worker pending0/readytrue、累计完成1708、errors=[]，不是只在启动机位运行。

客户端及默认策略定向 10/10（原客户端9项，加策略回归；原日志仍记录9项）（`tools/reports/terrain-row-worker-client-v38.log`）覆盖：乱序结果仍由实际 WorldTerrain 队首安装、2 uploads/frame、缓存跳过、失效节点/替换任务结果丢弃、错误与超时退回原 CPU、真实 ArrayBuffer 转移、dispose 与迟到响应。初始化与单个 job 均有 watchdog，失败会终止 Worker、清空 pending 标记，让原 CPU 完成原任务，不能吞错后留空块。

`terrain-worker-terminated-recovered-dining.json/png`：主线实际 terminate Worker 后切入餐厅，watchdog 捕获 job1709 timeout，pending0/readyfalse，恢复原 CPU；最终 q0/m0、应用 errors=[]，完整餐厅及新 GI 正常。没有关闭候选后重载来绕过故障。

## 内存与边界

实测复制的输入 typed arrays 为 58,720,256 字节（core/far Float32 高度、detail Uint8、两张 RGBA 地类），Worker 自有样本缓存 7,405,568 字节，合计至少额外 **66,125,824 字节（约63.06MiB）**，未计 JS 对象、索引、消息与分配器开销。缓存保持到 dispose，不宣称闲置即释放。计算结果转移后 Worker 不保留其 buffer，但主线程最终几何仍按原方案占用内存。

此项处理加载尾部和主线程行计算竞争；林溪稳态绘制/GPU、整体光照色彩专项及剩余场景美术仍需按原计划推进。

## 来源汇合后真实派生重建清单（仅审计，本文未执行）

工作目录为项目根。先等 `world-data.js`、`ecology.js`、`terrain.js` 以及后续 `hydrology.js` 稳定；保存旧产物后执行一次，禁止只替换源 hash。

| 派生物 | 本轮触发依据 | 命令 |
|---|---|---|
| 草甸根缓存 | meadow-root-binding 的真实递归来源含 ecology/world-data/hydrology/terrain-shadow-domain；terrain.js 本身不在该列表 | `node tools/build-meadow-root-cache-v38.mjs` |
| 55根近看参考 | export-meadow-patch 显式绑定 ecology，且实际高度由世界计算 | `node tools/export-meadow-patch-v38.mjs` |
| 远距草甸参考 | 显式绑定 ecology/terrain/terrain-material/meadow-surface/grass-root-field | `node tools/export-meadow-distance-baseline-v38.mjs` |
| 林缘根缓存 | forest-root-binding 显式绑定 world-data/hydrology；此次 world-data 已变化，后续 hydrology 合并后一次再生 | `node tools/build-forest-root-cache-v38.mjs` |
| 室外四家族 GI | recipe 显式绑定 world-data/terrain/hydrology；需新独立 recipe 后真正采样 | 下列两步 |
| 建筑 prepared | 显式列表没有本轮 world-data/terrain/ecology/hydrology；仅这些改动不触发 | 不重复生成；若 structures 等列内文件另改，才 `node tools/build-structure-prepared-v38.mjs` |

四家族流程：读取现 `tools/reports/room-exterior-terrain-v38.json`，取其 `sources` 的 JSON.stringify 后 SHA256 前12位作为旧绑定 key。保留已有 backup/candidate，不覆盖历史。导出新的独立候选到工具约定路径：

```sh
node tools/export-room-exterior-terrain-v38.mjs './backups/route-continuity-v38/exterior-rebind-<旧绑定key>/room-exterior-terrain-candidate.json'
node tools/rebake-room-exterior-adopted-v38.mjs
```

后者真实运行 terrain、aperture、ground、ground-bounce 四家族采样并保留旧数据；**不运行** `verify-room-exterior-rebinding-v38.mjs` 做 hash-only 更新。新 Worker 与 terrain 循环引用引入本身不等于物理地貌改变，但严格源绑定仍需用真实输出复核。检查根数/身份/未受影响字节，运行 meadow-root-cache（含actual）、meadow-patch-reference、meadow-distance-canopy、forest-root-cache 及四个 room-exterior 定向测试；完整室内家具三门态源未变，不因此重烘整楼室内 GI。

## 实景追加：主动准备不饿死后台消息

统一构建后route3侧面完整prepareView实景暴露调度问题：60秒预算耗尽，1396800次循环，尚余275块/15近块；退出主动准备后自然队列可以完成，非Worker算法错误。只在队首workerPending时改用实际setTimeout事件轮让出，避免scheduler.yield提升后的续任务反复占用队列。原CPU计算、队列排序、上传限额和LOD不变；真实相同侧面机位修复后1.7257秒、113次迭代、q0/m0；该值是主动准备，不是新的冷启动对照。上方冷启动AB数据仍保留原测量口径。

24/24客户端及地形定向回归通过，包含有优先续任务时异步结果与错误送达。修复后构建通过；最终源绑定室外GI还需在采用冻结点再次真实再生，前一次完整1329项在这处追加修复之前。
