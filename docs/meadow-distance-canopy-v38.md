# 代表路线近远草接替诊断

默认关闭，入口参数 meadowDistanceCanopy=1；同页通过 terrain.material.userData.meadowDistanceCanopy.setEnabled(true/false) 切换。安装位于main的terrain创建后，不修改地形物理来源、worker、生态根、草叶几何、原密度或距离。

实际 adopted-route-valley.png 与 adopted-route-west.png 显示近草到光滑绿坡的明显接替。现有草LOD在62–78米淡出，外侧由地形材料接替；共有R/B群落色仍存在，缺少逐叶法线和根端遮蔽的角度响应。此次只隔离其中更小的可证伪原因：冠层纹理经过textureGrad、mip和anisotropy过滤后，16厘米冠层height又按最差屏幕方向footprint在0.35–1.3米淡出，最终gradient再按0.25–1.7米淡出。在掠视各向异性条件下，横向仍可解析起伏可能被一起抹平。

候选独立模块仅补回这层冠层梯度的差，不改变共享纹理/取样、R/B颜料、G的原色规则、曝光/太阳/饱和度或植物。原非冠层gradient照旧；河床、岸土和裸土排除；极端掠视梯度有界。开关为0完全沿用原公式。2项针对检查验证默认关闭、同页切换、原顶点源码/取样保持和原compile hook恢复。

这不是正式修复结论。须在两原机位及横向移动下检查是否真实增加可读群落起伏，是否出现闪烁或再次出现规则短波。如果只是变暗/变亮或增加噪点，就不采用。材质起伏不能替代山脊真实草轮廓，叶簇方向性接替仍需后续验证。完整光色仍阶段5。
