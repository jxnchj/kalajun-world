# Reach 73: closed whole-bend candidate

Status: implemented and frozen, default OFF. Browser art acceptance is pending. No main.js, water shader, global lighting, tree geometry, source centreline, water level, or independent stone transform was changed. Candidate69 remains available with unchanged payload bytes.

## Entry and integration

- URL: `?reachDesign73=bend` with the normal forest entry/options. Omit it or use `reachDesign73=0` for the default world. It is mutually exclusive with active69/50/48 and legacy41 geometry.
- World: `world.hydrology.forestReach39.stats.design73 === 'rooted-low-banks73-1'`.
- `web/src/v2/reach-design73-material.js`: `loadReachDesign73Assets()` reuses the existing66 gravelly_sand source; after terrain references are ready call `installReachDesign73Material(material,{world,assets,enabled:true})`. Owner exposes `uniform`, `stats`, `setEnabled`, `setDiagnostic`, `dispose`. Dispose owner before assets. Main integration belongs to root.
- For the existing review helper, expose `debug.reachDesign73Owner` and snapshot `reachDesign73: owner.stats`.
- `/review/reach-design73.js` exports `captureReach73(app,{label:'candidate',prefix:'reach-design73'})`. Its three absolute camera poses exactly equal the previous69/53 poses; 1280×800 DPR1, time870 and521 real contact records remain mandatory. It releases synchronous review hold before every await.

## Actual change

The full36m within the original4.2104m bank corridor now uses interpolated low-bank profiles with a limited cohesive soil cut. Dry-bank height can decrease: it is no longer `max(old,water)+lift`. The low-bank profile is monotone from its wet toe toward the outside ground anchor, so it has no raised narrow bar followed by an inland trough. Original end sections remain exact. Original tree core support and the five stone support surfaces remain exact;73 uses a wider smooth deformation release around the stone supports.

Real sampled water widths are0.870–1.314m. Maximum sampled raising is0.1624m and lowering0.1458m.23.51% of the entire sampled corridor changes by more than3cm, including protected regions and end fades in the denominator. The original root-mat high lip is lowered by over8cm, while a short middle cohesive bank is formed. These are source geometry measurements, not evidence that the picture is attractive.

Material roles now follow this section: fine mineral bed/toe, bounded coarse lenses, cohesive soil cut, rooted low bank. Steepness does not imply rock. The existing coarse scan retains its2.9m scale and the existing fine scan its2.48m scale. Organic/soil roles share the same weights across colour, normal and roughness; no new scan, sampler, draw or water opacity compensation was introduced.

All521 bank IDs remain:205 sedges and316 root mats,240232tri and11069 leaf seating groups. Every root retains scale, orientation, source leaf x/z coordinates, normals, wind, colour and index topology. Only whole-root placement and rigid per-leaf vertical seating change. All521 move, at most0.68274m horizontally and0.13801m vertically.14 actual terrain-row-kernel tiles at0.15625m spacing validate every prepared contact. No failed contacts. Maximum analytic-vs-rendered-triangle height difference2.365mm; the existing minimum-foot rigid seating rule yields at most5.917mm difference to the higher paired foot. This is not a claim of zero clearance at every leaf vertex. Runtime contact invalidation/revalidation remains active.

The surrounding meadow cache still has45486 occupied slots:45404 ordinary plus82 procedural wet-geometry slots (default45402+84). No roots are deleted. All80927 forest records, including y, remain identical to the original full-source record digest.

## Loading and preservation

73 uses explicit serialized world inputs and the formal terrain Worker. Default prepared terrain rows are deliberately bypassed only for the candidate, with the live Worker retained. Candidate forest/meadow/reach packages live under `web/public/data/v2/reach-design73/`; a missing or invalid relocated reach package is an explicit failure, never silent restoration of old root positions.

The12 affected default derivations were regenerated using official generators: forest, meadow, reach, full/priority/demand terrain, exterior source, all4 GI categories and the independent8m reference. All non-binding payloads are unchanged; the8m reference still contains all54 roots and identical near/middle/ground payload. No hashes were hand edited.69 forest/meadow/reach gzip files are byte-identical after refreshing their source bindings. Backups: `backups/route-continuity-v73/source`, `default-prepared`, `retained69`.

## Measured resource boundary

Per full source water representation for the10 active segments:

| | vertices | triangles | bytes |
|---|---:|---:|---:|
| default |21737|41530|2422880|
|69|23091|44238|2574528|
|73|22678|43386|2528116|

73 adds1856 water triangles and105236 bytes over default, and has852 fewer triangles than69. No additional water draw is added. Only13 extra along-water rows are required to conform to a retained stone support; final depth refinement takes1 round and max interpolation error is3.488mm, within the original3.5mm tolerance. Trying5/6 refinement rounds alone did not fix the earlier support transition problem; the final geometry support release fixed it. water.js and its default4-round limit were not changed.

Material resource layout matches69: two private4-layer RGBA8 arrays,33554432 CPU pixel bytes; no extra samplers or draws and two extra filtered scan samples relative to the original material. This does not claim that the GPU cost is zero.

73 disk gzip payloads: forest3101781B, meadow4005912B, bank619727B (7727420B total). Raw decoded payloads:3903808/10364340/2838084B. These are disk/body representations, not measured network transfer or browser startup time.

## Verification and remaining acceptance

126/126 targeted tests passed: new geometry/material roles, all original IDs and geometry attributes, exact real Worker buffers, both water LODs, five full stone matrices, prepared loaders and failure/release paths, default/69 compatibility, four GI sources,8m reference and review-helper hold lifecycle.

Evidence:
- `tools/reports/reach-design73-targeted-tests.log`
- `tools/reports/reach-design73-validation.json`
- `tools/candidates/reach-design73/contact-report.json`
- `tools/reports/reach-design73-default-regeneration.json`
- `tools/reports/reach-design73-bundles.json`

The GLSL hooks were tested against actual Three shader source, including signed literals and reserved identifiers; actual browser compilation, three-view appearance, moving water/grass contact and GPU cost still belong to root's unified acceptance. This remains an OFF candidate, not an adopted default or a surveyed Kalajun stream reconstruction.
