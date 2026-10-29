# 局部根毡真实岸坡试用（OFF）

仅 `reachBankDesign50=root-pool&reachRootMat=1` 同时存在时加载；其他组合零请求、零网格。此为既有 middle-root-lobe 的约半米局部纤维，不铺满整条溪岸，也未被默认采用。

- 实现：`web/src/v2/reach-root-mat-trial.js`，导出 `ReachRootMatTrial(world,{search})`；`await load()` 后添加 `group`，由现有 `environment.register(materials)` 注册普通 PBR；无逐帧 update。`stats` 可读、`dispose()` 幂等。主入口由主线程接线。
- 新公开资源：`web/public/assets/v2/shore/root-mat-trial/root-mat-section.glb`。与原候选 GLB 逐字节一致，426,684 bytes、2 个材质网格、15,204 三角、10,374 导出顶点、无纹理采样器。开启时新增最多 2 个主绘制，太阳阴影及水倒影仍有相应 pass 成本。
- 原可编辑源与原导出保留在 `assets/src/v2/shore/root-mat-section-candidate/`。不改曲线、原 GLB、现有 521 个植物根记录、树根与其他世界实体。端点校验 fixture 从现有 105 条 Blender 曲线只读提取，不重新生成造型。

贴合依据是当前真实 `world.surface.heightAt`，水缘取同一 `world.hydrology.forestReach39.waterSectionAt`；中心 chainage offset 1.5，纵向沿原根资产 0.53m 范围；从水缘外 0.28m 的上段映射到外侧 0.06m 的下段。原 Blender 坐标按 glTF `(X,Z,-Y)` 处理，先对原代表坡面做最近点投影，得到真实法向埋藏/露出距离，再沿真实岸坡法向保留同一距离。最后重算法线。模型垂向长度随真实岸坡改变，并非保留原代表坡面形状；埋藏与露出的法向毫米关系保留。

实际数据检查见 `reach-root-mat-trial-fit.json`：全部 10,374 顶点独立最近点复核，最大法向距离差约 4.90nm（CPU/Float32 本地顶点范围，不代表 GPU 世界坐标精度）；5,663 个埋藏顶点及所有符号均保持，埋藏比 54.59%。全部 101 个非根颈末端连同半径仍埋入至少 1.80mm；最低末端在水位上 46.70mm，根颈低于真实冠顶至少 45.27mm，离最近受保护树根约 6.56m。拟合约 0.37 秒是本机 Node 的单次 CPU 测量，不是浏览器加载/GPU 数据。运行时 stats 的 maxNormalDistanceError 是局部切平面近似残差（最大 0.053mm），独立测试报告的 maxClosestDistanceErrorMeters 才是最近曲面误差。

验证：`node --test web/src/v2/reach-root-mat-trial.test.js`，7/7。包括关闭/错配地形无请求、失败可见且可重试、原资产不变、法向/水位/保护距离、所有端点、取消和晚返回解析资源释放、重复销毁。可通过 `ROOT_MAT_TRIAL_REPORT=tools/reports/reach-root-mat-trial-fit.json` 显式更新独立报告。

未完成边界：只证明真实查询面贴合；实际地形渲染三角近似、厘米尺度可读性、太阳阴影偏差、细根远距混叠和最终美术采用仍需主线程在同一实景机位检查。形态是设计的纤维根簇，不是当地物种扫描。当前无新离线渲染、无 Aholo、无全构建或浏览器操作。
