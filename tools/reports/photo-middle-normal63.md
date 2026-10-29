# 照片中冠法线专化 63：独立 OFF 候选

范围仅实际加载 nearParts.mode=1 的 MeshStandardMaterial。未接 main、未构建、未做浏览器像素/反射/GPU 验收；不能声称提速或已采用。

## 已核实的冗余

原生态顶点 shader 对 mode1 在距离 <=42 或 >=235 时早退；spruce-material 的法线细节在 38m 已归零，并最终执行 normalize(mix(nonPerturbedNormal,normal,0))。现有采样门控已跳过该距离的法线纹理采样，因此本候选不宣称减少纹理读取。它专化掉剩余的普通 TBN 求解和 needleUvDx/Dy 导数，保留原几何法线、双面方向与最终 normalize(nonPerturbedNormal)。原 clearcoat 条件块仍原样保留但不启用；带 clearcoat、anisotropy、bump、对象空间法线、PhysicalMaterial 或固体针叶元数据的材质拒绝安装。

## 接口及验收

模块 web/src/v2/photo-middle-normal63.js：

```js
const candidate = installPhotoMiddleNormal63(ecology); // OFF，不改版本
candidate.setEnabled(true);
candidate.setEnabled(false); // 恢复原 hook 和 cache key
candidate.dispose();
```

仅在载入 nearParts 后安装；不复制几何、材质或纹理，不改 depth。调用实际原 onBeforeCompile 链后验证 mode1 与 42..235 早退文本、法线替换段和 Three chunk 各唯一；源码契约变化明确拒绝。材质 hook 被第三方替换时撤销明确报错，不覆盖第三方改动。编译 key 独立，切换触发 needsUpdate，不能把首次编译时间当稳态 GPU 时间。

针对实际 attachEcologyWind → crown occlusion → needle surface → branch photos 链验证：vertex 字符串完全不变；颜色/alpha/LOD/dither 段、PBR/AO/fog/output 段与全部 uniforms 引用不变；DoubleSide、normalMap、alphaTest 保留；near mode5/12、对象空间与 Physical 不误用；错误距离契约拒绝；恢复原 shader 完全相等。

`node --test web/src/v2/photo-middle-normal63.test.js web/src/v2/spruce-material.test.js`：6/6 通过，0 跳过。

后续需同一实际姿态/时间、含反射的原始/启用/恢复逐像素比较，再做真实 GPU 对照；并测试非冻结 RAF 转向。测试前确认仅一个真实 3D 页面。此候选只检验无效 ALU/导数是否有净收益，不改变全部叶片数量、几何细节、alpha 阈值、风或阴影质量。

## 实际64入口：无目标，方向结束

主线真实安装得到 materials=0/skipped45，15个mode1材质均normalMap=false（包括5个alpha=.45冠材）。读取原始schrenk-spruce-mid.glb材质JSON确认bark/core/frond均没有normalTexture；hi仅frond有index1、scale约0.65。因此不是运行时清除，而是中景原资产本来无normal贴图。ecology映射mid→mode1后clone材质，installNeedleSurface在无normalMap时直接return，候选想移除的针叶导数段在真实mode1并未安装。

此前Node测试是带normalMap的合成真实hook链，只证明转换的限定行为，不能作为实际存在冗余的依据。当前真实目标为0，没有省掉任何实际GPU工作；不接主入口、不跑ABBA、不扩大到38m条件不成立的其他模式。独立代码留作未采用记录。
