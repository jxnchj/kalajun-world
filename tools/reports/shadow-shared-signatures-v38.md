# V38 阴影签名候选：失败，已撤下生产接线

真实 Chrome 120 帧分项（`docs/previews/v2-route-craft-38/shadow-caster-phases-live.json`）显示matrix均值4.621ms、capture3.057ms、traversal3.456ms、lights0.020ms、membership0.031ms。不能把约10ms总负担全归为签名比较。

本次候选只尝试两项：geometry属性改用实时own-key for-in，省Object.keys临时数组；共享customDepth的标准投影shader资格每update只判定一次，禁止跨帧memo。保持相同属性布局/版本、矩阵、可见性、材质、几何和三阴影频率。默认关闭时原路径不变。

合成隔离场景（7007节点、778geometry、579terrain、84表面材质，跳过矩阵传播与frustum hooks）交替150次测量：baseline均值0.468254ms、中位0.465625ms；candidate均值0.489987ms、中位0.486417ms。虽然共享depth判定579次降至84次（495重用），额外for-in/WeakMap开销抵消收益，候选反慢约4.64%。不采用，不值得据此宣称优化真实帧率。

生产`shadowSharedSignatures38`分支及对应镜像测试已撤下，保留原已接受优化；原21项tracker测试全部通过。失败实现仅留在`tools/experiments/sun-shadow-shared-signatures-v38.mjs`，由`tools/probe_shadow_signatures_v38.mjs`独立引用复现实验，应用不会导入。测量原始JSON为`tools/reports/shadow-shared-signatures-v38.json`。

另排除“全skip时删除tracker矩阵传播”：这里skip=true表示该cascade本来就due必重画、无需签名，不表示不画；main使用withPreparedWorldMatrices跳过主render矩阵传播并明确依赖tracker已经更新。直接跳过会留下旧姿态，未实施。旧sceneMatrixCache没有净收益，本次没有重做。

下一步需要真实场景隔离CPU（同一准备完成场景短批次tracker.update、不提交render）与正常render帧对比，区别签名执行本身和GPU/调度竞争。当前没有充分证据支持继续泛化微调，因此停止这项试验，等待主线验收。此前已构建版本可能仍含默认off分支，下一次统一构建才覆盖源码撤除。
