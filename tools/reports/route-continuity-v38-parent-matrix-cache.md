# 父组范围矩阵传播候选（默认关闭）

当前真实林溪7007节点：389非叶Scene/Group均为matrixAutoUpdate=true；6618叶中2660自动、3958手动。120帧扫描诊断均值matrix4.15ms/capture3.09ms/traversal3.00ms/lights.032ms；诊断含计时开销，不冒充正常帧性能。

入口 `?sceneMatrixCache=parents`，旧 `=1` 全树缓存保留，无参数仍不安装。运行时可通过 `debug.sceneMatrixCache.setEnabled(false/true)` 在同页对照。`stats.scope` 为 parents；eligible 为实际hook父数量，manualGuards 为直接手动子节点快照数。checks/reused/composed、childChecks/childChanges、guardCopies/customFallbacks均为累计计数。

只给原生Scene和非叶Group安装局部/世界更新hook，叶Mesh/实例/相机方法完全原生。父保留TRS/pivot/局部及世界矩阵精确检查；直接手动叶保留各16值local/world比较，捕获无needsUpdate直接写入。正常静态帧不复制manual快照、不扫描自动叶TRS，原生自动叶仍每帧更新。发生force、dirty、直接写入或新子节点后才重新采集所影响父的manual快照。手动非叶子树及自定义更新回调保守保留原force；不修改Three原型、不改任何更新标记配置。

资格随childadded/childremoved增删：空Group为原生叶，加入孩子后可成为候选；移除最后孩子恢复方法。重挂子树先恢复原方法，再重新登记。保留运行时外部替换方法，dispose不覆盖它们。叶手动matrix与matrixWorld均必须观察，仅看local16值会漏原生强制传播覆盖world直接写入的语义。

测试与原生逐项对照：自动/手动节点、直接local/world、pivot、dirty、显式updateMatrix/updateWorldMatrix、matrixAutoUpdate与matrixWorldAutoUpdate切换、动态门旋转、强制更新、关闭/重启、子树增删重挂、资格转换、相机逆矩阵和自定义force回调。另计数证明5个静态帧中两个手动叶原生10次matrix产品降为0，同时自动叶5次compose保留；这是工作量验证，不是耗时收益。

实际同条件浏览器画面/阴影/整帧及matrix分项AB尚待验收。不宣称林溪帧率瓶颈解决，不默认启用。无植被密度、模型、阴影或反射精度改动。
