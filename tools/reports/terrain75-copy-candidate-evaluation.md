# Terrain allocation-copy candidate: not adopted

**Decision:** keep production unchanged. The isolated candidate preserves the tested bytes but provides no consistent speed gain, and all four copies of the original 2500 ms case still fail its first `ready === true` assertion. No prepared/GI signature or payload was changed.

Baseline: `4e1d6f251ff979760f7020c4d940489cba091c36`.

## Candidate and correctness evidence

The staging-only patch expands the parent normal/color/cover copy loop, replaces same-buffer skirt `subarray`+`set` operations with bit-preserving `copyWithin`, and replaces six-element temporary morph index arrays with direct Uint16 writes. It leaves cross-buffer Float32 copies, all arithmetic, sampling, LOD, queue order, morph timing, budgets, and assertions unchanged.

Five fixed-input differential cases passed: dry, wet/hydrology, protected parent (no morph), small tile (mixed morph/no-morph), and warm cache. Each covers 9 or 10 tiles. Compared bytes include row snapshots at completed rows 1/2/17/18/33; all final position/normal/color/cover/hydrology/shore/landform/community/UV/index/morph buffers; heights and centers; exact bounds; and equal cache/sample counters. Cached row/finish guards and ownership also passed. `copyWithin` retained explicit ±0, infinity, and unusual NaN bit patterns.

The dry case exercised **1,884 alternate-diagonal writes, 2,212 standard-diagonal writes, and 4,096 unchanged cells**. These are bounded synthetic byte-equivalence results, not a full-world/prepared-data certification.

## Same-process fixed-work ABBA

Both implementations received equal A-B-B-A warmup. Four measured ABBA blocks then built the same 9 tiles / 297 rows using a fresh world and cache per sample. All 16 outputs had the same full output hash. Hashing and snapshots were outside timing; no fake clock or forced GC was used.

| Variant | Samples | Median | Mean | Range |
| --- | ---: | ---: | ---: | ---: |
| Baseline A | 8 | 27.62 ms | 28.54 ms | 21.04–36.07 ms |
| Candidate B | 8 | 28.18 ms | 28.68 ms | 25.79–32.98 ms |

Candidate block improvements were **−6.77%, −6.55%, +10.15%, −0.57%**: faster in only one of four blocks. Short, variable samples cannot support a stable speed claim.

## Original 2500 ms assertion — separate failure evidence

The original test body and assertions were copied unchanged except post-return observation and final cleanup. The initial call retained `maxMs: 2500`, default `waitFor: "all"`, original fixture/camera, and normal real-clock execution.

| Order | Elapsed | Iterations | Queued | Near queued | Morph groups | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| A | 2509.15 ms | 549 | 61 | 0 | 4 | budget; first ready assertion failed |
| B | 2504.81 ms | 617 | 0 | 0 | 2 | budget; first ready assertion failed |
| B | 2504.65 ms | 592 | 8 | 0 | 5 | budget; first ready assertion failed |
| A | 2502.57 ms | 606 | 16 | 0 | 6 | budget; first ready assertion failed |

Every run had `nearReady: true` but not full readiness. A temporarily empty queue is insufficient while morph groups remain; the original readiness semantics were preserved. Relocation/disposal assertions were not reached. These warmed same-process failures must not be confused with the earlier instrumented diagnostic or a full-suite rerun.

## Binding cost and boundary

Read-only binding enumeration found `terrain.js` absent from forest (26 sources), meadow (67), reach-cover (83), and structure (45), but present in terrain-prepared (41), through `terrain-row-kernel.js`. The room-exterior GI exporter also explicitly hashes the entire `terrain.js`. Adoption would therefore require real terrain payload regeneration/equality proof and explicit handling of the exterior GI provenance, not merely signature edits. Changing `meadow-surface.js` would additionally affect forest, meadow, and reach-cover bindings.

That regeneration cost is **not justified for this rejected candidate**. The original failure remains open. The test combines correctness (honest readiness and coverage) with a machine-dependent throughput requirement. Future correctness evidence can be added independently, but removing/loosening the 2500 ms assertion or counting a moved performance failure as a full pass would change the acceptance contract.

## Evidence and execution limits

- [Machine-readable evaluation](terrain75-copy-candidate-evaluation.json)
- Separate staging evidence: `backups/terrain75-copy-candidate/equivalence.json`, `original-budget-failures.json`, and `fixed-work-abba.json`.
- Staging patch, runner, source hashes, and coverage are in the same directory. Production `terrain.js` SHA-256 was rechecked unchanged.
- One harness setup error (missing `restoredTiles: 0` in the test double) was corrected before the recorded run; no production correction was involved.
- CPU validation has ended. No browser/GPU work, further performance loop, live source edit, prepared manifest edit, or GI signature change was performed.
