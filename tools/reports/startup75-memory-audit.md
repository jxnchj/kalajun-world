# Startup 75 memory audit

Code: `81995554835581a9c3edbf2a47c94c68e175db18`. Source inspection only; no production optimization or new runtime experiment. Repository-relative source hashes, asset headers, graph listings and evidence hashes are in [the JSON companion](startup75-memory-audit.json).

## What is established

The known pre-`worldData` buffers do **not** explain or establish a fix for the GiB-scale renderer/process peaks. The generic loading caption is not reliable phase attribution at a later RSS sample.

[World-data loading](../../web/src/v2/world-data.js#L282) starts ten source requests together. Unique retained raster backing is exactly **56 MiB**, derived from source dimensions:

| Retained data | Calculation | Bytes / MiB |
|---|---|---:|
| Core Float32 heights | 2048² × 4 | 16,777,216 / 16 |
| Far Float32 heights | 1024² × 4 | 4,194,304 / 4 |
| Detail RGBA | 2048² × 4 | 16,777,216 / 16 |
| Core landcover RGBA | 2048² × 4 | 16,777,216 / 16 |
| Far landcover RGBA | 1024² × 4 | 4,194,304 / 4 |
| **Total** | | **58,720,256 / 56** |

`Uint8Array`/`DataView` wrappers and `makeRaster` containers do not allocate another copy of their backing. Baseline-world and surface references sharing those arrays are not another 56 MiB.

Potential overlapping temporaries: decoded Uint16 heights **10 MiB**; PNG canvas pixel backing approximately **20 MiB**; PNG bitmap pixel backing approximately **20 MiB**; three compressed inputs **12,067,444 bytes (11.51 MiB)**; possible Blob snapshot storage of similar compressed size. Bitmap cleanup already occurs. Canvas release, browser image representation, decompressor storage, physical copy sharing, GC and simultaneous lifetimes are unmeasured. **Do not sum these categories into an observed RSS peak.**

## Hydrology and the later worker

[Hydrology construction](../../web/src/v2/hydrology.js#L58) recursively constructs a complete baseline `valleySource` and then current hydrology. The source contains **219 lines / 62,637 points / 62,418 segments**; the initial source-index formula inserts **155,538 references per pass**. These are source-derived counts, not heap-byte measurements. Both resulting graphs remain available.

**Preserve both graphs.** [Valley root mapping](../../web/src/v2/valley-bank-roots.js#L8) uses the baseline to retain original root placement. This audit does not recommend removing it.

Only after main `worldData` and coarse terrain, [worker startup](../../web/src/v2/main.js#L158) [structured-clones inputs](../../web/src/v2/terrain-row-worker-client.js#L28): another **56 MiB** of raster backing, plus JSON/object copies. The [worker reconstructs world data](../../web/src/v2/terrain-row-worker.js#L6), including two hydrology graphs. Transferring these live main-world buffers would detach them and is not an acceptable drop-in optimization.

## Asset/import boundary

The on-disk review build has **12 initial static JS chunks, 3,743,552 bytes total**; its main chunk is 3,319,161 bytes. The nonreview build is **12 chunks / 3,732,191 bytes**. These are file sizes, not measured JS heap or browser cache residency.

The approximately 11.8 MB `0-*.js` lodge modules are dynamic GI fallback imports, not initial static imports ([example](../../web/src/v2/lodge-tables-field.js#L12)). Public runtime assets include lodge tables GLB **20.11 MB**, guest living **17.06 MB**, streamed tables interior **14.97 MB**, and vanity **14.78 MB**. [Their asset-loading stage starts after world data](../../web/src/v2/main.js#L153). Large `.blend` files are authoring inputs, not evidence of browser-loaded content. The early local canopy lookup is another conditional source; a cache hit was not measured here.

## Separate native observations

| Case | Guard result | Native observation / limits |
|---|---|---|
| 02, default compositor | Sampled sum-RSS **2,162,368 KiB**, over the old 2 GiB guard | At 07:32:37 UTC, earlier screenshot still showed generic world-data preparation and software QA preparing 0/0. At peak, reported renderer/GPU/browser RSS was 1,413,496 / 181,536 / 168,804 KiB. The screenshot does not establish the phase ~21 seconds later. |
| 03, large-scene tier | Sampled sum-RSS **3,309,492 KiB**, over the 3 GiB guard; minimum system available **5,481,095,168 bytes** | Reported native UI reached **1,132 terrain chunks**, QA **gpu-wait**, **1 preparation fence complete**, world **0/0**. Reported renderer/GPU/browser RSS: **1,770,292 / 971,700 / 150,228 KiB**. No startup diagnostic JSON was successfully saved. This is later than the initial caption; do not attribute the entire peak to `worldData`. |

Evidence: [case02 summary](../../backups/cloud75-baseline/native-world-static-02-default-compositor/summary.json), [case03 summary](../../backups/cloud75-baseline/native-world-static-03-large-scene/summary.json), and their adjacent events/screenshots. RSS is a sampled sum that can double-count shared pages and miss between-sample peaks. These were **RSS guard stops, not established OS OOMs**. No completed world GPU frame, final quality acceptance or real-time performance result follows.

## Small exact-output candidates — not implemented

1. Explicitly release/reset the temporary PNG canvas after extracting pixels: shorter lifetime for approximately 20 MiB combined backing, without changing pixel output.
2. Replace [gzip Blob snapshot](../../web/src/v2/world-data.js#L49) with a byte-backed stream, preserving magic detection, offset views, already-decoded input and corrupt-stream failures. Possible copy reduction is around 11.51 MiB for current inputs, not a measured saving.
3. Perform each height conversion in a short-lived source job after metadata arrives, avoiding outer `cb`/`fb` references through synchronous world construction. Preserve bit-identical Float32 outputs and stage behavior; potential 10 MiB lifetime improvement is GC-dependent.

None is claimed to recover the GiB-scale gap. Density, detail, source roots and hydrology remain unchanged.

## Next minimal diagnostic

Use existing **保存诊断JSON** when responsive: [loading-only snapshot](../../web/src/v2/main.js#L92), [export button](../../web/src/v2/software-review75.js#L106). Case03 did not successfully export one; a blocked/deferred click is not phase evidence.

If diagnostic-only instrumentation is needed, record monotonic checkpoints before/after the ten-source join, height conversion and `createWorldData`, plus worker-init and asset-start boundaries. Include completed source counts and declared buffer sizes; export through the existing UI and correlate with monitor timestamps. Optional `performance.memory` is only JS-heap telemetry, not renderer/GPU/RSS. A checkpoint cannot sample inside a synchronous blocked task. Do not force GC or change scene semantics merely to obtain a favorable number.
