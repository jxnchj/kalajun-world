# 原 middle 草延距候选39（默认关闭）

入口参数 `meadowSourceRange39=1`。普通中距草原69三角/根、原全部叶片/根字段/旋转/尺度/风/材质均复用；原near23–33m保持，普通middle淡出改为120–140m，顶点整根剔除同步到140m，常驻tile同步扩展。不改变树/花/basal/brookWet shader范围。新增远tile暂不创建水岸wet mesh，进入原常驻圈才准备；水岸原35/80/27可见距离不变。

`web/src/v2/meadow-source-range39.test.js` 4/4通过；实际ShaderLib拼接严格比对：只有普通middle两个远端表达式变化，其他模式shader和风纹理内容相同。构造/普通根生成比对，远tile准备/原圈wet准备行为通过。日志 `tools/reports/meadow-source-range39-tests.log`。

已进入同构建浏览器对照，仍默认关闭。140m仍需远端过渡，不能称完整衔接已解决。

本次 ecology.js 改动不在 forestRootCodeBinding 固定源集合；在 meadowRootCodeBinding 中，故必须真实重新生成 meadow 缓存并验证原根payload一致，不能仅更新hash。性能窗口期间尚未运行该重计算，交由统一时点完成。

## 2026-10-24 实际浏览器追加

1280×800、DPR1、time870、river-forest原机位，同一构建。原范围首次与回测均q0/m0，20秒帧间隔72.064/69.764ms，main.color18.736/18.745ms；延展稳态q0/m0为58.652ms，main.color19.540ms。整帧存在明显调度漂移，不能把这一对照称为性能提升；主颜色工作额外约0.8ms。延展首次采样时q273，**无效**，不纳入同条件比较。所有记录errors为空。

证据在 docs/previews/v2-route-craft-38/grass-range39-{original,original-repeat-steady,extended-steady}.json。草密度、原叶片与几何保持；新增中距体积尚需西坡视觉判断，暂不采用默认。
