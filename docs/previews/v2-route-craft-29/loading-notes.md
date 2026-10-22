# Round 29 loading candidate: remove the far-forest manifest dependency

## Current evidence

Round 28 final-B1/B2 ecology source phases show first network callbacks delayed approximately 2.1 / 2.2 seconds while terrain preparation runs. In B2, the far manifest took 2202.7 ms before its two large texture requests began, then fetches took up to 658.6 ms; total far load 2873.7 ms. These wall times include main-thread scheduling, not only network transfer. Ecology core maps and structure preparation were also on the broader startup path, so the far improvement alone is not proof of improved total startup.

## Change and A/B

`spruce-far-impostor.js` imports the existing, unmodified canonical capture manifest (47,216 source JSON bytes) as build data, as the existing GLB transport does. On the default URL its two texture requests now start immediately, before an asynchronous manifest response is needed. The manifest, frames, texture payloads, resolution, number of layers, normal reconstruction and GPU settings remain unchanged. Both texture payloads must still complete successfully before publishing the asset; no readiness or overlay rule changes.

- Candidate default: `farManifest=bundled` (parameter may be omitted).
- Reference: `farManifest=network`.
- Observable: `ecology.farTrees.manifestMode` and `manifestMs` plus existing request ResourceTiming.
- Custom manifest URLs always retain the existing authoritative network path.
- Each load clones the bundled manifest so a consumer cannot mutate subsequent loads.
- The JavaScript bundle grows by the manifest's minified data; final build and same-condition browser tests must determine the total tradeoff.

## Targeted verification

Command: `node --test web/src/v2/spruce-far-manifest.test.js web/src/v2/spruce-far-impostor.test.js web/src/v2/spruce-far-transport.test.js`.

16 / 16 pass. The new tests verify both payloads start without waiting for the metadata response, exact texture data and metadata equality for v26/v27, all texture options, per-load metadata isolation, custom URL behavior, pre-abort, payload failure, and the network reference. Existing transport tests verify original RGBA hashes, including normal RGB beneath zero alpha, HTTP-decoded and application-gzip delivery, ResourceTiming, and disposal. Existing loader test wrapper explicitly selects `manifest: network` to preserve original manifest-fetch error assertions rather than weaken them.

No runtime fps change expected from this change. No density or detail changed. Browser gains are not claimed here; coordinator performs final whole-version and/or same-build A/B.

Backups: `backups/route-continuity-v29/load/web/src/v2/`.

## Shadow scan spatial-due extension

`SunShadowScheduler.dueCascades(dt, camera, {force})` now shares the exact camera/light/frustum spatial signature with `update`. Camera world matrix/projection, light local position, target local position and the six shadow camera frustum extents are the same fields already causing a render refresh. Such an already-required redraw does not need its content invalidation scan first. Legacy callers without `camera` retain cadence-only prediction. Camera layers are not added to the spatial signature: the existing caster membership scan handles them, avoiding an unsafe extra skip condition.

`environment.js` passes current `forceShadowUpdate` before prediction and to the later render scheduler. `SunShadowCasters.update` is still called normally; its full scene matrix propagation remains before the main draw even when all cascades skip their content scan. No shadow interval, resolution, frustum, caster geometry or render scheduling rule changed. AB remains `shadowDueScan=0`.

26 / 26 scheduler/caster tests pass, including 500 deterministic camera/light/cadence cases, fixed-camera reuse, each frustum extent, force compatibility, and an integration test verifying skipped scans still propagate object matrices, the next cacheable frame captures deferred geometry/transform revisions, and subsequent stable frames reuse normally. The existing layer/visibility/material/geometry regression cases remain intact.
