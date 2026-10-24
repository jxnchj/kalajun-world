# 代表路线第一人称落座候选

默认OFF，入口 `seating39=1`。已实现独立模块与controls/collision有界接口，main已接独立按钮/可见阻挡提示与状态快照，最终构建及实走待完成；Node真实物理通过不能代替浏览器实际路线。

## 原资产坐标与范围

`tools/blender/export_seating39.py` 从最终tables整楼Blend与house_a-lived原门廊Blend射线命中真实坐面，输出 `generated/seating-39.json`，保留源SHA/命中三角/法线。仅代表公共楼两张沙发各选过道侧原坐垫x4.65，坐面高.530；原代表牧居长凳x-2，坐面高.355。没有改几何、GI、碰撞或挪茶几。原沙发中间坐垫前方茶几阻挡，不能假作空处；2号沙发实际接近站位须从过道斜向靠近（本地x约4.20），不能直穿茶几。旧非tables源不提供公共楼交互。

## 姿态与连续碰撞

第一人称坐姿仅模拟上身胶囊：半径.22m，高.88m，眼高距胶囊底.78m，底与真实坐面留.018m。不包含可见人物、腿部骨骼或完整人体布娃娃。站位先变为原站立胶囊内部的上身形状，头顶位置不抬升；随后先抬至所需高度、扫掠到坐面上方、降至坐高。每段预检、每个固定步进再次用Rapier shape cast与端点相交检查；不关闭椅子或墙体碰撞，不用setPose搬人。

起身先检查全部原路和最终完整站立胶囊头顶/落脚空间，受阻保持原坐姿可重试；通过后反向连续移动、最后恢复原站立身体。若动态障碍在过渡期间进入，停在已验证安全姿态，障碍移开自动继续，不推过实体。飞行切换、场景setPose和dispose取消座位状态并沿原碰撞生命周期清理。

## 主线接入接口

```js
import {Seating39} from './seating39.js';
const seating=new Seating39(world,controls,collision);
```

实例在enabled时安装 `controls.seating`，由现有fixedStep调用 `step(dt)`，main不另加每帧积分。可用 `seating.nearest()` 判断面向座位前部的近距接近区域；`seating.toggle()` 执行落座/起身；`seating.stats`暴露state、seat、blocked、sweeps；提示按钮可显示“坐下休息/起身”，不复用F门键或L灯键。dispose时调用seating.dispose。坐下要求walk、未蹲行、源座位正面1.25m以内、完整stream就绪；否则返回false或具体blocked原因。

## 针对验证

`seating39.test.js`载入最终完整GLB、原门廊GLB，所有原家具/墙体碰撞保留，3座位分别30Hz/60Hz完成连续坐下和起身。实际在退出站位放置阻挡，起身失败且坐姿/位置不变；移除后可重试并恢复不相交站位。坐标来源SHA和原控制器回归共14/14通过，日志 `tools/reports/seating39-tests.log`。

待浏览器：沿门/步道真实行走抵达，公共楼沙发环顾窗景、起身、再到代表门廊长凳，检查相机过渡/提示、实际碰撞、切场景/切飞行恢复。没有宣称这条连续实景路线已完成，也没有提前修改完整光照色彩。

实际接口收口：nearest与sit共享canApproach，站立眼睛须在源坐面上方.78–1.52m、水平距离.28–1.25m且位于座位正前侧，controls真实yaw视线与座位方向夹角≤65°；背向或另一楼层不提示也不能直接触发。新增三座位旋转实例测试及原真实Rapier路线仍通过。主线已接独立UI，本文子任务未修改main或seating-ui。

实际沙发1 UI落座暴露入座后仍面向靠背的问题：现落座开始按真实seat.front在1.15秒内smoothstep最短角平滑转向，不改变坐姿或碰撞路径。任何非零拖动立即takeLookControl，本次自动转向永久结束；外部yaw/pitch变化也撤销自动转向，不能拉回。30/60Hz终向一致、每步无180°跳转、用户接管持续有效，新旧共15/15通过。等待主线再次构建实景验证转向。

## 主线实际浏览器（尚未采用默认）

从公共楼前阶原入口切换步行，W登阶、按钮开门、W入楼，再以真实控制器沿前厅/窗侧过道走到两张沙发；全程保留原家具/门碰撞，没有setPose越障。两座均按钮落座，第一张105次连续扫掠并可环顾窗外，起身返回原位overlap=false。第二张在原站位临时插入测试碰撞体，按钮起身时保持坐姿并显示“起身通路或头顶受阻”；移除测试体后可正常重试。之后从原过道、门口和前阶真实走出，最终idle且overlap=false。

证据：seating39-lodge-actual-walk.json、seating39-blocked-exit.png/json、seating39-lodge-walk-return.json，均在docs/previews/v2-route-craft-38。可程序控制yaw和W键的路线日志为真实fixed-step/Rapier移动，不能称全部手动鼠标键盘操作。座位阶段已保存，前阶初始W段以实际工具状态记录。

实景发现落座保持接近时朝向会看向靠背，已补1.15秒平滑转向真实座位前方，用户拖动立即接管；该修复15项定向通过，最新构建实景复验进行中。上身坐姿不代表完整人体动画，门廊尚待本轮实走验收。

## 门廊实景追加（2026-10-24）

完整构建实际 `walk-house_a&seating39=1`：门口步行→长凳侧前→UI坐下→自动转向草原→UI起身→实际返回入口。268次扫掠，最终overlaps=false、errors=[]。未禁用桌子/长凳碰撞；前向目标受到真实家具阻挡，但在安全侧方已满足落座条件。截图 `previews/v2-route-craft-38/seating39-porch-seated-turn.png` 对应q0/m0，路径 `seating39-porch-actual-walk.json`。自动转向实际完成；用户拖动接管仍待验证。原入口shader超16槽现以完整云影分层纹理修复，不通过降低材质/灯影细节规避。候选尚未默认采用。

## 默认采用与恢复验收

三处交互现默认启用，`seating39=0`关闭。实际拖动画面在sitting时接管，3秒后seated且yaw/pitch精确保持（user-look-takeover）；真实UI在sitting约100ms切飞行，恢复idle、collision=false、按钮隐藏（mid-transition-flight）；坐稳切预设同样恢复（seated-preset-recovery）。三项JSON均在同证据目录。定向28/28通过，构建通过；采用后默认入口复验继续。
