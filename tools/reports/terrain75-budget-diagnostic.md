# Terrain 75 budget diagnostic — unresolved

The original terrain budget test still fails. This is an **intermediate checkpoint, not a full test pass or visual acceptance**. No terrain runtime, quality setting, clock, budget, or original assertion was changed.

## What failed

The preserved uninstrumented result fails the **first** assertion, `assert.equal(result.ready, true)`, at `web/src/v2/terrain.test.js:199:10`; it does not reach relocation/disposal checks. The preserved case duration is 2902.93 ms.

A single copied, instrumented version of the exact initial `prepareView(camera, { maxMs: 2500, onProgress })` call returned:

| Field | Observed |
| --- | ---: |
| `ready` / `nearReady` | false / false |
| `reason` | budget |
| `elapsedMs` | 2504.05 |
| iterations | 356 |
| queued / near queued tiles | 220 / 104 |
| morphing groups | 0 |
| visible tiles / minimum spacing | 199 / 0.3125 |
| row worker / worker-pending jobs | absent / 0 |

The failure is unfinished tile generation, not just morph settling. Reaching the minimum spacing in some visible tiles is not full readiness. `prepareView` requires three planning turns with zero queued jobs and zero morphs (`terrain.js:647–674`).

Measured update work totaled 2237.95 ms: row construction 1309.24 ms, tile finish 406.16 ms, planning 99.95 ms, measurement 57.36 ms, queue sorting 10.71 ms, and morph advancement 0.99 ms. These are diagnostic timings, **not a performance comparison**.

## Full dependency audit

Node resolution recorded the executed import graph, rather than checking only `terrain.js` and its test. The test closure contains **52 modules: 44 Git-tracked files, 6 installed Three modules, and 2 Node builtins**. `WorldTerrain` alone reaches **25 modules: 23 tracked files plus 2 Three modules**.

- Every tracked closure file is byte-identical to baseline `8ea4753192ac8941954c8af3696a766da7adc72f`, including generated source JSON and transitive terrain/material/environment dependencies. The JSON report records every current and baseline Git blob hash.
- The sole dormant local dynamic import, `shadow-depth-diagnostic.js` from `environment.js:109`, is also baseline-identical. It was not executed; its only import is the already-audited Three package.
- `web/package.json` and `web/package-lock.json` are baseline-identical. Three resolves to 0.186.1; all six loaded installed files are hashed. **Those installed files are not Git-tracked, so historical installed bytes cannot be certified from Git.** An unchanged lockfile is not that missing byte proof.
- `main.js`, `terrain-row-worker-client.js`, `software-review75.js`, and `software-review-policy75.js` are absent from the executed closure. No row worker exists in this case. There is no direct optional-review runtime path in this test.

## Limits and next step

The diagnostic uses a copy under `backups/cloud75-terrain-diagnostic`, with timing wrappers around six methods and `update`. That adds overhead inside the unchanged budget; the isolated target also has a different warmup/allocation history than the complete terrain file. Its queue counts establish this run’s state, not the exact state of earlier uninstrumented failures.

**Established:** the preserved first assertion fails, the diagnostic exits honestly on its real budget with unfinished generation, and the tracked dependency closure is unchanged from baseline. **Not established:** why earlier baseline/isolated runs passed while later runs failed, whether external installed bytes changed historically, or a new runtime regression/environmental cause.

Keep this original budget failure explicit in the checkpoint. Do not optimize production, relax the test, or claim the suite passes. The smallest future diagnostic change would be a test-only assertion message containing the returned result, so an uninstrumented failure preserves its reason and queue state. No further run or source change is included here.

Evidence: [`terrain75-budget-diagnostic.json`](terrain75-budget-diagnostic.json). Raw copied case, resolver trace, returned state, and TAP are retained under `backups/cloud75-terrain-diagnostic/`; the preserved original failure remains under `backups/cloud75-resource-isolation/results/terrain-isolated.tap`.
