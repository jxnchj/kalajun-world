# 织物原生 QA：冻结 SIDE 仪器源码（仅隔离复现）

本包只保存 **3 文件的精确补丁、测试、输入身份与状态**，不把仪器接入生产入口。基线为 `27596dfb56f48326971c46c69a376a4213a3073d`。补丁保留原 near 静态视点，只增加一个明确标注的低机位 SIDE 视点；main 只接入原视点注册／初始选择和受 held/pending/reservation/closed 约束的点击入口。不改渲染、准备上限、物理、门态、密度、质量或默认采用。

**Git 单独不能复现新候选画面。** 必须另从授权的、已校验独立备份取得 `candidate-inputs.json` 指定的22项确切候选字节（几何、manifest、20 GI模块）。本包只有它们的路径、大小和哈希，没有新候选资产，也没有私有备份链接或Library标识。没有可靠且已验证的LFS上传结果前，不上传普通blob来绕开LFS、不只提交悬空指针、不用旧Git资产冒充新候选。

## 安全应用顺序

只在**全新、干净、无人使用的隔离QA工作副本**应用，绝不对当前生产、副本中正在运行的浏览器或已经冻结的NEAR/SIDE证据目录执行。下列变量由操作者明确指定；本包不自动创建批准、运行浏览器或部署。

```sh
# 从已有仓库创建独立基线，避免smudge意外拉取全部制作源。
GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach "$QA" 27596dfb56f48326971c46c69a376a4213a3073d
# BUNDLE 为本包绝对路径；QA 为刚创建的隔离路径。
test -z "$(git -C "$QA" status --porcelain)"
git -C "$QA" apply --check "$BUNDLE/instrumentation.patch"
git -C "$QA" apply "$BUNDLE/instrumentation.patch"
```

应用前，按 `manifest.json` 核对baseline、已有main和4项辅助输入SHA256；两个新增文件必须不存在。后续仅文档／源码包提交可作为兼容基线，但所有绑定生产输入仍须相同，patch必须干净通过。不得削弱或改旧manifest来迁就不同生产源码。应用后逐项核对三个 `patchedSHA256`，实际差异只能是这三个仪器文件；补丁重复应用应拒绝，而非强制覆盖。

依赖按基线 `web/package-lock.json` 使用 Node 24 与 `npm ci`；轻量源码检查：

```sh
(cd "$QA/web" && node --test --test-reporter=tap src/v2/textile-near-review76.test.js)
```

需要浏览器构建时，再单独取得基线公开运行资产和22项新候选：逐项校验候选SHA256/size后**复制到隔离QA目的路径，不覆盖主仓库，不复用硬链接**。候选输入缺失或不符即停止，不回退旧资产继续声称新候选测试。

已验证的SLIM布局是546个public LFS路径＋20个候选GI路径已物化，共566；69个非web制作源保留原Git指针。这不是完整635项LFS物化。public目录总638文件（含92项非LFS），仅两个批准的public候选差异；22项资产加3项仪器合计25个差异。需要制作源的Blender任务不可使用此SLIM目录冒充完整环境。

构建使用隔离输出目录，检查5项prepared binding、22候选输入、全部public/dist清单和HTTP实际字节；不改变质量换取通过。原作者构建5.86秒、782文件，四项HTTP响应（HTML、bundle、GLB、manifest）核对通过；不是782次HTTP检查。本次源码包验证只重放补丁并跑11项helper测试，没有重建、开浏览器或复跑38项完整专项。

## 原生证据边界

`validation-status.json` 是**有时间截点的状态摘要**，不是授权文件，也不是自动验收证书。入口／箱面、NEAR、SIDE是不同视点；NEAR与SIDE还使用不同仪器构建，证据不可互换。各自同构建OFF/ON、OFF返回记录必须保留实际view/pose/time/viewport/generation/door/owner和来源SHA。

截至当前草稿截点，实际原生范围仅 `house_a-living-1`、time870、原开门约102°、1280×800/DPR1/HDR4×，有限静帧和native JPEG截图，不是原始framebuffer。非零ecology队列不写成全世界settled。低机位静态瞬移不证明站立／步行／碰撞可达；软件SwiftShader耗时不代表目标GPU实时性能。其余家族、门态矩阵、time600早晨、最终接触／光照美术、性能、默认采用和部署，必须另有实际完成证据，不能因计划已授权写成通过。

源码与数值测试通过不等于画面或最终美术验收。发布此包不修改原候选OFF状态。后续family提案和新视点不包含在本冻结SIDE包内。
