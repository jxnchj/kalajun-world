# Prepared 岸草恢复包络惰性计算46（已按实景验收采用）

仅已下载且验证过的521根 prepared 恢复路径。现缺省启用精确惰性计算，`reachEnvelopeLazy46=0` 保留原 eager 回退。下述早期候选测量为采用前记录。正式候选入口 `/dist-v2/reach-lazy46/v2.html?view=river-forest&time=870&reachEnvelopeLazy46=1`，同构建以0对照；不要求启用局部阴影。Worker白名单精确包含该不影响地形的开关。

## 原因和范围

`restoreReachCover42` 原先每根 make/clone/seat 后立即调用 `createPlantEnvelope([geometry])`。恢复后的合批只读 geometry、seat；动态 `validateContact42` 必须根据真实当前接地重新建立 actual 几何及 envelope，不使用此静态 asset.envelope，且保留该原校验完整路径。改为只在 asset.envelope 首次读取时调用原同函数并缓存；未复制包络算法、未启用原型缓存、未修改任一几何/接地数组。每个恢复对象拥有独立闭包，随对象释放回收，无全局缓存。原 getter 计算对应的 geometry 保持原恢复对象，不引用后续世界合批 geometry。

## 实际局部CPU（不是浏览器FPS或冷加载结论）

2026-10-28，实际 gzip 中521记录，第一次独立单文件测量：原恢复239.758ms，其中 envelope204.297ms、make24.402ms、clone4.163ms；惰性恢复26.078ms，make19.581ms、clone2.807ms。随后的测试显式读取全部521包络另花178.884ms。该顺序存在JIT/机器负载差异，不把总差作为严格AB收益；它证明原路径里昂贵且未消费的计算及延迟位置。

## 验证

`reach-envelope-lazy46.test.js` 使用实际521根逐个核对所有属性和索引typed-array、seat/contact元数据，首次 envelope 与 eager 深度相等，第二次读取同对象且计时不增，独立恢复对象不共享包络，geometry.dispose后缓存结果仍保留。明确缺省/0关闭。

原 `reach-cover-prepared42.test.js` 完整场景对照切候选：合批所有buffer相等；真实当前地面和已有捕获的11069组接地都执行原校验，521 prepared contact命中；全过程静态 envelopeMs 未出现，证明实际路径未触发 getter。Worker隔离保留未知空间参数拒绝断言。三文件合计29/29通过，日志 `/tmp/reach-lazy46-target.log`。

通过原 `build-meadow-root-cache-v38.mjs` 与 `build-reach-cover-prepared42.mjs` 正式再生来源绑定，保留生成器全量相等断言。压缩数据SHA不变：meadow `031a0d2c9e599275b27aecd059c68cf591920f4a14991a966a16cebb9195f71e`；reach `9e62e8d16168db6be5b669e5e79d395b74eac384b76685a4d76724796916d877`。

独立构建使用现有 `vite.v2.config.js --outDir dist-v2/reach-lazy46`，主dist与shadow45保持。以上为首次交付时的离线证据；后续实际验收及采用见下节。浏览器 `reachBankCover39.stats.envelopeLazy46` 提供 makeMs/cloneMs；正常实际路径不应有 envelopeMs。

## 实景采用记录

主线四组实际浏览器加载（`reach-lazy46-load-a1/b1/b2/a2.json`）全部零错，两对恢复 buildWork 分别改善约70%/67%；实际两模式根、全部几何buffer和contact相等，见 `reach-lazy46-eager-hashes.json`、`reach-lazy46-lazy-hashes.json`、`reach-lazy46-accepted-geometry.json/png`（均位于 `docs/previews/v2-route-craft-38/`）。主线据此授权默认采用，未宣称整体首帧或FPS收益。

采用只改变URL predicate缺省值，显式0仍原路径；低级恢复生成器缺省仍eager以保原正式生成器验证。采用后29/29定向通过，两个正式生成器重跑且压缩数据SHA仍如上。独立采用验证构建 `dist-v2/reach-lazy46-adopt/v2.html?view=river-forest&time=870`，不带开关即新默认，可加0回退。主dist、shadow45和此前候选构建均保留。
