# Cloud75 源码恢复束（候选仍关闭）

本目录保存被 `/backups/` 忽略的**显式、逐字节源码闭包**，不是发布候选资产，也不是授权烘焙。52 个 payload 文件，425,044 字节；完整文件列表、原路径、字节数、SHA256 和逐文件状态见 `manifest.json`。不直接在 `payload/` 下执行：原代码断言 staging 布局、相对导入 `../../web`，缓存绑定原路径和源 SHA。

## 包含／排除

包括 V4 几何、精确域和三角证明、缓存防护、独立读回、AO/GI staging、生产 owner 检查及必要测试。`v3_metrics/fixture_source2262_raw.json` 是固定 SHA 的必要 128,251 字节测试夹具，不是完整生产输出。`serialization-before-v11/` 两份旧源码是精确比较的必要测试夹具，只作历史输入，不是可执行当前入口。

不含 Blender 二进制／下载包、运行配置、profiles、环境、凭据、生产缓存、候选 Blend/GLB、GI 模块、root approvals 或一次性运行包装。历史失败候选不混作当前版本。固定日期的 lineage 包装、绝对云端路径 smoke/launcher 留在独立 checkpoint，不伪装为通用入口。不得 `git add -f backups`。不部署、不改变默认开关、不改变密度或画质。

## 检查与恢复

从项目根执行（首次仅检查，不写入）：

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/cloud75-source-replay/restore.py --repo "$PWD"
```

在**新建、无人写入的隔离恢复工作副本**确认后，才使用 `--apply`。禁止用它覆盖活跃 staging。恢复器只创建不存在的清单文件；相同字节跳过，不同字节、缺失或损坏 payload、重复目标、路径逃逸及符号链接均拒绝。全部预检通过才开始创建，最终重验；写入中断可能留下部分同字节文件，可安全重试。它不是并发锁或对恶意并发文件系统写入的防御边界，运行期间必须独占目标副本。

基线检查要求 `450a2c0be9d7c1731058b991933d3167befcc147` 是 HEAD 的祖先，并逐项验证 `boundInputs`，**不是 HEAD 必须等于旧提交**。因此之后只改文档／新增本源码束的提交仍可恢复。清单显式绑定生产 Blender 配方、V2 顶层生产 JS、包锁、主要输入和四个 household 家族引用的外部源；实际变化将拒绝恢复，不静默更新绑定。生产代码绑定是保守的超集，未来有意升级后需重新审计并建立新版源码束。Git LFS 必须先取回真实输入，指针文件不能代替资产哈希。

未来资产、生产代码或 runtime 被正式采用／升级后，如需复核本历史源码束，应在记录的原基线 `450a2c0be9d7c1731058b991933d3167befcc147`（或全部绑定输入仍匹配的后续提交）的独立工作副本中恢复，并重新满足当时的 runtime 身份要求。不得为了让旧束通过而削弱或更新旧 manifest，也不得将历史源码恢复到已经采用新资产的生产工作副本。新版输入需要另建、审阅和验证新版源码束，旧束及旧证据保持不变。

发布前仅比较，不向 live 写入：

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/cloud75-source-replay/restore.py --repo "$PWD" --check-live
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tools/cloud75-source-replay -p test_restore.py -v
```

`--check-live` 失败意味着 live 源已变化或缺失：停止发布，重新选择稳定检查点、审阅变化、复制确切字节、更新清单和验证记录。不能删除失败项或放宽哈希。发布之前和建立 Git tree 之后再次核对源束 SHA，避免把过时副本当最新成果。

## Runtime 与分阶段重做

本束不复制旧 `runtime-provenance.json`。在恢复机器上从已验证官方发行包取得 Blender 5.2.3 LTS，独立核验归档 SHA `78486c018b4443efe5e75ab54c290ed8c15abafd249b862c2c9ce2530a918eec`；实际二进制预期 SHA `b8b07a190fb25db76aae6de08dbc6c2b3d64e22e82bed6ba90de9545859f3431`。重新记录本机 `binaryPath`、实际 `binarySHA256`、实际完整 `--version` 输出、归档 SHA 和归档成员一致性检查；只有检查真实完成才设置 `binaryMatchesVerifiedArchiveMember`。使用当前脚本读取的字段结构生成本地 provenance，不能复制旧路径或填入未经执行的成功值。

按仓库 package-lock 安装依赖，使用 Node 24（当前源依赖 `registerHooks`）和 Blender 自带 Python；本束不升级项目依赖。新 provenance 改变缓存身份，旧 cache 不得自动复用。源码恢复不等于旧证据恢复。

阅读 `run_v4_job.py`、`execution_budget.py`、`pipeline.py` 后，在各阶段取得实际资源／候选放行条件，再分别执行 bounded baseline interfaces、baseline cover、geometry generate-zero、zero interfaces/cover、solve、corrected interfaces/cover、export、certificate、GLB读回、saved-Blend读回、owner 与同条件预览。每阶段保存独立报告，失败不进入下一阶段。新源 fixture 可由 `export_numeric_fixture.py` 从绑定原始源生成；已有必要 fixture 不覆盖。

`bridge_zero_serialization.py` 只是历史精确两处比较修正的复用证明，不是一般缓存迁移工具。全新恢复通常重新测量，不复制旧批准或缓存。AO/GI 必须由独立审阅的输入、证据与新批准进入 `pipeline.py`；**禁止直接运行生产 `tools/blender/v2_house_textiles_gi73.py` 的 main**，它会写生产输出。恢复器不生成任何批准。

## 证据边界与发布顺序

- 本次打包没有重跑 Blender、几何或 GI 任务。每文件 `status` 是来源状态标签，不是本次执行凭证。
- 既有数学、导出、读回和 owner 结果引用相应独立 checkpoint；全部状态必须在进度报告中绑定实际命令和报告 SHA。
- `verify_staged_runtime.mjs`、`verify_room_owner76.mjs`、`room_owner76_extra_checks.mjs` 是已准备的检查工具；本束不声称实际新 GI 候选通过，更不声称 native/GPU 验收。
- AO 的 pipeline 运行与独立读回、25 状态 GI、世界同条件视觉／性能、默认采用是不同门禁。仅恢复源码不能把任何门禁改为完成。
- v12 checkpoint 的 SHA 只标识已存在独立备份；部分此束源码比 v12 新，不声称 v12 已包含这些文件。后续 checkpoint 必须显式包含本束和较新成果。

先等活跃 AO/GI／读回完成，封存当时受保护 tracked 文件与证据，再提交源码束和进度文档。旧 `post_ao_inputs.bind()` 会重新验证旧 protected 文件；之后改文档也可能导致旧上下文重验失败，须在当时封存副本复核，不可修改旧 protected 清单。新 GI 使用新保护基线，并明确记录仅文档／源码发布差异。

候选 Blend/GLB 以后推广仍需 Git LFS；普通 GitHub create_blob 不能证明 LFS object 已上传。只提交指针而未验证远端对象可下载不是交付。
