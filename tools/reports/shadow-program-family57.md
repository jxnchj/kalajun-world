# 草影程序复用与真实来源更新 50–57（尚未采用）

默认正式入口仍为49；以下均为唯一Chrome世界页、电脑横屏1280×800 DPR1、time870的独立验收。没有减少根、叶、几何、风或遮挡物。长路线均为原生W输入的低速飞行，不能写成有实体碰撞的步行。

## 已观测与修复

50长段33.67m记录900帧，805帧细节影窗有效；其余62帧与重复预热有关、33帧来源准备。51同走廊33.90m仍812/900有效，不能以短段480/480替代长路线通过。51还发现异步选择期间活动根改变，旧根索引越界。

52在每个视图构造和最后提交前核查原生来源，变化走既有重选；真实34.65m、822/900有效，无原根选择异常，仍有预热。相关回归包含中途与最后一次yield后根数缩减、根矩阵重排、已有视图保留及重新同步。

实际programMiss诊断逐层确认：新细枝只是替换uniform的材质副本；其继承的投影阴影又被包装一次，造成新key/版本；普通枝条数组长度及vertexAttribDivisor也被保守证书误当GLSL编译差异。53–56逐项核实并修复。56真实42.15m仍941/1000有效，不能称问题解决；最新诊断仍指向实例除数差异，所以57补齐GLSL与VAO状态分离。

57仅对明确由既有细枝构建器创建、只替换uniform的副本记录来源。任意等字符串闭包不共享；hook/key/version变化即撤销。材质、uniform、VBO、VAO、原divisor与源遮挡证书都独立保留。原生投影已继承则不再重复包装。普通属性长度/除数不需要另一份GPU程序，类型/格式/实例类别/morph/实际shader变化仍验证。针对47/48项及后续临时全源组合检查均有独立日志，不冒充新的全量回归；最后一次全量为51的1843/1843。

另有真实新来源interval计算仅4.3ms、等待切片约783ms。57缺精确包围时暂时保留该来源全部几何与根，后台精化；已准备来源原筛选不变、不增加2/32ms预算。报告额外三角上界和持续mask次数。实际GPU完整遮挡与连续性待验，不能用Node通过认定采用。

## 图像证据

51已有六个真实风时间点的ON/native有效PNG及完整源Oracle，所有Oracle像素差0，窗口在画面中有实际效果。图片为同风同步成对采集，工具/网络期间恢复正常RAF；不是连续录像，也不代表移动连续性通过。

`shadow51-single-wind-summary.json`记录每次完整源/选择draw和三角；首帧完整273draw/11,082,559tri、选择201draw/1,931,263tri，遮挡0差。不得用选择三角减少直接宣称FPS提升。

## 构建与统计范围

52/53/55/56/57使用隔离临时构建源保持原岸坡和准备包，未回滚共享目录正在制作的bank50。旧岸坡原字节已从manifest逐SHA验证，并保存到backups/shadow-only52-base；正式默认49/各独立dist均保留。54是新岸形质量候选，与上述性能/连续性构建分开。

55起使用startOnInput观察，真实W后计满1000RAF，避免工具通信耗尽采集窗口。此前首帧观察与按键有延迟，按键时刻、实际距离、队列与状态以各JSON为准；不同路线/起始加载状态不得直接相减认定加速。

尚未完成：57真实路线、跨场景返回、完整源遮挡、额外绘制成本与最终默认采用。林溪整体帧率、加载长尾与第三阶段仍开放。

## 57真实长路线结果（2026-10-29）

唯一横屏页、1000帧、原生W低速飞行40.7879m，954帧有效、38帧pending、0隐藏帧；无根选择异常。仍不满足连续采用条件。静止加载尾部仍反复准备，但q0后30个自然RAF的preparations530/revision2418完全不变，来源版本无变化，因此不是无限静止重准备，不作无依据修复。

终点六风图像验收第一对被完整源Oracle拒绝：54像素差、最大128、总3570；完整源275draw/11,133,503tri，选择199draw/1,975,951tri。没有保存通过图或把少量差异忽略；错误与q0现场保存在shadow57-oracle-failure-and-settled.json。候选继续OFF，逐来源诊断处理中。普通实例offset/stride已确定是VAO绑定，新增9/9检查通过，尚未新构建；真正新材质仍必须预热。

## 58定位与60实际结果

逐源完整地表对照最终确证为贴地等深度处材质ID排序导致接收地表与投影者先后相反，并非根包络遗漏。统一receiver/reference=-1、caster=1后，逐源与完整分类均零差异。保留失败和反证，不改风边界或放宽断言。

60六个自然风时刻完整遮挡全部零差异，实际ON/native图有阴影细化。原生W40.4601m/1000帧973有效、26准备中、0隐藏；开始时q0，而57为q170，不可据两者差额称受控提速。首次加载记录来源退休竞态，已修正缺失版本误匹配并以真实异步移除回归21/21验证；61另预热已驻留却count0的mode12批次，26/26针对通过，待浏览器。

60实际meadow缓存ready/hits54/cached19319+procedural84，岸草准备包ready。全回归1872中1871通过，唯一8m参考来源过期已正式再导，54根及全部payload不变、5/5针对通过；待下一统一全量。第三阶段仍未完成。

## 62真实路线与自然风；63待验

已核对实际文件 `docs/previews/v2-route-craft-38/shadow62-single-continuous-42m.json`。独立横屏1280×800/DPR1、time870、单页原生W移动 **41.4434569 m**，采集1000帧：938帧ready、63帧pending、0隐藏帧、failures=0。ready与pending是分别记录的状态，并非互斥统计。路线首尾q均0；输入距观察器armed约100.332秒，不能称首次可交互立即移动或冷启动验收。仍未达到全程连续采用条件，也没有由此得出FPS收益。

剩余programMiss精确为 `spruce-12-0--38,49-31/32`（id12413/12414，geometry9401/9402，material1383/1384），均 `no-completed-material-certificate`、exactGeometryCertificates=0。初始28m真实预取半径内没有树形0，因而61只预热已有批次还不足以覆盖此长路线首次出现的树形；不是现有批次过滤遗漏。63已有限补齐“已经加载的固定mode12模板”的精确单根编译代表，复用原 `createTreeWindGeometry`、原材质闭包及严格成功后证书，编译后释放私有容器，不扩大世界根半径/密度，不发布到场景或遮挡列表。针对23/23已通过；统一63浏览器结果尚待，不能以测试代替实际连续性。

`docs/previews/v2-route-craft-38/shadow62-single-wind-summary.json` 记录六个不同的自然RAF风时刻（221.3275、222.2603、226.8442、230.6862、235.1443、239.0693）。每次同步ON/native对照及完整源Oracle全部 **pixels=0、max=0、sum=0**，realWindChanged与visibleEffect均为true，完整遮挡量随风变化，非空/非静止占位图。每次完整254draw/10,735,259tri、选择170draw/1,308,445tri；这些是实际覆盖与提交数量，不是FPS证明。主线已查看首组ON/native图。每对同风同步采集，保存前恢复正常RAF；这是六时刻图像证据，不冒充连续录像或1000帧全程通过。

当前结论：贴地绘制顺序修复后完整遮挡在六时刻保持零差异，来源退休异常本轮未再发生；尚有真实变体等待，候选继续OFF。下一步以统一63单页同路线核验固定模板预热后的ready/pending、真实源遮挡与自然风形态，不重复62旧测试，也不据历史多窗口样本认定帧率变化。

## 63 实测与 64 差量补齐（待浏览器验收）

`shadow63-single-continuous-42m.json`：41.0220m，1000 帧 961 ready / 39 pending / 0 hidden、0 failures。39 无效帧集中于 row71–109（203631.8–207668ms）：38 次 native-source-revision-changed，末次 prepared-awaiting-native-pass。后台 prepare94 总4527.3ms，其中85.8ms工作、4401.2ms等待、38yield；最后 bounded work含22个spruce根更新、4个匿名植被根更新、7个地形初建、22个GPU枝针来源，不能将全部归因于新树编译。预取模板证书生效，末尾同步history不再记录program miss。此数据输入发生armed后175秒，不是首次可交互立即移动。

64 修复仍仅 localShadowWindow42 OFF 候选内部：原 pending 会阻止一切 warm 快路，临时完整源开始精选后，新revision就只能等待整轮完成。新增 `deltaWindowBudget64` 在原选区/太阳不变的条件下按完整原生来源版本复用未变行，移除退休源，对新增/变更源保完整当前根、drawRange、brush run和原属性；不根据未知包络拒绝来源。已证实不在旧选区的未变来源仍保持原排除结果。未支持类型明确返回安全路径。新stage必须逐项通过准确program证书才可提交；原32ms检查不增加。已过期mask不视作有效。

异步view stage以owner commitGeneration检测前台提交；其持有view加pin直到阶段退出，退役延后，旧stage不能覆盖新提交或释放仍在使用的view。后台精选仍继续，跨代际走既有重选。源变更/未捕获实际count或矩阵变化仍由原完整snapshot检查拒绝。

统计新增 `owner.stats.delta64`：完整临时来源列表（id/name/triangles）、extraTrianglesUpperBound、durationMs、frames。upperBound是这些完整来源的全部提交三角上界，并非精确净增；重复差量会保留仍完整的来源统计。正常精选提交后budget不再含delta64，历史stats仍供审查，判断当前状态应同时看owner.budget.delta64。

针对 controller42/coverage42/budget42/delta64/provisional57/retirement42/depth-order58/template63：37/37通过，0跳过。新增5项覆盖实际owner复用/退休、真实未预热证书拒绝、同步deadline、await期间重入/旧stagepin、提交前源变化及dispose取消。未构建、未GPU；仍须同路线当前完整source oracle、自然风图审及新增完整几何的实际瞬时GPU/长帧验收，不能据Node通过称连续性已修复。

## 65 实际失败与完整brush地址修复

`shadow65-single-continuous-42m.json`：39.336m，972/1000 ready、38 pending；24次 Brush slice outside original live run。根因在delta完整brush路径将共享station流的绝对b.start当作当前原生run的相对切片起点；原selectedBrushRuns42输出相对起点，sliceBrushSource42的完整当前run应是start=0,count=b.count。已仅修该起点，不削弱边界断言，不减少任何实例。

新增实际InstancedInterleavedBuffer测试：共享流绝对起点3、当前2个brush（576针叶实例、2枝实例），delta切片为0/2，保原aNeedleFrame0属性对象及已偏移地址、零附加instance offset、全部3192三角；随后真实来源缩为1个brush再次完整提交。delta/budget/geometry共17/17针对通过，未构建。

25个下视线中心窗外帧不是全都fallback：20帧段中1帧ready，5帧段中4帧ready。第一段从181902.3到下一次窗内184451.1，观测中断2548.8ms；第二段185836.3到186604.5，为768.2ms。这表示脚下局部覆盖缺席，原PCF仍保留，不能称全世界阴影缺失。ready=false四段为13/13/1/1帧，到下一次ready观测分别1558.2/1673.9/53.0/336.2ms，最长1673.9ms。异常对应前两段26帧，后两帧不能归同一异常。修正后仍需真实路线确认锚点追随与遮挡完整，不能以17测试通过代替浏览器连续性。

## 66 早期移动与 67 当前目标校验

shadow66-single-continuous-42m：主线记录首可操作后101ms输入，约41.865m/1000帧988ready、29pending、0failure；23帧下视线中心窗外。唯一后台prepare90耗3256.9ms，实际工作56.4ms、yieldWait3183ms、26yield。当前scheduler使用MessageChannel及16ms窗口/4ms累计CPU限制，不存在每次显式等待RAF；26次平均约122ms的实际等待不能归为人为固定睡眠，也不能无界取消yield来称优化。

已确认逻辑缺口：prepare(anchor)捕获开始时目标，index/selection/view多轮重选仍沿用旧值。最后一轮index/selection/views仅约.2/.8/1.1ms却仍发布旧目标。67每次真实afterShadow记录当前下视线锚点；每轮index完成后改用最新锚点，最终view commit前严格验证当前目标仍在该选区安全halo内，出界沿既有重选路径保留有效准备；compile完成后再检查一次。未改2ms准备预算、32mswarm预算、4m窗口或4.5m选区，未放宽valid。锚点不是将新位置直接套进旧剔除结果。

新增确定性异步回归覆盖：index yield期间目标0→2、view提交前2→4拒绝、compile期间4→6后重新选择，最终仅当前6的选区完成；真实owner在提交校验拒绝时保留旧有效mask/视图，无提前发布。controller/delta/coverage共27/27通过；source冻结，未构建/浏览器。统计anchorRetargets67记录更换目标次数。该修复消除“已准备完成还发布过期位置”，不代表3秒后台等待或所有窗口跟随问题已经实景解决。

## 68 当前目标同步完整选择（待实景）

67实际1000帧虽997ready，但42帧下视线中心在窗外，不能算跟随通过。其异步长轮5739.2ms/48yield，104.1ms工作、5584.2ms等待，15次目标重选；仅不断检查移动目标会在窄halo与慢帧之间追逐，继续增加ready没有解决空间覆盖。

68在pending期间来源失效或当前目标超出旧安全halo时，同32ms快路优先调用 `currentWindowBudget68`。读取当前完整原生提交表；对basis一致、逐源version一致、非provisional、长度/有限性/区间顺序完整的已发布sourceBoxes，直接按当前目标筛选全部root或整个静态源。其他来源保全部当前几何；缺失/半完成包络不能剔除。GPU brush沿现实际完整风包络及本源相对run计算。该路径不调用syncCached、不修改cells/memberships/versions/boundsCache，避免与async writer交叉修改；全源snapshot/version在结束前再次校验。原程序证书/32ms/4m/4.5m、stage代际与pin不变；不能证明支持的来源返回原安全路径。

budget.current68记录publishedSources/completeSources；完整临时源仍记delta64列表及三角上界。这次选择anchor是当前目标，不能套用旧选区的已排除来源或旧rows。优先路径不接受旧sourceIndex证书，而是当前完整sourceRevision；后续源改变依然失效。

新增回归包括移至原域外900m、已准备root重新选择、新增及变化源全量；实际高分段Box的异步index中途checkpoint读取并证明半完成源不漏；错误basis/不齐或NaN或反向bounds/version未发布/provisional均全源；未捕获count变化拒绝；deadline不扩；非零共享brush起点保持当前有效全部实例。controller/coverage/delta/budget/geometry共41/41通过。未全量/构建/GPU，尚需1000帧下视线覆盖、全源oracle和瞬时提交成本；不宣称GPU性能改善。

## 70 分开实际绘制状态与异步观察，减少视图重复匹配

68剩余两次native-source失效为预算：selection17.7ms+views17.1ms=34.8ms，以及selection33ms（尚未进入views）。另两行prepared-awaiting-native-pass距离异步结束仅0.5/3ms，不能仅凭RAF读到ready=false就认定颜色绘制时回退。

70 owner在每个stage按source→tag建立一次候选桶，桶内仍逐项严格比较shape/contract及used；保留retry来源与pin/代际。不改变选择几何或预热证书。此为可验证的重复JS查找消除，尚无GPU/帧时收益结论。

controller.afterShadow在finally记录不可变stats.beforeColor70，处于原shadow回调结束、Three继续同步主颜色提交前：真实uniform x及全部参数、ready/valid、anchor、frame/pass、cameraId、native/owner revision、calls/triangles、最后maskAtMs和原因。后续异步commit不会改写旧快照。observer保留全部原RAF记录，额外关联beforeColor70，不调整成功判据；cameraId/maskAtMs供区分其他渲染与沿用计数。新检查位置是测量澄清，不是渲染修复。

current68新增轻量sourceCount/publishedSources/completeSources/rootBoxChecks/rootSelections/totalMs；仅累计整数和整体计时，无逐顶点performance.now。预算中止也在sync trace保留累计诊断。

controller/coverage/delta/submissions/depth-order共42/42通过。新增实际快照后修改owner证明不可变、原source/tag匹配仍拒绝错误shape/contract且used不重复/retry可复用。未全量、未构建、未浏览器；等统一70实际检验。

## 71 仅消除选择/验证临时分配（待实景）

70的三个主颜色前uniform0与同步预算miss一致：rev1262为21ms selection+14.4ms views，rev1309为25.1+7.1ms，rev1379为32.9ms selection。每次约7600–8000根选择，完整未知来源仅3–7个。不能将程序证书或observer假阴性归到这三个真实fallback。

71保留逐root同样的size/halo算术与检查，只把每根sizes.map/forEach/some改为标量循环；只有确实保留的实例根才分配原counts记录。窗外根不创建立即丢弃的数组/闭包。版本快照仍读取原完整字段且检查次数不减，current选择使用调用内scratch，plan检查使用stage私有scratch，commit使用本次commit私有scratch；没有全局共享scratch，没有保存为原生证书。

原完整map/forEach算法与新实际入口逐records/submitted对照：多size[4.5,9,2]、真实完整风包络、边界±1e-7、远处根、版本改变后完整源；原snapshot与boxes不改，source引用相同。嵌套选择及两个独立view阶段证明scratch隔离。delta/controller/coverage/budget/geometry/depth-order共47/47通过，0跳过；未全量/构建/GPU，不宣称三次fallback已消除或已获得帧率提升。


## 71 实景复读：连续性通过，非整体帧率优化

证据目录 docs/previews/v2-route-craft-38/。shadow71-single-continuous-42m：首次可操作后94.2ms输入、移动42.286321m；1000帧beforeColor70.uniform全1，眼前地面超窗0、failures0。RAF ready998的两处是异步提交后观察时序，实际主颜色仍有效；临时完整提交14帧/max1,090,238tri，pending16不等于画面回退。

shadow71-single-wind-summary：六自然风时刻528.1149–541.6317，完整遮挡pixels/max/sum全部0。完整238draw/10,268,299tri，选择107draw/634,091tri。ON/native均1,024,000非空像素，两者画面差异41,441–42,174像素；非空且有实际效果，仍须主线美术图审。

shadow71-abba：唯一可见3D页，同机位自然风，预热120帧/各360帧。A1/B1/B2/A2整帧73.636/73.381/73.173/74.376ms；GPU32.429/32.399/33.501/32.131ms。GPU均值32.280→32.950，约+0.670ms；整帧74.006→73.277的小变化不证明稳定整体帧率收益。局部阴影是质量修复，不能称FPS优化。

gl-query71-diagnostic：120RAF中getParameter359次共2.2ms/max.7，getQueryParameter345次共3.6ms/max.5，isEnabled120次记录0，blitFramebuffer360次共.8ms。前三项查询约.048ms/帧，含包装及计时精度；没有证据把整帧瓶颈归因同步查询stall。CPU调用短不等于blit没有GPU成本。

源码冻结、候选仍OFF；本段连续性和完整遮挡通过，跨区/最终美术/采用仍由主线验收，不称第三阶段完成。

### 唯一后续只读CPU定位：同轮共享纹理签名重复读取

sun-shadow-casters.js:55–65的texture()重复捕获完整Texture状态；:195–197每个alpha/位移材质调用，:219为morphTexture。_attribute已有同update复用，texture没有。ecology.js:571/580/585真实材质clone共享Texture引用，构成不同材质重复状态读取的源码证据；已有同材质revision缓存，不重复计跨级联收益。

最小方案可沿现revision机制仅在同caster update内复用同Texture完整状态，下轮重新读取所有原字段；身份/version/channel/wrap/offset/repeat/rotation/manual matrix检查不能少，重入/自定义getter不适用则走原路。不动投影者、更新频率或密度。尚未实现。

收益仅限重复标量读/签名写，没有GPU减少证据。71末snapshot恰好所有级联跳过、materialScans0，历史mean含加载，不能据此估算毫秒。若继续，先用现短诊断计真实扫描段texture访问数与唯一身份，重复少就结束，不新造框架。这是一项有重复工作源码证据但未有独立耗时证据的微优化，不承诺解决整帧瓶颈。
