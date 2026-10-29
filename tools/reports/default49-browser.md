# 默认49：电脑横屏整合验收

2026-10-28。当前仅电脑横屏；未做竖屏适配，完整光色保持阶段5。

## 已完成

完整回归1828/1828，0失败/跳过，日志stage3-integrated49-regression-fixed.log。主构建保留全部独立版本；正式入口 /dist-v2/v2.html 已默认采用唯一代表木屋的加工木材48。

真实Chrome：1280×800/DPR1/time870，正式默认室内ready/q0/errors空，159节点/69295顶点。default49-house-interior.json/png保存实际结果；显式houseTimber48=0完整重载后木材48为空且原蛇纹恢复，default49-house-original-rollback.json/png通过。独立整合49门廊图与原生drag yaw -128.869→-117.669已核实。正式林溪default49-forest-live.json/png同样q0、Worker ready/error null、errors空。未重做全部历史连续步行，已有门态/碰撞源码不变，相关物理测试保持默认新材质。

新可编辑源 assets/src/v2/pastoral/timber48/house-a-group-timber48-finished.blend 已生成/读回，原几何、全部UV/AO/法线及保护源文件不变。只把室内加工板与外粗木区分；端纹规则感、屋顶/家具精修及最终光色仍中间态。

## 实际发现的测量环境干扰

默认49复验后发现此前保留的旧主窗口1839973780没有随当前3815窗口变成hidden。对旧页安装临时visibilitychange观察约341072.9ms，只有初始visible记录，没有hidden事件；独立渲染计数观察98795.6ms内 renderer.info.render.frame增加3112。这是渲染pass计数，不能除时间当作FPS。该旧场景持续占用渲染资源已成立，不能仅依据代理关闭自己临时页就称GPU独占。

已关闭本任务留下的旧3780及旧reach-lazy46实验3777，保留当前正式49窗口3815。仅清理本任务旧验收页；没有关闭用户其他服务/应用。临时观察字段/事件监听已移除，当前窗口已清除device override、可正常交互。

Performance49与单段GPU49及本轮加载记录均须注明可能存在旧场景争用；原始证据保留，不把这些数值称单场景性能。程序栈、实际draw序列、模型数量与同源几何一致性结论不因此抹除；性能采用仍需唯一3D页面下的新对照。尚未量化关闭旧页带来的净收益，不宣称林溪性能已解决。

只读设备检查：Mac16,11、24GiB内存，未记录thermal/performance警告（不等同于证明没有瞬时降频）。用户桌面其他应用仍在使用，本项目不停止它们。后续先等待本项目生成/测试CPU任务结束，再用同一页面顺序切换A/B，避免重新留下多个持续渲染的窗口。
