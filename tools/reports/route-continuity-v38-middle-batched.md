# v38 mode1 中距冠片原生 BatchedMesh 候选

当前结论（2026-10-27）：不采用，默认不创建、不启用；第42轮用新的整 RAF CPU 口径完成一次复查，仍无稳定净收益，结束本分支迭代。下述早期实现记录保留，最新实景证据见文末。Three 原生 BatchedMesh 非实例 multiDraw 每树一个子 draw，多出的顶点纹理读取有可能比原 instancing 慢；不得据“draw 调用变少”声称整帧性能改善。

入口：`?middleTreeBatched=1` 创建并启用；同页运行 `systems.ecology.middleBatched.enabled.value = 0/1` 对照。无 WEBGL_multi_draw 时恢复原 InstancedMesh 路径；当次已排队绘制仍由 Three 自带逐 draw fallback 完成，不丢树。没有改 Three 核心或 GL 方法。

范围：只 mode1、alphaTest>0 的照片冠片，五个形态各一个原生 BatchedMesh，将原多个固定世界区块汇合。mode5/12、树干、细针、远树不变。原 nearTreeBatches、activeRecords、实例矩阵和 SpruceRootWind 仍是权威；开关只替换提交对象。停用时原完整批次重新加入原 nearGroup，原风更新持续。

数据：原静态 position/normal/uv/aPlantWind/aCrownOcclusion/index 由 Three.addGeometry 原生复制，每个形态只复制一次。各根使用同一原 Float32 矩阵；两 texel 保存原有五个风值，不重新算风、量化或插值。原生 batching ID 读取一次、matrix 四 texel 读取一次，原 vertex batching chunk 复用该矩阵；新增风读取两次。保留原生态 LOD 阈值、风函数和照片覆盖。sortObjects=false。

视图与阴影：Three 原生 onBeforeRender / onBeforeShadow 分别按实际主、反射、阴影相机进行每根保守球剔除，局部球包含完整原 TREE_CULL_WIND 加 0.25m 浮点余量；未使用主相机选择结果替代其他 pass。汇合体也保持完整球/盒。根集合或矩阵变化显式增加 object.userData.shadowRevision，风变化仅更新风纹理，遵守原有风阴影刷新 cadence。原级联 receiver 域可在批级剔除；原生子 draw 只按实际阴影相机 frustum，可能比原 receiver 收紧范围提交更多根，安全但未保证更省。

生命周期：全容量迁移时先释放离开根的原生 ID 再加入新根；稳定矩阵不重写，稳定风值不重传。销毁仅释放新 native geometry、matrix/ID/wind texture 与克隆材质，不释放借用源资产；恢复原提交对象。默认关闭时无这些额外对象和纹理。快照 `ecology.middleTreeBatched` 给出 roots/sourceBatches/forms、matrixWrites/windUploads、native draw/subDraw 计数、额外 geometry/matrix/ID/wind 字节。

文件：`web/src/v2/spruce-middle-batched.js`、对应测试；ecology 在 load/sync/dispose 接线。备份 `backups/route-continuity-v38/middle-batched/web/src/v2/ecology.js`。

验证：新增 8 项加 spruce-wind/tree-view-batches 共 35 项通过，约 179ms。使用安装版原生 BatchedMesh 验证 geometry 数据、完整根集合、main/reflection/shadow drawID、真实 SunShadowCasters revision、全容量替换、原路径回退和独立资源释放；另外实际读取当前缓存全部五形态 mid 冠片，确认所有静态 attribute 数组逐值/类型一致、所有 index 一致。非真实 WebGL 编译/性能验收。


## 第42轮一次复查：仍不采用

旧 `middle-forest-{on-1,off-1,on-2,off-2}.json` 并非只有 GPU：各20秒真实帧间隔均值为31.48/38.26/49.92/180.07ms，但后两组出现1100/2862ms最大长停顿，不能据此证明可靠整体收益或整体退化。因此在新整 RAF 统计可用后，仅做这一次受控复查，不重写原候选。

使用独立 review 小包在同一已加载世界挂接原 SpruceMiddleBatched，不新增启动参数、不关闭现有地形 Worker。完整978根、142个源批次→5形态批，冻结图0差。正式 ABBA（A原路径、B候选）结果：

| 指标 | A1 | B1 | B2 | A2 |
| --- | ---: | ---: | ---: | ---: |
| 整帧 ms | 77.07 | 69.41 | 69.67 | 68.94 |
| RAF 同步 CPU ms | 76.38 | 69.14 | 69.45 | 68.58 |
| GPU ms | 22.23 | 23.28 | 23.72 | 21.84 |

首A明显高于末A，末A与两次B同级；不能把两模式平均约4.7%的整帧差归为稳定候选收益。GPU依旧变慢。保持OFF，不再推进本分支；实际helper已dispose并恢复原提交对象。证据：`docs/previews/v2-route-craft-38/middle42-normal-abba.json`。图像等价与完整根数只证明本次正确性，不能替代性能采用依据。
