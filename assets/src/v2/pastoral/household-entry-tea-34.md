# 饮茶户石阶：第35轮选择性合入

该阶段3设计属于 `cabins:-1972,3678:784f73bf0ba94d17`，不是实地测绘复刻，也不代表整户或全世界已完成。原木屋、茶具、地形及其他住户保持原资产。

- Blender主文件含32块独立闭合石块（8块踏面与24块垫石），导出一个网格、2752三角；运行与Rapier碰撞共用同一完整几何。
- 最终修订为 `front-bevel-17p111mm`：0.17m级高、0.36m踏深、1.2012m宽，14mm高/17.111mm深前后倒角。10mm旧候选未采用；运行时拒绝不匹配的修订、实体、台阶契约和比例。
- 保留原完整stone材质、实体尺度UV、32方向局部接触AO/天空可见度。没有新增贴图，没有把光照画进颜色。隐藏preview对象保留原木屋、茶具和真实地形参考。
- 仅饮茶实体使用 `house_a-entry-tea-34` GI场；仍是原静态双反弹近似。相较共享茶户场，变化很小，不等于完整室内GI改善。
- 默认采用最终编辑源；`householdEntry=v33`保留过程版回退，`householdYards=v32`保留完整院落回退。`householdEntryShadow=closed`仅为显式实验，默认standard；低太阳接触保真、宽斜纹问题仍需独立处理。
- `walk-household-tea`菜单位于该实体真实门前草地并面向门中心，供实际浏览器走入/走出检查。测试通过不代替浏览器移动与多太阳角验收。

## 编辑与重建

使用能读取v0502源的Blender 5.2系列。保持单石可编辑性，修改后以`--export`导出；只有明确重新程序生成时使用`--rebuild`。

```sh
node tools/export_household_entry_recipe.mjs
"$BLENDER" -b --python tools/blender/v2_household_entry.py -- --export
"$BLENDER" -b --python tools/blender/test_v2_household_entry.py
python3 tools/build_glb_transport.py
"$BLENDER" -b --python tools/blender/v2_household_entry_bake.py
cd web && node --test src/v2/household-entry-steps.test.js src/v2/household-entry-selection.test.js src/v2/household-room-fields.test.js
```

导出会更新AO/天空属性、主源和导出指纹，因此必须连同传输清单、实体GI及合同一并刷新，不能只换GLB。原共享室内源保持不变。

原交接的云端报告、未采用阴影研究和旧失败倒角记录保留在 `kalajun-round33-34-review-20261023/candidate`，没有整包复制到主项目。当前本地检查写入 `tools/reports/route-continuity-v35-entry-tests.log` 及现有 source/grid 验证JSON；浏览器结论由本轮整体验收单独记录，历史记录不能替代本机结果。

## 本地源与脱敏交接源的配对

交接继承的是GitHub脱敏副本的Blender指纹，本地原源必须保留。第35轮只读比对确认两份原木屋/家具在全部网格、UV/AO、对象变换及实际引用的材质节点/图像字节上一致；文件路径和Blender重存时清除的无用户孤立数据不同，具体清单见 `tools/reports/entry-source-rebinding-v35.json`。元数据同时保留`handoffOriginalSources`与当前`unchangedOriginalSources`，没有伪装成字节相同。饮茶实体GI另行用本地原源重烘焙，先验证原茶户11项控制payload，见 `entry-canonical-rebake-v35.log`。石阶本体的Blend/GLB字节没有重写。
