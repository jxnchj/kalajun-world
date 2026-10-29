# Aerial continuity 42 source binding regeneration

2026-10-27. The default-OFF aerial continuity flag changes the full `ecology.js` source digest, but does not alter generated plant roots or geometry.

Affected formal binding sets: meadow root cache, and reach-cover prepared cache (which includes the meadow dependency set). Forest root cache now depends on extracted forest-root-source, not the ecology class; its saved complete code binding still equals the current binding and was not regenerated. The isolated 8m reference, two distance baselines and two 24m cluster sources embed the ecology digest and were re-exported as well. Historical experimental timing reports were not rewritten.

Before regeneration, 14 affected output/manifests/reports were copied with original paths to `tools/backups/aerial42-cache-rebind/`; `before.json` records original SHA-256 values. No hashes were manually changed.

Actual commands, all from the project root:

```sh
node tools/build-meadow-root-cache-v38.mjs
node tools/build-reach-cover-prepared42.mjs
node tools/export-meadow-patch-v38.mjs
node tools/export-meadow-distance-baseline-v38.mjs
node tools/export-meadow-clusters42.mjs
node --test web/src/v2/meadow-root-cache.test.js web/src/v2/meadow-root-cache-actual.test.js web/src/v2/reach-cover-prepared42.test.js web/src/v2/meadow-patch-reference-v38.test.js web/src/v2/meadow-cluster-lod42.test.js web/src/v2/forest-root-cache.test.js
```

Result: 36 tests passed, zero failures/skips. Formal actual-source tests compare cached/live roots and attributes and prepared/original full geometry, contacts and seven existing shoreline relocations.

Independent before/after comparison is saved in `tools/reports/aerial42-cache-rebind.json`:

- Meadow root cache: all 10,363,932 decompressed bytes and all 4,005,730 compressed bytes unchanged. 45,402 roots / 111 tiles / 84 procedural entries retained.
- Prepared shore: all 2,067,069 decompressed bytes and all 485,353 compressed bytes unchanged. 521 roots, 205 sedges / 316 mats, 240,232 triangles retained.
- Both manifests are deeply equal to their backups after removing only `code`; all current code bindings match formal generators.
- Five reference payloads: after removing only `sources`, every field is deeply equal (roots, geometry attributes, indices, ground, normals, sizes, etc.). Root counts remain 54, 54, 80, 458, 770. Their only changed source digest is `web/src/v2/ecology.js`.

No runtime/default adoption, main build or browser result is claimed by this regeneration. The aerial candidate still requires the coordinator's same-condition browser acceptance.
