# 林溪 profile 开关 ABBA 与建筑包围体只读计数

2026-10-28。采用已通过主线 1810 项回归的冻结 `dist-v2/integrated46`；本轮未改运行时源码、主构建、AABB 判断或任何质量参数。

结论：profile 两组配对的帧时差方向相反，没有稳定证据说明统计功能是林溪低帧率的主要原因。建筑 AABB 收紧在原林溪机位没有可省的提交，本方向不实施。

## 正式性能条件

同一入口 `/dist-v2/integrated46/v2.html?view=river-forest&time=870&debug=1`，A 完全不带 `profile` 参数；B 只增加 `profile=1`。其余候选参数均缺省，prepared 静态包络惰性恢复使用本构建的已采用缺省值。运行信息面板关闭。浏览器缓存采用相同正常策略，IndexedDB 保留；本轮测稳态而不是冷加载。

- 1280×800、DPR1、time870、原林溪位置 `[-3611.851169467755,2329.157270885741,4805.483400316967]`、yaw `-29.88794104541604`、pitch `-10`。
- A1/B1/B2/A2 每轮完整文档导航。导航后立即安装相同启动器，等待 debug 暴露，再等待 terrain q0/m0 连续 60 RAF，接着采 180 个真实 RAF 时间戳差。
- 采样区间只保存 RAF 时间戳差，未逐帧读 snapshot、地形、相机或 renderer 计数。起止检查视口、机位、地形，visibilitychange 触发作废。结束一次 snapshot，并确认实际 renderer frame 增长。
- 采集脚本 `tools/browser-profile-overhead46.js`。启动器只在 debug 尚未出现的导航初期安装，见证据 `boot.installedMs/firstDebugMs`；四轮分别为 547.2/20394.9、495.6/19703.6、401.0/19962.4、387.3/18566.8 ms。未对应用更新或渲染函数安装包装。
- 最初 `profile46-a1.json` 是恢复脚本时的预备样本，采样起点比正式协议晚，完整保留但未放入下表。正式四轮统一重新导航与启动，证据均带 `clean`。
- rooms 在窗口前关闭其图审页面，root 不新增 GPU 页，GI 无重 CPU 任务。原用户页保留，隐藏时由现有源码暂停；本轮没有为了计时删除或降低内容。

本地冻结入口 JS `v2-BTfszpDm.js` SHA-256 `a6cae2c046ea0f6a9ecdc16494c9514b44791e4c1650dd2dba9b018214ee14be`；HTML SHA-256 `5ad9739081da7f2f36dddca1c446f16e2e9e35e007451de5fcb92ac89b554be6`。

## 结果

| 正式样本 | profile | RAF 均值 ms | RAF p95 ms | 1000/均值 | GPU 最近60帧 ms | RAF同步CPU最近120帧 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| A1 | 参数缺省 | 74.3717 | 93.4 | 13.446 | 未启用 | 未启用 |
| B1 | 1 | 91.0383 | 120.1 | 10.984 | 73.7864 | 91.1983 |
| B2 | 1 | 76.2978 | 95.3 | 13.107 | 46.1271 | 76.7967 |
| A2 | 参数缺省 | 77.5572 | 108.5 | 12.894 | 未启用 | 未启用 |

全部 180 样本、valid=true、errors=[]，保存 HTTP 成功。A 的 GPU/RAFCPU 确实未启用，而不是把 0 当真实耗时。B 的 GPU、同步CPU与RAF区间存在重叠且滚动窗口长度不同，不能相加。

第一对 B1-A1 为 +16.6667 ms，反向第二对 B2-A2 为 -1.2594 ms，方向相反。不能取第一对单独归因 GPU query，也不能根据两对混合均值宣布固定统计开销。不开 profile 仍约 74–78 ms，当前整体性能问题真实存在，本轮没有解决它。

四轮密度字段深度比较相同：19403 草丛、3918 树部件实例/450 活跃树批、林下1107184三角形；溪岸205 sedges+316 mats、240232三角形；建筑6591实例、197可见批/450098三角形、生活配置35可见批；地形1237可见/1628驻留、2850048三角形。全部地形Worker ready、error=null，末尾 q0。最终 renderer.calls 受当前阴影更新帧影响（1859 或1385），不能把单帧总数差称为密度改变。

## 一次建筑球/盒计数：当前机位无收益依据

正式 A2 结束后才运行 `tools/browser-structure-bounds46.js`。纯读取现有 `_batches` 和 `householdLiving.batches`，不改几何、矩阵、可见性、shader、层、LOD、裁剪方法或渲染调用。

主视锥来自当前 P×V。反射直接取已发布的 `uRiverReflectionMatrix = T×Pmirror×Vmirror`，仅左乘 T 的逆恢复当前真实斜裁剪反射视锥；没有新造反射相机或安装 render hook。反射有效，patch `river-41711e76-99c57ca2:862`，capture position/projection 与当前相机严格相同，并应用原反射 220 m 球距离门槛。

| 主视图范围 | 活跃且层/可见性有效批 | 球通过 | AABB通过 | 球通过、盒拒绝 | 对应可省三角形 |
| --- | ---: | ---: | ---: | ---: | ---: |
| structures/body | 1541 | 197 | 199 | 0 | 0 |
| householdLiving/body | 460 | 35 | 35 | 0 | 0 |

另有 2 批为盒通过而球拒绝，直接改成仅盒测试反而可能增加提交。所有上述建筑在实际反射路径均先被现有 220 m 门槛排除，因此反射没有进入几何测试的建筑批。无不支持对象跳过（skipped=[]）。当前实际热点不足以支持 AABB 改动，停止此路线；这只是原林溪机位结论，不推断所有机位。

## 证据与收尾

`docs/previews/v2-route-craft-38/` 下：

- `profile46-clean-a1.json`、`profile46-clean-b1.json`、`profile46-clean-b2.json`、`profile46-clean-a2.json`：完整每RAF时间戳差、最终snapshot和协议。
- `profile46-a1.json`：预备样本，未混入正式对照。
- `structure-bounds46-forest.json`：一次只读主/反射计数。
- `profile46-live-final.png/json`：末尾不开profile的实际画面，保存成功且本地看图确认。

整个正式采样、计数、保存未调用 reviewHold。最终 PNG 保存后，浏览器工具在截图步骤自行断开临时页；inventory 确认本会话 tabs=[]，随后 `viewport.reset()` 成功，未留下冻结页面。两份诊断脚本 syntax check 通过；未宣称本轮是新的画质完成或主线性能优化成果。
