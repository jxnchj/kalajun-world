# Full middle-grass continuity: exact surface retention plan41

## Why this differs from rejected work

The previous two crossed cards redistributed coverage and lost it at opposite/high views; multi-hit depth atlases had sampling/self-shadow errors and45–80fetch cost. Neither is repeated. Keeping original middle only to140m moved the gap because the actual source still had2–3px upper-edge p95 at140m. This path first keeps every original leaf surface and measures the real screen-space termination requirement, rather than choosing another arbitrary outer radius.

## Proven first step: only permanently zero triangles

Actual `meadowGeometry(false)` has69 indexed triangles,24 of which have two exactly equal position AND aPlantWind inputs. The original deformation is a function of these inputs and the same root/time; both vertices remain identical after every wind/instance transform. These primitives therefore have zero area for all views and phases. Removing only their indices keeps the45 original nonzero triangles, all24 leaves, full stem/head source and root seed selection. Near geometry similarly retains221 of245 triangles. No small or merely collinear triangle is removed; no epsilon or root-density rule is used.

`meadow-exact-index41.js` clones original attributes unchanged, modifies only the index, preserves source normals instead of recomputing, and rejects morph/group/partial-range sources. DoubleSide and flat/smooth shading remain material-owned and unchanged. No primitive-ID dependent code exists in the ordinary meadow shader; screen-space dither still uses gl_FragCoord, with retained triangles in original order. Material displacement or a future deformation input would require a new proof; this helper is only for the actual ordinary meadow source.

3/3 tests pass: source near/middle exact attributes/effective triangles, equal inputs under nonlinear wind and arbitrary root transforms, retention of small/collinear triangles with distinct deformation inputs. CPU proof does not substitute for GPU image comparison.

## Independent browser comparison

`/meadow-exact41.html`, module `/meadow-exact41.js`; not imported by production.

`window.meadowExact41.compare({patch:'meadow'|'west',distance:140,azimuth:0,elevation:10,time:3})` compares coverage, albedo, normals and direction response, reporting every changed pixel. Uses existing real55/80-root source exports, original instanced fields and original shader far-field wind,1280×800/DPR1/FOV52/4×MSAA. Both original and compact retain full roots without distance exit. `render(spec,'original'|'compact','albedo'|'coverage'|'normal'|'response')` displays each. `save(spec,'exact41-west-140')` writes both images/JSON through the existing evidence endpoint.

Required coverage: both real slopes,8 azimuths,10°/45°,62/100/140/200/320/640m, several wind phases; representative GPU comparisons should be bit-identical. Any pixel difference is investigated rather than tolerated merely because mean error is small. `measureExtent(spec)` measures original coverage and upper-edge stats against actual local ground; finite patch statistics must not be mistaken for entire ridge skyline. Need source grass plus terrain in a full route before choosing cutoff.

## Next after exact rendering passes

1. Measure active-view original middle leaf extent, both main and reflection views, at100–640m. Retain any original leaf still contributing a visible ridge/occlusion contour; do not declare all roots subpixel from average tuft size.
2. Build an independent24m world-tile/4–8m subcluster prototype retaining full compacted source triangles and original fields. Compare ordinary instancing against clustered draw submission, including wind-expanded exact bounds. Batching may increase CPU/memory or draws, so no performance claim in advance.
3. Test conservative projected full-root bounds and actual terrain occlusion. Never cull merely because its root point is hidden. Inconclusive subpixel aggregates must remain until a validated canopy surface representation preserves coverage and directional response.
4. Only after source continuity and timing are verified, integrate a bounded runtime retention profile with continuous prefetch and source-bound packages. Middle remains original non-caster; additional shadow quality is separately measured. Existing62–78m production remains unchanged while this work is candidate-only.

No GPU speedup, full-world far continuity, or final image acceptance claimed yet. This is a full-surface path, not a replacement with a flat image or density reduction.

## Production integration / 2026-10-27

Parent's actual Chrome evidence is now available: `docs/previews/v2-route-craft-38/meadow-exact41-gpu-all.json` contains 576 combinations with zero changed pixels in coverage/albedo/normal/response. The 192 extent combinations in `meadow-exact41-extent-all.json` retain upper edges even at 320m (maximum3px) and 640m (1px); 140m is not a disappearance distance. These are finite-patch measurements, not complete hillsides.

`?meadowExact41=1` now selects separate compacted ordinary near/middle render templates. Default and `=0` retain the original templates. Canonical `grassGeometries` still supplies brook/wet assets, root placement and seating envelopes unchanged; wet geometry has NOT been compacted. Instance fields, root caches, material/depth/dither, ranges and densities are unchanged. Stats expose `meadowExactIndex41` and per-LOD original/result counts. Candidate templates are disposed separately after wrappers retire.

Target regression: 10/10 exact-index and grass-root-field tests passed (`/tmp/meadow-exact41-integration-tests.log`), including actual WorldEcology ordinary mesh construction, exact roots/instance matrices/all attributes, original wet/seating sources, bounds, flags and template disposal. Parent still needs whole-scene same-phase pixels and GPU timings before adoption. No scene speedup claimed from triangle count alone. Source/cache bindings require genuine regeneration by the main integration task.
