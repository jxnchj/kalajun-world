# 同帧结构矩阵复用：净成本失败，未接入

检查发现 structures.update 与随后环境 tracker 的 scene.updateMatrixWorld 会在一个同步帧中两次传播结构组。候选仅在已采用 arithmetic41 的原生、手动矩阵、无子节点、有限纯平移叶资格内尝试复用；逐值检查当前局部平移、父平移及全部世界矩阵，任何变化回退原运算，单次同步 scope 结束和异常均清空有效期。没有跨帧复用或省略外部修改观察。

20 类矩阵/层级变更回归通过。实际木屋、门扇与公共楼流式内装，47 batches、20 个新增流式批次，所有节点 local/world/flags 逐值对照通过；13 个 scope 复用 547 次。测试先统一选择初态，避免首次切换视点的统计和已准备状态混比。

但 4000 个全部具备复用资格的手动平移叶微基准，两个传播/同步帧，ABBA 原路径 0.205/0.164 ms，候选 0.498/0.495 ms。精确快照及检查的成本超过 arithmetic41 已经简化后的矩阵赋值。它不能因复用计数较高而宣称收益。

已撤销本次 arithmetic41 生产接点，不改 main、不继续浏览器接入。实现与测试移至 tools/experiments/structure-{matrix-same-frame42,same-frame42,same-frame42.test,same-frame42-world.test}.mjs；复现工具 tools/benchmark-structure-same-frame42.mjs，原始数值 structure-same-frame42.json。原生产与隔离实验共 8 项验证通过。无需用户决策，按失败方案不接入的既定要求结束此路线。
