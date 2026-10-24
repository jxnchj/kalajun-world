# 生态纹理提前上传候选（第38轮）

状态：`earlyTreeTextures=1` 显式启用，默认关闭。25项专项检查通过，实际四组冷启动波动很大，无稳定净收益证据，继续默认关闭。

范围：仅hi/mid两份云杉GLB中真实最终材质纹理，以及远树已解码的albedo/normal DataArrayTexture。`loadEcologySources` 在每个源完成时同步通知队列，再立即推进依赖（如needle worker）；实际 `renderer.initTexture` 放到后续任务，复用 CompileTextureQueue 的每任务8项/4毫秒调度预算。单次上传可能超过4毫秒，未承诺硬实时。

不新增资产请求、不复制/改采样器、不产生替代纹理、不绘制预热场景、不提前上传将被替换的几何。源纹理对象后续由真实材质clone共享；hi/mid共享Source但不同Texture/sampler仍分别交给Three处理，不能只按image去重。相同Texture identity/version不重复排队。版本变化可重新准备。

事务：所有源完成后 beforePublish 等待剩余队列，随后进入原生态派生几何流程。上传异常会停止队列并abort现有加载控制器；原加载事务等待在途资产后统一释放。外部abort、销毁、排队纹理被提前dispose均不会继续上传或发布残缺资源。队列只借用资源，不关闭图像或自行dispose纹理。切换视点不取消全局共用纹理，原viewGeneration准备保护仍负责最终目的地。

时间证据：`snapshot.ecology.earlyTreeTextures` 保存绝对performance.now导航时基的startedAtMs、firstUploadAtMs、completedAtMs；sources中每个源有readyAtMs、firstStepAtMs、completedAtMs及queue统计。initialized/alreadyInitialized/duplicates、uploadTotalMs/maxUploadMs分别反映初始化调用、已就绪复用、排重和主线程提交耗时，不是GPU实际完成时间。原导航→完整首帧提交字段仍为loadTimings.navigationToFirstFrameSubmittedMs；生态总加载、initialScene、initialShaders、firstFrame照旧计时。

与旧实验的区别：`texturePreparation=1` 只在全部资产和initialScene结束后与shader link并行，历史曾把firstFrame308ms降至172ms、但shader195ms增至431ms，导航7.890s与7.888s近似不变。新候选提前到单项资产完成，存在与剩余资源/worker重叠的机会；若只是挪动等待或阻塞主线程，仍应保持关闭。

专项检查覆盖真实Three Texture/Source身份、材质clone共享、相同source不同sampler、排重/版本更新、远树数组纹理、其他源忽略、未完成far资源时hi上传已执行、全部工作完成前禁止发布、abort/dispose、GPU初始化错误及晚到源清理、原编译队列与shader readiness。日志：tools/reports/early-tree-textures-v38-tests.log（25/25）。没有全量构建或离线资产重生成。

绑定：森林源路径及树冠派生算法未变，不需重建其缓存。meadow实验以ecology整文件绑定，本次接线延续安全失效，需要使用该实验时严格重生成；没有只改manifest hash。默认meadow路径不受影响。

浏览器 A/B：同构建/视点/时间/分辨率、相同cache条件，earlyTreeTextures=0/1交替，检查资产请求集合与字节不增加、实际色影完整、errors为空。比较导航总时长及early队列与其余source阶段的真实交叠，不能仅看firstFrame缩短。旧texturePreparation参数保持同值（建议均关闭）避免混合归因。撤销候选只需移除URL参数。

## 实际冷启动四组结果

独立顺序 off1 10.070s / on1 15.325s / off2 20.886s / on2 10.038s。off2 期间系统 Python 启动误触 Xcode 工具约2.5秒，标记潜在污染；不据此计算均值提速，独立 on1 本身也需15.325秒。不继续反复该实验。

四份原始 JSON 的65条请求，其 path、encodedBytes、decodedBytes 多重集合完全一致，encoded合计105,019,180 bytes，transfer合计105,038,680 bytes；未新增或遗漏资产，errors均为空。两次开启均完成7个实际纹理初始化，CPU提交98.9/59.4ms；不能把这项局部完成或耗时当作导航收益。

证据 docs/previews/v2-route-craft-38/early-textures-{off,on}-{1,2}.json。完整请求集合与污染标记见 tools/reports/early-tree-textures-v38-result.json。
