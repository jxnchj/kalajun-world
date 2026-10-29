# Connected meadow pigment candidate41 — default OFF

Scope: the existing v24 moisture/maturity source is formed from nested cell-centred radial kernels. Its world projection rotates and blends cells but retains repeated rounded island topology. This is separate from the proven loss of raised leaf coverage when original middle grass exits at62–78m. No pigment/material change can by itself fix that missing volume; neither the rejected cross strips nor the expensive multi-hit depth atlas is restarted.

New source profile `?meadowPattern=v41` replaces only R moisture and B maturity with a deterministic periodic continuous gradient field and smooth domain drift, followed by exact rank transfer of the original256-level distributions. G canopy and A source blend remain byte-identical. The source dimensions/mips/sampler count/palette, real DEM aspect/hollow/forest-edge community modulation, all grass positions/scales/geometry and near/middle distances remain unchanged. The new source and immutable grass-root fields select together through the existing meadow-surface profile. Default remains v24. Source rank equality is an integrity fact, not proof of visual quality or equal appearance at every location.

Initial design reused radial-cell frequencies with integer shear. Actual offline images showed more small spots and2m pigment change increased about50%; rejected. Current candidate removes that shear and halves the local gradient frequency to account for its signed lobes. It does not blur the canopy G or remove fine leaf geometry.

## Offline inspection

`node tools/preview-meadow-connected41.mjs` samples actual world DEM-derived community/landform data over384m centred on meadow(-1972.53,3395.88) and west(-7070,2670), at2m spacing. It produces JSON and RGB files; `tools/reports/meadow-connected41-preview.png` is the reviewed2×2 pigment map. There is no lighting, perspective, fog, or alpha geometry in this diagnostic. Colours use the same canopy palette and existing geographic tint/communities; the display conversion is linear→sRGB only. Do not present it as a browser scene.

|Actual patch|old/new2m moisture MAD|old/new connected positive components|old/new small components(<100m²)|
|---|---|---|---|
|meadow|.02062/.02539|23/19|8/4|
|west|.02142/.02467|15/14|4/2|

The candidate has fewer detached small areas and larger connected masses in these maps without flattening source contrast. Local patch means differ because the field is reorganised, although the full source histograms are exact. The visual result is a reviewable candidate, not evidence that distant slope repetition is resolved. Real perspective, moving view and terrain/leaf colour continuity require browser comparison at both sites. Keep OFF until this passes.

## Contracts and integration

Five targeted tests pass: exact full R/B histograms, exact G/A bytes, determinism, toroidal repeat and boundary continuity, real WorldEcology source geometry/root identity and shared immutable root fields. All rendering follows the existing shader; no shader texture lookups or samplers are added.

`meadow-surface.js` changes source binding. Regenerate the ordinary meadow root cache with the existing official tool at integration time, verifying the default payload stays equivalent; do not patch hashes only. Nondefault `meadowPattern` already disables the prepared root source. Terrain Worker currently conservatively bypasses all unknown source variants, so a v41 comparison is visual only until Worker/profile protocol is explicitly matched. Do not interpret its reload time as performance regression or improvement. Candidate adds one CPU source generation and rank sort at load time; no new per-frame work.

Outstanding: far grass raised coverage is still absent beyond original range; exact full-world GPU benefit has not been established; candidate adoption needs original/new/restored same-view screenshots and motion review. Full light/color remains stage5.
