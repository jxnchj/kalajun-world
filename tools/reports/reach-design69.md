# 69：36 米河弯形态与沉积材料候选

状态：代码与独立数据已冻结，默认 OFF；尚未经过本轮真实 Chrome 着色器编译、三机位图审或 GPU/启动测量，不能视为已采用。它承接 66 的真实细砂细砾扫描素材，改变整段浅滩横断和材料主从，不靠加不透明水色遮床，也未改变全局光照。

## 实际交付与边界

`?reachDesign69=bend` 启用共享形态；缺省或 `reachDesign69=0` 保持默认原值。三个不等长、左右交替的内弯低滩与对岸冲刷单元共用原中心线、下坡水位和转弯坐标。新水缘由同一高度函数求交，地形、实际地面查询、水深和水网几何沿用该源。两端完全接回原断面；树根保护核和 5 块独立岸石支撑区保持原值。不与 bank50/root-pool、profile48 或 form41 OFF 叠加。

141 个横断、双侧 2.5cm 采样中，最大抬升 9.23cm、下切 19.49cm，最大水缘内退 22.93cm，最小水宽 68.75cm；原湿区新增露出约 2.919m²（离散估算）。水覆盖范围内未形成新的露干孤岛，外岸没有增加相对原 DEM 的低洼复湿点。保留原 DEM 自身低洼，不冒称整个原河网已无交汇/外岸问题。原实体布局未改。

材料按同一三处内弯/冲刷单元、实际坡度和离水高度分配细料与粗砾；原石周边保留粗砾，颜色/法线/粗糙度共权重。湿润粗糙度施于最终混合后的扫描结果，避免随后干扫描粗糙度覆盖。细料扫描实际尺度 2.48m，原粗砾 2.9m；未缩糊全体石纹。原透明水、反射、折射接口均保留；水下介质与基材 F0 的完整物理传输仍是原实现近似，本候选未宣称解决。

## 根、石与实际地形接触

固定岸盖的 521 株（205 sedge / 316 mat）、全部 ID/XZ/尺度/旋转、11,069 叶组和 240,232 三角保持。用正式 terrain-row-kernel 的 15 块 5m 地形、Float32 顶点/实际索引、15.625cm 网格重新计算接地；145 根 Y 改变，最大 7.168cm。所有叶组通过原实际风/水/石接触验证，失败 0；最大解析高度与实际三角面偏差 1.436cm，座部采样最大地面高差 1.521cm，最低足点埋入 2mm。5 块原岸石的完整变换矩阵逐值相同。运行时仍检查实际提交面数据；预制 verdict 不匹配时走原验证，不能无条件相信离线包。

外围 meadow 缓存共 45,486 个占位，零新增/删除。45,397 个普通→普通根 XZ/Y 完全不变。对全部 89 个原/新程序湿草槽实际复算后，44 根按旧群落规则移动：37 根仍为湿草（最大平移 37.43cm），7 根类别切换（5 普通→湿草、2 湿草→普通，最大 88.31cm）。早期“7 根移动”只统计了类别切换，不能作为总移动数。它们不属于固定 521 岸根边界。ID/尺度/旋转不变；对 22 块真实地形三角面复验，全部采样点不入水、完整风包络不撞原岸石；额外座部下调最多 3.141mm，座部最大地面高差 2.644cm。两根回普通草根位于真实面下约 3.5cm，与既有规则一致。没有新增生态冻结钩子，ecology.js 未改。

## Worker 与独立缓存

候选作为明确的 `loadWorldData` source input 传入 Worker，严格接受 `0|bend`；未知/冲突参数仍拒绝。候选不请求默认 prepared 地形行，明确记录 `variant69: live-worker`，保留正式 Worker 队列路径。另线程实际执行 terrain-row-worker.js，与主线程正式 kernel 的全部输出 typed buffers 逐值一致。

森林、草地、521 岸盖都使用 `web/public/data/v2/reach-design69/` 独立命名空间和原完整源/输入/载荷摘要验证。森林 80,927 根/134 tile 的记录与默认 raw/gzip 字节完全相同；草地候选覆盖 111 tile / 99,900 source slot。候选包：forest 3,101,781B，meadow 4,005,607B，reach cover 615,806B（均 gzip 文件大小，非网络 transferSize）。岸盖预制包失败状态可见，禁止静默重生成而移动固定 521 根。

源绑定因真实新增依赖已通过正式工具再生默认 11 项：forest、meadow、reach、terrain full/priority/demand、室外地形 recipe，以及四类 GI terrain/aperture/ground/ground-bounce。全部非绑定 payload 不变；GI 辐射数据完全相同，仅剔除已有运行计时 `.seconds` 比较。未手改 hash。旧 manifests/payloads 与源副本位于 `backups/route-continuity-v69/`。结构与独立 8m meadow reference 不依赖本次改变的源，因此没有盲目再生。

## 主入口最小接线

主线程负责 main.js。形态和 Worker 已自动按 URL/source input 接好。等原 `terrain.loadReferences()` 完成，仅在 `world.hydrology.forestReach39?.stats.design69` 有值时：

```js
import { loadReachDesign69Assets, installReachDesign69Material } from './reach-design69-material.js';
const assets69 = await loadReachDesign69Assets();
const owner69 = installReachDesign69Material(terrain.material, {
  world, assets: assets69, enabled: true,
});
// owner69.setEnabled(false/true), owner69.setDiagnostic(false/true)
// owner69.uniform / owner69.stats 可供诊断
// 释放顺序：owner69.dispose(); assets69.dispose();
```

不要再安装 64/66 的材质 owner，也不要同时启用 50 的 root-pool。材质 OFF 只关闭细料与最终湿响应，不撤销已经生成的 69 形态；完全回到默认需要移除/关闭 `reachDesign69` 后重新加载世界。

## 成本与验收

现有自适应水网因新横断产生额外深度细分。每种 near/far 表示均从 21,737 顶点 / 41,530 三角 / 2,422,880B，增加到 23,091 / 44,238 / 2,574,528B：各 +1,354 顶点、+2,708 三角、+151,648B，无新 draw。材料沿用 66 的两张私有四层扫描数组，mipmap 约 42.67MiB；无新增 sampler/draw，细料增加两次 textureGrad，并在局部域做 10 个源河段投影。实际 GPU 与候选 live terrain Worker 冷启动耗时尚未测量，不以离线生成耗时代替。

76/76 针对测试通过（真实独立 Worker、OFF 精确恢复、完整源绑定、实际候选数据请求、521 接触和材质生命周期）。实际 GLSL 编译和视觉未被字符串测试替代。主线程仍须固定 whole-bend / pool-cross / root-mat 三机位，检查全弯不再呈连续石路或棕砂路、内弯低滩与对岸冲刷关系、水沿坡连续覆盖、521 叶足与石头周围无新缝隙，再测试移动、准备队列与 GPU。

## 可复现生成与文件

```sh
node tools/build-reach-design69.mjs
node tools/build-forest-root-cache-v38.mjs --reachDesign69=bend
node tools/build-meadow-root-cache-v38.mjs --reachDesign69=bend
node tools/candidates/reach-design69/verify-peripheral-grass.mjs
```

默认再生已完成，`tools/rebuild-default-bindings69.mjs` 为本轮一次性备份/正式工具编排；它遇到既有备份会拒绝覆盖，不应重复运行。证明见 `reach-design69-default-regeneration.json`。完整机器读结果见 `reach-design69-validation.json`、`tools/candidates/reach-design69/contact-report.json` 与 `peripheral-grass-report.json`。

新增运行源：`web/src/v2/reach-design69.js`、`reach-design69-material.js`。必要接线：world-data / hydrology / forest-reach39 / terrain-row-worker-client / terrain-prepared42 / forest-root-cache / meadow-root-cache / reach-cover-prepared42 / forest-reach-cover39，以及 `web/forest-root-binding.js`。对应测试和官方生成器已同步。没有编辑 main.js、ecology.js、水光照 shader、默认岸石布局、近针资产或全局环境。
