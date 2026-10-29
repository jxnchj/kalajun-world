# 代表木屋成组木材48：离线可审候选，未接运行时

新增 `assets/src/v2/pastoral/timber48/house-a-group-timber48.blend`（7,768,233字节，现有四张纹理已打包）、`house-a-timber48-coordinates.json`（4,388,609字节）。脚本 `tools/blender/v2_house_timber48.py`，复现时只写新timber48目录。原GLB、原house_a-lived.blend及已接受的timber38派生源均原SHA不变；未改structures、旧生成器、碰撞或GI。

范围159对象/631连接组件/74778面角：外墙圆木、原端面、楼板/梁、门板/窗板、门廊原木作、室内原内衬。家具保原现状，没有重造或增添装饰。已有源Color/AO和侧面修正normal完全保留。重新打开派生Blend后，再核对所有原positions、polygons、world matrices、原UV层、颜色层、corner normals指纹相等；材质槽与新增Timber48 UV层为明确变化。新侧车逐loop绑定原vertex id及组件id，保存物理轴/横向基/稳定偏移和端面标记；运行时接入前还需映射原GLB拆缝顶点，不能直接当已可加载的GLB替换。

材质复用项目 rough_wood_diff/rough/normal 与 wood_end，不下载、不生成新纹理。物理映射沿材长2.1m、横向.55m；切面单独直径.42m坐标。按组件稳定偏移，颜色/粗糙度/normal同一坐标，避免通道错位。匹配各原材质平均色，不改世界曝光。原图扫描强度、尺度与端纹是否足够自然仍以实景接入后复审，不称目标质感已完成。

六张可审图位于新目录：exterior/porch/interior.png，以及对应baseline-*。同机位、同光源、同采样Cycles CPU20samples；室内另有180W检查灯（两组相同），只为看清材质，未保存为实际世界照明或GI。已人工打开候选/原源室内及门廊图：原规则蛇纹由沿真实材长的木纤维替换，内衬/门廊/梁沿共同尺度；端纹仍沿用现有较规则木端图，是明确中间态。已验证原源SHA、派生SHA、74778条坐标有限/索引范围正确/loop唯一。

建议下一步接线采用原GLB附加坐标属性与目标实体材质分支，保原几何及现timberContinuity AO，不直接替换GLB；预制结构恢复早退分支和真实door材质捕获都要覆盖。新材质应先在代表木屋室外—门廊—室内同路实景验收，与原GI低频颜色关系一起检查，再决定范围扩展。当前没有默认采用或浏览器完成证据。

## 运行接线候选（仍默认OFF）

`/dist-v2/house-timber48/v2.html?view=pastoral-house_a-entry&time=870&houseTimber48=1`，0/缺省原材质。合法0/1保地形Worker；只处理原代表实体 `cabins:-1743,3612:30f9adc9fb584805`。shader用实际instance世界原点与该建筑/原门铰链的精确锚点匹配，不依赖会被可见性压实改变的实例序号。其他房屋保原采样。原门捕获前增加独立属性，门hinge/geometry/index/motionGuard全部原路径。

GLB导出拆缝与Blender面角不是一对一。离线构建器逐原位置/原UV核验唯一物理组件身份；在原GLB真实法线下重新计算同物理轴坐标，拒绝身份歧义，不为新UV复制原顶点。实际159节点、69295原GLB顶点全部覆盖。原UV/AO/normal均未替换；新增aHouseTimber48，近/远compact路径均携带。

运行材质分加工类别：外圆木/门廊 normal强度.23、roughness.70–.95；内衬和门窗板 normal.07、roughness.44–.66，端面另采端纹，原材质平均色保持。既有家具暂未批量替换。此数值只是可审候选，须真实室内GI下判断，不用离线180W检查灯证明GI效果。

和`structurePrepared=1`组合时显式`source-reprepare`：预制旧包没有新增拆缝字段，候选使用完整原GLB重新处理，未减少任何near/far细节；本组合不保持预制快路，不作为加载收益证据。缺省structurePrepared关闭，原用户路径不受影响。

`house-timber48.test.js` 3/3通过：实际GLB损坏拒绝且不半发布；真实结构与原门全部原buffer、bounds、近远LOD、碰撞三角相等；门实际开合矩阵变化；source-reprepare明确没有读预制包；shader保AO及两种加工参数。`house-timber48-target.log`、`house-timber48-runtime-build.log`。真实WebGL编译、材质采样预算、代表房屋与旁屋同图对照以及GI下的连续性仍待主线验收。此接线新增structures依赖意味着旧预制来源绑定需下一个空闲CPU窗口正式再生，不能手改hash。

## Binding regeneration and frozen candidate

The original tools/build-structure-prepared-v38.mjs regenerated the full prepared structure after adding house-timber48.js to the source list. No manual hash replacement or GI rebake. house-timber48-prepared-regenerate.log records generation; house-timber48-prepared-test.log confirms 10/10 tests, zero skips, including exact original near/far buffers, materials, embedded images, moving doors, collision and disposal.

The independent dist-v2/house-timber48 build now contains the new binding. Main dist47 and other candidates are preserved. Candidate remains OFF. Browser shader compilation, sampler budget, target/neighbor isolation, real door motion and material appearance under actual indoor GI remain pending because the Mac is locked. Build success is not visual acceptance.

Full current-source regression: npm --prefix web run test:v2 completed with 1815/1815 pass, 0 fail, 0 skipped, 87055.65 ms. Log: tools/reports/stage3-integrated48-regression.log. No test weakening or implementation repair was needed. This covers the frozen timber48 integration but does not replace pending real-browser material/GI acceptance. Main dist47 was not rebuilt or modified.

## Actual desktop browser validation and sampler correction

Desktop 1280x800 / DPR1 / time870, independent candidate only. Initial 4-new-sampler candidate FAILED real pastoral wood shader linkage (16 sampler hardware limit); 2-new-sampler packing still failed. Captured actual failed shader established the shared GLTF ORM sampler duplication. Correction preserves source pixels: sRGB 1024 array contains colour and original 256 end pixels tiled 4x4 with UV /4; linear RGBA contains original normal RGB and original roughness G in A. Exact-identity roughnessMap===metalnessMap aliases only the sampler while retaining original metallic UV and B channel. No room GI, shadows or geometry were removed.

New actual linked programs use 11/13/14/16 samplers; maximum is 16/16, ready true and current snapshot errors empty. Old console failures from previous navigations are retained evidence, not new-build failures. Targeted regression now 12/12, zero skips; original prepared binding regenerated again with the original generator. Prior 1815 full regression predates this sampler fix and is not claimed as current full regression.

Saved evidence in docs/previews/v2-route-craft-38: house-timber48-interior-on/original, porch-on/original, door-close, neighbor-isolation. Original comparison temporarily excludes only candidate anchors; geometry, original material branch and GI remain same. Every hold and anchor mutation restores in finally. Native UI door closure recorded 120 RAF, angle -1.780236 to 0, errors empty; native reopening succeeded before neighbor navigation. Neighbor household-0 same-frame on/off PNG is byte-identical.

Visual result is NOT accepted: physical fibres remove the old sinusoidal pattern, but the planed interior lining remains grey/weathered with excessive albedo contrast despite smoother normal/roughness. Next bounded art correction must retain original finished-board colour relationship and attenuate interior scan contrast; exterior and end grain need parent review. No default adoption. Temporary browser pages closed and viewport override cleared. No performance claim.

## Finished interior correction, desktop verification

Interior-only long-grain surfaces now use the original GLTF colour texture full-resolution linear mean as the finished timber base, modulated by the same complete 1024 fibre texture at 24 percent relative contrast. Outer logs/porch do not enter this branch; source geometry, AO, original UV, GI, normal detail, lights and exposure remain unchanged. This removes broad grey/black weathering from protected interior boards while retaining longitudinal grain. No lower-resolution texture or fewer source details.

Actual evidence house-timber48-finished-interior-on/original and finished-porch-on/original uses Desktop 1280x800 / DPR1 / time870, verified from each saved snapshot. Initial emulation raced renderer initialization; the incorrect-size preliminary interior capture was replaced after explicitly checking renderer size. No performance comparison is claimed. Actual finished-door-close records 100 RAF from -1.780236 to 0; finished-door-open records native UI reopening. Finished-neighbor confirms byte-identical on/original PNG for unselected household-0. All saved current snapshots errors empty; actual maximum linked sampler count remains16. Holds/anchor overrides restore in finally; temporary page3807 closed and emulation cleared.

Final offline cache correction: original ImageBitmap colour means cached in WeakMap by Texture identity, image identity, Texture version and colourSpace; canvas and other mutable image sources never cached. This avoids repeated full-image reads during material installation without changing numerical results. 14/14 targeted tests pass (house-timber48-sampler-test.log), including mean colour-space calculation and each cache invalidation. Original prepared generator rerun and independent house-timber48 build succeeded (2.59s); main dist47 remains untouched. Last browser visual evidence predates only this numerically identical cache addition, not a shader/material formula change.

Visual status: finished wall boards now differ materially from rough outer logs and preserve the old lighter wood relationship. Parent visual acceptance pending. Reused regular end-grain rings and coarse roof/furniture components remain intermediate; this candidate does not claim their final refinement or broad world-quality completion. Default still OFF. Full1815 regression predates sampler/finished correction; final source only has the stated14 targeted pass until main integration reruns full tests.

## Source adoption authorized after parent visual review

Parent reviewed finished interior on/original and porch, accepted the improved processed-board material for the one representative house only. Source default is now enabled; houseTimber48=0 is the exact original branch. Missing/1 and invalid nonzero values follow cabinTimber existing !==0 predicate semantics; terrain Worker still only permits explicit legal 0/1 and rejects invalid/unknown parameters. No-target worlds do not bypass original prepared loading. 8/8 short adoption tests pass (house-timber48-adoption-target.log). No full test or heavy build during perf recording.

Prepared binding now intentionally awaits the original generator at the next released CPU window: node tools/build-structure-prepared-v38.mjs, then node --test web/src/v2/structure-prepared.test.js web/src/v2/house-timber48.test.js web/src/v2/house-timber-textures48.test.js. Do not patch signature manually. Parent owns unified main build and final default browser verification. Existing independent bundle still represents the explicitly enabled reviewed candidate until rebuilt. End-grain regularity, roof and furniture remain intermediate; this adoption is not completion of the entire building group.

## Editable finished source delivered

Executed tools/blender/v2_house_timber48_finished.py without rendering. New assets/src/v2/pastoral/timber48/house-a-group-timber48-finished.blend is 7,769,084 bytes; SHA256 6fbb44d7bc62b0b7ea4b8dc1037dcb6b5f6e1ad2f9c56fa4cec4812b113e2a11. Six derived interior material variants, 302 material-slot assignments; exterior materials unchanged. Saved then reopened the Blend and verified all original mesh vertices/faces/transforms, every UV layer, color/AO and corner normals equal. Protected old Blend/GLB, coordinate sidecar and both runtime field files remain byte-identical. Separate finished-source JSON records the fingerprints and assignments; execution log house-timber48-finished-source.log. No runtime/shader edit, no export, no render. Blender independent lighting/colour management/normal evaluation is not pixel-identical to runtime GI; accepted browser images remain the visual evidence.

## Integrated49 Node fixture repair

Full49's 15 failures were caused by newly adopted default timber entering Node fixtures with relative browser fetch / no canvas. Production remains unchanged; there is no automatic Node disable. Historical structures, structure-reuse, structure-selection-cache and structure-texture-reuse original-asset comparisons explicitly set houseTimber48:false, retaining all old fixed geometry/material/selection/texture assertions.

Collision, doors, household-entry-steps and household-living preserve default48. Shared test-support/house-timber48-node.js reads the actual checked-in fields, so production verifies all original GLB source attributes/index hashes and constructs every added field. It injects existing-style undecoded texture substitutes and a source-mean-only Node canvas stub; these tests do not establish colour or browser quality. Added explicit assertions ensure the target actually activates 159 nodes /69295 vertices and retained aHouseTimber48 in prepared geometry.

Eight affected files pass92/92 (stage3-integrated49-fixtures.log,13.05s). After adding explicit default-activation assertions, the four physics/household files pass37/37 (stage3-integrated49-default48-physics.log,11.24s). No effective assertion removed or weakened. Runtime source frozen; full integrated rerun is left to parent.
