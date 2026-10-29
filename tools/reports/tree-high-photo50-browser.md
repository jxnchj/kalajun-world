# 高冠原生48m分组：同构建唯一页面验收

最终结论：**本轮不采用，候选保持 OFF，结束该路线的GPU扩测。** 无损几何/根/风的定向验证已通过；真实整帧只有0.5–0.7ms的小幅改善迹象、p95基本不变，第一组基线明显漂移，不能据此证明稳定净收益。原位冻结0差，实际候选加速飞行跨组完成；目的地冻结热切换失败，已精确复现为验收工具不满足既有共享风槽序约束，不修改生产架构来迁就工具。

## 条件与边界

构建为 `web/dist-v2/integrated50`，A不带候选参数、B只带 `treeHighPhoto48=1`，均 `view=river-forest&time=870&debug=1`，无profile，面板关闭，1280×800/DPR1。实际控制页始终是主线程原有 `1839973815`；子任务跨session接手被工具拒绝后，没有新开第二页，由主线程运行独立served helper，子任务读取落盘结果。主线程已确认全Chrome localhost517x库存只有该一个3D页；测试期间其他agents无重CPU/GPU作业。

原机位 `[-3611.851169467755,2329.157270885741,4805.483400316967]`，yaw `-29.88794104541604`、pitch `-10`。每组60稳定RAF后采180RAF，仅逐帧读时间、渲染frame计数、q/m、姿态与visibility，前后各一次完整snapshot。控制始终可用，姿态改变即整组无效。四组都valid、poseUnchanged、q0/m0、errors空。

HTTP默认cache及已有IDB在各次导航中保持同策略，**这不是设备冷启动测试**。三个验收脚本与HTTP字节一致，未进入生产bundle。证据存于 `docs/previews/v2-route-craft-38/tree-high-photo50-{a1,b1,b2,a2}.json`。

旧3780/3777场景曾在另一窗口保持visible并持续渲染，因此旧49 trace/单段GPU耗时不能当单世界成绩。相关报告已补限制。此次是关闭旧页后的有效单页面组；也不能将旧约110ms到现约38ms归因于此候选。

## 整帧与加载结果

| 组 | 候选 | mean ms | p95 ms | PMREM型事件 | firstFrame sync ms | awaitTail ms |
|---|---|---:|---:|---|---:|---:|
| A1 | OFF |52.7328|91.2|1：i33，+36 renders，58.4ms|550.8|0|
| B1 | ON |37.8244|50.0|1：i102，+34 renders，33.3ms|322.7|0|
| B2 | ON |37.6394|50.0|0|528.0|0|
| A2 | OFF |38.3289|50.1|0|277.6|0|

所有事件和尖峰都保留在原始样本与均值中。A1的6个30帧块均值为51.947/52.503/59.443/50.837/52.220/49.447ms，并非只被一个PMREM样本拉高。B1各块37.777/37.500/38.303/38.090/37.220/38.057ms，B2与其一致。后半B2→A2只有0.6894ms（1.80%）差异；B1相对A2只有0.5044ms（1.32%）。不能用两A平均45.5308对两B37.7319宣称可信17.13%提速。

各组 `firstFrameNewPrograms=[]`、color/depth/output `stalledProbes=0`。新增时序将首绘277.6–550.8ms明确归于同步工作，等待尾部均为0；这组不支持候选改善加载，也不支持把此次首绘长尾归于异步link等待。A1导航至首绘19.095s，后面三组13.525/13.760/13.247s，缓存/首次准备差异存在，不作为候选加载成绩。

## 密度、周期与实际工作量

四组地形完全相同：visibleTiles1237、resident1628、triangles2,850,048、minSpacing0.15625、maxDepth13。树活跃部件实例3213、实际风根1027不变；活跃批450→465，风上传21420→22980字节，增加1560字节，符合离线核算。最终snapshot的draw/tri受阴影和反射刷新相位影响，不能代替180帧平均。

只读核实 `environment.js:162–174`：elapsed距离上次环境probe超过30秒，或相机离上次probe位置超过900m，等待0.2秒后执行 `pmrem.fromScene(envScene,.04,.1,2000,{size:128})`；setTime也会触发一次0.12秒等待。当前Three的128尺寸生成包括6面×背景与scene=12次render、初始blur2次、9级GGX与copy双pass=18次，合计32次额外render；加正常2–4次得到+34～36。60+180RAF没有严格对齐30秒环境周期，故记录各组次数，绝不关闭PMREM来跑更好数字。B1有1次而B2无，均值仅差0.185ms，现有差异不能全部归因于周期事件。

离线原生分组计数、完整root/matrix/wind位级验证与资源退休详见 `photo-native-partition49.md`。它们证明保守剔除正确及几何提交减少，不是整体FPS完成证明。中层mode1更大的负担未解决；本候选只涉及mode5照片高冠，其他树干、内核、近针叶、草、建筑、光色均原样。

## 实际冻结与移动

原位已完成。同步执行96m重复基线→48m→96m恢复，每次更新environment receiver/caster/CSM并重画阴影与反射；finally解除短时hold，之后才上传证据。原位三项 `baselineRepeat/originalVsCandidate/originalReturn` 均为0像素差、maxChannel0。四次都reflection captured、mirror receiver1，3213部件/1027风根不变、errors空。实际PNG已查看，未见回退。证据为 `tree-high-photo50-original-pose-{original,candidate,restore}.{json,png}`。

随后在同一页面显式启用候选、rebuild/sync，使用原生drag与ShiftW进行正常flight输入。`tree-high-photo50-motion.json` 记录实际水平位移289.206m，从原位到 `[-3689.0795388471156,2311.836006170602,4526.779127051337]`，yaw `-15.487941045416033`、pitch `-8.400000000000006`；260条观察均candidate=true，跨48m格、转向/俯仰均改变、3332次renderer render，未timeout，目的地q0/m0/errors空。**这是Shift加速飞行，不是步行验收。** 目的地活跃根710/部件2205反映位置改变，不能与原位1027/3213相减后称降密度。

目的地同姿态冻结未通过：review helper在ON→OFF热切换后抛出 `Shared tree wind parts must retain identical active root order`。异常后主线程实际核实ready/q0/errors空、candidate=true、holdWas=false，正常控制已释放；没有将目的地截图或零差伪记为完成。安全回默认OFF使用正式URL重载，不再原位热切换。

## 移动后热切换失败的定向复现

只修改诊断测试，未修改生产源码或风缓冲约束。命令 `node --test --test-name-pattern='review-only hot switch' tools/experiments/tree-high-photo49.test.mjs`：1/1通过，总1991.66ms，测试本体844.82ms。这里的“通过”表示严格复现预期错误并确认边界，**不是**将浏览器失败记作通过。

使用真实hi/mid GLB与当前根生成，在实际289m起终点连线的26个位置分别推进固定OFF与固定ON实例，所有resident根、每根16个矩阵Float32位、5个风Float32位均一致，固定模式没有异常。随后只在移动后的ON实例热切OFF，精确触发同一异常：mode5、96m块 `-39,47` 的既存树干部件0（alpha0）保留swap-removal槽序；新建照片部件2（alpha约0.45）按source顺序写入，却重新加入树干的共享force buffer。两者9根集合相同，顺序不同：树干首根 `spruce:-306:381`，照片首根 `spruce:-312:378`。根风validator正确拒绝错误配对。恢复固定ON分区后，状态再次与固定OFF参考逐根精确相等。

因此，本次证据说明**验收脚本的任意热切换不受支持**，不证明固定URL候选在正常移动中坏掉；同时，也不能拿离线结果补称目的地浏览器像素验收通过。原位没有历史swap所以先前0差成立。保留该反例测试，两个热切换helper在源文件与served副本均已加明确立即拒绝，防止误用。后续同页ABBA辅助脚本尚未运行即退休，未生成/虚构额外性能结果。

原生重载ABBA与原位0差证据保留，但现有收益不足以支持默认采用。停止该小候选，不继续创建新调度/共享机制；主线转岸坡与草影。完整光色顺序不变，第三阶段未完成。
