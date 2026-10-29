# legacyRoomLazy 开口预取48：默认OFF，首次可见完整性仍未解决

## 已有证据与真实缺口

RoomViewSelection 首遇开口12m且在视锥/正面才选中，14m只保留此前选择。RoomBounceField.set 遇未完成的旧包或household场会令 uRoomFieldActive=0、绑定empty并开始异步加载。正常RAF仅对三房组模式变化调用目的地准备；木屋/毡房连续首次走近不会自动等待，所以可出现几何完整但GI尚缺的中间帧。已有启动/转场末态ready测试不能覆盖该首见时间窗。

历史文件 docs/previews/v2-route-craft-38/legacy-lazy-cold-{on1,on2,off1,off2}.json：首帧 ON 7245/10929ms，OFF 7017/7196ms；旧五包并行导入在OFF样本约13–55ms。这些样本没有证明可采用的首帧收益。household-startup-fixed和yurt-transition只证明已有await准备路径的完整末态，不证明任意冷态转向无缺GI。

## 本次最小候选

只在 legacyRoomLazy=1 时，对现有 RoomViewSelection.entries 的实际开口中心30m内数据预取，不要求开口朝向/视锥。没有修改12/14m照明选择，没有提前点亮或切换房间，没有冻结交互、没有增加prepareDestination门禁。household使用真实house_a基础依赖；新版guest独立场不盲取其不用的旧包。最多已有五个旧base房型，每房型一次投机尝试；失败可见且原实际选房loader仍可重试。ready包不重取，owner释放后不继续写统计。

改动 legacy-room-loader.js、settlements.js；新增 legacy-room-opening-prefetch48.test.js。定向9/9通过：原五表逐值一致、真实household启动、默认OFF、距离/背向预取、同房型去重、失败可重试、卸载、原12/14m选择不变。没有改 main、木材48或prepared manifest，没有浏览器或性能验收。

## 保留边界

30m只创造提前量，不能保证慢网或直接转头/跳入时数据齐全；household附加场与完整照明发布也未由这一步解决。候选继续OFF，生产保留原完整GI启动保障，不以暂停世界掩盖问题。未证明总体收益，不建议为这1.68MB旧包继续扩充调度框架或长ABBA。
