# Ground community spatial structure 42 — isolated OFF candidate

This is an art/material handoff candidate, not an impostor, shadow map, mean-leaf BRDF or a claim of real distant grass. Production entry, roots, leaf count, existing geometry LOD distances and all shader wind are unchanged.

Existing source reused: `terrainMeadowFeatures` already combines the exact meadow texture and community weights consumed at grass roots. R is moisture, B maturity, G tuft structure and A texture blend. No new field, noise, texture, generated asset, mesh, shadow or global light/color setting is introduced.

`installMeadowGroundStructure42(material)` adds a reversible OFF uniform. Mature/drier areas receive at most 18% of the existing dry-grass palette, with the same geographic/landform/community tint. Low G/A tuft interstices expose at most 10% more of the existing soil material; its existing albedo, normal and roughness mixing all consume the updated soil weight. G is not multiplied into brightness as a fake shadow. Dry material adds a bounded roughness change, independent of sun direction.

The candidate excludes forest, snow, rock, bank, riverbed, bare ground and the existing organic-bank cover using original masks. Fully resolved footprints <=4cm retain the original material; this is a screen-footprint condition, not a guaranteed camera-radius exclusion (grazing views may have large footprints nearby). Transitions use the already filtered shared field. Above 1.3–3m footprints the addition smoothly returns to the original unresolved ground. No camera-centred 296/320m ring is added. These thresholds and weights are initial art parameters, not calibrated botanical coverage.

API (dev server module):

```js
const {installMeadowGroundStructure42}=await import('/src/v2/meadow-ground-structure42.js');
const s=installMeadowGroundStructure42(window.kalajunV2.terrain.material); // OFF
s.setEnabled(true);  // same page A/B
s.setEnabled(false);
s.dispose();         // original hooks/program key restored
```

Coordinator should confirm its debug terrain material path. No main import/build was added. The module does not change cache/source-binding sets.

Minimum browser acceptance: original/ON/restored at the existing above40/pitch-30 meadow view and west slope, same wind/time/q0/m0/1280x800/DPR1, extension held at the same 320m state. Look for coherent dry/turf material patches rather than repeating pepper noise or new dark/bright rings. Check a lower resolved foreground and creek/bank/rock/path boundaries to ensure masks are appropriate. Compare original restoration, then move across the former ring and vary sun direction to distinguish material from fixed fake shadows. This may improve surface composition but cannot recover missing silhouettes or guarantee the 320m density boundary is solved.

Two lightweight source/contract tests pass: unchanged vertex source and field fetch count, exact hook restoration/default OFF, material weight bounds, filtered/near endpoint and habitat-zero behavior. No asset regeneration, main build or browser performed. Actual material appearance/performance remains unaccepted.

## First actual high-meadow acceptance: ineffective, not adopted

The actual original/candidate/restored `ground42-meadow-high-*` images retain the fine speckling and finite extension boundary. Changes are too weak to count as a solution. Source formula inspection explains a concrete limitation: at the documented shared-field mean, even with eligible=1 and full footprint activation, dry weight is only 0.0008468 and soil increment before remaining-soil factor is 0.0071733.

A lightweight read of the existing actual 24m root fixtures (no world regeneration) applied the same community shifts before evaluating the candidate. Meadow: 458 roots, dry weight zero at every root, mean gap 0.012714. West: 770 roots, mean dry 0.030390, mean gap 0.029759. These are source-root probes with eligibility=1/footprint=.5, NOT visible-pixel measurements; actual masks may reduce them further. Raising the maximum 18% cannot activate a maturity mask that is exactly zero, and painting dry grass over a fresh community would be an inappropriate workaround.

Added same-page `setDiagnostic('weights'|'field'|'filters'|'off')`, default off. Weights shows R=dry×16, G=actual added soil×16, B=0. Field shows source R moisture, B maturity, A texture mix in RGB display order. Filters shows eligible mask, candidate footprint activation, and ORIGINAL crown-normal retention after its two filters. Diagnostic display bypasses scene lighting but remains in the existing output pipeline; it is a visualization, not raw linear framebuffer readback. No new noise or material strength change was made. Two lightweight tests pass; coordinator still needs the rebuilt independent library and actual pixel diagnostics before the next art iteration.

## Fresh-sward revision 2 — ready for art comparison, still OFF

The next candidate no longer requires dry maturity for all structural effects. It reuses the original A material field (about 7m source scale), modulated by broad R moisture. The existing G fine tuft field is not amplified or converted to a shadow. Fresh communities use a complementary live-cluster/interstice mask: up to 32% of the existing live-canopy material in clusters and up to 16% of the existing soil material in gaps, with the original habitat/footprint masks. These are art material-mixture weights, not root occupancy or density reductions.

Live cluster coverage also adjusts canopy roughness by at most 0.0128. The same A/R material mask produces a zero-centred shallow shading relief with maximum +/-6cm; its actual world-space derivatives augment the original terrain normal gradient. This is a normal/material effect only: no displaced geometry, collision height or simulated real grass volume. No fixed sun shadow, global darkening, new texture/noise or LOD-radius change. Existing material fields retain their geographic/community coupling.

`state.setRevision(1)` retains the first weak candidate; `state.setRevision(2)` selects fresh-sward iteration (initial candidate revision). The overall `setEnabled` remains OFF by default. `setDiagnostic('weights')` now displays dry×16 / added soil×16 / fresh coverage×4 in RGB. All other diagnostics remain available. `setEnabled(false)` plus `setDiagnostic('off')` restores the original appearance; `dispose()` restores original hooks.

Three lightweight tests pass including a genuinely fresh source case where dry=0 but live-cluster/gap weights are nonzero, near/unresolved/excluded endpoints and exact hook restoration. No build, asset regeneration or browser was performed. Art acceptance must judge whether coherent clusters emerge at the high meadow and west slope without dirty islands, pepper noise, creek intrusion or a new distance band. Retain the grass extension/root count/time across old/revision1/revision2/restored views; do not infer success from these tests.
