# 细流引水的水：参考与实现

这份笔记只写查得到出处的外观结论，和本仓库实际做了什么。参考图放在研究产物里，不进游戏包，也不进 git。

## 参考游戏里的水长什么样

**Where's My Water?（鳄鱼小顽皮爱洗澡）**  
Disney Mobile，Creature Feep，Tim FitzRandolph，2011 年 9 月 22 日发行。玩法是挖开泥土，把有限或无限的水引到 Swampy 的浴缸；毒液会污染水，软泥会变硬，藻类吸水，还有橡皮鸭。[Wikipedia: Where's My Water?](https://en.wikipedia.org/wiki/Where%27s_My_Water)

FitzRandolph 接受 USA Today 采访时说：水是许多彼此作用的小水滴，背景会透过水发生折射，流动要符合玩家的预期。[访谈](http://content.usatoday.com/communities/gamehunters/post/2011/10/interview-disney-mobiles-tim-fitzrandolph-on-wheres-my-water/1)

它不是用 Unity 做的流体。有开发者在 Unity 论坛里确认，原作是自写的 C++/OpenGL。[Unity 讨论](https://discussions.unity.com/t/2d-digging-e-g-wheres-my-water/456947)

网上常被拿来对照的「软边缘圆斑 + 透明度阈值 + 半径大约是物理半径两倍 + 用浓度场做折射」，来自 Ludum Dare 的爱好者写法，经 Stack Overflow 转引。那是粉丝技法，不是迪士尼公开的渲染器。[Stack Overflow 线索](https://stackoverflow.com/questions/10196239/where-i-can-learn-how-to-implement-the-physics-of-where-is-my-water)

**Happy Glass**  
Lion Studios / Game5mobile，2018。画线引水，墨越少星越多，杯子的脸随水位变化，画面是方格纸。[设计分析](https://www.gamedeveloper.com/design/happy-glass-design-analysis)  
商店页把水描述成沿着画出的线流动。[Google Play](https://play.google.com/store/apps/details?id=com.game5mobile.lineandwater)  
Cocos 论坛的教程用扁蓝色圆和半透明光晕，再用透明度阈值把水滴粘成一团。那是复刻教程，不是官方着色器。[论坛教程](https://forum.cocosengine.org/t/tutorial-building-fluid-effects-used-in-happy-glass/51630)

**Water Connect**  
转管子，让彩色的水在管道里接通。商店文案里的 “3D graphic” 指管道和界面，不是自由液面模拟。[Puzzle](https://play.google.com/store/apps/details?id=com.gma.water.connect.puzzle) [Flow](https://play.google.com/store/apps/details?id=com.gma.water.connect.flow)

**Sand Balls**  
SayGames / Estoty。彩色沙子球沿手指路径落下，不是连续水面。[Google Play](https://play.google.com/store/apps/details?id=com.water.balls) [MobyGames](https://www.mobygames.com/game/145796/sand-balls/)

**屏幕空间流体（本项目着色器所依据的论文，不是上面任何一款游戏的内部文档）**  
van der Laan、Green、Sainz，*Screen Space Fluid Rendering with Curvature Flow*，I3D 2009：粒子画进深度图，双边或曲率平滑，厚度用加法混合，再用 Beer 定律上色。[PDF](https://wstahw.win.tue.nl/edu/2IV06/andrei/particle_rendering/provided/p91-van_der_laan.pdf)  
Simon Green，GDC / SIGGRAPH 2010：可分离双边模糊是近似；厚度可以更低分辨率；吸收是 `I = exp(-kd)`；折射是 `texcoord + N.xy * thickness`；边缘用 Fresnel。[幻灯片](https://developer.download.nvidia.com/presentations/2010/gdc/Direct3D_Effects.pdf)  
概述：[Geeks3D](https://www.geeks3d.com/20100809/siggraph-2010-screen-space-fluid-rendering-for-games/) [Babylon.js 实现笔记](https://doc.babylonjs.com/features/featuresDeepDive/particles/fluid_renderer/fluid_implementation)  
2D metaball 的常见做法是：羽化圆相加，取阈值，再用有限差分估算法线。[DMGregory](https://gamedev.stackexchange.com/questions/69231/2d-metaballs-with-shader-to-give-blobs-of-water-effect)

从这些材料里能站得住的外观清单：

- 颜色偏青蓝，厚处更深，薄处发白。
- 边缘有一圈亮边或泡沫，而不是硬切的圆。
- 高光小而集中，厚水能透出后面的背景。
- 水要连成体积，不能是一粒粒分开的珠子。
- 飞溅可以更碎，积水要成一整块。

## 本仓库实际做的渲染

物理仍是二维。画面用 WebGL 屏幕空间流体（`fluid.js`，three.js r160，MIT，见 `vendor/three.module.min.js`）：

1. 正视投影下把每个粒子画成球体点精灵。
2. 深度用 min 混合，空像素清成 1（眼空间深度打包进 0–1，避免 `clearColor` 被夹到 1 之后把真正的水面深度比掉）。
3. 厚度和颜色用加法混合，半精度浮点缓冲。
4. 可分离双边模糊把珠子收成连续表面。
5. 有限差分得到法线。低画质少压平法线（混向朝外 0.18），保留体积感。
6. 合成：背景折射、Schlick Fresnel 边缘、Beer–Lambert 厚度吸收（油的吸收偏金黄）、一层或两层高光、薄处泡沫。
7. 低画质（`uLite`）仍是这套简化光照，不是退回扁色块。帧时间持续偏高时自动降到低画质。

棋盘、水壶、石块画在背景画布上，带一点厚度和侧光。玻璃口、水位椭圆和小鸭画在流体上面。

## 粒子

| | 旧版 | 现在 |
| --- | --- | --- |
| 半径 `RAD` | 0.0054 | 0.0026 |
| 平滑半径 `HH` | 0.0162 | 0.0104 |
| 低画质粒子上限 | — | 980，半径 ×1.05，每秒约 460 个 |
| 高画质粒子上限 | — | 2200，每秒约 900 个 |
| 渲染点半径 | — | `RAD × 画质倍率 × 3.35` |

重力、发射和 XSPH 黏度没有为了变小而改掉，细流的速度感保持原样。杯子目标、活板所需水量都按发射速率缩放，所以低、高两档用同一张关卡图。

## 为什么积水不是纯粒子柱

这套可压缩的细粒子 SPH 堆不出高水柱：一两百颗粒子倒进两格宽的井里，仍然只有大约一格深。因此杯子以外的「一池水」改成静水容器：飞溅和沿着墨线跑的水仍是自由粒子；慢下来并进入容器后记成水或油的颗数，再按颗数铺回一格视觉粒子，交给同一套屏幕空间流体去画。

这样做得到的是水位、浮力、连通器、倾斜水头和油浮在水上。它不是一条从状态方程里长出来的高水柱。

## 做进关卡的五种真水

每章一个主题。前两关是教画线。第 1 关的墨线会落下再停住。

1. **浮力**，第 3 关 The Duck。井里的水位托起小鸭，小鸭顶开侧门，水再溢进杯子。直线被屋顶挡住。
2. **连通器**，第 4 关 Two Columns。两根柱子底部相连，只往左柱灌，右柱升到同一水位后溢进杯子。
3. **倾斜**，第 5 关 Tip the Bowl。没有墨。左右按钮、方向键，或手机倾斜（约 6° 以上）让水面抬向一侧。没有陀螺仪时用 Lean 按钮。
4. **密度分层**，第 6 关 Oil on Water。油浮在水上，高堰走油，低口走水，分别进入两个杯子。
5. **水的重量**，第 7 关 The Floor Gives。水积在井里，达到重量后井底打开，水掉进下面的杯子。直线停在屋顶上，进不了井口。

代表解法都在 `levels.js` 的 `solution` 里。`node tools/verify.mjs` 在低、高两档上跑作者解，并确认第 3–7 关的直线灌法不会过关。

## 后续清单（这次没做进关卡）

- **虹吸**：`basinSiphon` 能沿一根拱起的墨线把容器里的水抽到另一头，但出水落点对不齐杯子，没能同时满足「作者解获胜」和「直线失败」。
- **相变**：冷冻搭桥、火化冰、蒸汽上升再冷凝。要温度场和另一种粒子，手机上的粒子预算会紧。
- **沙**：冲开沙堆或湿沙变硬。等于再跑一套颗粒，和细水抢同一帧。
- **按比例切分**：刀片把一股水分给几个杯子。粒子少的时候比例抖，低画质不稳定。
- **水车**：粒子推刚体转动。现在的浮动物体是跟着水位走的，没有通用的力矩求解。
- **组合大关**：一关里叠浮力、油、倾斜和活板。单关已经调稳，叠在一起要重调每一档粒子数。
- **危险物章节**：火、毒、岩浆遇水成石、青苔、宝石仍留在 `sim.js`，这版关卡书没用它们。
- **墨线受重力**只放在第 1 关。后面的机关关把墨线固定住，避免线自己滑出井口。

## 门户包

`node build-portal.mjs`、`--sdk poki`、`--sdk crazygames` 会打包页面和脚本，并拒绝游戏屋里的地址。研究文档不进 zip。
