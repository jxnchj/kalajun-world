# 手作户连续步行与门态间接光验收

2026-10-28。默认主构建 `/dist-v2/v2.html?view=yard-1&time=870&profile=1`；1280×800、DPR1、14:30。无候选阴影/树冠参数。建筑 `cabins:-1743,3612:30f9adc9fb584805`，对应 `house_a-living-1`。

## 真实路线

开始仅一次定位到院路[-1719.8,3617.371]，随后点击原生步行按钮。之后全部通过原生W/S、拖动视角和F完成，没有途中setPose：院路弯道→门廊台阶→关门尝试前进→后退开门→跨门槛入室→室内回身关门→看室内→开门出屋→回身关门→返回院路分岔→既有porch-use侧路生活区[-1736.6921,3615.8890]。

40条按键事件记录的折线路径下界38.75m；此数来自实际位置而非按键时长乘速度。共9个检查点均为walk、grounded=true、地形q0、errors空。末端检查点已保存；随后回合中断使浏览器验收页自动关闭，没有继续移动或新建瞬移路线冒充连续。

关门后第一次接近还不足证明碰撞；保留`closed-door-stop`。随后额外W450ms位置仅变化约0.011m，保持门外，保存`closed-door-blocked`。后退约1.2m、F开门后再自然前进约2.25m进入室内。碰撞累计字段未递增，因此不把该字段当墙阻挡次数；证明来自实际输入、前后位置和闭门/开门行为差异。

## GI与可见结果

室内为该户自身`house_a-living-1`，bundle/closed/ready均true。室内真实F关门采集38帧，角度从102.00002°到0°，household与doorAngles每帧均ready，未切错房型。关闭后的室内图已查看，墙、床、柜、炉体、窗景仍可读；开门时入口反弹更强。未用像素完全一致判定不同门态，也未改全局曝光或颜色。

出门后roomSkyBounce.active=false、household.key=null；最终回到屋外侧路仍正确清空，内部缓存保留loadedStyles=1。窗景、门口与室外位置对应。木纹重复、草路宽绿边与远坡平滑/重复仍为美术中间态，不能据通行成功宣布整个聚落最终质感完成。

本项验证既有建筑组的连续探索与源绑定有限门态GI，不代表任意动态实时GI、所有家具逐个碰撞、全域装修或第三阶段整体完成。

## 证据

`docs/previews/v2-route-craft-38/household45-*.json/.png`：yard-start、porch-step、closed-door-stop、closed-door-blocked、inside-open、inside-door-closed、inside-closed-room、exit-porch、life-area-return。末文件包含完整检查点、输入和室内关门采样。

## 截图有效性补查（2026-10-28）

逐张读取PNG确认：仅`household45-inside-door-closed.png`有实际画面，另外8张PNG全黑，属于在非绘制回调读取非保留画布的失败抓取，不能作为可复查视觉证据。原生浏览器操作时确有现场截图观察，但这些黑图不替代现场图。9份JSON、40条输入、位置/门态/GI记录仍有效；本次连续通行与GI状态结论保留，路线各视点可复查图待补拍。补拍会明确标为固定视点复查，不冒充重新连续步行。失败文件保留。

## 46固定视点补图

已在原默认主构建time870、1280×800、DPR1补存5张有效PNG并读取检查：`household46-yard-recapture`、`closed-room-recapture`、`interior-side-recapture`、`bed-window-recapture`、`life-area-recapture`（均household46前缀）。这是固定机位复查，不冒充原连续路线重新通过，也不是逐一重拍全部9检查点。室内实际house_a-living-1 bundle/closed/ready均true，错误空；床、柜、炉体和窗口可读，木纹与边缘接合仍待美术完善。原household45-inside-door-closed有效图只拍到门板，不能用它证明全室视觉质量，本次完整房间复查图补足该缺口。

补图不使用跨工具暂停；实际鼠标拖动使yaw从-65.82变为-14.62，连续绘制正常。原验收`setReviewHold(true)`会跳过控制更新和整帧绘制，曾在采样后等候取证时保持，导致用户所见假死。后续仅在必要的同步固定对照中使用并finally恢复，普通采样/保存/等待保持可交互。没有更改浏览器权限或系统设置。
