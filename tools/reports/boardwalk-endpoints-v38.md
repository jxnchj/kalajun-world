# Four original boardwalk endpoints — physical route repair

## Scope and actual associations

- Route0: original uphill line reaches `cabins:-1999.5,3372.6:0f598bcbed84e01b`, asset `cabin_small`. Its original central hinge exists in `tools/blender/cabin.py` and `assets/cabin_small.glb`.
- Route1: both endpoints are open pasture (nearest building centres approximately19/28m). No invented doorstep or building relocation. Original40.5658858466m line unchanged.
- Route2: endpoint `yurts:-1709.8,3617.6:6ce5970440b919ae` is specifically **yurt_deck**, not the ordinary replacement yurt. Original pair of outward door hinges and original deck/furnishings retained. Original12.5657611285m line unchanged.
- Route3: original `gh_lanchuan` and `gh_lanchuan_lodge` buildings retain previously tested entrances. Original33.8338740795m line unchanged.

Collision membership now derives from these audited exact entity IDs, while preserving existing house_a/yurt coverage. Only the two previously missing route entities are added; other cabin_small/yurt_deck buildings do not acquire new interaction or physics in this patch.

## Corrected route0 geometry

Old source endpoint world[-1998.2,3376.2] maps to cabin local[-2.32712668054,2.710398345354]. The original front wall is localz=3.1; the line crosses the porch railing off-centre and ends inside the wall beside a window. Simply enabling collision revealed this previously hidden error.

`objects.json` is untouched. Only the derived final segment (starting at original penultimate point) is redirected to the outside edge of the existing central steps: cabin local[0,6.65], world[-1993.298449729667,3376.108047782533]. The original cabin source authors porch frontz=5.1 and5 steps of0.30m run; last step centrez=6.5 and front edgez=6.65. This connects to real source stair/porch geometry without adding a false doorway or deleting walls/railings.

- Endpoint displacement4.9024126981m; path29.8870868462→27.0911172154m.
- Same maximum0.30m tread spacing, full Blender plank/bearer/post detail, materials and authoritative collision matrices.
- Route0 steps101→92; pieces343→314. These remove the incorrect wall/railing penetration and reflect the shorter corrected route, not a performance LOD or density reduction.
- Other3 route points and piece layouts unchanged. Total wood pieces1357→1328 and triangles146556→143424.
- Derived source and correction metadata remain on each route. `?boardwalkEndpoint=0` retains the old source-line comparison for diagnosis; it intentionally restores the known bad endpoint.

## Original doors and privacy of scope

`WorldDoors` captures the original cabin_small door (108 triangles), and the original yurt_deck double doors, with hinge-name/location assertions. No substitute mesh or new asset request. Shared asset templates serve9 cabin instances and3 deck-yurt instances; all original leaves remain rendered in their original poses. Only the audited route0 cabin and route2 deck-yurt receive interactive entries/moving leaves; unrelated instances cannot be toggled. Dynamic leaves reuse the existing swept Rapier guard, blocked/pending state and automatic resume.

The cabin's static collision geometry is28,056 triangles; door108 triangles. Door frame, stairs, porch, railing, furniture, walls, floor and roof keep native geometry. The route2 source is original yurt_deck rather than a substituted ordinary yurt. No structures.js/main/GI changes in this subtask.

## Validation

`tools/reports/boardwalk-endpoints-v38-tests.log`: **31/31 passed** across endpoint, timber, doors, collision and lodge-door suites (2026-10-24).

- All4 timber lines walked both directions on actual terrain, unchanged spacing/detail and shared visible/physical timber geometry.
- Route0: full corrected92 treads→original stairs/porch→closed door blocks→open1.75rad→interior→body blocks closing→step away and pending close completes→original stairs→all92 treads back. Exterior wall separately blocks the swept capsule.
- Route2: all43 original treads→actual deck→closed original leaves block→outward opening stops against body→back away and opening automatically completes→crouched entry (native1.55m door)→deck→all43 treads back. Actual curved wall separately blocks body.
- Source door vertex/triangle/instance conservation and no interaction on unrelated same-asset buildings.
- Both original route3 buildings and public lodge12 front stairs remain covered by real-asset Rapier regressions.
- Menu now exposes walk-boardwalk-0/1/2/3. Existing route2/3 names preserved.

These are actual Three GLB + Rapier/DEM tests, not browser acceptance. Parent owns real Chrome walking, screenshots and visual checks. New source dependencies were handed to lodge_furnish38 for one final real prepared-cache regeneration; no metadata-only hash substitution and no concurrent regeneration here. Rendering/landscape artistry remains intermediate; no full lighting/color phase changes or Aholo use.
