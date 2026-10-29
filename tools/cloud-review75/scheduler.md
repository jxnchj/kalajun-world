# Installed cloud software-review helper

Installed October 29, 2026 over `8ea4753`. This is a deliberately bounded fixed-viewport QA recovery path, not a new rendering backend or production performance optimization. Current source files are authoritative; tests and usage do not require an unpublished staging directory. Use the separately verified ANGLE/SwiftShader cloud browser without changing sandbox flags.

Installed focused checks passed 66/66. The first full run reported 1988/1992 with three old fixture failures and one unchanged terrain timing failure; fixture repairs passed 12/12. An early isolated terrain run passed 13/13, but subsequent ordinary full regression remained 1992/1993. A complete disjoint 379+1-file run then passed 1980/1980 outside terrain.test.js and 12/13 in that isolated group: aggregate 1992/1993, no skips. The original 2500 ms terrain-readiness assertion remains unresolved and unchanged. Its 44 executed tracked dependency files match 8ea4753 and do not include the optional QA integration; timing variability and its full cause remain unproven. See ../reports/terrain75-budget-diagnostic.md. This is an intermediate source checkpoint, not a full-pass or real-world rendering acceptance claim.

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

Before world use, run the relevant tests and required full regression, build the current source, and then perform the fixed-viewport cloud scene. Retain the separately agreed browser watchdog180s, fence210s, scene1200s and outer1320s allowances; tests do not shorten them. No real scene, native button flow, screenshot quality, repeated navigation, runtime memory or motion acceptance is claimed by this artifact.
