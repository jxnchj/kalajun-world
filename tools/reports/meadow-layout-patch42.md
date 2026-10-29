# 固定草甸空间造型 patch 42：独立 OFF 候选

仅 meadow 前方中心 (-1936,3376)、64m见方范围，边缘10m渐退。三个不同尺度的草丛岛沿现地形等高线方向组织，现有群落湿度/林缘权重只调节移动强度；没有新增随机噪声、虚构牧径、调色或图卡。最大根位移2m，保留每个root ID、数量、s/sy/rot与全部原叶片。坡面完全水平时不虚构方向，保原位。

当前源是独立模块 `web/src/v2/meadow-layout-patch42.js`，不改正式 ecology/main/缓存文件。安装默认OFF，wrapper在原generateGrassTileRoots返回之后应用一次确定性ID映射，原prepared缓存不能绕过；近/中/远簇均读同一个映射。只原位更新相交驻留草tile矩阵/根场并刷新远簇，基底草按现syncPool清空重填。湿岸asset与已有修正接地的保护根不改，禁用/释放恢复原记录和原入口descriptor。迁移保原离地偏移重新取地形高度；不删除拒绝根。

目的：先审阅草甸是否有成组、顺地形的轮廓；本项**不是320m几何退出的修复**，不预告其能解决远端所有细碎感。原阴影、风、叶片几何、原LOD选择仍保持。

安全：使用现完整含风包络，原地形坡度/土地覆盖条件、河道排除、真实routeBins线段净空、岸石精确包络、门槛/木道/牧场生活物件contact owner。拒绝位置回原位，未放宽原碰撞。实际接地/水石无交叉和美术效果仍须真实路线验证；测试不能替代图审。

四项轻量回归通过：6561根总数/ID/尺度不变、最大位移与边界渐退、拒绝与水平坡回退、tile到达顺序不影响结果、实际现接口的缓存后应用/近远一致/湿岸对象保留/多次开关恢复。未运行实际浏览器，未采用。

独立构建：`node tools/build-meadow-layout-patch42.mjs`，只写dist-v2/meadow-layout42，不清主dist。运行：

```js
const m = await import('/dist-v2/meadow-layout42/meadow-layout42.js');
window.meadowLayout42 = m.installMeadowLayoutPatch42(window.kalajunV2);
meadowLayout42.setEnabled(true); // 正常帧刷新后对照
meadowLayout42.setEnabled(false);
meadowLayout42.dispose(); delete window.meadowLayout42;
```

stats记录sources/moved/rejected/maxShift。建议同风相位近5m、坡面40m俯视与160–320m斜视，要求肉眼出现成组形态，不能只凭修改值非零验收。首次开启会更新局部实例缓冲并重建远簇mesh，不把该帧用于稳态性能对照。
