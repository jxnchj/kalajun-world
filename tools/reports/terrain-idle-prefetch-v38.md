# 资产窗口内远地形空闲续建候选

默认关闭，`farTerrainIdle38=1` 开启。尚无浏览器提速或采用结论。目标为首帧后的远地形139–201排队长尾，不声称解决生态准备4.6–5.1秒。

仅增加 terrain-idle-prefetch.js 与 main 窄接线，不改 terrain/world/hydrology/material、全局 yield 或LOD/顶点。现有 near prepare 返回 nearReady 且 generation仍相同时，资产与地形纹理 join 尚未结束才利用 requestIdleCallback。无原生可取消 idle API 时不抢前台，状态明确为idle-unavailable。没有timeout强制触发的idle任务。

每片依据真实 deadline.timeRemaining，至少1ms才工作，传入既有 prepareView(waitFor=all,maxMs=min(4,remaining))；这是协作预算，不是能抢占同步_plan/_buildRow的4ms硬上限，workMs记录实际耗时。maxMs总窗口6000ms。几何创建、顺序、原顶点字段、地形保护与原调度全部复用；没有低LOD替代或拆出第二套地形。

资产成功/失败、换目的地、预算到期取消等待idle；只在自有slice运行时取消terrain准备。main finally等待取消后退出，不等待远景all完成；已停止pump的迟到asset回调不能取消新正式准备。near失败或slice失败由stats.error交main处理，没有未观察的后台拒绝。near预算未达到nearReady不启动远景。

统计位于现有 `kalajunLoading.getSnapshot().farTerrainIdle`：enabled、slices、workMs、reason、last、error。reason区分disabled/idle-unavailable/near-not-ready/assets-settled/asset-error/destination/budget/ready/error。原terrainPrefetch与initialScene分段保留。

11/11候选生命周期与原yield测试通过；另3/3真实WorldTerrain源高度/法线/UV/绕序、准备完成/预算、换目的地取消隔离回归通过。日志 terrain-idle-prefetch-tests.log 与 terrain-idle-original-scheduler-tests.log。尚未build，未重生无关资产。

主线验收须同时比较：首帧提交时刻、资源/生态阶段、首帧queued与nearQueued、自然队列及morph归零时刻、实际画面与全部几何数量。不将I/O重叠时间当作纯空闲；若资源回调被拖慢或首帧退化则不采用。

## 主线同条件浏览器结论：不采用

固定5174、1280×800/DPR1、river-forest/time870、同一构建、浏览器缓存禁用；未清OS文件缓存，测量期间无Blender/build重任务。四组off/on/off/on首帧为12.7621/11.8600/12.5030/12.4080秒。两次开启只获7/10个idle片，实际36.6/53.6ms工作；首次队列195/190/195/193，并非稳定的整体加载收益。

从导航计60秒的自然采样（最近250ms采样点）resident tiles为886/966/887/889，queued为142/178/141/139。队列随父块细分派生子块并非单调，因此不能把瞬时queued大小直接当完成比例。第二开启与第二关闭几乎相同，不据第一开启单次较快声称稳定提速。只有on1持续观察到187.132秒自然q0/m0，其他组在较早时刻结束记录；不能捏造四组完整尾部比较。默认保持OFF，结束此候选，不把仅几十毫秒重叠当长尾已解。

四组完整加载阶段与自然时间序列：docs/previews/v2-route-craft-38/terrain-idle-{off1,on1,off2,on2}-natural.json。全部errors空；没有强制prepareView来提前结束自然尾部。测量后浏览器缓存恢复。
