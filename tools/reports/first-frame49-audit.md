# Default49 first-frame wait: read-only audit

Actual evidence: `docs/previews/v2-route-craft-38/default49-house-interior.json` and `default49-house-original-rollback.json`. Adopted/original firstFrame is 10,104.5 / 9,432.3 ms; initialShaders is 5,345.7 / 5,375.5 ms; both firstFrameNewPrograms arrays are empty. Both are1280x800/DPR1,4xMSAA RGBA16F with61,440,000 estimated attachment bytes. These are observations, not isolated proof of timber cost.

Both shader preparations report exactly one stalled probe and max/probeTotal155.3 /175.7 ms. `web/src/v2/shader-readiness.js:3,47-61` uses5000ms no-progress recovery before an explicit LINK_STATUS check. Thus5.3sec is not demonstrated shader computation: most is readiness wait. It also does not prove the extension was wrong or that earlier synchronous probing is beneficial.

`web/src/v2/main.js:58-64` measures `await work()`. `:478-481` wraps renderWorld, so phase elapsed also includes the post-render microtask continuation delay. Without a timer immediately around work(),10sec must not be described as proven pure synchronous rendering.

Compile is not upload/draw readiness. Installed Three `WebGLRenderer.js:1369-1498` compile traverses and prepareMaterial; it does not run standard mesh objects.update. `WebGLObjects.js:5-38` and `WebGLAttributes.js:5-17` upload actual geometry and instance buffers in render. Textures are initialized at material uniform application unless `CompileTextureQueue` explicitly runs. That queue is only enabled by texturePreparation=1 (`shader-readiness.js:18`), not default. No evidence yet partitions buffer upload, texture upload, target allocation, first actual driver draw or remaining JS.

Actual first renderWorld (`main.js:90-99`) includes wind caches if enabled, room shadow atlas preparation, OFF coverage hook, refraction preparation and worldFrame main/output. Default initial compile already calls room atlas/refraction and binds the HDR target (`:302-329`); therefore not all target creation can be assumed to occur at firstFrame. The pass window must identify actual remaining calls.

Existing early upload branch is not a recommended retry: `tools/reports/early-tree-textures-v38.md` records no stable navigation gain in four runs; seven uploads cost59.4/98.9ms CPU. Earlier texturePreparation reduced firstFrame308→172ms while moving shader195→431ms and total navigation remained7.890/7.888sec. These older milliseconds cannot explain today's seconds without measurement.

## Minimal next measurement, not yet implemented

Reuse the independent review build pattern of `tools/build-shadow-cpu-review42.mjs`, preserving official plugins and data paths, output below dist-v2. Review-only transform measures sync work time and await-tail separately at the existing measureLoad boundary. Wrap actual context calls only during firstFrame: bufferData/bufferSubData; texImage/texSubImage2D/3D; texStorage2D/3D; generateMipmap; renderbufferStorage/Multisample; drawArrays/Elements and instanced variants; blitFramebuffer; existing getProgramParameter/checkFramebufferStatus. Record counts, aggregate CPU, maximum, buffer bytes and bounded top16 slow calls. No added getError/getParameter/finish/readPixels or extra draw. Unknown texture byte sizes stay unknown rather than inventing bandwidth.

One call's time may be driver back-pressure from previous work: count/max explains where CPU waits, not which GPU operation caused it. Sum wrapped CPU versus direct sync and await-tail, report unaccounted JS and timer overhead. Restore all original methods after the first completed frame and save with the existing /__review38/evidence endpoint. Browser window coordination pending; no production/main edit or fresh upload optimization was made.

## One actual frozen49 attribution run

Executed the existing default49 built entry `assets/v2-Dra3GlgJ.js` through a new same-directory copy, not current source. `tools/build-first-frame49-frozen-review.mjs` asserts exactly one complete minified measureLoad match, writes `assets/v2-first-frame49-review.js` plus `first-frame49-review.html`, and verifies original entry unchanged. Build provenance is `first-frame49-frozen-build.json`. All original sibling imports, worker URLs and public resources remain in place. No Vite/source rebuild, source binding substitution or parameter disabling Worker. Browser HTTP/GPU caches were not forcibly cleared: this is one attribution sample, not controlled cold AB evidence.

Actual `first-frame49-native-gl.json`: Desktop1280x800/DPR1/time870, errors empty, newPrograms empty, hooks restored true. Direct firstFrame630.2ms, await-tail0.1ms, phase630.7ms. Wrapped GL289.5ms; unaccounted synchronous JS/other calls/timing overhead340.7ms. bufferData4580 calls /115,817,932 bytes /90.7ms (max16.7); texSubImage2D63 calls /119.9ms (max35.2); texSubImage3D10 calls /71.1ms (max24.4). Draw calls total below1msCPU; that is submission latency, not GPU execution time. No new finish/readPixels/query synchronization was introduced. Per-call timer/dispatch overhead is part of this instrumented sample and not an optimization measurement.

Initial shader356.5ms with zero stalled probes, initialScene9051.2ms; navigation first-frame submission16188.5ms. **The earlier9–10sec first-frame stall did not reproduce.** It is not fixed by this diagnostic. This run proves real remaining uploads exist after compile, but their measured cost does not explain historical seconds. Existing source new candidates were not included. Browser tab1839973818 closed; device override cleared and native methods restored.

Next action is deliberately narrower than another upload candidate: retain the diagnostic entry for the next naturally stalled load, and identify the actual unready shader program and completion-status timeline in the existing readiness mechanism before considering its fixed5000ms recovery policy. An earlier bounded LINK_STATUS probe is only a testable candidate after a stall recurs; it may merely move a driver wait. Do not reduce the default threshold on this successful no-stall sample. Buffer/texture preupload would predominantly move the observed~282ms and previous total-navigation tests already failed; it is not justified as the10sec fix. No production optimization/default change was made.

### 后续环境核查：并非已证实独占 GPU

主线随后实测旧场景页 3780 独立窗口始终 `visibility=visible`，约 98.8 秒 renderer frame 增加 3112，五分钟监听未出现 hidden；另验收页 3815 也 visible。因此本次 first-frame49 单组内部耗时记录仍是真实调用时间，但不能称独占 GPU，不能将历史长尾或本次 630ms 的差异归于代码变化。主线将关闭旧场景 3780、旧测试 3777，仅保留一个 3D 场景后重载观察。现有新增同步/await 与 stalled program 字段保留；不调整 5000ms 阈值、不据此重新提前上传。
