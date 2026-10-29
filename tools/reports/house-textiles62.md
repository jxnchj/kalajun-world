# House_a 成组织物62（独立 OFF 候选，未实景验收）

针对61真实图中的床被尖折/厚白边、箱上10mm层间空气、长凳垫缺承托，制作9个既有织物节点的接触形体。影响明确为共享 house_a 资产族；不替换其他房型、不加装饰、不改变家具布局或全局光色。原几何以外的主世界/木作48/58入口仍冻结，未接 structures。

## 源与运行资产
- 可编辑 `assets/src/v2/pastoral/textiles62/house-a-textiles62.blend`，来自真实 house_a-lived-timber-38.blend。
- 建模 `tools/blender/v2_house_textiles62.py`；发布 `tools/build-house-textiles62.mjs`。
- geometry-only GLB `web/public/assets/v2/house-textiles62/geometry.glb` 1,577,704字节，9节点、零images/texture；原节点材质/PBR与纹样继续借用，不导新材质。
- 独立 API `web/src/v2/house-textiles62.js`：显式 `houseTextiles62=1` 才开启；`prepareHouseTextiles62(assetId, scene, {enabled,loadAsset})`，在原48/58字段准备和assembly前调用。原9节点位置/对象变换/材料不变，只换geometry；原纹理图案保留，新的UV投影仍必须实景验。
- 原Blend/原house_a_lived.glb完整SHA不变；258个其他mesh指纹不变。原床被/脚毯的实体缝边保留，三角数13664/5600与原相同。其他改造不减物件或织物层数。

## 形体
床垫底面由原.425抬到床条实际.440之上1mm，中心顶仍.554；边缘压薄、被面跟随真实床垫网格而非互不相关的解析鼓面，脚毯跟随被面。保留原枕头，不声称重新模拟枕头压力。

箱上4层保持原横向错位、颜色顺序与整体摆放；每层底面从下一层实际三角面采样，代替原10mm空隙。盖毯仍原占地、原纹理，只跟随叠毯上表面，不以独立高拱掩盖空气。叠层圆钝与薄围边是设计形体，不是动态布料模拟。

凳垫下表面贴合原座板真实倒角，双坐位仅浅压陷；保留毫米缝边，不绘制黑轮廓线。

## 实际检查与明确局限
4/4 Node实际GLB针对通过212.9ms：默认OFF/非house不加载；真实9节点原材料及所有非目标几何不变；恢复完整；最后源binding损坏/最终候选缺UV均零半发布；替换后原木作48与家具58的真实精确字段仍全部通过。

真实承托核查 `tools/blender/v2_house_textiles62_audit.py` → `textiles62/contact-audit.json`，检测下表面grid点对实际承托三角面，非构造函数自证。首次发现顶盖最大10mm空隙、2.36mm穿插及座板倒角8.25mm空隙，已改真实BVH承托后复验：有承托的样点全部无超过2mm空隙/穿插。床垫约1–1.35mm，被面约1mm，脚毯约.7mm；叠层近0（浮点误差<0.001mm），凳垫约1mm。

以下未伪称全接触：床条真实缝隙47点、被/脚毯超出下层55/57点、错位叠毯27/27点、盖毯外悬157点仍明确记为无下方覆盖。外悬边并非错误删除，也不能由该内部点抽样证明垂落自然；最终侧面/低角度图必须检查。现接触AO按候选几何重算，房间GI未重烘；不宣称全部动态GI正确。没有浏览器图审或性能结论，没有默认采用。

## 后续最小接入（尚未执行）
constructor/options显式候选；开启时跳过house_a原prepared以免恢复旧几何；在48/58 prepare前调用上述API；把retiredGeometries登记既有source资源owner（候选新geometry由后续_trackSource接管），stat记入structures。不要额外释放借用材质/纹理，不在dispose调用restore后让旧geometry失去owner。候选改变可见软物件表面，collision应使用同一assembly模板，不另造隐形碰撞。保持原门/所有木作节点不变。

接入会使structure-prepared source签名变化，但本独立模块未被生产import，当前未引起默认准备来源变化。需主线统一授权接线与正式再生/独立build，之后沿61三机位原/新/恢复核查，并至少补一次箱盖/凳垫侧面悬边和原门态GI。不能以本文数值采用替代实际图审。

## structures 已接线（仍显式 OFF，未主构建/浏览器）
主线63全量退出后获授权接入：constructor `houseTextiles62`/options；开启的house_a绕过原prepared；在48/58准备前替换；旧/新source geometry立即登记同一_sourceGeometries owner；stats与release清理。main及Worker名单未改。`structure-prepared-binding.js`登记新增真实模块，需正式再生structure来源。

7/7针对真实GLB整合通过783.6ms：
- 9节点替换作用于完整house_a资产族；无代表实体的邻屋族仍按明确候选范围替换，其他房型不加载；OFF原prepared路径与零候选请求保持。
- 全部非织物source geometry（含48/58新增字段）逐值一致；原门完整模板、base矩阵、门碰撞geometry逐值一致。
- 两个实际house_a实例的collision完整三角数量变化精确等于新旧9织物三角差，碰撞跟随同一新表面；未保留隐形旧织物碰撞。全坐标有限。
- 原九节点与新九节点资源各释放一次；在替换后58加载失败也释放两组资源，没有遗留owner。

这只证明真实运行资产接入与回归，不证明新的布面造型或GI接触最终观感；新geometry影响局部接触，房间GI未重烘。默认采用与主构建仍由主线实景验收决定。

## 63实景否决与独立资产修正版（仍OFF，待新版实景）
已亲看 `house-textiles63-candidate-{whole-room,bed-chest,window-bench}-0.png` 并和61旧织物比较。63不采用：床白厚边改善但宽褶消失、箱侧布纹被压掉、红盖毯出现白色裂痕、凳两端尖耳。完整63源/GLB/manifest/script备份 `backups/house-textiles63-first-candidate/`，旧图保留。

确定归因与修复：
1. 侧壁原先沿用上下表面同UV，侧面UV面积为零，原布纹采样退化；现侧壁按周边展开有效二维UV，仍借原全部纹样/材质，不新增或抹除图案。实体毫米缝边保留。
2. 凳面BVH超出真实座板后回退.480常量，高于原倒角边缘形成耳朵。现从实际边缘高度连续向下延拓，不上跳。
3. 床面原30/19mm宽褶曾降为6/4mm，形成平板；恢复原量级宽褶，保接触和原9节点/层数，不通过压平去穿插。
4. 白痕已由实际三角内部证明：旧盖毯顶面6,856个内部采样，24点低于白色下层，最深3.158mm。原grid点检查漏掉三角内部。新版盖毯内区与下层共用格点和显式一致对角线，外加连续悬边，保持原外轮廓占地；不用覆盖饰物掩盖。新版8,960个顶面内部样点穿插0，最小净高4.939mm；有承托底点净高约.700mm。检查脚本 `tools/blender/v2_house_textiles62_triangle_audit.py`，结果 `textiles62/interior-top-audit64.json`。有限离线采样不是所有视角最终视觉证明。

新版geometry-only GLB1,741,496B，原主GLB、258非目标mesh及原材质不变；7/7真实源与整合测试838.5ms。未修改structures/main/Worker、未渲染或浏览器，仍不默认采用。待实景复查侧壁纹样是否合理、盖毯穿插是否消失、凳边及宽褶是否自然；此前63的技术ready不作美术通过。

## 64实景再次否决与保留原折层修正版（仍OFF）
已看64三机位：白三角在这些图中消失，但凳角仍翘尖、叠毯侧面缺原折层细节、被面仍薄，不能采用。旧64源、GLB、manifest及脚本完整备份 `backups/house-textiles64-candidate/`。

只读回查 `v2_soft_goods.py` 后明确：原四条folded各自不是单个软盒，而是两片折返叶与两道实体缝边。先前重建虽三角数更多，仍丢失有效形体细节；已停止该单壳替代。当前每件保留原2940顶点、5872三角、全部polygon连接、全部UV loop、双叶与双实体缝边，仅根据下叶实际底面和前一层真实支撑作连续竖直位移；XY原样，源脚本明确断言topology/UV完全相同。

凳角的第二个实际根因是矩形夹取不能处理25mm圆倒角投影：夹取后的点仍可能在真实圆角之外而触发高平面fallback。当前从中心向采样点二分找到实际可见投影轮廓，再从其真实高度连续下垂，不使用常量高度回退。

盖毯内区改跟随原上叶格点/实际对角线，外围连续延伸。此次还发现审查工具对quad调用BVHTree.FromPolygons会自行剖分，与GLB的loop_triangles不同；一度产生-14.8mm假穿插。生成与审查现全部使用实际loop_triangles，未放宽阈值。此口径问题不改变63白痕真实图审失败；64重建源原本已是显式三角，亦不把此前通过改写成失败。

最终实际三角口径：盖毯4032个顶面内部点穿插0，最小顶面净高5.152mm；四条折毯下叶各459个内部点均有承托、约.700mm净空；凳垫893点约1mm净空。外轮廓自然程度仍需新版图审，不能由数值判定。

独立GLB1,671,944B；7/7真实源整合测试789.3ms。原门、48/58木作、原主GLB保持；无main/structures/Worker新改动，无渲染与默认启用。本轮保留床面偏薄为未完成，不宣称整组成品。CPU作业结束已通知主线安排GPU。

## 66实景否决与整件落位修复（仍OFF，待图审）
66图中凳尖角已解决，但叠毯波浪夹板/蓝灰尖三角严重失败。完整66候选备份 `backups/house-textiles66-failed/`。只读排查确认无旧customNormals，四材质单槽正确；原双叶535同XY样点/件交叉0，变形候选四件出现16/18/20/20交叉，最深约17.27mm；相邻顶点位移跳变最大152mm。逐点射线贴合的非连续场逐层放大，保持拓扑与UV并不能保持正确形体；此前支承点和盖毯净空未覆盖此内部自交，不能当整物通过。

当前取消该warp。每条叠毯以原底面顶点/三角内部采样和实际承托确定唯一竖直位移，整件平移，不再逐顶点贴合。原双叶、双缝、完整UV、XY及内部形体保留，允许正常折口空隙。盖毯跟随稳定上表面，已通过的凳垫修复不变。

新增实际失败回归 `tools/blender/v2_house_textiles62_shape_audit.py`，结果 `textiles62/shape-regression67.json`：四件每件535个内部样点交叉0，最小双叶间距约.947mm；全部相邻边位移差0。层间底部实采正常净空约.70–5.96mm，无>2mm穿插，不能将大于2mm空隙误记为失败或要求所有点贴死。盖毯4032内部点穿插0，顶面最小净高5.152mm。

当前独立GLB1,565,836B；7/7真实GLB整合814.5ms。原主GLB、木作和门保持，structures/main/默认无改动。尚未新图审，床面偏薄仍为中间态。CPU已归还主线。

## 71 同构建实景采用审查（2026-10-29）

亲自对照 `house-textiles71-{candidate,original}-{whole-room,bed-chest,window-bench}-0.png` 三对真实图。相较原版，床垫与床架、床尾毯及箱顶盖毯的大悬空缩小，凳垫尖角消失；66失败版的尖三角、竖刺与红毯下裂状洞未在这三机位重现。纹样及原有双层缝边保留，未见新增明显穿插。床品仍偏薄硬，叠毯侧面仍板状；这些是未完成质感，不应称整组织物完成。建议接受为接触形体修复，待下述同源照明收口后默认采用；目前保持 OFF。图审仅覆盖三实际机位，不等于所有背面自交的证明。

### 实际 GI 输入与最小采用收口

- `v2_room_bounce.py` 的 FILES、`v2_household_room_bake.py`、`v2_household_entry_bake.py`、`v2_room_door_angles.py` 均读取 `assets/src/v2/pastoral/house_a-lived.blend`，再从场景不透明三角构造 BVH。并未加载 textiles62 九节点；运行时替换 geometry 不会更新已烘焙场。
- 现验证主要绑定原 `house_a_lived.glb` 与原 Blend SHA；它们未变，所以现有 ready/source 校验不能证明已包含候选织物。采用前需在共同烘焙输入处明确叠加九节点几何，并登记该派生来源，不能仅改旧 hash。
- 受影响范围限 house_a：基础 sky/secondSky/solar/secondSolar/apertures，以及 house_a-living-0/1/2、house_a-entry-tea-34 的开闭端点与 entry 30/60/90°中间门态。用相同组合重新计算/比较，避免原、新几何场混用；保显式 OFF 的旧组合。无需重烘 yurt、lanchuan、三房灯或外地形场。
- `v2_room_contact.py` 是近地板 contact correction：receiver 在 floor[-.025,+.085]m，射线半径 .55m，全部不透明几何作为 blocker。它不是床面/毯层接触贴图。应随相同 house_a recipe 重算比较；若结果相同可按真实计算复用，不预先声称必有改变，也不声称新布面接触已由该场完整解决。候选已有自身 vertex AO 不等于房间场更新。
- 最小剩余工作：统一九节点烘焙叠加与来源选择；限定上述 house_a 数据重算/相等复用；检查原/新开闭门、昼夜及邻屋对应资产族，随后默认采用。无需先把薄硬质感全部重做，更不提前全局光色。

本次只读源码/图审并补报告，未改生产/资产、未运行重烘、未开浏览器。

## 73 候选同源 GI 正式接线与重烘（仍 OFF）

新增 `tools/blender/v2_house_textiles_gi73.py`，每次打开既有 house_a GI 原场景，然后导入真实运行 `house-textiles62/geometry.glb`，只把其九个 mesh 变换到原节点局部坐标并替换 mesh，保原材料及其他对象。不是再次变形71资产。全部场使用原 sky/secondSky/solar/secondSolar/aperture/contact 积分器、原采样数量、原接收网格和原门轴。

正式运行527.60秒完成：house_a、living0/1/2、entry各102/0/30/60/90，共25门态，20独立模块（开闭同包）写在 `web/src/v2/house-textiles-gi73-data/`。未压缩10,003,297B，各模块gzip累计5,638,038B；仅候选启用时选择，不能称没有加载代价。来源和结果在 `tools/reports/house-textiles-gi73-all.json`。五族地板contact实算payload均改变，已保新值，未冒称床面接触图。

加载接线只改现有 legacy/household/secondSolar/closed/teaAngles/pastoralAngles loader 和新 selector。`houseTextiles62=0`或缺省保持原import；1选择完整新组。新增 `derivedGeometry` 明确记录实际GLB SHA、manifest SHA、九节点名单、原GLB SHA；加载拒绝混旧字段，household和门态验证也比较该字段。旧运行源码备份 `backups/house-textiles-gi73-runtime/`，原GI目录未写，原Blend/GLB/hash均保持。未改 main.js 或其他房型。

针对回归26/26通过，进一步新源来源与完整 RoomBounceField 加载测试3/3通过：fresh ON进程逐个加载五族、基础secondSolar、closed和两类真实中间门态owner；OFF原门态回归、缺包/错误来源拒绝、yurt仍旧源。原根、几何、纹理密度不变。直接计算五类prepared依赖列表，修改文件与structure/forest/meadow/terrain/reach列表交集均空，因此本轮无需重生其准备包。

边界：尚无73独立构建/浏览器门态、昼夜与邻屋实景验证，不能据Node通过默认采用；该步骤由主线统一执行。71三对仅证明形体净改善，不能替代新照明的图审。织物仍OFF，薄硬质感仍中间态。

## 74 电脑横版实际验收与暂停点（2026-10-29）

统一74完整回归1965/1965通过、构建成功后，在Chrome唯一3D页1280×800/DPR1、time870验收候选。三固定绝对机位六图已保存 house-textiles74-candidate-*；几何接触修复保留，床品仍薄硬，叠毯板状感尚未解决。早先helper的旧固定scope文字已纠正为按真实来源描述；已有六图文件未回写其历史scope，GI来源以下列独立证据为准。

实际原生门按钮分别打开与关闭：house-gi74-native-open记录809个RAF（34条中间门态），close记录867个RAF（34条中间门态）。全部记录可见、无运行错误、无原/新GI混用；起终分别0→102及102→0度。开放、闭合、30/60/90度加载源共29条全部指向geometry b59195344614a6ee566c98976a7688d5ce49fa1c4b1117aa5f4c837013e1f854。记录仅证明原生门交互及来源/权重连续，不把RAF当每一条都独立绘制，也不是任意动态GI。

闭门同机位正午870、夕照1260及UI允许最晚1305均实景保存、q0/errors空；最晚是21:45，不冒称全天/深夜覆盖。原生切换饮茶、手作、晾晒三屋，均收敛并保存门廊实际截图，分别按各自household数据加载29条新来源。此处是邻屋门廊与来源验证，不冒称逐户走进室内完成全视角验收。

候选仍OFF，没有默认切换。根据用户“完成当前小任务后暂停”，本组浏览器检查收尾后停止。继续时应完成同构建显式0回退对照、默认采用检查及正式入口复验；若采用，几何与GI选择必须同步，不能只切几何。床品柔软形态另按阶段计划完善，完整光色仍第五阶段。
