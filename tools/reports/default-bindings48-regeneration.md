# 默认来源正式再生48（完成）

全部生成器以默认 fresh Node 入口运行，无地形候选或高冠开关；没有手改hash，没有构建主dist。生成前备份位于 backups/default-bindings48-20261028/。逐步记录见 default-bindings48-regeneration.json，各步正式输出在同名前缀log。

完成11步：forest roots（80927根/134tile）、meadow roots（45402根/111tile）、reach prepared（521根）、terrain full（1628行）、priority默认（148行）、demand all（1564行）、默认外地形导出，以及terrain/aperture/ground/ground-bounce四类真实GI重算。

原非binding内容比较：三类根manifest去code后完全一致（包括raw/压缩payload SHA）；priority/demand去code后完全一致；full逐key比较全部属性/parentSHA/压缩rowSHA一致，排除生成耗时和物理pack offset；外地形导出除sources外全部vertices/colors/triangles/pose等一致。四类GI全部辐射states完全一致。最初terrain GI严查发现4处states.{open,closed}.{sky,groundSky}.second.seconds耗时不同，立即停止并递归定位：仅这4处性能记录变动，其他字段零差；明确排除这些耗时后继续剩余3类，保留原失败与定位记录，不将其当辐射差异忽略。

相关10文件串行42/42测试通过，33.63秒，日志 default-bindings48-targeted-tests.log。包含forest当前来源、meadow实际恢复、reach准备接地、terrain真实所有行/按需恢复、四GI来源、手列profile模块SHA/watch/virtual binding。无全量重复。

默认数值不变，候选reachBankProfile48=left-hermite仍OFF；新参数必须走其不同world输入hash，不能使用本批默认根/接地包。本批已完成并冻结，可交主线统一全量与独立构建。新岸坡尚未浏览器图审，不代表其采用。
