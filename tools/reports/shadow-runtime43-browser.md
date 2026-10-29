# 局部草影真实运行复验（2026-10-28）

当前默认仍关闭，第三阶段未完成。使用当前主静态构建 `/dist-v2/v2.html?view=river-forest&time=870&profile=1&localShadowWindow42=1`，1280×800 / DPR1 / time870。未改原4096阴影图、植物数量或叶片。

## 已通过：多材质分组导致跨区失败的修复

首次林溪加载局部准备2055.3ms；通过原生地点按钮切到岚川草坡，局部准备1712.1ms，submissions failures0、owner ready且valid=null、errors空。原`boardwalk-timber-post`深度分组失败没有复现。再通过原生按钮返回林溪，局部准备1393ms、ready、errors空。这里记录的是局部准备时间，不是整次地点切换耗时。

证据：`shadow43-initial-runtime.json`、`shadow43-crosszone-meadow.json`、`shadow43-crosszone-return.json`。

## 已通过：返回后的热状态移动与完整遮挡

返回后地形q0/m0并稳定30RAF，原生W按下2.4秒，实际平面位移约6.37m；180帧全部ready/valid。采样期间新增26次同步准备全部命中。终点完整原生207draw/9168609tri与选择16draw/352818tri的遮挡mask逐像素0差。这是有跨区缓存的结果，不证明首次移动或整体帧率已解决。

证据：`shadow43-native-movement.json`、`shadow43-movement-oracle.json/png`。

## 未通过：完整重载后的短移仍有失效和长帧

全页reload清除页面内缓存后，等地形q0/m0及30RAF；原生W请求虽为2.4秒，但该次180帧记录实际位移仅约0.187m，不能标成与热状态相同的6.37m路线。记录173/180帧有效，7帧退回原阴影。保留原始输入与轨迹，不将请求时长冒充有效路程。

实际长准备来源：匿名非实例Mesh，父级`reach39-rooted-bank-community`，121344顶点/637056索引，包含aPlantWind和aBrookSeat等岸草属性，单位世界矩阵。该源投影准备active48.2ms、wall2571.8ms（其中wait2523.6ms）；同步selection另记录437.8ms，尚不能把这437.8ms全部归因同一个函数。源类型已排除地形。初步源码定位为岸草接地aBrookSeat更新使整个逐顶点风包络失效，正在用完整源的严格保守包络缓存修复；未扩预算或删几何。

短移终点完整原生287draw/10859971tri与选择70draw/429604tri遮挡0差，说明静止后的覆盖正确；仍不等于时域连续或性能通过。

证据：`shadow43-fresh-native-movement.json`、`shadow43-fresh-movement-oracle.json/png`。未重置HTTP/GPU驱动缓存，本次仅为新页面首次探索，不称完整冷机测试。


## 修后独立构建：首次页面实际6.37m移动通过，整帧成本仍待判定

独立`/dist-v2/shadow43/v2.html`，同1280×800/DPR1/time870及原机位，无跨区预热。等q0/m0/30RAF后，以真实KeyW keydown事件开始180帧采样，keyup确实到达（间隔2529.8ms）。实际位置从[-3611.851169,2329.157271,4805.483400]到[-3615.024678,2329.098721,4799.961811]，平面约6.37m，180/180有效；新增22次同步准备全部hit，最大22.2ms、没有新增异步准备。不能把该移动平均102.05ms的帧时称流畅。

浏览器实际121344顶点岸草一次接地更新bankBaseBuilds=0 / bankSeatScans=1 / vertexBuilds=0，active/wall约0.6ms；确认新路径在真实岸草上运行。初次加载仍有一次来源准备失败后恢复及长尾，须单独解释，不以移动通过覆盖加载问题。

终点mask完整207draw/9168609tri与局部16draw/352818tri逐像素0差。原/细影画面对照必须强制真实原生阴影提交；最先保存的`shadow43-bank-native-original/refined`由于没有重新触发shadow pass而两图相同，只作无效开关记录。有效图为`shadow43-bank-force-original/refined`，owner enabled/ready且valid=null，变化位于近地接收区域，细叶投影可见。静态图不代替完整时域和性能验收，默认仍OFF。

证据`shadow43-bank-native-movement.json`、`shadow43-bank-movement-oracle.json/png`及上述force图片。完整重载未清HTTP/驱动缓存，不称冷机。


### 后续加载缺口定位（未改变上述有效6.37m结论）

初始入口的局部准备2.44s已ready；但新岸草约53.8s进入原生caster列表，后台准备#34用6.56s（active73.9ms、wait6467.4ms/33yield、index6117.3ms）。两池第一次静态base为17.6/45.4ms；准备期间seat源版本变化，views阶段正确拒绝，native596/index595/owner561。不能把等q0后的移动通过扩称用户首帧可操作后的所有流入均连续。

该准备未到preparePrograms；下一次暖快路直接render两份新材料1321/1322，program105→106、mask17.1ms。之后program不再增加，unpreparedMaterials持续标记不是反复编译，但证明新增variant首次绘制未显式预热。正修复views失效后的重新选取及新variant预热衔接；不清标记冒充已预热，不忽略真实版本。

## 45同速复验与对照边界（2026-10-28）

新页speed2.8，实际6.8369m、480/480 ready/valid；终点完整208draw/9177939tri与局部16draw/352698tri逐像素0差。两组实际cache均producer=true/builds=0/seatScans=1，证明生成阶段box已被真实影窗采用。证据shadow45-early-native-movement、shadow45-early-movement-oracle、shadow45-producer-cache-actual。

随后同条件shadow44对照实际6.6964m也480/480有效；44/45首帧14.4875/13.8804秒，两者首帧前岸草均已built，buildWork283.3/287.3ms。此轮没有重现早期source流入回退，不能将历史44的23.2秒首帧或3.33秒回退与当前45相减宣称修复全部长尾。交互后同步峰值44为77.5ms、45为95.4ms，仍不流畅；正确性通过不代表采用性能通过。

第一次45未恢复speed2.8，按默认14产生33.72m探索，已单独保留shadow45-early-flight34m，不冒充同路线：454/480有效，81.6/158ms主要在实际mask绘制，program不增长。详情见shadow-whole-source-feasibility42。默认仍OFF。

45截图补查：`shadow45-early-native-movement.png`有有效世界画面；`shadow45-early-movement-oracle.png`全黑，不作为图审证据。oracle JSON的完整/局部遮挡数值对照有效；数值结论与无效截图分开保留。
