# 36m溪岸矿物资格候选44（默认接入已冻结，待统一构建端点复验）

有效图审输入为shadow45-early-native-movement.png和shore43-default-near.png；shadow45-early-movement-oracle.png纯黑，不作材料视觉证据，相关数值诊断另行判断。

实测2272断面点（71沿程站×两岸×16横断位置）：957点在真实水域外且原v5河床权重>0.2、organic<0.2，最大外伸0.5m、权重可达1。数据reach-facies44-sections.json。原因是后置v5 reachDomain/Bed只按湿度/高度，不按实际shoreDistance，重新盖掉前层已恢复的根毡。

候选web/src/v2/reach-facies44.js仅此36m，以同一recovery统一抑制上游terrainPhysicalBed与后置reachBed，普通外岸恢复同源forestColor/normal/roughness，原root/humus组保持自身响应；保深流槽与原sand/gravel核心。不加sampler，不改几何、521根、原草石水、曝光或GI。横向0.5–0.8m渐退，仅原湿岸和近水高度有效，不向无关低地扩展。不是扩大原composition42五个椭圆。

2/2针对测试通过（实际断面分类和真实完整材质链/顶点及采样器不变、OFF及dispose），独立构建成功。入口/dist-v2/reach-facies44/facies44.js；installReachFacies44(debug.terrain.material)，setEnabled、setDiagnostic、dispose。已完成后述浏览器编译与画面对照，不能报完整质感完成或性能提升。

三个建议观察机位（x,y,z / yaw,pitch）：上游[-3620.948149,2329.219072,4816.685928]/20.680428,-29.719115；中游[-3615.300903,2329.018804,4805.695148]/339.856991,-27.602893；下游[-3618.814812,2328.947446,4793.742568]/292.828820,-28.917311。均原地表+1.7、朝下游3m水中线，不称碰撞步行起点。后续需整段原机位+三断面，OFF/ON/还原、水开关、诊断mask真实图审。


## 2026-10-28 实际整段图审

独立真实世界入口完成原 forest 总览及沿程 -12/0/+12m 两岸共 7 个机位的原版/候选/还原，编译后同步 renderFrozenWorld 与 toDataURL 保存，全部图有画面。reach-facies44-summary.json 的 errors=[]；7 组 restored RGBA 分量差均为 0。图片在 docs/previews/v2-route-craft-38/reach-facies44-*.png。诊断页 1839973783 已关闭，GPU 已交回性能验收，不留暂停页。此轮全量测试曾并行，因此不报告帧率或 GPU 收益。

已亲自查看 7 个候选视点，并对照总览与中游原图：外岸连续宽灰矿物带明显减少，同源森林土与根毡接到水缘；流槽灰色露床和原浅滩仍保留。观察图中没有新增环形或平行颜色接缝。但上游局部平滑棕色湿唇、中游整齐岸边和下游原有折线水形依然存在，不能称完整溪岸美术完成。-12/+12m 为近摄断面，±18m 过渡端只在总览范围中，尚未单独两端近摄，不冒称专项端点验收。

建议有限默认采用材料分类修复，仍由主协调统一决定和接入。当前源码依然独立 OFF。生产接入点为 createTerrainMaterial 内 installReachSurface41 后，仅该 v5 材质启用时安装；显式 reachFacies44=0 不安装，保完整原路。需 worker 安全参数与原来源绑定回归；不扩大到全局改色。

几何/水域保持证据：候选只包裹原 terrain material 的片元钩子，不访问或改写任何 roots/position/index/水网；测试实际完整 vertexShader 与原链完全相等、采样器数量不变，深水 shore=-0.2 或 clearance=-0.2 recovery=0，原 sand/gravel 核心 recovery=0，7 机位还原零差。既有 521 根和所有草/石/水结构未改；未另跑浏览器全几何逐字节 hash，因此不将上述源码及顶点链证据冒称全资产字节审计。浅水最边缘 -0.04～+0.015m 的原连续过渡有意参与，不能称全部水下像素恒定。


主协调随后批准有限默认采用。terrain-material.js 已在 v5 revision 匹配后默认安装，reachFacies44=0 完全保留旧链；独立 install API 仍默认 OFF。Worker 严格仅接受该参数全部值为 0/1。相关 28/28 测试通过（0.59s），包含原 shader 完整恢复、默认开启、旧版 surface/form/reach 关闭及非法 Worker 值拒绝。未做主构建或无依据重烘 GI；统一构建后补两端近摄。上述先前独立 OFF 状态为采用前历史，不代表当前源码默认。


## integrated47 默认入口复验

真实 /dist-v2/integrated47/v2.html?view=river-forest&time=870&debug=1，无候选参数。默认材质 cache key 确认 reach-facies44；总览及±18m两端均521根、prepared42 ready/reason null、preparedHits521、pending0、Worker ready/error null、terrain q0、errors[]。默认 lazy 的 envelopeLazy46 实际有 make/clone 记录。未掉 prepared fallback。数据 reach-facies47-default-summary.json。

最初 end-18 近枝遮挡过半，不足以验端部；对岸图仍有遮挡，最终补水槽上方2.5m俯65°的 reach-facies47-default-end-18-channel.png，并实际查看该图和 end18.png，端部两岸地表可见，无新增横切/环形颜色接缝。未删除树枝或其他几何。既有平滑岸唇和局部窄湿带仍为中间态。

回正常高度后用原生鼠标拖动，yaw210→226、pitch-14→-15.6，ready=true/errors=[]、holdWas=false，证据 reach-facies47-native-turn.json。诊断页1839973791已关闭。全量Node与此次图审并行，所有时间仅诊断不作性能结论。建议主协调正式构建替换主dist，保留0回退；此次未实际另加载0入口，原版回退已有针对测试及上一7机位独立原/新/恢复证据。没有宣称全资产hash。

## 47正式默认入口采用

2026-10-28：统一源码1812/1812通过，独立47及正式主dist均构建成功。主dist使用emptyOutDir=false保留已有候选/旧资源；实际默认入口无候选开关，源缓存ready、Worker ready、岸草521根及接触命中521、q0、errors空。facies材质key和惰性恢复字段实际存在。正常鼠标拖动yaw -29.88794→-20.28794，holdWas=false，未冻结交互。证据stage3-default47-live.json/png。完整性能与加载长尾仍开放；前文默认OFF指采用前测试时点。
