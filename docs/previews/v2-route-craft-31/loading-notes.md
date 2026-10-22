# Round 31: exact cold crown preparation

The recorded round-30 B1 startup spent 820.9 ms in ecology post-source setup and 454.0 ms in near-crown shell setup. These main-thread calculations also delay pending building preparation. This round removes repeated arithmetic and temporary attribute enumeration, keeping the complete existing geometry.

`spruce-volume.js` now reuses immutable source rows, exactly matching directed UV-cut endpoints and interpolation parameter, and transformed corners within one branch. Reverse-direction edges remain separate because floating-point interpolation can round differently. Branches never share their deformed positions or normals. Maps are scoped to one build, and all draw/index order is retained.

The default is enabled. `crownBuildReuse=0` disables value reuse and restores the original attribute-row/interpolation calculation path. For a strict prior-version comparison use the protected round-30 build. The standalone benchmark directly imports the saved original round-30 function rather than treating the disabled flag as an identical old implementation.

## Evidence

- Actual five forms × hi/mid/near: all 95 arrays, 18,244,324 bytes, 248,334 triangles, metadata and bounds compare exactly against the preserved round-30 algorithm.
- Node CPU geometry-only alternating 8 samples: old 1,178.71 ms mean, new 713.13 ms mean (39.50% shorter). This is not a full-browser startup or GPU claim.
- 39 focused volume/cache/loading tests pass (`loading-tests.log`).
- Existing cache generator rerun and `--check-inputs` passes. Algorithm/source key changes intentionally. All 15 part descriptors and compressed payload bytes remain identical: existing `spruce-canopy-v1-e10a2d6afd5403ae.bin.gz`, 11,391,085 bytes. No new cache payload and no added network bytes.
- Input/build/manifest backups: `backups/route-continuity-v31/loading/`.

## Browser checks still owned by parent

Use `canopyCache=0` for a build-work comparison; otherwise a valid local canopy cache correctly bypasses this work. With fixed view, time, size and DPR compare:

- `snapshot.ecology.needlePayload.timings.geometrySetupMs`
- `snapshot.ecology.needlePayload.timings.formPreparationMs`
- `snapshot.ecology.assetLoads.postSourceMs`
- `snapshot.loadTimings.phases.ecologyAssets.elapsedMs`
- `snapshot.loadTimings.totalMs` and `firstFrameNewPrograms`

All geometry density, foliage texture coverage, material optics, wind, color and shadow representation are unchanged. The remaining first-frame tail (asset I/O, terrain/ecology preparation, first GPU submission), whole GPU draw burden, and final image acceptance are not solved by this local CPU result.
