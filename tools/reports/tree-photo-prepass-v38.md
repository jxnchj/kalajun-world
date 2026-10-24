# Main-world photo crown depth prefix — candidate, default OFF

Switch: `treePhotoPrepass=1`; same-page `kalajunV2.debug.treePhotoPrepass.enabled=true/false`.
Statistics: `getSnapshot().treePhotoPrepass`.

Implementation uses public Three Scene/Group/InstancedMesh/Material APIs. Registered mode 1/5 alpha-masked photo crown batches are drawn first inside the SAME world render, not via an additional renderer.render. The scene's opaque sorter already honors groupOrder before material/depth ordering. The prefix group uses the smallest finite order. Its proxies have colorWrite=false, castShadow=false, original geometry and original instance attributes/bounds. No terrain, needles, roots, density, resolution, MSAA, shadow or reflection content is removed. The normal pass keeps its original LessEqualDepth state.

The cloned Standard material invokes the actual original compile pipeline: exact source vertex shader, original shared wind uniforms, alpha threshold, branch/LOD screen dither, alpha hash, and alpha-to-coverage. Fragment code ends after the last alpha rejection include, before PBR shading. OPAQUE alpha handling is preserved. The public CSM shader registry entry is restored after the source compile callback so depth compilation does not steal the original material's lighting shader. Whole-frame GPU and frozen actual pixel equivalence remain browser acceptance requirements; identical source gl_Position does not by itself prove driver raster output.

The prefix is visible only during synchronous main render or compile kickoff, hidden again in finally. Reflection and shadow preparation happen outside this scope; actual CSM shadow render cannot cast proxies because castShadow=false. Shader prewarm includes prefix on initial enabled startup. Same-page enable compiles synchronously as Three normally does, with complete first draw (no skipped frames or objects). Errors propagate with a diagnostic and restore visibility; disabling permits ordinary rendering. Experimental treeViewCull/middleTreeBatched/treeWorldFrustum/crownRootMask combinations fail explicitly.

No main world attachment lifecycle changes. Source audit: WorldFrame target retains 4x MSAA with `storeMultisampledDepthBuffer=false`; Three WebGLRenderer resolves on each renderer.render and WebGLTextures discards this depth. A two-render prepass would therefore require changing attachment preservation and incur resolve/clear hazards. The one-render prefix avoids these completely.

Only registered tree batches are synchronized, not all world business objects. Membership rebuild is revision gated. Disposal detaches shared instanceMatrix/instanceColor before proxy.dispose, because Three otherwise deletes those shared GPU buffers. Original geometry and material are never disposed by this feature.

Targeted Node tests: 7/7 passing (2026-10-24): vertex/prefix coverage equality, shared uniform identity, CSM success/error state restoration, scope/off behavior, draw failure recovery, streaming/disposal buffers, unsupported configuration errors. No full suite or build run by this subtask. Browser frozen A/B and idle-CPU frame/GPU ABAB still required. Additional vertex submission is expected (~6.238M photo triangles in representative forest); a throughput loss means leave OFF.

## Browser regression correction

Initial frozen A/B had 24,442 changed pixels, while OFF repeat was exact. Full-fragment clone retained 21,070 differences; identical original material reduced this to 85. This exposed a concrete clone-contract bug: Three MeshStandardMaterial.copy resets defines to STANDARD (line 412), dropping ECO_ROOT_WIND. The prepass therefore used the unshared per-vertex field path instead of the original per-root wind attributes. Fixed by explicitly copying all defines, with a regression assertion covering ECO_ROOT_WIND and CSM. Browser re-verification of corrected prefix is still required; remaining 85 pixels are not accepted as proof of equality. No polygon bias, alpha change, or MSAA reduction applied.

## Invariant browser separation

After defines fix, truncated prefix retained 55 changed pixels (max89), including dark defects; not accepted. Both original and prefix vertex programs now declare `invariant gl_Position` only while candidate is enabled. Original callbacks/cache key and CSM registration are restored on disable/dispose. Targeted suites 16/16 passed.

Actual files: `tree-invariant-{original,source,prefix,source2,restored}.png/json` in route38 previews. Parent browser check: source vs prefix=0 pixels, source2 repeat=0, restored vs original=0. Source-only invariant vs original changes 22,648 pixels (max173); thus this is NOT original-baseline pixel equivalence.

Read-only image analysis of the actual source/original pair (1280x800):
- 20,053 of changed pixels (88.54%) have maximum-channel delta exactly1. Counts above 2/4/8/16/32/64/128: 2,181 / 1,564 / 850 / 373 / 147 / 65 / 27.
- Whole-image mean absolute RGB difference: 0.028929/255. Signed RGB totals: -1718/-1102/-1264.
- All differences are within y0..350, matching the photo crowns. Rows351..799, including foreground grass/ground/water, are exact.
- Delta>16 has 369 eight-connected components among373 pixels; maximum component2 pixels. Largest locations [582,67,584,69], [299,45,301,47], [101,134,102,136], [72,56,73,58]. No coherent missing branch area.
- New pure-black pixels:0. A deliberately coarse bright-blue sky classification finds34 sky→tree vs25 tree→sky pixels (net9 more canopy-classified pixels); this is a diagnostic, not a physical coverage measurement.
- Actual full-frame visual inspection finds no coherent leaf loss or changed wind posture. These spatially isolated differences support floating-point projection/sampling-boundary effects from invariant compilation, unlike the prior visible black defects.

Assessment: acceptable visual candidate at THIS camera, retaining exact assets/counts, but not proof of global equivalence. Another near-crown angle and motion check plus positive idle-CPU whole-frame performance are required before adoption. Default remains off. No bias, threshold change, density reduction, or relaxed depth test is used.

## Integrated independent browser decision (2026-10-24)
Actual Chrome 1280x800 DPR1, river-forest time870, terrain queue/morph0, no concurrent bake/build. Integrated invariant prefix matches invariant-source PNG exactly; repeated prefix exact; disabling restores original PNG exactly. Original-vs-invariant float edge differences remain as documented.

Four independent20s windows after3s warmup: off1 frame63.299/GPU31.606ms (316frames), on1 63.856/35.014 (314), off2 81.980/32.500 (244), on2 66.869/35.303 (300). Off2 contains an ecology315ms outlier; it cannot support a full-frame improvement claim. GPU consistently increases. **Candidate rejected for default; remains off.** More camera/performance repetitions are not justified by this result. Evidence `docs/previews/v2-route-craft-38/tree-prepass-independent-{off1,on1,off2,on2}.json`.
