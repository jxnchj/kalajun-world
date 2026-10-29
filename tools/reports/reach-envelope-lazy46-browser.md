# Prepared 岸草包络惰性计算46：浏览器加载验收

2026-10-28，独立冻结构建 `web/dist-v2/reach-lazy46`，入口 JS `v2-CdQpje2L.js`。HTML SHA-256：`0aa254488231f5f83346a28cde2319a37e1a549d51e58f2c925af9905c65186c`。

结论：实际浏览器两组配对均减少溪岸自身 `buildWorkMs`，并确认完整渲染数据相同。整页首帧与地形队列清空没有稳定改善，不能据此称冷启动长尾或帧率已经解决。源码仍默认关闭；没有修改主构建或降低任何密度、细节。

## 条件与计时边界

- 同一构建 `?view=river-forest&time=870&profile=1&reachEnvelopeLazy46=0/1`，顺序 A1 原版、B1 候选、B2 候选、A2 原版。每次完整文档导航，各运行重新创建世界。
- 1280×800、渲染 DPR 1；四轮最终机位均为 `[-3611.851169467755,2329.157270885741,4805.483400316967]`，yaw `-29.88794104541604`、pitch `-10`。运行面板关闭，无移动操作。
- 导航前通过 CDP 关闭 HTTP cache；IndexedDB 保留，没有清库。因此这是禁 HTTP 缓存、保留本地数据缓存的加载测试，不是全缓存清空测试。
- 浏览器接口不支持 before-document 注入。每次 `goto` 后立即只注入一次 collector，并断言 `window.kalajunV2.debug` 尚不存在。安装时刻分别为导航后 218.6、236.1、155.1、214.4 ms，均早于首帧。首帧使用应用自身 `navigationToFirstFrameSubmittedMs`，不以注入时间为零点。
- 每 RAF 仅检查诊断对象是否出现以及 built/ready/q/m 简表；仅状态变化时保存边沿，结束才读取一次完整 snapshot。q0/m0、521 ready 连续 60 RAF 后保存。
- 应用到首帧后才暴露 debug。A1/B1/B2 第一次可读时岸草已经完成，因此这三轮 built/521 ready 时间为观测上界；A2 实际捕获了后续状态变化。不能把前三轮的上界称为精确构建完成时刻。
- A1/B1 使用页 1839973773；该页在上下文续接时被工具自动关闭，B2/A2 使用新页 1839973777，重新应用相同视口及禁缓存设置。未隐去这一工具生命周期差异。

## 四轮结果

所有时间相对导航，单位 ms。`≤` 表示首次可读时已完成。

| 项目 | A1 原版 | B1 惰性 | B2 惰性 | A2 原版 |
| --- | ---: | ---: | ---: | ---: |
| 首帧提交 | 13991.4 | 13534.2 | 22504.0 | 19907.1 |
| bank built | ≤13991.6 | ≤13534.4 | ≤22504.4 | 29695.1 |
| 实际 521 根 ready | ≤13991.6 | ≤13534.4 | ≤22504.4 | 32029.8 |
| terrain q0 | 36561.6 | 36367.7 | 67538.5 | 60073.9 |
| 采集结束（另稳定 60 RAF） | 39307.1 | 39135.8 | 71757.7 | 63856.9 |
| bank buildWorkMs | 279.4 | 84.4 | 463.3 | 1410.0 |
| lazy makeMs | — | 23.4 | 45.4 | — |
| lazy cloneMs | — | 3.7 | 5.3 | — |
| 实际静态 lazy envelope 首读次数 | 不适用 | 0 | 0 | 不适用 |
| prepared source status | ready | ready | ready | ready |
| 实际 roots / ready | 521 / 521 | 521 / 521 | 521 / 521 | 521 / 521 |
| 应用错误 | 0 | 0 | 0 | 0 |

第一对 bank CPU 少 195.0 ms（69.8%），反向第二对少 946.7 ms（67.1%）。这只是局部构建成本，不是稳态帧率；第二组全局耗时显著上移，不能将两组混为稳定整页收益。

具体地，第一对候选首帧早 457.2 ms、q0 早 193.9 ms；第二对候选首帧反而晚 2596.9 ms、q0 晚 7464.6 ms。B2 的 initialScene 为 11302.6 ms，A1/B1 为 3666.4/3462.4 ms；B2 的多个未改动准备环节也同时变慢。root 确认期间没有并发重构建、测试或新建 3D 页，仅轻量文档与图片读取；未核实用户其他应用活动。保留全部数据，不删除较慢结果、不替它指定无证据的原因。

## 完整数据等价

在 A1/B1 结束后逐字节散列全部两池 geometry，非抽样：sedge 205 根、mat 316 根；每池全部 10 个属性 `aBrookDrop/aBrookHeight/aBrookReady/aBrookRoot/aBrookScale/aBrookSeat/aPlantWind/color/normal/position` 加完整 index。总计 15,211,024 bytes、240,232 triangles，全部散列及 attribute 类型/count/itemSize/normalized 相同。

同时保存并 deepStrictEqual 比较全部 521 根的 primitive 字段、完整 seats、preparedContact42、waterBroadPhaseFalsePositive，以及实际 contact cache input/output 字节散列。完整两池对象深度相同。metadata SHA-256：

- sedge：`5df9adae2498a7f6c57f23afd3f9b30c21d1298f9520b2e91cce258c2064b0b0`
- mat：`9d4ff7784c06793872c906aa9d555ab2494490ae5817084accd0193c4a7f8be5`

source cache manifest/code/input 哈希相同，而且 manifestInputs 与实际 world 输入全量相同。prepared gzip SHA `9e62e8d16168db6be5b669e5e79d395b74eac384b76685a4d76724796916d877`；raw SHA `2fe599cd4b25d1f5ffd52557ecc2a244df389c685d7e11b44ca04099595be366`；code signature `215303ddf68272d216fc94e9c5982ce0369bfac29a096a5b3179ced9ec5073a0`。

原版实际持有 521 个已求值 envelope；候选实际持有 521 个 getter、没有已求值 envelope。候选 profile 没有 `envelopeMs` 属性；原实现第一次求值即创建该键（即使时长为零），所以零次可以确认。未为非零次数新增侵入计数器。

## 证据与页面收尾

证据目录 `docs/previews/v2-route-craft-38/`：

- `reach-lazy46-load-a1.json`、`reach-lazy46-load-b1.json`、`reach-lazy46-load-b2.json`、`reach-lazy46-load-a2.json`。
- `reach-lazy46-eager-hashes.json`、`reach-lazy46-lazy-hashes.json`，含全部属性散列和完整元数据。
- `reach-lazy46-accepted-geometry.png/json`：A2 原版终点画面；文件名只标记本轮等价几何，不表示第三阶段画质最终验收或默认采用。
- 采集与散列脚本 `tools/browser-reach-lazy46.js`、`tools/browser-reach-lazy46-hash.js`。两文件 `node --check` 通过。浏览器四轮使用了脚本的早期版本，其结束后 hold 已明确恢复；随后诊断脚本取消无必要结束 hold，hash 改为只在同步复制数组时 hold 并 `finally` 恢复，异步散列/保存不冻结交互。此调整只影响诊断收尾，没有重新命名或改写本轮原始结果。

所有保存通过绝对 `/__review38/evidence`，检查 HTTP 成功。最终页确认 `priorHold=false`，恢复默认视口、恢复 HTTP cache 设置并保留可操作页面，由 root 接手；没有留下冻结页。此次只验加载及实际几何等价，没有重新做帧率样本，也没有把早期移动专项标为完成。

## 47正式默认入口采用

2026-10-28：统一源码1812/1812通过，独立47及正式主dist均构建成功。主dist使用emptyOutDir=false保留已有候选/旧资源；实际默认入口无候选开关，源缓存ready、Worker ready、岸草521根及接触命中521、q0、errors空。facies材质key和惰性恢复字段实际存在。正常鼠标拖动yaw -29.88794→-20.28794，holdWas=false，未冻结交互。证据stage3-default47-live.json/png。完整性能与加载长尾仍开放；前文默认OFF指采用前测试时点。
