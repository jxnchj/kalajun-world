# 三客房洗手台高位接触残差候选

状态：主线已完成三房实际WebGL与冻结机位验收，源码默认采用；`vanityUpperContact39=0` 显式关闭。最终默认构建由主线统一进行。没有更换最终卫浴GLB/Blend、没有修改原地面接触字段或八表GI来源，也没有调整曝光、太阳或灯具参数。

## 先确认真实残差

旧 `v2_room_contact.py` 仅采地面 y-.025…+.085 的接收面，heightRange[-.10,.25]；运行时高于该范围直接不修正。因此原0.94m台面只依赖资产顶点AO和低频间接光。不过该顶点AO已真实烘焙，不能再完整乘一次新AO。

先对最终可编辑源真实抽样：每房526点中16点的 dense/coarse<.95，最低约.538，说明局部龙头根部等确有顶点插值遗漏；多数区域不缺遮挡。然后按同一源真实完整生成：

| 房间 | 有效台面接收点 | 残差<.95点 | 最低比例 | 平均比例 |
|---|---:|---:|---:|---:|
| 1 | 5048 | 112 | .535878 | .995166 |
| 2 | 5048 | 112 | .535388 | .995121 |
| 3 | 5048 | 113 | .535660 | .995116 |

使用源资产相同的Random(38)、48方向、2m、距离衰减及AO下界公式。在每个台面内部命中点计算dense，与**实际源Color.r按该三角重心插值**的coarse相除，限定不增亮；不是拿两个无关AO叠乘。生成耗时1.43秒。报告 `tools/reports/vanity-upper-contact39-audit.json` 保存最强点坐标、两端AO与比值。

## 独立层与边界

脚本 `tools/blender/v2_vanity_upper_contact39.py --bake` 读取原最终源：Blend `0418790225b7113dec526e3ae176325dd589323a57f6e194789ae5a7ca794f2e`，GLB `201190ad2bd3886783c2dfc9b81099ba944740bccb7973bd95102981720b7f10`。新增 `generated/vanity-upper-contact39.json` 明确绑定两者，不改旧GI hash。

仅真实洗手台水平陶瓷面 local y=.94、法线向上>.999；盆内斜面、龙头本体、镜、墙、地面均不扩展。每房121×57 RG8，R残差、G接收高度，未命中区域R=1且G=0。自有范围与接收高度测试（1–4mm渐变）避免与楼板同XZ混层，不把原地面纹理高度范围拉宽。

`room-contact.js` 保持原floor数据和原变换，显式开启后才组合高位修正。现有room-lighting接合点仅作用间接漫反射/间接镜面与房内GI，原太阳/真实灯具直射路径不改。默认关闭时仍原1个sampler和原floor shader；候选开启增加1个sampler、仅目标高度/法线/范围内4次取样，无新pass。JSON 56,038字节目前作为静态导入；GPU每房13,794字节，三房全访问41,382字节，房间离开不活跃、缓存保留至dispose。不是宣称零成本。

## 验证与实景待办

18/18定向通过：原room-contact 9项、guest-vanity-GI 3项、新高位6项。覆盖实际磁盘源SHA、三房有效格和局部残差分布、原地面数据不变、默认无额外sampler、房间切换/离开/释放、实际最强残差点对楼板/龙头顶/斜盆面不串层。日志 `tools/reports/vanity-upper-contact39-tests.log`。

主线待做同机位A/B：time870与可达1305，三灯开关；检查龙头根/台面接合是否更可信，无粗黑圈和过度压暗，地板/太阳直射边缘不变；实际三房切换q0/errors[]且field身份正确。候选新增sampler还需真实WebGL编译验收；Node不能代替。此项仅补少数高位接触残差，不声称完成室内动态GI、镜面反射或完整光色专项。


## 实际浏览器16纹理单元限制修复

首版候选因额外sampler使 `v2/v2_pastoral_wood` 超过 MAX_TEXTURE_IMAGE_UNITS(16)，真实link失败，未采用。上文首版独立纹理预算由本段修正版替代。

修正版将原地面RG与高位RG逐字节并排装入同一接触atlas，各自独立UV/接收高度，复用原 `uRoomContactMap`。所有材质包括pastoral wood仍仅原1个接触sampler，未删除材质、阴影或GI纹理。原地面texel中心和插值连续性保留；新高位仅目标片元额外4tap。

实际三房atlas尺寸对应字节205,200/192,660/177,840，各较原地面增加68,970字节（含padding）。高位状态对象仍缓存13,794字节/房，但其独立texture不绑定GPU sampler；不能按首版41,382B宣称全部GPU增量。

18/18针对通过，新增atlas每行原始RG逐字节及显式候选onBeforeCompile链检查：pastoral wood与ceramic无额外sampler。真实WebGL修正版复验仍由主线完成；候选继续默认OFF。


## 实际验收与默认采用

主线实际三房台面同机位均q0/m0/errors=[]，各房key正确；离开到meadow后upper inactive/key=null。三号房冻结off/on/off-repeat比较：10,139像素变化、最大通道差22，重复off零差；实际看图变化局限台面边缘与接合，无粗黑圈。三号1305自动/开灯/关灯已查看，原灯曝白在关闭upper时同样存在，留阶段5完整光色处理，不在此调全局。

采用后去掉不再参与shader的 `uVanityUpperMap`、独立DataTexture及其缓存。唯一GPU资源由RoomContactField的共享atlas持有，upper只保存接收范围/开关。`upperContact.atlasTextureBytes`统计已缓存高位atlas总GPU格式字节，`atlasExtraBytes`统计相对原地面场的增量；离开只是inactive，资源至dispose才释放。三房全缓存总575,700B，增量206,910B；不是此前未上传独立DataTexture的41,382B。

默认/显式关闭、旧地面shader合同、源及实际接触生命周期18/18通过，日志 `tools/reports/vanity-upper-contact39-default-tests.log`。未build、未重生室外GI；最终默认入口复验由主线完成。
