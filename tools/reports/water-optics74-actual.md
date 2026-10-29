# 水体光学74实际诊断

证据：docs/previews/v2-route-craft-38/water-optics74-summary.json及三个机位各0/1/2/3/restored图与JSON。只在独立helper临时包装水材质，未改生产水shader。

9个预定水像素的HalfFloat世界目标线性读数：
- root-mat Fresnel：0.02201843 / 0.02235413 / 0.02253723。
- pool-cross Fresnel：0.02511597 / 0.02561951 / 0.02456665。
- whole-bend Fresnel：0.13476563 / 0.07269287 / 0.04034424。
- 9点最终reflectionWeight全部1；plane/normal/UV gates全部1；rawValid、实际取样mapAlpha、水片元marker全部1。
- refractionBlend除pool-cross第二点0.93896484外全部1。

因此这些实际水像素确实执行水shader并获得完整局部反射支持。此前“平滑坡度与原段坡度门限错配可能误拒”的假设在这三机位9点被否决，不能据此改法线门限。全局snapshot active并非片元有效证明，但本次已直接验证所选片元；不将9点结论扩为全河所有角度。

正常mode0与restored0三对PNG字节完全相等，因而逐像素相等；9点原始HalfFloat RGBA也逐项相同，没有本次恢复差异需归因影图或反射更新。PNG SHA256：
- root-mat：cbd4ed93077124631a98498dd1ae00aaf3b28d59b5f6e96b9dde95777099653e
- pool-cross：00c6b8ae60e60c8199664b5321e5cf9b1627a07214907909040f90be4ec33d52
- whole-bend：6a7af6d852d22d9900f67e22f1e10e98f6bc7d59d570c7f2149a5607bded68a0

当前可以排除这组视角的反射域失效、透明水未绘制与诊断未恢复。棕色干路观感仍存在，不能以反射通道通过宣布水体美术完成；现数据也不足以认定Fresnel公式或合成次序错误。未提高alpha、未改全局色彩，也不追加新诊断。
