# 林溪阴影隔离诊断（未采用优化）

同一1280×800/DPR1、time870、固定林溪机位、q0，冻结风/相机，保持源材质、全部几何。诊断结束均恢复完整影图；生产未过滤物件、未缩影图。

分段GPU query给出standard约7.33ms，但分段总影图约21.5ms，明显高于原粗粒度计时，存在计时扰动，不作为可缓存收益依据。

单query在正常renderer.render内部包完整三CSM shadow调用（Three不能在render外直接调用shadowMap.render，其currentRenderState为空；这一失败尝试无有效测量）。完整模式通常10.8–11.2ms，存在15–22ms波动；standard两组中位1.968/1.703ms，animated10.743/10.365ms，empty清理0.679/0.639ms。提交数full1855=standard1207+animated648。类别独立缺少彼此遮挡，不能把时间相加，也不能将差值直接承诺为缓存收益。静态缓存暂不实施。

低覆盖下界诊断第一份shadow-static39-low-coverage-isolation.json **无效**：renderer.setViewport并未被影图内部调用，viewportCalls全0，不用于结论。改为实际GL viewport拦截后，小视口每帧确实3次，保原attachments、完整顶点和原shader；有效shadow-static39-low-coverage-gl-isolation.json的一组低覆盖9.293ms、相邻完整11.036ms，另一组均受20ms级波动影响。只能认为顶点/primitive工作值得继续调查，不能定量保证收益。视口缩小只发生在诊断，已恢复；不采用降分辨率。

下一候选先研究固定针叶局部形体GPU共享，保原风/实例/细节；未接入，额外内存、带宽和首次加载均需同条件验证。实际JSON均在docs/previews/v2-route-craft-38/。
