# 建筑投影列表候选：只读微基准无收益，未接入

2026-10-24。主线在真实林溪当前场景运行只读ABBA遍历小基准，证据 `docs/previews/v2-route-craft-38/structure-shadow-list-probe.json`。未提交render、未运行完整GPU对照，也没有可用CDP CPU Profiler采样（当前接口method not found）。

候选只复用建筑update已有castShadow决定，对已知非投影叶节点先做live guard；未知child、living/entry组、外部改成castShadow=true仍走原递归，避免漏掉合法外部修改。原扫描已在castShadow处短路，理论上主要只省visit调用和少量布尔判断。

实际visited由7174减至3665，1737个候选对象身份完全相同，但baseline中位0.100ms/均值0.104125ms，guard中位0.110ms/均值0.111625ms。平均反慢约7.2%，且尚未计入建筑update维护Set的额外成本。少访问节点不等于更快，因此不继续构建、完整测试或GPU验收，也不继续微调。

本次临时写入sun-shadow-casters.js和structures.js的默认关闭接点已精准删除，未回滚其他公共楼分包/默认加载闸工作。源码不存在structureShadowList38接线；仅保留本报告和真实只读probe证据。未采用，不作为帧率改善记录。
