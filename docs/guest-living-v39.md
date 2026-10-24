# 三客房睡眠、收纳与窗边织物 v39（已实景通过，源码默认采用）

基于已采用的 `assets/src/v2/settlements/guest-vanity-v38/lanchuan-vanity.blend` 派生；已完成三房浏览器与实际步行验收，源码默认采用。`guestLiving39=0` 保留上一版vanity源，`guestVanity38=0` 保留更旧源；仅显式living=1与vanity=0同时请求时报冲突。下方离线候选及19项验证为历史过程，最终默认验证见末尾。

## 已制作范围

- 三个衣柜：原 0.55×1.05×1.93m 单盒替换为侧板、背板、顶底、退进踢脚与两扇框板门；保留现有把手和位置。三室门横枨高度分别为0.76、0.88、1m，保持同一家族，不添加无关物件。门缝为真实几何空隙，门当前固定，不宣称可开。
- 三张床框：原占地和床垫支承高度保持，分为侧枨、端枨、角脚及床垫底板；角脚延至原木地板约0.0355m，不保留原盒底悬空7cm。床垫、被褥、床尾毯、已有缝制枕头、床头背景逐字段保留。
- 六个床头柜：顶、侧、背、底、双层抽屉面与薄握边，删除旧黑色假缝盒；保留原0.42×0.43×0.54m范围、灯具与插座。
- 六幅窗帘：保留原帘体及开口轮廓，补真实挂带、折边；挂带从每个原褶皱顶部取样连接到现有轨道，非悬浮在平均平面。未重做整片褶皱，未宣称布料模拟或可拉帘；现有轨道及原织物素材继续复用。

材质全部复用源材质与图像，未生成新木纹/织物，不改变全局光色。构造细节是基于已有配置的设计，不冒充照片测量。未调用Aholo。

## 文件与来源

- 生成脚本：`tools/blender/v2_guest_living39.py`
- 前后预览脚本：`tools/blender/preview_guest_living39.py`
- 完整可编辑源与GLB：`assets/src/v2/settlements/guest-living39/lanchuan-living39.blend`、同目录 `lanchuan-living39.glb`
- 同目录 `metadata.json` 保存实际源/输出SHA、被替换对象和成本；原源SHA为 `0418790225b7113dec526e3ae176325dd589323a57f6e194789ae5a7ca794f2e`。
- 保留626对象的变换、几何、UV、材质名和原颜色属性一致，包含已验卫浴、35°淋浴玻璃和原床品。仅删除12个盒体及6条旧黑假缝。
- 完整三角199,856→233,060，净增33,204。新件35,532三角，删除2,328三角。GLB17,060,928B；尚未压缩/发布。
- 新件18,144顶点真实48方向、2m上下文AO并采样40m天空遮挡；AO平均0.35819（包含柜内遮蔽面），不是全白占位。原对象AO不变。本轮生成约16.06秒，不含离线渲染。

## 验收边界

同目录 `before/candidate-{group,storage,sleep,window,heading}.png` 为匹配相机和中性照明的离线观察图，隐藏建筑壳以显示成组构造，不是运行时GI或真实浏览器验收。全部3房共用同套构造，房间原摆位/物件数量保持；仍需主线审图，之后才决定接入。

采用前须按最终源真实重采3房天空/太阳/灯具两阶、开口、地面接触及台面高位接触。不能把现有GI只换源SHA。碰撞须按新构件验证原通路、衣柜与床柜阻挡，新床脚不能使用旧空区碰撞假定。当前没有做交互柜门/抽屉、帘布物理或动态GI，不改变阶段5完整光色的原顺序。

最终候选GLB SHA256：`9c1c5e5e2dc464fe61adfa6b3f5ee55f90a180bf9bebc097586b9b9f579e35c1`；Blend SHA256：`a1d99484eb8c35864e4517f912d51baa1f90197de3becf78a69aea3a3577920b`。已实际查看整体、收纳、床区及最终帘头图：框板/柜门空隙和床角脚可辨，帘挂带与原轨道/褶顶连接。木纹仍沿用原程序素材、帘体规则褶皱仍保留；这是几何构造候选，不代表整室终稿。


## 独立运行接线与真实重采

完整公开源 `web/public/assets/v2/gh_lanchuan_rooms_living39.glb` 与上述离线GLB SHA相同。无损gzip 6,468,325B，解压后17,060,928B逐字节完全一致，正式loader先验实际SHA再parse；失败不回退旧几何搭新GI。`guestLiving39=1&guestVanity38=0` 显式冲突抛错，避免混源。

- 新key：`lanchuan-freedom-{1,2,3}-living39`，旧vanity与原始key数据均不覆盖。
- `tools/blender/v2_guest_living_gi39.py --room N` 实际重算天空一/二阶、太阳一/二阶、灯具一/二阶、地面接触、开口遮挡全部8表。
- 三房采样耗时69.88/67.50/62.50秒，实际有效探针404/404/396（各405），太阳81方向、天空96方向、二阶32表面方向，原源参数不降采样。所有表源GLB/Blend身份一致。
- `v2_guest_living_upper39.py --bake` 重新对最终场景执行真实台面fine/coarse残差，三房各5048有效采样；低于.95的112/112/113点。独立数据仅在新key使用，仍合并进原floor RG atlas，**没有额外sampler或独立GPU纹理**，floor每个texel不变。
- 外门当前仍为原资产固定姿态，淋浴玻璃保留35°固定开态。这里没有客房外门交互/多角度GI；不能借用公共楼三门态结论。

运行接点复用现有vanity准备/等待路径，全部8表验证通过后才发布registry。新框板/床柜使用新实际几何碰撞；只有原先明确的洗手柜碰撞继续沿用已验原代理，35°玻璃保持新真实姿态。

## 定向验证

`tools/reports/guest-living39-integrated-tests.log`：19/19通过，包括实际GLB完整233,060三角、无损gzip/错SHA拒绝、实际Rapier三房入口到台盆并返回、台盆原柜阻挡、新床足端及衣柜前面阻挡、旧vanity默认源及三房GI回归；新三房实际set/update→prepare、日光/仅灯具数值、跨房/离开、upper新key与floor逐texel一致、已满预算材质仍单接触sampler。

这些是源码/真实离线物理与数值验证，不代替浏览器。主线统一prepared重生/build后，需实景3室构造、通路、灯开关与离开恢复验收。当前默认未启用，未宣称完整动态GI或最终色彩。


## 实景采用与默认回归

主线已实际查看三房整体与窗前：`docs/previews/v2-route-craft-38/guest-living39-room{1,2,3}-overview.json/png`、相关window证据，完整队列q0/m0、errors空，各roomContact实际为对应`-living39` key。近柜图记录q14/m3，不能冒充完整整景稳态。

`guest-living39-room3-actual-walk.json`记录真实UI步行：入口到台盆、返回、床框与衣柜阻挡；最终overlap=false、errors=[]，不是setPose越障碍。`guest-living39-room1-night-auto.json/png`及`night-off.json/png`配合主线实际auto→on→off操作证明灯具GI随关闭变化；仍保留源绑定接触。这里夜间命名按证据文件引用，不把低层测试的午夜能力误写成UI午夜入口。

默认采用后`tools/reports/guest-living39-default-tests.log` **44/44通过**：新源加载和3房GI真正空query；旧vanity专测显式living=false或query0；更旧源vanity=0保留；真实新床/柜/卫生间碰撞；完整木道/逐户入口加载改为支持新实际源fetch，不通过关闭新默认规避测试。

主线将统一真实再生结构prepared及默认构建，本次没有重复室外GI重烘。全局光色、规则帘褶、旧木纹、镜面及完整动态GI仍是中间态；柜门/抽屉、客房外门仍没有新增可动交互，35°淋浴玻璃是固定开态。阶段3继续推进，不据此宣称整室最终美术完成。


## 本小阶段默认入口收口

最终 `integration39-close-build.log` 构建通过。无guestLiving候选参数的默认一号客房在1280×800、DPR1、time870下q0/m0/errors空，实际加载living39源与对应GI；截图 `docs/previews/v2-route-craft-38/guest-living39-default-final.png`。同页通过地点按钮切回林溪，sky/contact均inactive，field与upper key清空，证据 `integration39-default-room-to-forest.json`（q0/m0/errors空）。三房整体与三号房实际碰撞此前已验，不重复宣称每房都有实走。完整动态GI、玻璃、帘布与阶段5光色仍待做。按用户要求当前小阶段后暂停。
