# Installed cloud software-review helper

Installed October 29, 2026 over `8ea4753`. This is a deliberately bounded fixed-viewport QA recovery path, not a new rendering backend or production performance optimization. Current source files are authoritative; tests and usage do not require an unpublished staging directory. Use the separately verified ANGLE/SwiftShader cloud browser without changing sandbox flags.

Installed focused checks passed 66/66. The first full run reported 1988/1992 with three old fixture failures and one unchanged terrain timing failure; fixture repairs passed 12/12. An early isolated terrain run passed 13/13, but subsequent ordinary full regression remained 1992/1993. A complete disjoint 379+1-file run then passed 1980/1980 outside terrain.test.js and 12/13 in that isolated group: aggregate 1992/1993, no skips. The original 2500 ms terrain-readiness assertion remains unresolved and unchanged. Its 44 executed tracked dependency files match 8ea4753 and do not include the optional QA integration; timing variability and its full cause remain unproven. See ../reports/terrain75-budget-diagnostic.md. This is an intermediate source checkpoint, not a full-pass or real-world rendering acceptance claim.

## Subsequent diagnostic checkpoint (2026-10-29, checkpoint cutoff 10:20 UTC)

The pre-configuration-repair diagnostic version used in cases05/06 passed 192 affected checks and a build; the last full result remains 1992/1993 with the original terrain budget failure. Those historical checks do not validate the configuration repair. The repair now has a separate 379/379 focused pass, 0 skips, and successful 9.73-second build; this is not a full regression or native acceptance. Read-only per-pass shadow state and a visible, single-capture JSON textarea preserve original render/preparation control flow and the ten-pass limit. Text export is manual, does not invoke clipboard APIs, does not refresh automatically, and clears on close.

Default-ON case04 failed finite local-shadow preparation: zero submitted/completed world draws, eleven completed preparation fences. Explicit `localShadowWindow42=0` case05 reached held3/3 at 1280×800/DPR1 with RGBA16F/Float32 depth/4×MSAA and matching generation/pose. Its held snapshot has terrain queue/morph/worker pending 0 but ecology pending 43 far-tree tasks; **all-queues-settled and full/default quality acceptance are not established**. The completed OFF route does not validate default ON. Case04 precedes the diagnostic build, so it is not a same-build causal/performance comparison with case05. See [the detailed limits and evidence](../reports/cloud75-native-review-checkpoint.md). Same-build ON case06 failed all ten preparation attempts with lastFailure.phase=views and Original 4096 shadow required: native captures were ready at revision 76 with zero failures, but every owner remained null. Source analysis confirms the existing default auto/32-sampler route selects 2048 cascade maps while the default local owner requires a 4096 native first map; this is not a missing required URL parameter. The three-file repair now guarantees a 4096 nearest native map for ON while retaining cascade layouts/other map sizes/far poses/bias and the old OFF policy, with explicit low-capability rejection. Theoretical additional depth storage is at least 48 MiB, not measured VRAM. Five generated-source bindings remain unchanged. Case07 exercises default ON without an explicit localShadowWindow42 parameter on the new build; its native HTTP build identity and capability preflight passed, but at the 10:20 UTC cutoff terminal scene evidence is pending. The full suite has not been rerun on this repair.

## Installed files and provenance

- Runtime integration: `web/src/v2/main.js`, `terrain-row-worker-client.js`, `software-review75.js`, and `software-review-policy75.js`.
- Dedicated checks: `software-review75.test.js` and `software-review-integration75.test.js`; existing visual-time, opaque-depth, and RAF-profile fixtures cover the optional integration without dropping their original assertions.
- The installed integration test uses an inline immutable `renderWorld` baseline from `8ea4753`; it does not depend on Git history or unpublished files.
- `source-binding-check.json`: read-only actual generator functions evaluated; every changed runtime path is outside terrain/meadow/forest/reach/structure source closures. No generated output is affected, so no hashes or prepared payloads need editing/regeneration for this patch.

## Optional route and original owners

Use `softwareReview75=1`, optionally `softwareReviewInputGap75=250` (or `0`). Missing / explicit `softwareReview75=0` is inert. Duplicate, conflicting or invalid values are rejected by QA and terrain Worker compatibility. Do **not** append the unavailable historical `softwareReview41` flags.

No `world-context`, control keys/speeds/physics, geometry, materials, source switches, shadow resolution, framebuffer quality, AA, DPR or reflection policy changes. `renderWorld` retains its original owner/body with only an abort guard. Full main/reflection order and target/matrix ownership remain. Original default screenshot handler is intact. Textiles missing/0 stays OFF; shadow missing/1 and explicit0 fallback stay unchanged. No source-binding list or hash is hand-edited.

QA asks the original `terrain.prepareView` for `waitFor:'all'` with a 210-second budget and rejects a non-ready result; ordinary paths retain the original near preparation/budget. Original ecology/water/lighting/shader/local-shadow preparation all run. Local-shadow afterShadow async owner settling is awaited inside the same fence token. Async zero-time `clientWaitSync` polling (100ms cadence, 210s total owner/fence timeout) gates complete submitted groups. No `gl.finish`, blocking wait, renderer monkey-patch or hidden render path.

Initial preparation and each destination own their whole async lifetime. Generation changes are revalidated around every added initial wait; stale preparation drains its final native work before handing ownership to the new destination. Failure/context loss/pagehide cancels polling, releases sync objects, prevents subsequent GPU entrypoints, cancels terrain/retry work and disposes the local-shadow owner. A timeout is failure, never a successful frame.

## Native review controls and honest evidence

- Initial original main draw plus two original full world/reflection frames at zero **main-frame** delta, then hold after three GPU-completed world draws. Prewarm fences have their own counter and never count as world frames. The first original main draw is explicitly labeled `original-first-main-draw`; later frames `world-and-reflection`.
- Visible buttons: static frame (0s), single simulation step (1/60s), explicit finite 60 steps (nominal 1s), pause subsequent frames, save diagnostic JSON. **No automatic 60-frame run.** Real native motion behavior remains to be browser-tested; first validation uses initial three and a few static steps only.
- The metric is `completedFrameSimulationSeconds`, not FPS or total simulation time. Preparation retains its original settling updates, and interrupted pre-render updates are not counted. Pausing stops subsequent main-frame requests; preparation/initial boot can still settle. Regular WASD/pointer/door/control owners are untouched.
- JSON includes current normal snapshot (queues/errors/source flags), backend renderer/vendor, submitted/completed/prewarm counts, last completed generation/view/pose/time/query/viewport/scope, failure and finite-simulation labels. `held` is **not** accepted-world readiness. Still require q0, no morphs, ready Worker, zero ecology/water pending, unchanged sources/quality and empty errors.
- QA blocks the old photo redraw and direct `renderFrozenWorld` bypass. Capture using native CUA after the held completed state; optionally request one visible static frame first. This is a **viewport screenshot including UI**, not an exact framebuffer PNG comparison. A signaled fence is not proof of correct or presented pixels; inspect the actual screenshot.
- Fixed viewport only. Set 1280×800/DPR1 before loading. Runtime resize explicitly aborts QA without clearing/redrawing the completed canvas, and requires reload at target dimensions. The normal resize path is unchanged.
- QA `loadTimings.totalMs` includes explicit GPU completion waits; first submission and first GPU-completed timestamps are separate. Do not compare that total or controlled intervals to historical Mac/hardware real-time FPS. Normal/0 timing remains original.

## Tests and adoption gate

From repo root:

```sh
node --test web/src/v2/{software-review75,software-review-integration75,visual-time,prepared-world-matrices,world-context,terrain-row-worker-client}.test.js
node --check web/src/v2/main.js
node --check web/src/v2/software-review75.js
git diff --check
```

Tests cover inert/0 and malformed flags, Worker policy, three actual completions vs prewarm counts, GPU overlap rejection, async owner gating, input gap, timeout/null fence/WAIT_FAILED/flush/owner rejection/context loss/dispose cleanup, pause through preparation, finite time, early return, actual frame/reflection/update ownership, actual destination serialization/stale drain, actual scheduler success-state release, initial generation replacement, disabled initial route and explicit resize limitation. World-context and existing elapsed-time/matrix/Worker fixtures pass against the installed changed files.

Before world use, run the relevant tests and required full regression, build the current source, and then perform the fixed-viewport cloud scene. Retain the separately agreed browser watchdog180s, fence210s, scene1200s and outer1320s allowances; tests do not shorten them. Case05 adds only the documented OFF rollback static-frame and visible-text-export evidence; default-ON success, full queue settlement, motion, repeated navigation, visual-quality acceptance and real-time performance remain unverified. Known regression failures must remain explicit when authorizing any additional bounded diagnostic.
