# 第42轮地形加载补发候选（未接入）

此项只消除单 worker 的供给空档，不改变每次 terrain.update 最多 2 个 _finish、3ms CPU 工作预算，也不改变网格、LOD、队列优先级、父子激活与输出字段。仅显式 terrainRefill42=1 启用；默认原路径不变，不能记为已采用或帧率改善。

## 当前证据与实际限制

- terrain-row-worker-client.js 实际为单 Worker、limit=2。结果消息保存 workerPayload 后停止；下一次发任务依赖 terrain.update 的上传循环。
- terrain.js 保持 MAX_UPLOADS_PER_FRAME=2、BUILD_BUDGET_MS=3；window4 与初始化 yield 已有实际退化证据，本次不重新尝试。
- 已有完整离线包 1628 块、约 65.25MB 压缩 /264MB 原始，孤立 Chrome 流式解码约 1.50s。这不是网页完整冷启动证据；原148块近区包无足够实际命中，不能作为整个世界缓存。
- 1564个后续块至少需782次正常更新；100ms一帧时约78.2s。因而若每帧已有2块可用，补发无法缩短这个消费上限。它只在结果消息/较长块造成待料时有效。不可宣称可消除当前约78s长尾。

## 候选与集成边界

独立 TerrainWorkerRefill42 继承原 client；传入 queueProvider:()=>terrain.queue。禁止 limit 非2。原消息校验/生命周期先执行，然后只补发当前队列前4个有效job；最多2 pending，前缀已有4个结果时停止。没有预生成未知LOD子块，也不执行_finish。发布仍由原 terrain.update 完成。

相较原实现，消息任务可能额外执行原 terrainRowInput 与 postMessage structured clone，因此即使_finish预算不变，仍必须测量真实帧时；不能称主线程成本绝对不变。main 只接显式候选构造分支，原client只增加安全flag名。与 terrainWindow42=1 或 terrainPrepared42=1 同时出现时明确禁用refill并记录reason，不静默混合。完整离线包不接入。

取消/切区：provider读取当前队列，不捕获旧数组；已投递但失效的任务仍由原校验丢弃，不抢占正在算的单worker。旧pending最多2。错误、超时、dispose保留原释放与CPU fallback。原job缓存、partial、已建mesh等跳过。

## 针对验证

原client19项 + 新候选7项以及主入口风时钟/深度顺序回归，共38/38通过：结果到达无frame即可补发；前4有界；反序结果不越过队首；切区与dead晚到结果；fail/dispose；实际WorldTerrain.update四个ready仍只发布2个，单次finish超过3ms后停止；禁止limit4。原typed arrays直接接收，没有修改行生成公式或数据格式。

## 采用判据

同构建、同画布/机位/时间，分别记录first frame、queue0/morph0、p95/p99、computeMs，以及每帧readyPrefix/队首pending。需要区分“worker待料减少”与“消费上限始终饱和”。若默认队首不缺货或收益不足、帧时回退，不采用。refillStats附在 rowWorker.refill42 下。下一步只能在真实入口ABBA后决定，不能因单元测试通过宣布加载已改善。
