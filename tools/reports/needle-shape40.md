# Round 40 fixed needle shape GPU candidate

Status: implemented, default OFF, unit/regression verified; actual browser pixel equality and GPU-time acceptance pending. No density, geometry count, wind, LOD threshold, light, material colour or camera changes. This is an experiment for the existing stage-3 performance task, not an adopted performance improvement.

## Runtime integration

- URL `needleShape40=1` installs the candidate on station needle colour/depth materials. Without this flag, existing shader and geometry attributes remain unchanged and no shape targets are allocated.
- Outside any render callback, call `ecology.gpuBrushes?.prepareNeedleShapes(renderer, {budgetMs:2,maxForms:1})` before the world render. Continue in later frames for lazy packets. The budget is checked between forms: a single form compile/bake can exceed 2 ms.
- Same-page AB: `ecology.gpuBrushes.setNeedleShapeEnabled(false)` / `true`. This changes a uniform, without recompile or table reallocation. Both paths retain the same candidate shader structure, so also compare a clean default-OFF page for final adoption.
- Inspect `ecology.gpuBrushes.stats.needleShape`: prepared/pending, attachmentBytes, cumulative submissionMs and errors. GPU milliseconds remain null; submission CPU time is not GPU timing.

## Ownership and preservation

Each source form/lazy packet gets one two-target RGBA32F bake, shared by all tree roots and all colour/depth/reflection draws. Original per-needle delta/side arithmetic is retained. The original normal, vertex corner, colour UV, root matrix, wind, branch readiness and LOD code follow either branch unchanged. Draw-run source offset addresses the same packet table. Lazy entries include the additional table bytes in their existing cache budget and release targets/materials on eviction. Base and lazy material uniforms are separate. Context restore invalidates tables and reuses the original expression until a new bake succeeds. Float MRT capability or shader failures stay on the original expression with explicit error stats.

Storage is 32 logical bytes per needle (46,080 bytes per 288-station brush), plus 1024-wide row padding; no root multiplication. This trades ALU for two texture reads and VRAM and may fail performance acceptance. No current speedup is claimed.

## Verification

`node --test web/src/v2/needle-shape40.test.js web/src/v2/needle-shape-precompute39.test.js web/src/v2/spruce-gpu-stations.test.js web/src/v2/spruce-branch*.test.js`

Combined run: 29/29. Candidate-only module: 6/6. Coverage includes default isolation; colour/depth fallback construction and branch colour station scoping; independent lazy uniforms; single shared source table across roots; nonzero run addressing; preserved root wind/needle count; uniform-only same-page toggles; explicit failure fallback; context restoration and disposal.

Browser first compile exposed a reversed-depth renderer compatibility error with a bare Camera. The bake now uses OrthographicCamera (clip positions remain explicit); regression exercises its reversed-depth projection update. Rebuilt browser retest is required.

## Pending browser gates

1. Use identical route, resolution, DPR, time/weather, root/branch readiness and stable wind state. Wait for pending=0 and no error.
2. Capture same-page ON/OFF pixels with frozen scene/time and compare, including main view, reflected water and shadows. Different compiler passes still need empirical equality.
3. Measure repeated interleaved AB GPU/frame timings with disjoint filtering. Compare separate default OFF too; extra texture samplers/branch structure can cost even when the uniform is OFF.
4. Measure cold load and incremental bake stalls, allocation peak and lazy eviction/return correctness. Do not promote if performance or loading worsens.
5. Full shader compilation, pixel capture and performance are not proven by Node tests. Keep flag OFF unless these pass.

## 2026-10-26 actual Chrome result

Reversed-depth first run failed explicitly (`updateProjectionMatrix` missing on base Camera), fallback remained intact; corrected with OrthographicCamera. Subsequent real run: 40/40 tables prepared, 99,319,808 attachment bytes, cumulative CPU submission 508.6ms (not GPU time), no shader diagnostics/error. Frozen river-forest 1280×800/DPR1/time870/q0/m0 OFF→ON→OFF main output: 0 differing pixels in both comparisons. Water reflection cache was held; this does not independently prove a freshly recaptured reflection.

Natural 12-second alternating runs OFF/ON/OFF/ON: GPU recent60-frame means 34.2579 / 34.1629 / 33.9111 / 34.5614 ms; latest120-frame mean intervals 101.389 / 97.363 / 98.613 / 94.786 ms. All terrain q0/m0. Different shadow refresh frames have different render triangle totals by the existing scheduler; no density/geometry/range was changed. The stats `needle` nested object in the evidence was a live reference and ended with enabled=true in every record; authoritative run toggles are the separate `on` booleans. Evidence: `needle-shape40-pixel-*`, `needle-shape40-abab.json` in docs/previews/v2-route-craft-38.

Decision: no stable GPU benefit, substantial additional memory, remains OFF. Do not pursue default adoption based on CPU frame drift or pixel equality alone. First-load long tail remains open; no cold-load speedup claimed.
