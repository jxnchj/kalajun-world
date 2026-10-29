# 单根多视图远草表征41：真实小样与数值隔离

独立页 `/meadow-root-impostor41.html`，从未导入生产。不改原根、密度、近中源几何、当前远距范围或整体光色。真实Chrome、1280×800、DPR1、FOV52、4×MSAA；两处原实际坡面全部54/80根，320m、方位0、坡面相对仰角10度、风时刻3。

## 与失败旧atlas不同

每根分别捕获完整源，量化16方位与22.5度仰角档，运行时取相邻2方位；单次有限depth校正，无射线march。2张texture array（RGBA8法线/coverage + RGBA16F原色/depth），每片元8次fetch，每根2三角。原源实际非零三角45/根（69索引三角中24恒零）；没有将原退化三角也算成视觉细节收益。

当前捕获按每个真实root的当前风相位和原字段进行，是表示上限；不是已解决共享风姿的可部署资产。80根需31,457,280字节解码纹理、54根21,233,664字节，尚未计mip；绝不能扩成全世界每根一套捕获。真实GPU捕获约0.5–1秒/patch，无着色器或console错误。没有把捕获时间或三角数当渲染帧率。

## 第一批及有限隔离

|设置|西坡覆盖误差|草甸覆盖误差|结论|
|---|---:|---:|---|
|量化视图，A2C，实际地面|-55.51%|-78.30%|明显吞噬，拒绝当前合成|
|量化视图，常规覆盖混合，实际地面|+21.16%|-10.49%|A2C不是唯一问题，仍不合格|
|精确当前视图，覆盖混合，实际地面|+10.66%|-19.67%|视图量化之外仍有遮挡错误|
|精确当前视图，覆盖混合，双方无地面|-1.46%|+3.82%|仅覆盖积分到达初步阈值，不是小样通过|

所有设置都不提高alpha、不补草、不移根。原尺寸PNG和四通道JSON在 `docs/previews/v2-route-craft-38/root-impostor41-*`。带 `blend-exact-off` 的无遮挡结果不替代真实有地面验收。

当前证据把主要问题缩小到：A2C的亚像素量化；视图量化/重投影；mip聚合多个深度后的单一代表深度与真实坡面做一次硬遮挡。最后一项可把原应部分可见的草像素整片裁掉，也可把被地面挡住的部分整片保留。不能只靠平均覆盖数凑近来通过。

## 继续中的具体修复

已添加独立 `terrainCapture=clip`：在高分辨原源捕获时先让真实地形遮挡，才生成覆盖mip，并用根下原地形三角面约束深度代表值。保留完整原几何，这只是隔离/修复遮挡与归约次序的phase/terrain匹配上限。待主线性能窗口结束后实际验证。没有通过就不接runtime。

验收仍需真实有地面的两坡、多方位/仰角/风相位、原尺寸与放大图；覆盖误差<=5%、上缘误差95分位<=1像素、多个光向的覆盖归一响应误差<=5%，再检查移动稳定性及实际GPU成本。该阶段不以140m或320m任意半径宣称衔接完成。动态风姿共享、地形关系共享、传输与运行时成本均未解决。

## 联合属性与跨根遮挡隔离（继续中）

128×4MSAA捕获在薄叶交叠处平均相反法线；先平均法线再作正半球光响应会丢失能量。固定四命中仍用128捕获时，两坡响应误差为-39.61%/-15.49%。

新256单命中、最近邻法线/深度联合捕获，配合实际Chrome校准的4×MSAA位置（[-.375,.125],[-.125,-.375],[.125,.375],[.375,-.125]），两坡响应误差为-3.87%/+6.50%，但覆盖误差+12.65%/+14.84%，仍未通过。以上数值已由真实Chrome页面返回，但保存按钮未检查HTTP状态，长名字对应文件并未落盘；必须修复保存错误检测并重取原图，不能视为完整证据。保原叶片和风参数、不提高alpha。西坡解码125,829,120字节，草甸84,934,656字节，这是匹配相位上限，不能直接部署。

下一项修复：每根先平均4样点再跨根alpha混合，不等于同一像素样点逐根取深度并集后平均；前者丢失跨根命中相关性。独立诊断保留4样点身份，各作真实深度合成再resolve，不增样点。通过真实坡面后才能扩大方位/风相位及共享资产。其他不透明遮挡、共享风姿和运行时成本仍未解决。

实际跨根四次深度并集后，西坡coverage +12.66%、response +0.72%，草甸coverage +20.03%、response +9.68%，仍未通过。每根先归约不是主要覆盖偏差。保存逻辑已修复HTTP错误检查及短名，16份两坡原/候选PNG+JSON已真实确认落盘：`ri41-{west,meadow}-320-{four,union}-joint-cal-{original,compact}`。下一组独立代码已切真实float32深度捕获后存half，避免原unorm8深度约厘米级量化。此改动待实测，不算完成。

float32→half深度两坡已实测：覆盖仍+12.66%/+20.03%，和8bit捕获相同；响应-1.96%/+9.95%。草甸预先完整地形遮挡亦未改变结果。因此不能继续把主要覆盖偏差归因于深度量化或根下平面。证据为ri41-float-{west,meadow}-320-union-joint-cal-*。下一项256→512原捕获分辨率收敛测试已准备，不增加屏幕样点；观察是否薄叶栅格化量化导致偏差。

## 完整前景遮挡修复得到实际支持

256→512原捕获收敛并未解决原偏差：两坡coverage +22.18%/+15.00%，证据ri41-f512-*。进一步发现原单根相机距根3×size且near=size，排除了真实远视点与草根之间的前景坡面；root局部三角平面不能代替这一遮挡。

将相机移到真实根距离、near=.1，保持原正交尺寸且重新把float32深度编码到根局部half范围后，256两坡coverage变-5.56%/-3.29%，normal积分+4.18%/+2.17%；response仍-12.27%/-9.31%。证据ri41-full-clip-256-*。全部根、样点与叶片保留，没有提高alpha；这支持前景裁剪是假差异的重要来源，但还未达到完整小样通过。下一步只在完整前景条件下复验512，避免继续在有缺陷的捕获参考上追误差。

## 本轮收束：不采用单根高分辨 atlas

完整前景512两坡coverage为-0.78%/+1.70%，但response为-13.25%/+4.82%，尤其西坡响应未通过；normal积分+6.24%/+11.55%。证据ri41-full-clip-512-*已保存。覆盖积分相近不等于逐像素形态/光响应通过。

停止扩展当前单根512 atlas方案，不接生产。已确认并修复捕获前景近裁剪和样点合成等真实问题，但每个8m小块仍需0.34/0.50GB未计mip的纹理，逐样点4次depth并集，且未解决风姿共享、相邻视角、实际遮挡与整坡净成本；不能将这一上限原型宣称为可部署远草。保留独立代码/证据供复现，不再增加分辨率、光照补偿或alpha。

后续群落方案的目标是同源覆盖、轮廓高度、空间层次和材质响应连续，不要求远处每一片离散叶片逐像素相同；仍禁止整体减少密度。既有distance-canopy只改善地表法线，不产生上缘体积；原middle延至140m已实测只是推迟缺口；双全高条带高俯角/反向失败；45–80 fetch层atlas未通过，这些不再重复。另独立评估每根GPU风场缓存，先保完整源根/几何/风公式降低重复计算，再判断群落簇LOD可保留的几何范围。

## 2026-10-27 final hit/depth isolation: No-go

Actual native-button evidence: `ri42-west-isolated.json`, `ri42-west-perspective-old/new.json`, `ri42-west-depth-audit.json`. All runs explicitly released the atlas. The exact-ray perspective crop retains the original camera rays, 80 roots, 512 resolution and alpha; old orthographic capture remains an independent comparison. It did not solve the result: source/candidate hits 127/131, seven wrong roots and three wrong leaves, captured direct response about -16.6%. Isolated original roots 71/80/22/63 still disappear in candidate samples, and other roots appear where the original single-root sample is empty.

The last precision variant reused ONE capture/texture, switching half versus float depth while preserving captured leaf/response quantization. Actual 378,428 covered capture samples: max local half error 0.003084 m; max reprojected half depth error 2.95e-9; decode/reprojection residual zero. Half/float changes only one sample identity/coverage; float still has eight wrong roots and three wrong leaves. Therefore half quantization is not the primary remaining explanation. Same-hit normal-to-response reconstruction remains much closer than incorrectly selected hits.

Stop this refinement line. No more resolution, direction, alpha or model-dimension expansion. Thin-leaf raster sampling/first-hit consistency remains unresolved, as do shared wind poses and the prohibitive per-root asset footprint. The temporary float diagnostic increases memory and is not a production proposal. Production stays OFF. CPU projection tests and native diagnostic success are not visual adoption or stage completion.
