# 公共楼外壳／室内精确分包 v38

已由主任务完成实际浏览器验收并默认采用，仅用于当前 chairs 公共楼来源。浏览器省略参数即按需加载；lodgeInteriorStream38=0 保留完整加载，旧来源自动使用完整路径，显式 =1 与旧来源冲突时拒绝。WorldStructures 普通构造仍默认完整加载，由 main 显式选择浏览器默认行为，离线生成与完整源对照不会误产外壳。全部几何、材质、密度、碰撞和既有 GI 保留。

原完整 `gh_lanchuan_lodge_chairs38.glb`、可编辑Blend与三门态GI保持不变。完整源SHA为 `1025f39e99a19324945adfceb1f333514590c11761ea0205941e62635e8c6b3b`。

| 包 | 三角数 | GLB字节 | gzip字节 | GLB SHA256 |
|---|---:|---:|---:|---|
| shell | 38,012 | 4,272,684 | 1,607,181 | 8d7e4d7cd9231053bbe575d5eb486e1c60192142b010c7069a20c774b0e4bcc0 |
| interior | 76,076 | 8,826,112 | 6,872,759 | 8f23ab9495af70d0ebe3878d74086a431f8840ded167ea39d7fe9ce205a6ad15 |

路径为 `web/public/assets/v2/lodge-interior-stream38/{shell,interior}.glb`，对应 `.glb.gz`。合计114,088三角，与完整源相同。分包gzip总计8,479,940字节，比原完整源8,186,467字节增加293,473字节，因此不能称总传输压缩优化；其价值须以真实首场景关键链与目的地切换耗时衡量。

## 精确来源与覆盖

`tools/build-lodge-interior-stream-v38.mjs`只遍历原active scene。原文件mesh数组包含未实例化历史对象，不能将它们误当现有世界重复导出。每个原实例primitive三角恰好进入一个包，顺序及原顶点索引保持。原完整顶点属性不compact、不量化，POSITION/NORMAL/UV/AO逐字节相同；仅复制选中三角的index，节点祖先与全部transform保持。

门、窗玻璃、圆木墙、屋顶、屋顶种植与屋外构件留shell。24椅、原沙发与洗烘设备、室内地毯灯具以及668个已标定木作三角进入interior。plank/pine按既有字段逐三角拆分，不以整个共享材质名删除外部木作。shell不引用精细oak颜色、法线、roughness图；原圆木本来使用的约30KB端纹仍保留，这是外壳真实依赖，不能为减体积删去。

运行manifest `web/src/v2/generated/lodge-interior-stream-38.json`提供各包SHA/字节/gzip校验、完整源fullBounds及派生interiorWoodLayout。木作布局保持原完整顶点field和属性binding，仅index绑定更新为派生包；无需伪造完整源SHA。大型逐三角来源映射保存在离线报告 `tools/reports/lodge-interior-stream-triangle-map-v38.json`，不进入运行manifest。

## GI、碰撞与就绪闸

两个包合并逐属性等于原完整源，所以GI仍绑定 `gh_lanchuan_lodge-chairs-whole`及原完整SHA，并明确记录精确派生关系；不得将包SHA冒充重烘GI来源。既有材质均值与木作物理坐标契约不变。shell剩余plank对应原木纹shader的legacy分支，须保留Physical、clearcoat0、原map与roughness，而非漏装精细片后宣称完整。

碰撞不能由未完整shell冒充完整楼体。运行闸必须在进入、近处碰撞启用、主相机可见或阴影／反射需要该楼室内时等待interior安装与准备。仍使用原旧椅碰撞替代数据，完整有效碰撞63,592三角合同保持。无需另产低精度碰撞包。

## 当前验证与未完成

离线逐三角归属、原属性字节、层级变换、gzip回解及实际 GLTFLoader 验证通过；完整源与分包角色三角一致，静态113,992三角＋门96三角，原有效碰撞63,592三角保持。

主任务实际浏览器验收（本页整理其证据，不表示文档作者另跑浏览器）：

- 四室（餐厅、接待、休息、服务）及屋外开门视点，均在同一页面冻结时间、相机与风，完整源→分包→完整源逐像素差全部为0；证据位于 docs/previews/v2-route-craft-38/lodge-stream-{dining,reception,lounge,service}-*.json/png 及同目录屋外对照。
- 真实 HTTP503 注入后阻挡与重试按钮出现；恢复 fetch 并点击后达到 ready。重试立即显示正在准备，具体技术错误留在统计/控制台，不出现在产品提示。
- 距完整包围盒436m、背向建筑连续飞行，至397m触发加载，等待前后位置完全冻结。准备范围覆盖既有350m阴影范围，以及反射220m场景半径＋58m选点范围＋8m中心复用余量；完整楼包围盒进入主视锥时不受距离上限豁免。
- 实际关门接近、按钮开门、步行入屋和返回通过。完整内装、GI及全部内装材质编译后才放行；失败可重试，未就绪不创建缺失碰撞。

禁用浏览器缓存的同条件 ABAB（本机操作系统缓存未清空）：

| 轮次 | 完整 off1 | 按需 on1 | 完整 off2 | 按需 on2 |
|---|---:|---:|---:|---:|
| 首帧秒 | 12.577 | 11.940 | 12.128 | 11.571 |
| structures 秒 | 5.026 | 4.199 | 4.569 | 4.268 |

证据 docs/previews/v2-route-craft-38/stream-cold-{off1,on1,off2,on2}.json；精确首帧差由主任务报告为0.636/0.557秒。首次网络总实传减少10,545,680 B：公共楼GLB少6,579,286 B；roughness原路径实际重复两次7,937,472 B，按需路径仍请求一次3,968,736 B（木屋共用），另有manifest/木作模块差2,342 B。不能表述为roughness完全免载，也不能将所有后续内装传输忽略。整体加载长尾与林溪GPU瓶颈仍未解决。

默认采用定向验证见 tools/reports/lodge-stream-default-tests-v38.log；来源变更后的结构prepared是真实重新生成，见 lodge-stream-default-prepared-v38.log。当前默认URL的后续统一构建验收由主任务继续完成。
