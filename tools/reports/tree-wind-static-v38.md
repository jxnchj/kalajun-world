# 树冠风系数静态编译候选（第38轮）

状态：默认关闭，针对检查通过，真实浏览器像素/运动和 GPU A/B 待验。不是性能问题已解决。

入口 `treeWindCoefficientsStatic=1`。默认及 `=0` 保持原路径；原 `treeWindCoefficients=1` 运行时实验完整保留。两者同时提供时静态编译优先，运行时旧 uniform 不控制静态程序，CPU 时间相位仍正常推进。

本项只处理 mode 1/5 十份照片冠材质及对应深度材质。原曲面/索引/三角形/全部枝片、LOD、风根和材质保持。沿用既有五 float 系数与角加公式，编译时删除原 `aPlantWind` 引用及 runtime fallback。原属性仍保留在不可变源几何/缓存中，以保持资源所有权及完整回退。每顶点 active 风输入从旧双路径候选的 12+20=32 字节降到 20 字节；相比无系数原基线仍增加 8 字节。静态系数分配仍约 4.28 MB，不宣称减少下载或内存。

原 `sin(time*.85 + phase)` 的代数展开有 Float32 差异，不是逐像素数学恒等。专项 16 项通过；真实高/中 GLB 共30部件（包含树干/内核用于完整数学检查）、247829引用顶点、599742角点逐引用行验证；600.3秒最大世界误差 5.31124e-7 m。另99648组合检查中，前10分钟最大4.67830e-7m、6小时1.37900e-5m、24小时5.71688e-5m，最大树缩放1.48。实际驱动 sin 精度和像素变化仍要浏览器检查。这些是位置误差，不等于所有法线/阴影像素零差。

记录：`tools/reports/tree-wind-static-v38-tests.log`。`build_spruce_canopy_cache.mjs --check-inputs` 返回 current（inputKey 9083dae0…），无资产重建。forest 来源绑定不含 ecology，无影响。meadow 实验绑定含 ecology 整文件，本次 URL 接线会令旧 manifest 安全失效；默认关闭，不绕过校验、不伪改来源 hash。如需继续实验使用，应在计时结束后严格生成。

历史拒绝证据：`docs/previews/v2-forest-cold/wind-cascade-ab.json` 原动态系数 wind0/1 在同cascade0条件 GPU39.085/39.078ms、整帧49.833/49.834ms，未证明收益。本项只验证删除多余 active 输入与分支是否改变权衡，不能把减少 sin 直接称为提速。

浏览器验收：相同构建、分辨率、机位、完整树根、时间，默认与 `treeWindCoefficientsStatic=1` 交替；先冻结强风/近看照片冠验证影色完整，然后各组非计时 warm-up 后整帧与GPU分别采样。检查所有 mode1/5 颜色/深度程序 ACTIVE_ATTRIBUTES 无 aPlantWind、有 aTreeWindCoefficients/aTreeWindEddy；GL errors 为空。脚本旧 uniform 切换不适用于该编译型候选，需要不同URL实例或显式重编译后再测。

附只读排除：照片冠曲面已加载时构建；ECO_ROOT_WIND 已共享根风，无每顶点风场纹理。完全零LOD根已有CPU和顶点前置return。相位逐顶点来自高度和方位，不能改成同枝一个相位。v22已有meshoptimizer重排反证，LRU16/32均每unique仅一次，当前15部件计数一致；未再次运行GPU重排或覆盖资产。


## 主线程实际浏览器验证

真实Chrome同页恢复原ecoBend和静态系数交替：原/候选/原/候选GPU全样本均值30.05/30.50/31.02/29.77ms，整帧58.78/63.93/65.71/60.65ms；方向不一致，期间有短时独立CPU检查，不能声明净提速，默认继续关闭。冻结同一世界102.4万像素9个变化，其中3个通道差超过2级，最大21级，集中边缘，非位级等价。详细样本保留在docs/previews/v2-route-craft-38/tree-wind-static-summary.json。
