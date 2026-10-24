# 林溪河床与根垫材料候选

已按实际浏览器四态验收默认采用，可用各参数 `=0` 返回原版；只改 terrain-material.js，不改 hydrology/world/地形/根点/散石/水。以代表林溪实际机位 (-3611.9813305250705,4805.371282289286) 的36m内完整、36–60m平滑退出范围约束；另以原河床强制矿物权重或原根垫权重限制，不能修改附近普通山坡。

`forestSediment38=1`：原 terrainRockWeight 中超过天然 terrainRockFraction 的部分是河道强制增加的岩板材料。仅将该差额的颜色、法线、粗糙度同步换成已有 soilField 的细颗粒沉积材料；保留原天然岩石份额、所有分类掩码与湿度。颜色采用既有 terrainSoilColor，normal采用既有 terrainSoilGradient，干粗糙度 .96 并沿原湿度响应继续处理。不添加纹理读取、噪声或额外石头，不改变几何。

`forestRootSurface38=1`：保留原 terrainRootCover 的资格与权重；只在森林覆盖份额内，让根垫使用原 forest litter/moss 的颜色、扫描法线及有机孔隙粗糙度，避免最终混合再擦除森林扫描。普通草坡维持草根垫。关闭/范围外保留原始颜色、法线、粗糙度语句。

可同页独立设置 `terrain.material.userData.forestSediment38.value=0/1`、`terrain.material.userData.forestRootSurface38.value=0/1`；绑定的是当前shader同一uniform对象，无需 needsUpdate，无需重载资产。

最初候选阶段完成源码与定向测试后，执行以下四态验收（结果见下节）： old / sediment-only / root-only / both，固定相机/时刻，并额外隐藏水检查灰白岩板弯曲大纹是否消失及新沉积细节是否自然；然后恢复水看完整效果。需留意天然岩石权重仍然保留的陡面，不能误报全部岩纹必然消失。地形根垫9cm候选仍独立off，不叠加放大。


## 浏览器采用结论
实际 `forest-material-opposite-dry-*` 和 wet/overview 四态验证：大尺度岩板弯纹变为细沉积颗粒，森林根垫保留有机细节；仍有规则灰色沟槽，不能称连续灰岸完全解决。后续 `forest-subdivision-{off-dry,on-dry,on-wet}.png` 显示局部15.625cm细分消除底部薄亮脊，低视点 `forest-subdivision-low-wet` 未见明显裂缝/台阶，均 q0/m0/errors[]。

采用三项：forestBankSubdivision38、forestSediment38、forestRootSurface38，默认启用，各自 `=0` 对照。9cm forestRootedShoulder38 根垫仍关闭。未进一步加密或改变原河床断面。

同一对岸机位真实有水主scene提交：945 calls / 13,350,927 triangles → 949 / 13,360,143，仅增加4 draw和9,216实际提交三角。整个地形统计2,774,016→2,891,520，增加117,504三角，不能混同该机位实际提交。


四类室外GI均从本次稳定源码重新独立导出再完整重算（146.99秒），12/12来源及输运回归通过。备份 exterior-full-rebake-d6600a1b2cfe；三类states逐字节同，terrain类states差异经递归核对仅4个second.seconds耗时字段，所有辐射数据不变。没有运行hash-only rebind。详见 room-exterior-adopted-rebake-v38.json。
