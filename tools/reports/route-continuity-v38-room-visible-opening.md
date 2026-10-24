# v38 门槛外可见室内的 GI 选择修复

已确认原问题影响实际画面：牧居跨出 floor bounds 后 `setRoom(null)` 触发 RoomIndirectLight.clear，uRoomAmbientActive、bounce field 和 contact 被关闭；客房跨出 floor bounds 还会撤掉其三盏既有灯具。不是诊断统计滞后。

修改只位于 `settlements.js`、新增 `room-view-selection.js` 和对应测试。未修改 main、structures 的 prepared 绑定、全局曝光/光照或室内 shader 体积边界。备份在 `backups/route-continuity-v38/room-visible-opening/`。

选择策略：
- 原有占用房间始终最高优先级，客房交互开关仍只针对真实占用房间。
- 摄像机在外侧时，从真实门、窗、毡房顶孔中选近距可见开口对应的一间房。开口必须面向观察者、其保守包围球与实际 camera frustum 相交；首次选择半径 12m，原房间保持半径 14m，分数 20% 滞回降低邻房边界来回切换。
- 对 floor inset 到 opening plane 的墙体厚度保留 0.26 local m 的窄衔接范围，避免“仍在门洞内却已经不算室内”的断档。世界单位按建筑缩放。
- 保留该房间原有 worldToLocal / bounds / field / contact 与门开启率、实际门角度。邻房不会套用该房间体积；切换房间时按完整独立 entity id 绑定。
- 客房外看室内仍使用其原有三个灯具、原有功率与独立 on/off 状态；不添加新灯，不改变自动亮度规则。牧居延续原有 portal pool。

诊断：`settlements.lightingRoom` 是当前照明房间，`activeGuestRoom` 仍为真实占用客房；快照 `roomSkyBounce.viewSelection` 包含 roomId/reason/visibleRooms/openingKind/distance。

针对验收路径：木屋门中心 local x=1、y=1.5，z 从 2.29 依次跨过 2.31/2.49/2.51 到门廊 3.6/4.5，始终看向 local [1,1.4,-1]；岚川第一客房 x=2.7，z 从 3.2 到 3.26/3.39/3.41/4.8，看向 [2.7,1.4,-1]。门窗关闭/改变角度也应在外侧继续更新 field 和原静态 portal 阴影。

验证：真实 SettlementRuntime 测试跨门槛前后 room key、矩阵、field texture identity/data/version、灯具 power/anchor 和影图 dirty flag 均不变；门外关门仍关闭门源并刷新必要阴影；guest 开关相互独立、近邻屋 field 绑定正确、远离/转身后释放。新增 4 项连同原 settlements 与 door transport 共 22 项通过。真实浏览器视觉尚待验收。

仍是中间态：维持现有一间房 field / 三灯池架构，因此不会同时为多个可见室内提供独立 GI。视锥/开口测试是保守可见性，不含遮挡查询；它不把开口被外部墙树遮挡当作精确剔除依据。该修复解决近距门槛切断，不代表完整多房间可见 GI 或任意远距离室内连续照明已完成。
