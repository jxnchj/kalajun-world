# Offline needle packet feasibility, 2026-10-26

Read-only analysis and an offline measurement; no runtime changes or new production assets. `tools/measure-spruce-packet40.mjs` loads the actual hi GLB/recipe, derives the exact lazy branch groups and calls the original buildBrushPacket. Every gzip roundtrip preserves every typed-array byte.

All five forms contain276 lazy groups/8457 brushes:225035778 raw typed-array bytes,186011800 gzip bytes (about17.3% compression). Node aggregate generation3097.12ms and decompression574.24ms. These totals cover all groups, NOT the actual35-group forest view; current snapshot does not list group keys. Header, per-group fetch latency and browser parse/upload costs are excluded. The exported JSON contains per-key results for an exact browser-key subset later.

Existing actual `shadow-atlas40-perf-default-a1.json` reports35 resident groups, buildMs12981.1ms, firstGroupBuildWait2922.9ms, allBuiltWait25381.5ms. These include scheduling/message contention, not isolated pure compute. The much smaller Node all-group generation time means an offline packet cannot be assumed to remove that entire browser wait.

The offline format can cache the original frames(Float32), wood(Float32), variationKeys(Int16), variations/sharedVariations and topology with exact array metadata and source hashes. Cache must bind hi GLB, recipe, branch-detail constants and generator/packet code. Load the requested spatial group on demand with current bounded queue/abort/disposal semantics and validate before publication; retain runtime generation on recoverable cache failure. No geometry conversion or lower detail is necessary.

However, a full186MB bundle is a poor cold-start choice. Shared variations are already reused by rendered forms and present redundantly in each CPU packet; any future dedup must preserve the CPU stationBrushBounds use as well as GPU branch variations. This needs equality tests and source-bound per-form shared data, not simply deleting an array. precomputeBrushPacket is a different, larger shape layout and currently assumes stride16; lazy branch records use stride13, so it must not be used as an offline shortcut.

Recommendation: first isolate browser worker CPU/message/publication waits for the35 real keys, then test a small source-bound group cache with exact bitwise parity and same-view cold AB. Do not adopt a large download merely because local decompression is faster. This is feasibility evidence only, not a delivered loading speedup.

## Actual forest subset identified

Parent extracted35 runtime branchCache keys from the actual page. Summing the already measured matching rows (no second compute run): {"brushes": 999, "bytes": 27024606, "gzipBytes": 21845233, "buildMs": 367.9250840000002, "inflateMs": 67.31187400000181}. This is exactly the selected group set; timings are Node measurements of those groups within the all-group run, not browser cache speedup. Raw/gzip exclude metadata and fetch overhead.

## Runtime phase instrumentation (no scheduling or quality change)

Added duration-only telemetry around the original worker generation/optional packing and caller dispatch-to-message interval. Timing is stored in the builder's WeakMap, not added to recipe/packet fields; real five-form byte and attribute equality remains covered. Worker/window timestamps are never subtracted across realms. `packetNonComputeWaitMs = max(0, roundTrip - generation - packing)` includes worker queue, transport, main-thread delivery delay and scheduling; it is not pure network or idle time. Worker generation is elapsed wall time within buildBrushPacket, not operating-system CPU accounting.

Lazy group's main-thread station geometry, bounds, GPU-table objects, material cloning and optional shape registration are measured as `packetMainPrepareMs`; this excludes actual GPU upload/driver compilation and later draw/fade preparation. Existing firstDrawPreparation/allBuiltWait fields continue to report their original later gates. Existing `buildMs` and maxBuildMs keep their exact earlier interval. New counters aggregate only accepted successful cache results: preparationSamples, workerPreparationSamples, packetGenerateMs, packetPackingMs, packetRoundTripMs, packetNonComputeWaitMs, packetMainPrepareMs and roundtrip/main-prepare maxima. Per-group data is `entry.value.preparationTiming`.

No successful timing is synthesized for failed/aborted/late/unknown-ID messages or an older worker response without timing. Recreated builder ID reuse cannot consume old builder replies. Tests cover out-of-order two-slot replies, duplicate messages, worker failure/replacement, missing/invalid timing, actual worker transfer identity, cache retry and disposed completion. The unchanged original buildMs includes the asynchronous build interval; its aggregate and overlapping roundtrip totals are not wall-clock scene load duration.

20/20 loading/worker/cache tests passed; real browser stage breakdown is still required before choosing an optimization. This instrumentation itself does not establish a loading improvement.

## Immediate dispatch candidate (default OFF)

`needleBranchDispatch40=1` selects a narrow candidate in SpruceBranchCache: reserve the same running/byte slots, call the original async build immediately inside try/catch, and adopt its result through Promise.resolve. Success publication/failure retry remain asynchronous. This allows the original worker.postMessage (before build's first await) to occur before the caller's remaining synchronous scene work. The default remains the original microtask dispatch. It does not change worker concurrency, byte cap, records, priorities, geometry or draw/fade gates. Synchronous throws use the same retry path; synchronous disposal stops further dispatch and the eventual first result is disposed once.

Added buildDispatchWaitMs/maxBuildDispatchWaitMs measure only accepted builds' pump-to-build-invocation delay, and each entry keeps dispatchWaitMs. This separates that confirmed delay from the residual buildMs minus packetRoundTrip/mainPrepare; the entire residual must not be called dispatch delay without measurement. Candidate does not yet establish an actual cold-load benefit. The main thread must whitelist the pure rendering URL parameter for terrain Worker parity before browser A/B.


## Adoption after real browser alternation, 2026-10-26

Main-thread actual same-build A2/B1/A3/B2, HTTP cache disabled but local IndexedDB retained: all35 branch groups built in9939/5099.1/8288.7/5634.6ms; first group4469.8/1789/4356.9/2026.3ms; accumulated dispatch wait5271.2/.1/5192.3/0ms. All scenes eventually q0, no errors, original geometry counts retained. Concurrent cumulative metrics overlap and are not summed into wall-clock loading. Terrain's whole-scene tail varied, so no claim that the entire world's cold-load tail improved. This is specifically earlier completion of the original35 detailed needle groups under these cache conditions.

The needle station caller now defaults to immediate dispatch. `needleBranchDispatch40=0` explicitly restores the previous microtask path;1 remains accepted. Generic SpruceBranchCache still defaults false, so other callers do not silently change. Default-source browser verification follows the main-thread final build. Existing full-detail rendering and color/light staging are unchanged.

## Actual browser interleaved dispatch comparison

Same build/view/time870/1280x800/DPR1, HTTP cache disabled while existing IndexedDB retained. Four uncontended navigation samples A2/B1/A3/B2:35 packet groups allBuiltWaitMs9939/5099.1/8288.7/5634.6; firstGroupBuildWaitMs4469.8/1789/4356.9/2026.3; aggregate dispatch wait5271.2/.1/5192.3/0. A2/A3 use original microtask, B1/B2 immediate. All35 resident groups retain21579760 bytes,2 maximum active builds and original geometry. All return q0/m0/errors empty in completion snapshots. Required groups are35 while preparedGroups11–13 refers to separate pass/fade readiness; this does not prove every group visually faded in.

A1 ran during full tests and timed out before terrain completion; excluded. Several later45s observation windows also ended with terrain work pending, then resumed toq0. Their later uptime includes observation gaps/temporary review hold, so these completion times are NOT cold-start wall-time comparisons. Do not claim overall terrain-tail or steady-state GPU improvement. Evidence dispatch40-natural-a2,b1(-complete),a3(-complete),b2(-complete).

Decision: adopt immediate packet dispatch as the narrow, consistently improved branch preparation path; keep explicit0 fallback. No larger offline parameter download adopted. Whole-world GPU, terrain tail and final visual quality remain open.
