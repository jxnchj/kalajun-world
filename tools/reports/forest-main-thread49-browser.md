# Forest native Chrome CPU timeline 49

Date: 2026-10-28. This is a native Chrome DevTools Performance recording of the formal main build, not a clean FPS benchmark. No application source or rendering option was changed. No review hold was used.

**Later environment correction (2026-10-28):** the root task found retained scene tab1839973780 was still `document.visibilityState="visible"` while a different Chrome window was active. Over98.796seconds its renderer frame counter advanced3112; a5-minute observer saw no `hidden` event. Thus this session's empty owned-tab list did not establish system-wide GPU exclusivity. This trace must be treated as potentially contended by that retained 3D scene, not as an isolated single-world CPU/GPU baseline. Its captured stacks and callback durations remain evidence of what this tab did, but its approximately54ms frame intervals and idle/back-pressure gaps cannot establish the cost of one world. No new trace was recorded for this correction.

After the root closed old tabs1839973780 and1839973777, the separate formal49 single-scene baseline was40.093ms mean /50.1ms p95 (60settle+180RAF, same pose,1280×800/DPR1,time870,q0,errors empty; `docs/previews/v2-route-craft-38/default49-single-world-baseline.json`). This is new environmental baseline evidence, not an implementation speedup or a value to subtract from this instrumented trace.

## Recorded setup and evidence

- URL: `http://127.0.0.1:5174/dist-v2/v2.html?view=river-forest&time=870&debug=1`; no `profile` or experimental flags.
- Runtime checked once before recording: canvas 1280×800, renderer DPR 1, q=0, morphing=0, time=870, camera `[-3611.851169467755,2329.157270885741,4805.483400316967]`, yaw `-29.88794104541604`, pitch `-10`.
- Native DevTools docked right, Responsive emulation set to Desktop, 1280×800, DPR 1. CPU/network No throttling. JavaScript samples enabled; Screenshots enabled; memory/advanced paint instrumentation disabled. Browser host DPR remains 2; this is different from the emulated renderer DPR 1.
- Native trace saved through Chrome's Save trace dialog: `docs/previews/v2-route-craft-38/forest-main-thread49.json.gz` (approximately 12 MiB compressed). Export excludes resource contents and source maps.
- Trace start `2026-10-28T10:37:35.284Z`; 260,337 events, range 13,007.038 ms. Primary frame URL confirms this exact page; renderer PID 60083, main TID 3910330; profile id `0x1`. Bundle `web/dist-v2/assets/v2-BXAhyinM.js`.
- Chrome console paste protection appeared during attempted readiness check; it was not disabled. Readiness was obtained through the existing scoped read-only Runtime diagnostic capability. No CDP Profiler or new application sampler was used.

## Native panel findings

Summary: Scripting approximately 4,052 ms, System 278 ms, Rendering 20 ms, Painting 19 ms over 13,007 ms. Native Bottom-up includes **Profiling overhead 245.050 ms self / 313.925 ms total**, so this trace must not be treated as an uninstrumented run.

| Native Bottom-up item | Self ms | Total ms | Verified bundle mapping |
|---|---:|---:|---|
| `yt` | 296.653 | 528.968 | `WebGLRenderer.projectObject`: visible/layer/frustum traversal, WebGLObjects update, render-list insertion; line 4217 col 34665 |
| `w` | 250.221 | 851.395 | `WebGLShadowMap.renderObject`: shadow traversal and render submission; line 4193 col 5837 |
| `Aa.renderBufferDirect` | 231.289 | 935.806 | Native renderer draw submission; line 4217 col 29375 |
| `o` | 172.057 | 242.816 | `WebGLObjects.update`: geometry and instance attribute updates; line 4069 col 6275 |

These total times overlap through their call stacks; do not sum them. In particular, `yt` is not setProgram and `w` is not WebGLAttributes.update. `Dt`, line 4217 col 41308, is the setProgram path.

## Closed RAF duration and sampled stack breakdown

Trace contains 237 main-loop `rt` FunctionCall entries: 236 closed duration events and one unfinished final begin event. The first closed event takes 340.585 ms and overlaps profiler startup; its first sampling delta alone is 243.838 ms. Exclude that event and the unfinished final event for the steady diagnostic subset.

- Remaining **235** closed main-loop callbacks: mean **16.7468 ms**, p50 **15.673 ms**, p95 **21.670 ms**, min **13.594 ms**, max **23.270 ms**.
- **234** corresponding successive start intervals: mean **53.8860 ms**, p50 **50.930 ms**, p95 **68.822 ms**, min **22.363 ms**, max **141.087 ms**.
- The steady subset spans 12,630.671 ms. Sampled `(idle)` is approximately **8,567.705 ms**. Every measured callback is longer than 13 ms; this is not a sequence of hidden/held no-op RAFs.

Offline `ProfileChunk` aggregation uses the matching profile PID/id, merges nodes by call-frame identity, follows parent edges, and weights samples by `timeDeltas`. The steady sample window is from the second closed `rt` start to the last closed `rt` end. It is an approximation of native profile processing, not an exact reimplementation: full-range sampled self times differ slightly from the native Bottom-up values above.

Mutually exclusive direct children of the main-loop stack, divided by the 235 closed RAFs:

| Subtree | Approx. sampled ms/RAF | Mapping |
|---|---:|---|
| `runPreparedMain` | 10.949 | environment/shadow preparation plus main draw; bundle 4219:15975 |
| `renderReflection` | 1.346 | water reflection render; 6835:9571 |
| structures `update` | 1.296 | camera/world matrix and household/structure selection; 5594:14416 |
| terrain `update` | 1.129 | terrain plan/morph/cull and sibling submission batches; 4955:22998 |
| ecology `update` | 1.008 | wind and vegetation update; 5506:41526 |
| sheep `update` | 0.305 | existing flock simulation/animation; 4964:88164 |

Confirmed lower-level steady self costs include projectObject 1.250 ms/RAF, shadow renderObject 1.053, renderBufferDirect 0.968, WebGLObjects.update 0.720, native updateMatrixWorld 0.703, structure-matrix41 translation guard `gC` 0.666, structure-matrix41 wrapper `u` 0.513, multiplyMatrices 0.487, bindVertexArray 0.418. The terrain sibling batch update total is about 0.879 ms/RAF, including its `vc` validation path. These are measurable candidates, not proof that changing them improves overall frame delivery.

| Requested comparison | Exclusive self ms/RAF | Inclusive subtree ms/RAF |
|---|---:|---:|
| projectObject | 1.250 | 2.221 |
| shadow renderObject | 1.053 | 3.576 |
| renderBufferDirect | 0.968 | 3.907 |
| matrix41 wrapper `u` | 0.513 | 1.377 |
| matrix41 translation guard `gC` | 0.666 | 0.666 |
| terrain sibling batch update | 0.367 | 0.879 |
| terrain sibling fast validator `vc` | 0.337 | 0.493 |

The matrix41 wrapper and guard have non-overlapping self time totaling 1.179 ms/RAF; the wrapper's 1.377 ms inclusive already contains the guard. Likewise, terrain update's 0.879 ms inclusive already contains validation. These figures identify bounded CPU costs, not expected end-to-end gains. No Three.js internals or scheduling framework were changed.

## Interpretation and limits

The actual CPU timeline does **not** support treating the historical 70–90 ms frame intervals as 70–90 ms of JavaScript submission. In this recording, application callbacks generally finish in 14–23 ms while frame starts are about 54 ms apart, with substantial idle time. Rendering submission is a real CPU hotspot, but it does not alone explain the frame interval. Idle samples do not identify which GPU shader, compositor scheduling, or back-pressure mechanism is responsible. GPU process events in this general trace must not be presented as a per-scene GPU timer.

Do not infer a new clean FPS improvement or causal profile/no-profile difference from this recording. It uses the current formal build, real DevTools sampling, screenshot collection, and device emulation; historical ABBA runs were different evidence. No already-rejected atlas/proxy/multidraw/sceneMatrixCache/rootOrder/prepass scheme was re-enabled. No source change is justified merely by the largest minified function name.

## Cleanup verified

Restored the device toolbar's prior width 400, empty height, default DPR 2 and Mobile type, removed the DPR/type controls added for this task, switched Device Toolbar off, left Capture settings off, and closed DevTools. Closed task-created tab 1839973795 and verified this browser session's tab list is empty. No hold remains. GPU window was returned to the GI agent; subsequent work was only short offline trace parsing.
