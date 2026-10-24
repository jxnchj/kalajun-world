# 公共楼精细家具与独立整楼输运

状态（2026-10-24）：主任务完成实景检查并决定默认采用，新完整楼源、三门态和接触图均已实际重烘。无参数即选择新完整几何及独立的 `gh_lanchuan_lodge-furniture-whole` 光场。`lodgeFurniture=0` 保留原完整楼与其整楼 GI；旧源下 `lodgeWholeGI=0` 可回原餐厅光场。新家具启用时即使另带 `lodgeWholeGI=0` 也不会混搭。`lodgeWood=1` 未显式指定家具时选择旧源以兼容旧木材映射；只有显式 `lodgeFurniture=1&lodgeWood=1` 报错。

源为 `web/public/assets/v2/gh_lanchuan_lodge_furniture38.glb` 及可编辑的 `assets/src/v2/settlements/lodge-furniture-v38/lodge-complete.blend`，由 `generated/lodge-furniture-source-38.json` 绑定路径和实际 SHA。保留原建筑、门及开口，替换两沙发与三洗烘设备的120个盒件三角为23,256精细三角；全楼63,688三角。新家具在完整原建筑内实采顶点 AO；原其他顶点数据保持。

GI 路径复用现有可信积分器，但读取新完整源，绝不改旧GI签名充作新结果。`tools/blender/v2_lodge_whole_bake.py --furniture --index 0/1/2` 分别采用真实门角0/.875/1.75rad，保留47×5×13网格、96探针射线、32表面二跳方向及81太阳方向，六餐厅开口与十一东侧真实开口分开求解。有效漫反射来自完整新源的线性材质因子与 metallic；新暗鼓面为不透明，原门玻璃依真实姿态逐段0.9透射。接触图仍0.025m/64方向，从新沙发脚和设备几何重采。

独立输出 `lodge-furniture-data/{0,1,2}.js`、完整闭态 gzip 与 Float16 XOR 三态差分；包装必须解码后逐对象严格等于实际烘焙原数据。运行时验证新GLB/Blend双SHA、原密度网格、全部开口、真实新源门身份及接触源。损坏包只能回退同一新源的完整数据，不能退回旧场；森林未访问室内不加载这些GI包。

边界：几何和空间输运是本候选新内容，仍为静态家具及有限方向/两阶输运，门在三态插值，非任意动态GI。三门态与源绑定已通过；浏览器检查和采用决定由主任务负责记录，本文件的数值验证为 CPU 输运及数据绑定证据；完整光照与色彩专项顺序不变。未使用Aholo。

完成证据：三态均使用63,496个新源不透明三角，原门玻璃12三角按姿态处理；完整网格3055点，2986有效。原2979有效点全部保留，新家具形状让7点转为有效，未降低密度。闭态接触图与旧场相比7184个texel变化（2949更遮蔽、4235更开放），局部与跨室反弹均有真实变化，见 `tools/reports/lodge-furniture-source-change-v38.json`。

另两门态安全并行：先从同一新闭门源独立实采96方向有效性，作为只读公共输入；与完成的0态所有原字段/字节完全相同，最终包装仅另加sourceOpenings标识。各门态输出目录/报告独立，原数据、源模型不写。实际日志为 `lodge-furniture-bake-{0,1,2}-v38.log`，报告为 `lodge-furniture-gi-{0,1,2}-v38.json`。

无损包装：闭态gzip 6,635,952字节，XOR三态差分gzip 2,802,907字节，合计9,438,859字节，比三份完整gzip 19,969,503字节减少52.73%。解码后所有状态对象、Float16与RLE字符串严格一致；这不代表页面冷启动减少52.73%，访问该楼仍需实际下载/解压/解析验收。

测试：新家具GI专项4/4通过；公共楼、室内与聚落相关回归183/183通过。包含新GLB/Blend双SHA和完整反照率绑定、旧场/混源拒绝、坏包只能回退同新源、四室同一新接收体与接触图、三门态最终RGB逐项正确、夜间无残留、离开/返回、默认旧路径无候选GI请求。`lodge-furniture-gi-v38-tests.log` / `lodge-furniture-room-regression-v38.log`。未构建或跑全量测试，本页不把Node验证视为浏览器视觉验收。

默认采用回归：`tools/reports/lodge-furniture-default-gi-v38.log` 28/28。完整新楼实际路线以空 query 验证默认新 key、4 区房间、三门态最终 RGB、夜间/离开/返回；旧全楼和旧餐厅测试显式 `lodgeFurniture=0` 保留原断言。生产 GI 数据及源签名未变。

## 主任务实际浏览器验收证据

以下由 root 主任务在真实浏览器完成并据此决定默认采用，非本子任务运行的浏览器测试。证据文件已核实存在：

- 前厅：[状态](previews/v2-route-craft-38/lodge-furniture-reception.json)、[画面](previews/v2-route-craft-38/lodge-furniture-reception.png)。
- 休息区：[状态](previews/v2-route-craft-38/lodge-furniture-lounge.json)、[画面](previews/v2-route-craft-38/lodge-furniture-lounge.png)。
- 服务区：[状态](previews/v2-route-craft-38/lodge-furniture-service.json)、[画面](previews/v2-route-craft-38/lodge-furniture-service.png)。
- 餐厅：[状态](previews/v2-route-craft-38/lodge-furniture-dining.json)、[画面](previews/v2-route-craft-38/lodge-furniture-dining.png)。
- 沙发近看：[状态](previews/v2-route-craft-38/lodge-furniture-sofa-close.json)、[画面](previews/v2-route-craft-38/lodge-furniture-sofa-close.png)。
- 午夜：[状态](previews/v2-route-craft-38/lodge-furniture-midnight.json)、[画面](previews/v2-route-craft-38/lodge-furniture-midnight.png)。
- [开门动画实际 RGB](previews/v2-route-craft-38/lodge-furniture-rgb-door-animation.json)。
- [实际沙发碰撞阻挡](previews/v2-route-craft-38/lodge-furniture-actual-sofa-block.json)。
