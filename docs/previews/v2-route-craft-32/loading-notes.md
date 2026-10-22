# Round 32: lossless shared landcover sampling and forest conflict pruning

## Evidence and target

Round-31 B1/B2 initial scene preparation spent 3,110.6 / 3,822.0 ms in ecology and related preparation, over 90 ticks. Near-crown geometry setup was already down to about 284 ms. This change attacks common source sampling work during tree, grass and terrain creation instead of redoing the earlier crown optimization.

1. `world-data.js` shares pixel coordinates and indices across RGBA channels. Every bilinear multiplication/addition stays in the same order as the old scalar sampler, including the core/far blend. No resolution change, quantization, interpolation approximation, or retained cover changes. The scalar path is retained with `landcoverSampling=scalar`.
2. `forest-root-layout.js` rejects lower-priority neighbors before generating their proposals. Only higher-priority proposals can force a source fallback under the existing algorithm. Coordinate guard, tie ordering, collision distance, habitat checks and complete tree membership are retained. Set `forestPriorityFirst=0` for the previous evaluation order. No new cache or permanent storage is created.

Both default enabled. Compare the complete old calculation with `landcoverSampling=scalar&forestPriorityFirst=0`; parent browser acceptance owns any adoption adjustment.

## Exact output and offline timing

- Real forest-creek first 90 tile requests: 92,160 cells, 62,781 tree records. Every complete record, including null source cells, serializes to the same SHA-256: `834a0b0d533536b94de326e7fca0a13958bf105724c31268caf8a3b09f336f5e`.
- Alternating six old/new repetitions: old mean 332.32 ms, new mean 248.61 ms, 25.2% lower CPU time for this source-generation segment only.
- Priority-only trial: 314.56 → 292.77 ms. Most of the combined gain comes from the common RGBA coordinate reuse.
- `loading-root-joint.json` / `.log`: raw samples, statistics and equality digest. `tools/benchmark_forest_root_priority.mjs` reads the protected original conflict algorithm; old sampling is the retained scalar method.
- Actual core/far edge, blend region and arbitrary coordinates compare exactly; low-level Uint8/Float32 raster checks also use `Object.is`.
- Equal-priority ties and reverse-order root queries compare exactly.

## Scope limits

This is not a claim that the complete cold first frame or GPU burden is solved. No texture/network/asset bytes, triangle count, vegetation count, draw distance, time integration, queue budget or readiness gate changes. Terrain/grass scheduling can finish different amounts of already-required work inside unchanged millisecond budgets; final output remains complete. Browser startup and same-condition image/performance acceptance are handled by the coordinating task.

Backup: `backups/route-continuity-v32/loading/web/src/v2/`.
