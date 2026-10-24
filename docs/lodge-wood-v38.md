# 公共楼室内木材精修（默认关闭，待实景）

入口参数 `lodgeWood=1`；不带参数或 `lodgeWood=0` 保持原材质。仅派生 `gh_lanchuan_lodge` 的原 `plank` / `pine` 两个节点，运行前验证原manifest SHA及节点position、normal、UV、AO、index全字段。不改变原GLB、原Blend、家具位置、几何、碰撞或顶点遮蔽。新增材质坐标 `aLodgeWood`，原UV也完整保留。

原512² `wood_plank.png` 使用四块板和每板九条正弦纹，按0.5 UV/m在原建筑铺设，导致约50cm板宽、5.6cm纹间距，桌面、地板和墙面同图同尺度。此次选用[Poly Haven Oak Veneer 01](https://polyhaven.com/a/oak_veneer_01)，作者Jenelle van Heerden，官方标注clean及家具/室内用途，实际覆盖1.83000004m，依据[CC0许可](https://polyhaven.com/license)下载2K Diffuse、OpenGL Normal、Roughness，保存官方元数据与MD5核验。它是本项目的材质设计参考，不声称现实民宿使用同一树种或饰面。原始资产位于`assets/src/polyhaven/oak_veneer_01/`。

制作范围：四张1.9×0.9m原桌面、十六条原桌腿、两块原地板及pine内衬/原木柜层板；每个原连通组件具有稳定取样偏移。桌面沿长轴、桌腿沿竖向纤维，小端面使用本项目原可编辑端纹并降低不自然的大明暗差。内衬约14cm板宽，地板约18cm板宽、1.35m错缝；接缝仅改变浅法线/粗糙度，不画黑色AO线。桌面有适度清漆层，墙和地板分别保持较粗糙表面。未选中的门廊、外楼梯等原plank仍走原图和原粗糙度，原log外墙不改。

现有GI负责人直接确认公共楼正在采用的pine/plank反照率均为线性 `[0.23682348430156708, 0.11614272743463516, 0.05534806847572327]`，来自`tools/reports/lodge-dining-gi-v38.json.materialReflectance`，不含顶点AO。新扫描纹理按实际sRGB解码后的RGB均值校准材质因子，端面也保同一均值，未增加全局亮度。现有GI使用材质低频均值模型，因此可保其输入；它不会精确反映新细木纹造成的空间反弹差异，不能称完整纹理级动态GI。

脚本：`tools/build-lodge-wood-v38.mjs`从原GLB提取独立坐标；`tools/prepare-lodge-wood-v38.py`保存来源、图像校验与线性均值；`tools/blender/v2_lodge_wood.py`制作另存的可编辑材质Blend。运行实现`web/src/v2/lodge-wood.js`，局部接入structures。housePrepared只处理house_a，不会替代公共楼；structures源改变后仍需真实再生成其严格来源绑定，不能仅改hash。

中间态边界：保留原方盒家具硬边，没有借材质精修宣称新家具造型；材质尚待餐厅原机位、桌角近看、沿墙与地板走动、前后公共楼路线复验。全局光照/色彩仍阶段5。未使用Aholo。

验证补充：针对回归 4/4 通过；可编辑派生 `assets/src/v2/settlements/lanchuan-lodge-wood-v38.blend` 已实际制作并在独立 Blender 进程重新打开（12,373,468 字节）。重开核对全部 23 个原网格，原几何、法线、AO 与原 UV 完整相同，两个目标节点分别 264/336 个面使用派生材质，四类材质纹理已打包。材质节点可编辑；微小板缝的法线/粗糙度处理仍由运行时 shader 执行，Blend 并非逐像素运行时复刻。制作时遇到浮点字典键精度差异，改为统一整数坐标键后通过，并未移动顶点。证据为 `tools/reports/lodge-wood-blend-v38.json` 与 `lodge-wood-reopen-v38.log`。

严格 housePrepared 已经由实际原 GLB 重新运行完整准备流程，回归 7/7 通过；其二进制有效载荷与备份完全一致，JSON 除来源签名外完全一致，见 `tools/reports/lodge-wood-prepared-equivalence-v38.json`。未运行全量测试、未构建，保持默认关闭供主任务同条件浏览器验收。

清漆间接反射修复：按本地 Three 的 `aomap_fragment` 与 `RE_IndirectSpecular_Physical`，清漆具有独立的 `clearcoatSpecularIndirect` 累加器，原 asset/room 遮蔽只覆盖基层，导致新 Physical 木材暴露天空 IBL 绕过遮蔽。现于原 AO 阶段补清漆天空项相同 asset AO/skyAccess 近似；无 asset 通道的房间采用 Three 原清漆 AO 方式乘接触遮蔽。直接太阳清漆不变，后加室内 GI 不受室外天空遮蔽再次相乘，保留清漆与原粗糙度。已添加实际 shader 钩子组合与数值顺序回归，等待主任务实景复验。
