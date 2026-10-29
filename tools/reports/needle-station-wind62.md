# Station wind 62 — 默认关闭的可撤销候选

只为当前主视锥中最多两个真实 mode12 station mesh 缓存每 root × station 的四个风系数。全部根、针、枝包、UV、AO、形状、LOD 与阴影更新频率不改。原始其它网格和不匹配快照执行原式；局部 coverage 私有视图显式使用独立 valid=0。

接线由主线程完成：

```js
import {NeedleStationWindCache62} from './needle-station-wind-cache62.js';
const stationWind62 = new NeedleStationWindCache62({
  enabled: new URLSearchParams(location.search).get('needleStationWind62') === '1'
});
// 完成 ecology.update / syncTreeDynamics 后，首个世界/CSM render 前。
// 置于已有完整帧 GPU query 内。不要再次 environment.register 克隆材质。
stationWind62.prepare(renderer, ecology.gpuBrushes, camera, ecology.uniforms.uWindTime);
// 同一静止风时刻的显式验收，不属于每帧工作。
stationWind62.verifyGPU(renderer, {maxStations: 512});
// 释放前先撤掉本候选，再销毁 ecology。
stationWind62.dispose();
```

主/深度材质继承原完整 shader hook，仅替换 ecoOffset 调用。计算保留 field.b=(eddy+.5) 后再减 .5，以及 A*h*h*.0014 的原先左结合顺序；不采用相位展开、量化或每枝共用相位。缓存是原生 GPU 写入的 RGBA32F，帧内校验根、包、属性布局/版本、源材质生成与 Float32 风时刻。相同快照无需重写；不同快照必须重新求值或回退。

GPU readback oracle 从实际编译源提取 readNeedleStation/ecoBend，对样本站点全部15顶点的实际高度与弯后法线做原式/缓存同程序对照。检查所有像素已写满、有限值、逐Float32位差。全扫描可设置 maxStations 为两批最大站数；仍需主线程固定相机/风时刻做完整颜色与阴影零差、包含两次 bake 的 GPU A/B。

首个真实 draw 只走原式，观察到同 renderer 的当前 geometry 被 Three 更新后，下一 prepare 才借用原 VBO。源替换、上下文恢复需重新观察。默认关闭不克隆、不分配。setEnabled(false) 恢复原材质及回调并释放本候选；错误保留在 stats.errors，retry() 后才重试。未使用 needleShape40 或 atlas44。

37/37 定向回归通过，其中新候选17项。验证包括实际 WebGLGeometries 释放监听、未首绘即退休、上下文恢复、源/布局/根/风时刻失效、8帧 CSM cadence、真实 coverage hook 链。GPU、像素零差及性能尚未执行，不能由此宣称提速。

历史真实 forest draw catalogue 的两批为42048和46944站：系数逻辑1423872B，1024列实际纹理1441792B，另两个私有单点position共24B；不包含驱动程序开销。每次变化新增2 draw、88992次系数计算；单主通道原本1334880次完整风式，每顶点现在增加1次texelFetch并仍做高度/法线计算。三通道catalogue计4004640次原式提交，并不代表三通道每帧都更新。收益必须实测。

源深度已有 projected 包装时，克隆会再应用一次幂等去log包装并得到独立key：有新变体预热成本，未借用 uniform-only program-family 资格。草影 coverage 的唯一兼容分支不在 forest/meadow/reach/terrain/structure 正式依赖树，不需要再生准备数据。
