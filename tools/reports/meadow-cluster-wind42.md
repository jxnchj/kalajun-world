# 远草专属精确根风候选42（默认关闭）

范围仅 meadowCluster42 的两个独立材质及其源/紧排几何；不扩展旧普通草 collect，不启用普通草 wind41。直接复用 MEADOW_ROOT_FIELD41 字符串及 attachMeadowRootWind41 注入，保持根坐标来自原 Float32 instanceMatrix 第四列，保留每叶权重、局部相位、种子和方向响应。两层与反射使用同一持久根地址及 RGBA32F 缓存。

新模块 web/src/v2/meadow-cluster-wind42.js 导出 MeadowClusterWind42。构造 {enabled:false}，setEnabled、update(renderer)、dispose；stats 显示 roots/capacity/textureBytes/positionBytes/indexUploadBytes/positionUploadBytes/updates/rebuilds/updateMs。每帧 prepare 观察驻留 tile 与源实例版本；新增根批量写位置，移除 tile 释放并合并地址区间，末尾空间回收。两层原源共享同一索引属性；紧排池通过 matrix 脏区及新增尾段更新地址，不全量搬运原矩阵。首次接入、遗失脏区或重建时保守全量同步。所有 root 地址为 Float32 可精确表示的整数。

缓存以 2 的幂扩容，保留原根位置及稳定地址，两个材质共享可替换的 textureUniform。当前约21万驻留根通常容量262144：RGBA32F目标4 MiB、根坐标VBO3 MiB，另有源/池索引及root-ID映射。没有新增下载资产。容量内未引用槽也被缓存pass计算，属于可明确计量的额外成本，不把容量当实际根数。源位置每帧不重新打包；相同风时间/纹理版本/重定位/混合参数下重复 update 不增加pass。任何风输入或根位置变化使下一次 update 重算。失败render不发布新signature，恢复render target/cube face/mipmap与autoClear后允许重试。

主线接点（未自行修改main）：meadowCluster实例之后构造，默认参数 meadowClusterWind42=1 才启用；renderWorld 内、原 meadowRootWind.update 邻近调用 update(renderer)，须处于主线实际GPU计时范围并早于主颜色绘制；反射复用同时间缓存。debug暴露对象，stats挂生态，pagehide先dispose该对象再dispose cluster。关闭时恢复材质hooks、删除自身index属性、释放target及地址状态。clear/dispose均不改近草密度、矩阵或原rootfield。

轻量回归4/4：地址释放/合并/复用；两材质逐字公式及共享uniform；一个时间仅一pass；风时间、origin rebase与纹理version失效；稳定slot移动/换tile；源Float32边界位置更新；clear/re-enable；render异常恢复。测试没有GL上下文，不能证明实际驱动像素等价或净GPU收益。主线需先做原→候选→原恢复的冻结像素和无GL/GLSL错误确认，包含512m风域边缘、两层过渡、风原点重定位及反射；通过后再动态ABBA，包含该额外缓存pass。旧普通草wind41无可靠收益的结论保持有效，不能借新范围推翻旧数据。

## Actual browser shader and pixel check

Main now exposes default-OFF meadowClusterWind42. Real Chrome west-slope at1280x800/DPR1/time870,206539 source roots: original/cache/restored PNG0 changed pixels. Six controlled field-origin boundary cases at wind times4.00–5.85 and blend0/.5/1 also0 changed pixels; all original uniforms restored afterwards, errors empty. These are actual colour-path checks, not full movement/reflection or net GPU acceptance. Evidence meadow42-wind-pixel-* and meadow42-wind-edge-* under docs/previews/v2-route-craft-38.
