# 独立河弯沉积扫描候选 66

已完成独立默认 OFF 模块及 7/7 针对检查；尚未做 Chrome 图审、GPU 验收或采用。未修改 main、surface41、facies44、terrain-material 或任何地形、水位、植物生成数据。

## 素材

选用 [Poly Haven Gravelly Sand](https://polyhaven.com/a/gravelly_sand)，作者 Dario Barresi，官方 [CC0 许可](https://polyhaven.com/license)。官方 info API 经 web 工具核实尺寸为 2480.000019 mm；页面约为 2.5 m。使用真实比例 2.480000019 m，每张 1024×1024。亲看两张候选原图后选择此套：矿物砂/细砾与零星小石，含少量细枝碎屑；未见明显脚印或成片活草。它是材质类比，不是喀拉峻现场沉积扫描。

原颜色 JPG、OpenGL normal JPG 和 roughness JPG 保存在 assets/src/v2/riverbed/facies66/。运行颜色 JPG 完整复制；派生 PNG 只将解码 normal RGB 与 roughness R 合为 RGBA，逐字节回读确认无损，无调色、模糊、锐化或重缩放。原图大小与 SHA-256、官方链接、许可及尺寸证据见同目录 source.json 和 LICENSE.md。Python 直接访问元数据 API 与 CC legalcode.txt 曾返回 403；未绕过或伪造下载，保存了 web 已核实的标识与官方法律文本链接。

## 整段材料层级

真实细料扫描成为约 36 m 受控河弯合格湿床的连续底层。四段明确的冲刷露出分别位于入口、原 -3 m 左侧砾石区、4 m 缩窄段及出口；保留原砾石 2.9 m UV/法线/粗糙度，不把其纹理整体缩小或抹糊。两个原固定岸石身份和尺度用于其附近粗料保留资格，不新增石体。

材料权重由带方向、收尖宽度和轻弯的透镜决定，深水不再自动退回粗砾。水缘外 8 cm 平滑退出，避免两岸必留粗砾细线；既有 reachBed41 与 facies44 掩膜仍限制最终影响，原 root/humus 叠层继续在后面覆盖。颜色、微法线梯度、粗糙度使用完全同一 coarse/fine 权重。没有颜色补偿、全局光照修改、几何变化或植物搬移。

这是依据现有河弯形态的艺术沉积分区，非水动力输沙模拟。完整细料区会比 64 明显，仍需图审排除棕色长带、过多裸细料或不自然边界。

## 最小接入

文件 web/src/v2/reach-bed-facies66.js；独立构建 web/dist-v2/reach-facies66/reach-facies66.js。

先移除/销毁 facies64 试用 owner；66 要求采用的 surface41 v5/facies44 原材质链，不能叠在 64 上。等待 terrain 的原参考扫描 loadReferences 完成。不要改默认参数或生产材质文件。

```js
const mod = await import('/reach-facies66/reach-facies66.js');
const assets66 = await mod.loadReachBedFacies66Assets({
  baseURL: '/reach-facies66/assets/',
  signal: abortController.signal
});
const facies66 = mod.installReachBedFacies66(terrain.material, {
  assets: assets66, enabled: false
});
facies66.setEnabled(true);       // 首次启用安装钩子并请求编译
facies66.setEnabled(false);      // 此后相同程序、相同纹理做 OFF
facies66.setDiagnostic(true);    // 红=原粗料，绿=新扫描细料
// 退出候选
facies66.dispose();
assets66.dispose();
```

加载模块没有借用 this 调 fetch；失败/取消显式抛出，无静默备用材质。默认 OFF 不改 hook/key/shader。加入数组使用私有 uniform 与新数组副本，原 3 层解码像素按字节复制，色彩空间/mip/wrap/过滤保持；不修改、释放借用的原纹理。重编译复用自己的数组；dispose 仅释放自有资源且不覆盖后装 owner。若原参考图未就绪或 surface41 接线不一致，明确报错。

可由主线程放到候选资产目录或 baseURL 指向现有 dev public；独立 lib 构建明确禁用 publicDir/copyPublicDir，不复制全世界素材。构建脚本只将本候选4个文件放入 reach-facies66/assets/，独立测试页可直接加载。

## 验证与成本

node --test web/src/v2/reach-bed-facies66.test.js：7/7，通过时长 1.490 s。包括原真实材质链与 source 哈希不变、OFF/恢复、加载取消/HTTP错误、私有数组释放、同权重与粗砾核心、原923点几何查询及521根、原图/法线打包。

实际默认49世界71站×13横断位置=923点；以下为 CPU 材料分类，meso=.5，不是屏幕面积或美术通过：

| 段 | 水内样点 | 平均细料 | 细料>80% | 原粗料>90% |
| --- | ---: | ---: | ---: | ---: |
| 入口 | 207 | 71.4% | 136 | 44 |
| 中段 | 225 | 76.1% | 159 | 38 |
| 出口 | 207 | 78.3% | 153 | 34 |

pool-cross 焦点中心 offset -4..0 的细料权重为 1，改正64仅0.16的问题；同一 -3 m 左侧砾石核心仍完全使用原材质。所有923点 heightAt、water width/left/right/level 查询精确相同，原521个 root ID 与原 source/prepared bytes 不变。图审仍由 whole-bend、pool-cross、root-mat 原机位 OFF/ON/恢复完成。

新增运行图像文件 4,295,716 bytes。素材解码像素 8 MiB。私有4层×2组 RGBA8 纹理为32 MiB，不含mip；完整mip约42.7 MiB。为撤回仍保留原2组3层纹理，故该42.7 MiB是额外驻留上界，不是假称只多一层的8 MiB；独立候选若获采用可再并入原loader减去重复层。新增 sampler 0、draw 0、geometry 0；合格细料片元最多2个额外 textureGrad，6个简单范围计算。未测 GPU 收益/代价。

构建命令：node tools/candidates/reach-bed-facies66/build.mjs。备份位于 backups/reach-bed-facies66/；备份四份共享源码与当前文件逐字节相同。

## 首次浏览器失败及修复

首次实际Chrome安装因GLSL模板直接减负数，产生 --0.12 / --0.13 / --0.08，编译失败；不是图审通过。失败版本与记录保留在 backups/reach-bed-facies66/first-browser-failure/。已将全部生成数值统一括号化，版本升为 reach-bed-facies66-scan-2-signed-constants；新增负位移/负曲率实际生成式回归，7/7通过，独立lib回读与源GLSL一致。未改纹理、分区或main。Node字符串/算术检查不等同浏览器着色器编译，仍等待主线程重新安装实测。
