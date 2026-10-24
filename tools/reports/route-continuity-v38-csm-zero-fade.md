# v38 末级零权重阴影采样候选

状态：默认关闭，URL `csmZeroFadeSkip=1`。运行时可设 `systems.environment.csmZeroFadeSkip.value=0/1`（通过现有debug取得systems），不必重编译。尚未做实际浏览器GPU/像素验收；本任务没有执行全量构建。

## 真实缺口与精确范围

Three CSM普通分支已经跳过不相交级联，正常非过渡像素只采一个级联，过渡采两个，现有世界注入链保留此逻辑。不能把既有裁剪再次包装成新收益。

唯一改动针对末级完全淡出后：原last分支允许远处像素继续进入循环，先getShadow，再以ratio=0将结果混回无阴影阳光。若该世界点的shadow UV仍位于影图内，会读取没有最终贡献的5个PCF样本。

候选只扩展原fade分支的阴影调用谓词：启用且UNROLLED_LOOP_INDEX为末级、linearDepth>cascadeCenter、ratio<=0时，不调用阴影采样并使用因子1。RE_Direct、全部mix、所有有效sample参数/偏移/bias/强度/半径、级联范围和地图分辨率均保持原文不变。原CSM普通无fade分支不改；点光/聚光/非CSM分支不改。没有省略阳光。

默认最后归一化边为1、margin=.25，完全淡出边为1.125*(shadowFar-cameraNear)，约562m视深；这是viewer空间视深而非地面径向距离，反射仍使用已有主相机CSM坐标。收益只可能来自这一远部区域，不能解释或解决近林的主要GPU负担。实际GPU驱动可能已消除部分无效工作，候选仍需实测。

## 验证

20项针对测试通过，日志 `csm-zero-fade-v38-tests.log`。覆盖实际ShaderLib standard/physical/lambert/phong、原生Three unroll、3/4级联、重叠开关、原PCF/receiver-footprint/solar组合。逐字回退改动后与原shader完全一致，证明没有修改有效tap或RE_Direct。预置derivatives仍在一致控制流中先执行。

数值测试覆盖末级/非末级、中心之前/等于/之后、零和极小正权重、完全淡出边前/等于/之后。只有末级既有阴影权重严格为零才改变采样判定；阳光结果完全保留。测试不是浏览器GL执行或GPU性能证据。
