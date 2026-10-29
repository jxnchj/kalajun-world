# 喀拉峻 · 山野之间

基于 Three.js 与 Blender 的大范围草原世界。目标是根植于喀拉峻、琼库什台地貌与牧居生活，融合不同时期的场景元素，而非复刻某个年份。

当前开发入口为 V2；代表路线持续完善，GPU性能、加载长尾、动态草影、溪岸形态、远坡层次和完整室内GI尚未达标。完整光照与色彩专项仍按整体方案后置。

## 2026-10-29 开发快照

第三阶段按用户要求暂停，详细暂停点与后续工作见行动计划。源码包含已验证的局部草影默认策略、木作家具与加载缓存；最新织物及其同源GI、木步道草根碰撞索引、溪岸69/73候选保持各自开关状态，未因推送启用。新的完整构建来自当前源码，不等同本机仍保留的正式72静态目录；构建产物不入库。

本快照不宣称林溪整体帧率与冷启动达标，也不宣称室内任意动态GI完成。当前优先电脑横版，完整光照与色彩专项仍按第五阶段安排。

## 获取与运行

需要 Node.js 22.12+（或满足Vite 8要求的更高版本）、npm、Git LFS。

```sh
git lfs install
git clone https://github.com/jxnchj/kalajun-world.git
cd kalajun-world
git lfs pull
cd web
npm ci
npm run dev:v2
```

打开 http://127.0.0.1:5174/v2.html ，端口固定且冲突时失败，不自动更换端口。

```sh
npm run build:v2
# 材质无损打包测试另需 Python 3 与 Pillow；可通过 PYTHON 指定解释器。
npm run test:v2
```

## 目录与方案

- `web/src/v2/`：运行系统与回归检查。`web/public/`包含当前V2完整运行资产与公开地理场景数据。
- `tools/blender/`：资产建模、导出、间接光烘焙与压缩脚本。
- `assets/src/v2/`：当前必要Blender编辑源、纹理、配方与少量测试基准；大模型由Git LFS保存。
- `assets/tex/`、`assets/src/polyhaven/rock_07/`：必要制作依赖。
- `data/`：处理后的公开高程与土地覆盖栅格；原始下载不入库。
- [整体重构方案](docs/喀拉峻世界重构方案.md)
- [行动计划与进度](docs/行动计划与进度看板.md)
- [V2模块说明](web/src/v2/README.md)
- [上传范围与隐私处理](docs/仓库范围与隐私处理.md)

## 制作与资源

Blender Python工具需要单独安装兼容的Blender/bpy及脚本所需Python依赖；本仓库不携带本机虚拟环境。生成树枝展开数组通过 `tools/blender/spruce_branch_snapshot.mjs` 与 `spruce_volume_snapshot.mjs`，这些大型可再生中间文件不入库。不得把原始下载、环境文件、私人照片或服务端签名URL补进版本管理。

本仓库是经过脱敏的开发交付副本。旧版源码保留作技术参考，但私人照片比对、照片机位校准、肖像角色及相关原始输入不随仓库交付，因此不承诺旧版个人化功能完整可运行。照片校准如需使用，应由开发者自行在忽略的 `tools/photos.local.json`、`tools/cameras.local.json` 配置，切勿提交。当前V2不依赖它们。

## 数据与第三方资产归属

公开地形：Copernicus DEM GLO-30（DLR/Airbus/Copernicus）；土地覆盖：ESA WorldCover（CC BY 4.0）；道路与地物资料：OpenStreetMap contributors（ODbL）。Poly Haven自然材质/岩石为CC0；其余资产来源以场景manifest和对应源说明为准。本私有仓库未额外授予全部第三方资产的再分发许可，也不应直接改成公开仓库。
