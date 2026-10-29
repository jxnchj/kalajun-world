# 生态／地形矩阵算术42：No-go，保留OFF

已停止这一优化方向，不再添加复杂矩阵缓存。生产入口没有安装生态／地形候选；既有结构纯平移快路仍按原默认运行。新增allowAutoLeaves只在独立review候选显式开启。

## 已验证与实际限制

新范围确实命中：草坡初验terrain每次1424自动叶、ecology85、grass95；完整场景Float64矩阵逐值Object.is零差、最终画面零差。候选保持每次原生TRS compose、dirty与父矩阵传播，不修改matrixAutoUpdate。正确性通过不代表性能采用。

正常RAF证据：`docs/previews/v2-route-craft-38/owned-matrix42-forest-normal-abba.json`。

| 顺序 | 正常整帧均值 ms | 矩阵均值 ms |
|---|---:|---:|
| A | 84.65 | 7.66 |
| B | 80.76 | 7.29 |
| B | 104.03 | 13.90 |
| A | 109.93 | 13.86 |

存在明显时段漂移，且A阶段有另一agent约0.64秒轻离线活动。因此不能将表面整体约5%差值称为可靠净收益或采用依据。

更严格局部交错证据：`docs/previews/v2-route-craft-38/owned-matrix42-forest-isolated.json`。12个交错块只测矩阵传播：

- OFF：9.79 / 9.22 / 9.38 / 13.61 / 9.18 / 8.47 ms。
- ON：9.73 / 9.18 / 10.05 / 9.50 / 9.81 / 8.75 ms。

没有稳定局部收益；多数相邻差异很小或候选更慢，单个较大的OFF峰值不能当成优化成果。实际新范围虽命中，活变换检查、原生compose及分支成本抵消了减少乘法的收益。

## 保留状态

`/review/owned-matrix-arithmetic42.js` 与正常RAF helper仅作可复现诊断，默认OFF、不接main。原结构快路的auto叶选项仍默认false。候选与hook已由实景验收方dispose恢复；本结论不减少对象、密度、细节或任何更新语义。后续不重复本候选，也不扩为全scene矩阵cache。
