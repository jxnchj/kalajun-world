# 95m meadow aerial continuity adoption

2026-10-27. `meadowAerialContinuity42` now defaults ON; URL `?meadowAerialContinuity42=0`, constructor `false`, or `ecology.setMeadowAerialContinuity42(false)` preserve the exact original height gate. No root density, geometry, XZ LOD radius, wind, shadow flags, material or far-grass defaults changed. The cluster extension remains default OFF.

Adoption evidence supplied by the coordinator: `meadow42-aerial-fixed-before95` / `after95` retain every source field (zero differences), all 24 leaves and 303,601 resident roots. The original same-wind after95 case hides all meadow layers; the corrected images remain continuous. Native E/Q flight crosses 94.83–97.73m in 29 frames, zero hidden frames and no errors (`meadow42-aerial-native-crossing`).

This adoption solves the incorrect 95m all-or-nothing visibility jump only. It does not claim that the finite 320m extension boundary or all near/far meadow continuity is finished.

The former 250m hidden oracle in ecology.test.js remains explicitly `meadowAerialContinuity42:false`, with its original hidden assertion. New defaults/URL tests require ON, explicit zero requires OFF; the detailed crossing test still checks exact grass and flower root/matrix identities, wet meshes, shadows and queue preservation, plus reversible OFF behavior.

Fresh backups of 14 affected output/report files are in `tools/backups/aerial42-adopt-cache-rebind/`, with original SHA-256 in `before.json`. The same five formal generators were run again after adoption:

```sh
node tools/build-meadow-root-cache-v38.mjs
node tools/build-reach-cover-prepared42.mjs
node tools/export-meadow-patch-v38.mjs
node tools/export-meadow-distance-baseline-v38.mjs
node tools/export-meadow-clusters42.mjs
```

`tools/reports/aerial42-adopt-cache-rebind.json` records full before/after comparisons. Meadow and prepared-shore compressed and decompressed bytes are unchanged; manifests differ only in generated `code` binding. Five source fixtures differ only in `sources`, with every root/attribute/geometry/ground field identical. Forest binding remains valid without regeneration. No hand-edited hash.

Validation: 62/62 targeted aerial/continuity/worker/cache/actual-root/prepared-cover/reference/cluster-LOD tests pass, plus the original explicit-OFF meadow streaming test 1/1. Logs: `/tmp/aerial42-adopt-tests.log`, `/tmp/aerial42-adopt-old-path.log`. The coordinator performs the unified full regression and main build; neither was started here.
