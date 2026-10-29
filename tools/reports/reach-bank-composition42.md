# 成组溪岸材料42：第一轮实景图审，仍OFF

当前默认是v3岸形＋v5有机岸材（含v4实拍河床）；本候选是其上的独立材质覆盖，未改根、叶、地形或全局光色。安装包 `dist-v2/reach-bank42/reach-bank42.js`，`installReachBankComposition42(material)` 默认关闭，支持 setEnabled/setDiagnostic/dispose。

实际已查看 `bank42-mid-{original,candidate}`、`bank42-close-forward-candidate`、`bank42-bed-forward-{original,candidate}`。贴岸中部莎草根趾的部分白色碎石被有机土打断，局部接合有改善；中景变化弱。隐藏水面后仍能明确看到连续碎石槽，且现有根舌切面较平滑、深灰。候选没有新增逐根斑点、规则石子或整段新暗泥条，但不能据局部替换就称溪岸整体质感完成。

本轮不再扩大覆盖/降低亮度：那容易把碎石沟换成另一条泥沟。保持当前候选范围及OFF状态，优先推进前景显眼的大石块形体/材质来源确认，再决定与整体群落协调的下一轮内容。

待确认的大石头强匹配源码是水系统的 `river-stone-mineral-and-wet-edge` 实例，原源Poly Haven Rock 07，经 `tools/blender/v2_shore_rock.py` 归一化后由 `shoreStoneMatrix` 再非等比缩放；主线随后真实射线确认 object7620 / instance10，world[-3613.051504592532,2327.8518258210793,4803.874896018133]。进一步读到 scanned=true 后置编译分支后，纠正此前基类判断：扫描 ARM 并未完全被覆盖，最终使用 clamp(roughnessFactor,.62,.96) 加湿响应；程序微法线也已删除，保留原normalMap。不能把不存在的覆盖问题当修复。现以单实例原扫描粗糙度/原比例的独立对照区分材质与形体，未改全局光照。
