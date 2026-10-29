# 第41轮冻结源码的生成资产真实再生

2026-10-27。针对统一回归1455项中的10个非main失败，按正式源算法重新生成；未编辑绑定摘要、放宽断言、修改源码候选或减少GI采样。另2个main测试由GI代理修复。

实际执行：

- `node tools/build-forest-root-cache-v38.mjs`：134块、80927根；137216个根/空槽摘要与原基线相同，全部记录一致。
- `node tools/build-meadow-root-cache-v38.mjs`：111块、99900源槽，45440完整根与12个Float32字段、46原湿岸几何槽；解码逐槽、逐字段比特一致。
- `node tools/export-meadow-distance-baseline-v38.mjs`：两处实际8m坡面完整草/地形参考。
- `node tools/export-meadow-patch-v38.mjs`：独立54根8m patch参考包（测试实际使用此包），完整近/中源几何不变。
- `node tools/export-room-exterior-terrain-v38.mjs`：82690顶点、163328三角，当前原地形输入。
- Blender后台顺序执行原 `tools/blender/v2_room_exterior_terrain.py`、`v2_room_exterior_aperture.py`、`v2_room_exterior_ground.py`、`v2_room_exterior_ground_bounce.py`，全部exit0。239有效探针、96主采样、32二次采样、81太阳方向不变；四套完整物理路径真实重烘，最后一套87.15秒。对应日志 `/tmp/kalajun41-v2_room_exterior_*.py.log`。
- `node tools/build-structure-prepared-v38.mjs`：从完整house_a_lived原GLB重新准备所有几何、PBR、门及碰撞，输出11712888字节GLB/6013587字节gzip。

验证：forest9/9、structure7/7、独立patch5/5、四类exterior12/12；草根缓存及实际90轮场景比较通过。最终合并定向日志 `/tmp/kalajun41-regenerated-bindings-tests.log`，覆盖全部10个生成绑定失败及周边真实数据/HTTP/损坏拒绝路径。完整项目全量由主线随后执行；本记录不声称全量已经通过或视觉目标已经完成。
