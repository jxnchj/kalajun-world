# 林溪真实曲率岸形候选（默认关闭，尚未通过岸接触验收）

上一项切削深度材质候选v2真实低视点复验细线仍在、灰带仅变暗带，已dispose，明确不采用，不再调整土层阈值。

## 查明的结构问题

`river-section.js applyRepresentativeBanks` 在meander前通过47m/19m字段分配bar与shoulder；之后只brook重新按实际bend计算，林溪bendWeight仍0。当前代表段offset -15.77到+7.11m实际转角为负，几何内弯是side−，原barMinus却仅.08→.339、barPlus .94→.681。中心转角−.7245rad，shoulderMinus=.427、Plus=.953，实际内弯被当作陡切、外弯被当作长浅肩。此处用物理坐标normal=(-fz,+fx)判定，避免源变量left/right名称误导。

## 候选

`forestBankCurvature38=1`，仅代表锚点±18m；±12m内完整、12–18m回接原形。新增 `forest-bank-curvature-v38.js` 从最终下游中心线相邻±3节点计算有符号转角，仅对原水面之外重新分配紧凑坡脚/宽缓滩肩/回接岸顶。单调三次函数内岸接触斜率较小、外岸接触较陡，岸顶零相对斜率回接原DEM。没有随机noise、石头、漂浮层或材质变化。

原节点、原bar/shoulder、水宽、床深、水位、主路径完全保留；水内高度不改。只在旧保护包络内cut-only，不抬低于水位的原地面，不造坝。水文选择与湿度包络不变。`forestShoulderSourceWorld`复用原高度选择根，candidate根仅重新计算Y，源身份不重播；prepared输入包含候选开关，不能误用旧高度包。

## 验证与问题

2/2真实断面测试通过，包括所有lines/segments深比较、水内/外围不变、负转弯side−缓坡、接触连续、单调以及保护拒绝。

实际48m区域1483草根，原ID/xz/scale/rot和其他字段全部一致，仅24根Y变化。生产完整风包络（含gust/recoil/eddy及下弯）135200个岸接触样点发现19根新增保守穿插风险，最大4.828cm。**该候选尚不满足完整接触验收，不以断面测试通过代替完成。** 证据 `forest-curvature-contact-v38.json`。正在离线评估既有brook逐叶脚坐落，不在生产生态接入未经验证的适配。

## 源绑定与后续真实再生

运行改动仅hydrology.js、world-data.js与新增模块；forest-root-binding显式补新模块，meadow binding递归追踪world依赖自动包含。室外terrain导出来源也补该模块，没有改任何存量包hash。

需要真实重生：forest root包、meadow root包；四类室外GI必须以更新terrain导出重新实际烘焙，不是重写来源hash。housePrepared不因本次修改失效（其来源不含world/hydrology），若同期家具变更另计。候选未采用前可独立参数构建作实景，但旧GI来源应明确失效，不能伪称匹配；正式采用前由主线统一重生。

## 接触适配与默认数据收口

既有brook `compactPrototype`会把叶脚径向压缩到38%，不能直接用作“原足迹保持”。新增 `preserveFootprint:true` 窄选项，独立原足迹prototype缓存；默认brook行为不变。候选只在差异地形穿过原叶脚时生成逐叶Y坐落，复用原wet batch与随terrain LOD的contact绑定；全部原XZ、叶高/曲率、索引、顶点数量、颜色、法线和风属性保持。失败明确报原根ID，不删根或静默退化。

1483根中46根需要逐叶适配（逻辑根只有24根Y变化）；全适配根加原保守风险共47根验算。原生产石头碰撞使用全圆最大风包络，225°反向最大风并非本shader可达。改用真实shader的field r/g/b/a∈[0,1]、flex∈[.68,1.25]、local sine∈[-.5,.5]严格系数区间，保留gust/recoil/eddy及下弯，不挑时刻/不降低风幅。1,898,721个域样点的非基部绝对/新增穿插均0。完整原XYZ除叶组Y平移外逐值相等，index及风属性相等。`forest-curvature-wind-domain-v38.json`为实际候选生态支路结果。此为离散参数域地形验算，不能替代实际GPU连续风、岸接触和LOD验收；未宣称视觉采用。

11/11候选及brook/valley/草根拒绝回归通过。默认关闭状态的森林根80,927树/134tiles、草根45,486根/111tiles均真实再生，55根远草参考也通过原导出器重生。四GI通过新的独立terrain candidate真实重烘141.07秒，备份`backups/route-continuity-v38/exterior-full-rebake-88ac7616b8b0/`；三个payload完全相同，terrain表仅4个second.seconds耗时不同，所有辐射值不变。随后36/36缓存、参考资产、四GI来源/输运回归通过，日志`forest-curvature-default-bindings-tests.log`。未执行hash-only rebind。

这些数据对应**默认off旧岸形**。候选on的根输入明确不匹配默认缓存而执行原算法；本次GI不构成新岸面GI验收。正式采用候选前还需真实浏览器和采用后重新采样烘焙。

主线实际浏览器复验：bank-curvature-overview/low/opposite/top-on、低视点8秒动态录像、live-contact-timeline，以及远离60m后返回low-return-complete均完成；主线报告q/m=0、ecology pending=0、errors为空，未见新增明显穿草/悬浮，内外岸分配更合理，连续灰槽整体仍未解决。本项只能记为岸侧分配错误修复，不能称自然溪岸定稿。

主线要求将已验收候选改为默认ON并重生新默认数据时，自动审批拒绝了写入命令，理由为历史“实验暂不启用”未见用户明确撤销。命令未执行，已只读复核源码仍为显式=1开启，默认OFF；前述真实再生数据仍对应OFF。未用其他入口绕过，也未把旧数据标作新默认。等待主线澄清授权范围后再处理采用，当前保留可显式开启的已验收候选与完整证据。

## 已验收采用与新默认数据（当前状态）

上段审批阻塞已解除：主线补充直接用户授权范围，历史“实验暂不启用”明确属于 Dot 交接 zip 的选择性合并；当前是本会话独立开发并经实景验证的岸侧分配错误修复。对同一默认采用动作附该范围及实景证据重试一次，审批通过后执行。没有启用 Dot 旧实验、失败材质、HDR 或 9cm 抬肩。

`forestBankCurvature38` 现默认 ON，`=0` 保留旧断面对照。46 根逐叶适配保持全原足迹、叶片、风属性和根身份。新默认森林包真实重生：80,927 树、134 tiles，完整根记录摘要仍为 `93ad9d92426f6b8f6e3f3ab26b6642f7cb9a734d296c0bb27af567ed68dea3fd`。新默认草甸共 45,486 根，其中 45,440 完整字段记录与 46 原几何程序生成槽；111 tiles，rawSHA `58a688e48294f28ded529f5554e44d6dd2ff797f814758a88e902e02393eb3bd`。55 根参考通过原导出器真实重生。

新 terrain candidate `backups/route-continuity-v38/exterior-rebind-9887d5f5e93f/room-exterior-terrain-candidate.json` 后执行四类真实辐射重算，140.43 秒，备份 `backups/route-continuity-v38/exterior-full-rebake-51d99eab59c0/`。四类均重新执行采样，没有 hash-only rebind；结果中 aperture/ground/ground-bounce payload 与此前相同并不意味着跳过重算。

36/36 根缓存、参考与四 GI 来源/输运测试通过；另13/13几何、曲率、肩部保护与历史根拒绝回归通过。缓存对照现在严格比较所有原根字段、逐叶 geometry 全 attribute/index 字节、feet/seating/envelope 和 wet batch 几何，而非比较独立实例的随机 UUID；总根数断言仍为45,486。日志 `forest-curvature-adopted-bindings-tests.log`、`forest-curvature-adopted-geometry-tests.log`。源码与数据已供主线统一构建/回归。

本项成果边界不变：修复实际弯道内外岸分配错误和坐落，**连续灰槽仍开放，溪岸尚未自然化定稿**。全光照/色彩顺序未改变。

## 全回归发现的谷地组合错误与最终收口

主线第一次全套 1245 项为 1238 通过、7 失败，不是全通过。原 valley-meander 子进程超过12分钟无进展，恢复后2秒 native sample 见持续 Map/字符串哈希（JIT未符号化，不能声称已直接采到JS行），随后明确终止该测试子进程。证据 `valley-meander-stall-sample.txt`。

真实源码错误：`valleyBankContext` 的旧谷地 sourceWorld 浅拷贝继承森林 `forestShoulderSourceWorld`，它仍指向新谷地，导致 `_grassAt` 绕过旧谷地地形，已迁移根再次迁移。修复为该旧谷地选择世界移除不适用的森林别名，主世界森林别名保留。另修复实际无界路径：无河网样本 id=null 不再将 distance=Infinity 传入 nearSegments；用无section的原实际坐落分支，不编造距离。nearSegments/intersectsBounds 对非有限、负半径、无序或无法递增的网格坐标明确抛错。Infinity/-Infinity/NaN 与有限半径几何穷举 oracle 均有测试。

最终 valley 7/7 通过（30.33秒），原16,454根保留，新16,761根含307湿根；两个实际谷地版本各15片地形接触 pending=0，原花种类、身份、尺度和数量断言保留。`valley-meander-bank-composition-fix.log`。

其余6失败也已收口：两个历史截图固定射线、两个v19/v22旧剖面构造明确固定 curvature=false，原坐标、容差、断言未改；brook legacy假世界同步移除指向新brook的选择别名，保留当前默认ON测试。shore-contact的真实根落水/排除失败由谷地源码组合修复解决，未改其断言。五文件30/30通过，`bank-adoption-six-regressions.log`。

最终hydrology/ecology变更后，森林、草甸、55根参考再次真实再生；草甸 rawSHA仍58a688e48294f28ded529f5554e44d6dd2ff797f814758a88e902e02393eb3bd。四类GI又按新导出真实重烘140.79秒，备份 exterior-full-rebake-75d33d55ad37。最终40/40缓存/来源/参考/GI/曲率回归通过，`valley-bounded-final-bindings-tests.log`。源码稳定，等待主线统一构建与最终全套。此处不以定向通过代替整体重新验收。
