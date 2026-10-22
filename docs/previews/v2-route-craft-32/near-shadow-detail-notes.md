# 第32轮：近距离草影采样预算与可接入方案

主任务已通过实际动画隔离确认：原首层CSM范围60m、有效宽约119.76m、2048贴图对应约5.85cm/texel，radius=2让草影扩散成块。以下模块仅提供兼容的质量配置与必要稳定化；最终帧率、GPU时间、图像收益及采用策略以主任务浏览器记录为准。

## 4层CSM不应直接全设备默认

实际木屋/毡房GLB的木材、织物等材质拥有baseColor、normal、roughness、metalness四个fragment sampler。roughness与metalness虽共用图像，shader声明和Three纹理单元分配仍为两项。加上云缓存2、PMREM/DFG 2、室内GI场/contact 2、室内spot shadow 3，CSM之外共13项。旧3层共16，新增4层共17。WebGL2仅保证16；必须检查实际 `renderer.capabilities.maxTextures`，不能为了腾单位关闭任何现有室内功能。

## 模块接口

`createNearShadowDetail(renderer.capabilities, mode)`，mode为auto/cascade/resolution/legacy。

- auto：fragment sampler≥17采用4层2048，范围20/60/180/500m，旧60/180/500m远端完全保留，实际正交宽度不比原对应层更大。
- sampler=16：首层4096，其余两层2048，范围仍60/180/500m；不删除、不缩短任何旧阴影覆盖。
- 不支持4096且sampler不足17：保留legacy并可记录能力受限原因，不删细节冒充解决。
- 非legacy仅第一层radius=.5、normalBias=.008、depthBias为原1/4，反向深度符号通过公共 `shadowDepthBias` 正确设置；远层参数保留。

构造CSM后、configureCSMDepth后使用 `configureNearShadowDetail(csm,detail,{reversedDepth})`。4096混合模式附带必要的近层texel snap：Three r186原CSM全部按全局shadowMapSize稳定化，本模块仅为真正不同分辨率的级联重新从完整视锥求中心并按其像素节距取整。远层仍执行原Three路径，不变成半像素跳动。返回函数可在dispose时恢复包装。

## 成本与检查

- 4层方案额外4,194,304阴影像素；仅32位深度存储下界+16MiB。
- 原首层4096方案额外12,582,912阴影像素；仅32位深度存储下界+48MiB。
- 上述不是总VRAM实测，Three colour attachment、驱动分配及带宽另计。都可能增加GPU绘制成本，不能称性能优化。
- 19项相关测试通过，其中4项新测试：读取实际GLB验证最重室内材质sampler、能力回退/像素成本、4层保持旧各段覆盖精度、50帧运动及普通/反向深度下混合分辨率近灯位置与原生4096逐值一致、远灯与原生2048逐值一致。

实现仅新增 `web/src/v2/near-shadow-detail.js` 与 `.test.js`，不修改environment/main；由主任务选择、接入并验收。
