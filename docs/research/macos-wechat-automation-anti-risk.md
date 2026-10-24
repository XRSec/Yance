---
title: "macOS 微信自动化与风控规避方案"
status: proposed
audience: "连接器、自动化与安全开发参与者"
owner: UNSPECIFIED
last_reviewed: 2026-10-24
source_of_truth: true
language: zh-CN
---

# macOS 微信自动化与风控规避方案
## 窗口坐标实时换算、ROI 局部校验与 CGEvent 底层拟人化鼠标引擎

> - **文档类型**: Google Gemini 技术方案深度对话与算法实现归档
> - **会话原链**: [https://gemini.google.com/app/1b5105bd630d37fd](https://gemini.google.com/app/1b5105bd630d37fd)
> - **关联目标项目**: [XRSec/Yance (GitHub)](https://github.com/XRSec/Yance)
> - **归档时间**: 2026-10-24
> - **核心范畴**: 零录屏开销窗口几何读取、锚点相对坐标换算、ScreenCaptureKit + ANE 硬件加速 ROI 局部 OCR、微信 macOS 端风控三维拆解、Box-Muller 二维截断高斯落点、三阶贝塞尔曲线 + 费茨定律非对称减速、CGEvent 底层相对位移 Delta 硬件注入、对数正态分布微动按压延迟与完整 Swift 工程实现。

---

## 目录

#### 1. [背景与核心问题](#1-背景与核心问题)
#### 2. [第一部分：窗口定位、UI 坐标换算与风控拆解](#2-第一部分窗口定位ui-坐标换算与风控拆解)
   - [一、 窗口定位与 UI 坐标换算方案（无需屏幕共享）](#一-窗口定位与-ui-坐标换算方案无需屏幕共享)
   - [二、 微信 macOS 端的风控机制拆解](#二-微信-macos-端的风控机制拆解)
   - [三、 规避风控的工程设计建议](#三-规避风控的工程设计建议)
#### 3. [第二部分：CGEvent 底层拟人化鼠标引擎算法与 Swift 实现](#3-第二部分cgevent-底层拟人化鼠标引擎算法与-swift-实现)
   - [一、 核心算法与数学模型](#一-核心算法与数学模型)
   - [二、 完整 Swift 实现代码（HumanMouseController）](#二-完整-swift-实现代码humanmousecontroller)
   - [三、 接入微信窗口换算的调用示例](#三-接入微信窗口换算的调用示例)
   - [四、 进一步规避风控的实战调优建议](#四-进一步规避风控的实战调优建议)
#### 4. [第三部分：第三方驱动（cua-driver）的隐私、风控雷区与能力复用评估](#4-第三部分第三方驱动cua-driver的隐私风控雷区与能力复用评估)
   - [一、 cua-driver 的两大核心隐患](#一-cua-driver-的两大核心隐患)
   - [二、 窗口感知、OCR、直接点击能否直接复用？](#二-窗口感知ocr直接点击能否直接复用)
   - [三、 架构取舍与落地建议](#三-架构取舍与落地建议)
#### 5. [第四部分：微信 4.x 实测几何归档——可调分割线免疫、左上角独立搜索小窗口与防误判机制](#5-第四部分微信-4x-实测几何归档可调分割线免疫左上角独立搜索小窗口与防误判机制)
   - [一、 为什么左侧列表调宽与底部输入框调高不影响左上角定位？](#一-为什么左侧列表调宽与底部输入框调高不影响左上角定位)
   - [二、 搜索输入后弹出的“独立小窗口”实测几何规格与悬停滑动](#二-搜索输入后弹出的独立小窗口实测几何规格与悬停滑动)
   - [三、 仅截小窗口（零外泄/零干扰）、全粘贴输入铁律与“搜索网络结果”三重防误判](#三-仅截小窗口零外泄零干扰全粘贴输入铁律与搜索网络结果三重防误判)
   - [四、 右上角 `•••` 聊天详情抽屉与“独立用户信息卡片子窗口”二步唯一身份核验链](#四-右上角-聊天详情抽屉与独立用户信息卡片子窗口二步唯一身份核验链)
   - [五、 每次执行前的“动态像素分割线聚类与 7 区拓扑实时划分”机制（彻底告别写死长宽高）](#五-每次执行前的动态像素分割线聚类与-7-区拓扑实时划分机制彻底告别写死长宽高)
   - [六、 已落地的四套可复用脚本清单与标准调用方式](#六-已落地的四套可复用脚本清单与标准调用方式)

---

## 1. 背景与核心问题

在构建 Yance 的本地连接器与桌面执行层时，微信桌面端的 UI 交互是关键落地场景。通用 Computer-Using Agent（CUA）或全屏截图 + 多模态大模型解析方案面临高延迟（秒级）、计算开销大、极易因画面遮挡或抖动失效等缺陷；而直接针对微信进程进行 Hook 或注入 dylib 则属于必封的高危区。

本方案针对以下工程设想与风险进行系统性论证与实现：
#### 1. **轻量化几何感知**：基于 macOS 窗口位置实时换算点击位置，不使用重度 CUA，也不依赖持续录屏/屏幕共享；
#### 2. **局部视觉反馈**：权衡是否需要 OCR、如何以毫秒级开销完成搜索结果与异常弹窗的核验；
#### 3. **风控规避**：深入分析微信客户端底层与服务端行为序列检测，通过高斯落点、贝塞尔曲线滑行、硬件级 Delta 增量注入与对数正态按键延迟，彻底抹除软件合成点击的机械特征。

---

## 2. 第一部分：窗口定位、UI 坐标换算与风控拆解

放弃重度 CUA（Computer-Using Agent）视觉大模型方案，转而采用“窗口坐标实时换算 + 局部轻量级校验”，在 macOS 上不仅是完全可行的，而且在延迟、稳定性和隐蔽性上远优于通用 CUA。

此外，获取微信窗口大小和位置完全不需要走“屏幕共享（虚拟/真实）”，macOS 原生底层接口就能以微秒级开销直接读取窗口几何信息。真正的难点确实如你所虑，在于微信客户端的本地行为采集与服务端风控模型。

### 一、 窗口定位与 UI 坐标换算方案（无需屏幕共享）

在 macOS 上，微信 UI 属于典型的“局部固定锚点 + 弹性工作区”布局。你可以通过组合使用系统级 API 实现高精度的坐标映射：

#### 1. 零画面开销获取窗口位置与尺寸

不需要开启屏幕共享或持续录屏来测算窗口大小。直接调用 CoreGraphics 的 CGWindowListCopyWindowInfo 接口（传入 .optionOnScreenOnly），遍历匹配 kCGWindowOwnerName == "微信"（或 "WeChat"），即可直接拿到 kCGWindowBounds 字典中的 X, Y, Width, Height。

优势：该接口仅读取 WindowServer 的元数据，甚至不需要触发系统的“屏幕录制”权限，CPU 占用几乎为零，可实现毫秒级实时轮询。

#### 2. 相对坐标换算逻辑

拿到窗口左上角原点 
(
𝑊
𝑥
,
𝑊
𝑦
)
(W
x
	​

,W
y
	​

) 和宽高 
(
𝑊
𝑤
,
𝑊
ℎ
)
(W
w
	​

,W
h
	​

) 后，微信绝大部分核心控件不需要缩放比例计算，而是遵循锚点偏移（Anchor Offset）：

固定左上角偏移（与窗口拉大拉小无关）：左侧导航栏（聊天、通讯录图标）、顶部搜索框、搜索结果列表的第一项。它们的点击坐标永远是 
(
𝑊
𝑥
+
Δ
𝑥
,
𝑊
𝑦
+
Δ
𝑦
)
(W
x
	​

+Δx,W
y
	​

+Δy)。

分割线/右侧锚点偏移：聊天输入框、发送按钮、聊天详情（右上角 ...）受窗口总宽度或聊天列表拖拽宽度影响，坐标公式通常为 
(
𝑊
𝑥
+
𝑊
𝑤
−
Δ
𝑥
,
𝑊
𝑦
+
𝑊
ℎ
−
Δ
𝑦
)
(W
x
	​

+W
w
	​

−Δx,W
y
	​

+W
h
	​

−Δy)。

#### 3. 到底需不需要 OCR？

结论：不能纯盲点，必须配合“ROI 局部截图 + 原生轻量 OCR / 模板匹配”。
如果完全不用视觉反馈、纯靠坐标盲点，会遇到两个致命问题（且极易触发风控）：

搜索结果错位：搜索某个用户时，如果带有相同关键字的“群聊”、“功能”或“网络查找”排在了前面，纯坐标点击会点错对象。

异步加载与弹窗阻塞：微信卡顿、断网重连提示或系统弹窗会导致点击落空，引发一连串无效异常操作。

最佳实践方案：
使用 ScreenCaptureKit（macOS 12.3+ 推荐）仅截取搜索下拉列表那一小块区域（例如 
250
×
400
250×400 像素的 ROI），直接喂给 macOS 原生的 Vision 框架（VNRecognizeTextRequest）。

调用 Apple Neural Engine (ANE) 硬件加速，单次局部 OCR 耗时仅 15~30ms。

完全本地运行，无需走 CUA 大模型，既能校验“搜出来的人名对不对”，又能直接拿到该文字块的精确 Bounding Box 中心点进行点击。

### 二、 微信 macOS 端的风控机制拆解

由于你没有采用 Hook/注入（如破坏微信签名、注入 dylib），而是走纯外部系统接口，你已经规避了最致命的客户端内存完整性校验（必封区）。但在外部 UI 自动化层面，微信的风控主要集中在以下三个维度：

风控维度	微信的检测手段	你的方案面临的风险点


#### 1. 系统事件源检测




(客户端底层)

	监听 NSEvent / CGEvent 的底层属性（如 CGEventSourceStateID、事件关联的发送方 PID、硬件 HID 标志位）。	使用 CGEventPost 直接发送的软件合成点击，在系统底层带有明确的软件注入标记，与真实物理触控板/鼠标驱动（IOHIDEvent）产生的事件存在特征差异。


#### 2. 交互生物特征




(客户端遥测上报)

	采集鼠标移动轨迹、点击坐标分布熵、按下与抬起的时间差（Dwell Time）、键盘按键间隔。	高危区：如果每次换算出的坐标都是精确到同一个像素点（如永远点在相对偏移 (120, 45)）、鼠标不经过移动直接“瞬移”点击、按下与抬起间隔为 0ms 或固定常数，极易被标记为自动化脚本。


#### 3. 业务行为序列




(服务端风控核心)

	分析搜索频率、会话切换速度、陌生人/非高频联系人触达速率、操作间隔的周期性。	即使本地点击伪装得再像真人，如果出现“每 3.0 秒精准搜索一个微信号并发送消息”，服务端图计算模型会直接判定为 RPA 营销或爬虫行为。

关于录屏接口的安全性补充：macOS 上的微信无法直接感知是谁在调用 ScreenCaptureKit 截取它的画面（系统级隔离，正规软件如腾讯会议、OBS、CleanShot X 都在调用该接口），因此单纯调用系统截图/录屏接口本身不会触发微信封号。同时，尽量避免高频调用 AXUIElement（辅助功能 API）去遍历微信的 UI 树，因为被控端可以感知到 Accessibility 的高频查询请求。

### 三、 规避风控的工程设计建议

要在基于窗口坐标换算的架构下最大程度降低风控概率，必须在“算出坐标”到“执行动作”之间加入一层拟人化混淆层（Humanization Layer）：

点击坐标高斯随机化（拒绝单点重复）

不要直接点击换算出的中心点 
(
𝑋
,
𝑌
)
(X,Y)。将目标控件定义为一个矩形有效区域 
(
𝑋
,
𝑌
,
𝑊
,
𝐻
)
(X,Y,W,H)，每次点击时，以中心为均值、宽高安全边距为方差，使用二维正态分布（Gaussian Distribution）生成落点，确保每次点击像素都不重合。

补全鼠标移动轨迹与物理耗时

严禁直接发送 leftMouseDown。必须先从当前鼠标位置生成一条贝塞尔曲线（Bézier Curve）并叠加轻微噪声（模拟人手抖动与变速，符合 Fitts's Law 先快后慢），通过连续发送 kCGEventMouseMoved 将光标滑过去，再执行点击。

MouseDown 与 MouseUp 之间必须加入 55ms ~ 135ms 的随机延迟。

搜索与输入的节奏脱敏

定位到搜索框后，不要在 1ms 内完成“点击 -> 粘贴文本 -> 回车”。

模拟人类反应时间：点击搜索框 -> 停顿 200~500ms -> 写入剪贴板并触发 Cmd + V（或分字符模拟按键输入，字间间隔 80~200ms）-> 等待 UI 渲染 400~800ms -> Vision OCR 校验目标名字 -> 移动鼠标点击对应结果。

物理级隔离方案（终极防检测）

如果业务对账号安全要求极高，担心 CGEventPost 的软件合成标志位被微信客户端采集，可以在算出屏幕绝对坐标后，通过串口控制一个十几块钱的 ESP32-S3 或 CH9329 硬件键鼠模块（插在 Mac 的 USB 口上）。由芯片通过物理 USB HID 协议移动光标并点击，在 macOS 内核层面与真实罗技鼠标完全一致，彻底抹除软件自动化痕迹。

---

## 3. 第二部分：CGEvent 底层拟人化鼠标引擎算法与 Swift 实现

在 macOS 上使用 CGEvent 模拟真实人类鼠标操作，核心在于解决四个容易被客户端风控识破的特征：落点机械单一、轨迹线性匀速、按键耗时恒定，以及 CGEvent 底层相对位移字段（Delta）缺失。

下面从数学模型推导到完整的 Swift 工程代码，逐一拆解这套拟人化鼠标引擎的实现。

### 一、 核心算法与数学模型
#### 1. 二维截断高斯分布落点（Box-Muller 变换）

人类点击按钮时，落点会自然聚集在视觉中心附近，越往边缘概率越低，但绝不会每次都点在同一个像素上。
对于矩形控件区域 
(
𝑋
,
𝑌
,
𝑊
,
𝐻
)
(X,Y,W,H)，利用 Box-Muller 变换将两个独立的均匀分布随机数 
𝑈
1
,
𝑈
2
∈
(
0
,
1
]
U
1
	​

,U
2
	​

∈(0,1] 转换为标准正态分布 
𝑍
0
,
𝑍
1
∼
𝑁
(
0
,
1
)
Z
0
	​

,Z
1
	​

∼N(0,1)：

𝑍
0
=
−
2
ln
⁡
𝑈
1
cos
⁡
(
2
𝜋
𝑈
2
)
,
𝑍
1
=
−
2
ln
⁡
𝑈
1
sin
⁡
(
2
𝜋
𝑈
2
)
Z
0
	​

=
−2lnU
1
	​

	​

cos(2πU
2
	​

),Z
1
	​

=
−2lnU
1
	​

	​

sin(2πU
2
	​

)

将控件中心设为均值 
(
𝜇
𝑥
,
𝜇
𝑦
)
(μ
x
	​

,μ
y
	​

)，并将标准差设为 
𝜎
𝑥
=
𝑊
6
,
𝜎
𝑦
=
𝐻
6
σ
x
	​

=
6
W
	​

,σ
y
	​

=
6
H
	​

（遵循 
3
𝜎
3σ 原则，使 99.73% 的落点自然分布在控件内部），最后加上安全边距裁剪（Clamping），防止极小概率的越界误触。

#### 2. 三阶贝塞尔曲线与手部生理弧度

人手以手腕或手肘为支点移动鼠标，轨迹天然带有弧度。使用三阶贝塞尔曲线连接起点 
𝑃
0
P
0
	​

 与终点 
𝑃
3
P
3
	​

：

𝐵
(
𝑡
)
=
(
1
−
𝑡
)
3
𝑃
0
+
3
(
1
−
𝑡
)
2
𝑡
𝑃
1
+
3
(
1
−
𝑡
)
𝑡
2
𝑃
2
+
𝑡
3
𝑃
3
,
𝑡
∈
[
0
,
1
]
B(t)=(1−t)
3
P
0
	​

+3(1−t)
2
tP
1
	​

+3(1−t)t
2
P
2
	​

+t
3
P
3
	​

,t∈[0,1]

控制点 
𝑃
1
,
𝑃
2
P
1
	​

,P
2
	​

 生成策略：在向量 
𝑃
0
𝑃
3
⃗
P
0
	​

P
3
	​

	​

 的 
20
%
∼
40
%
20%∼40% 和 
60
%
∼
80
%
60%∼80% 处取基准点，并沿其法向量（垂直方向）施加随机偏移量，模拟手腕摆动产生的自然弧线。

生理微颤（Micro-tremor）：在轨迹中段叠加 
±
0.5
∼
1.5
 px
±0.5∼1.5 px 的高频高斯噪声，并在接近终点（
𝑡
t 大于 
0.85
0.85）时将噪声衰减至 
0
0，确保最终落点精准。

#### 3. 费茨定律（Fitts's Law）与非对称加减速

总耗时动态计算：鼠标移动耗时不能写死（如固定 500ms），需根据移动距离 
𝐷
D 和目标宽度 
𝑊
W 使用费茨定律计算：

𝑇
=
𝑎
+
𝑏
log
⁡
2
(
𝐷
𝑊
+
1
)
+
𝜖
T=a+blog
2
	​

(
W
D
	​

+1)+ϵ

其中 
𝑎
≈
120
 ms
a≈120 ms（启动反应），
𝑏
≈
110
 ms
b≈110 ms（运动系数），
𝜖
ϵ 为正态随机扰动。

非对称速度曲线（先快后慢）：人类移动鼠标时，前段快速甩动（Ballistic Phase），后段视觉校准缓慢逼近目标（Correction Phase）。将线性时间进度 
𝑢
∈
[
0
,
1
]
u∈[0,1] 映射为非线性的曲线参数 
𝑡
t：

𝑡
(
𝑢
)
=
1
−
(
1
−
𝑢
)
𝑘
,
𝑘
∈
[
2.2
,
3.0
]
t(u)=1−(1−u)
k
,k∈[2.2,3.0]

这样采样点会在终点附近自动加密，完美重现“接近目标时减速瞄准”的生物特征。

#### 4. CGEvent 底层防检测关键细节

许多自动化脚本直接修改 CGEvent 的 location 坐标，却忽略了系统底层的两个关键字段，极易被安全 SDK 捕获：

kCGMouseEventDeltaX 与 kCGMouseEventDeltaY：物理鼠标驱动产生 mouseMoved 事件时，必定携带相对于上一帧的整数位移增量。合成事件若不手动注入这两个字段，其值默认为 0（即“坐标在变，但底层硬件增量为零”的矛盾特征）。

事件源状态（Event Source State）：初始化 CGEventSource 时必须传入 .hidSystemState，使其与全局 HID 硬件输入流的状态表对齐。

### 二、 完整 Swift 实现代码（HumanMouseController）

以下代码可直接集成到 macOS 原生命令行工具或 App 中（需在 系统设置 -> 隐私与安全性 -> 辅助功能 中授予执行程序权限）：

Swift
import Foundation
import CoreGraphics

public final class HumanMouseController {
    
    private let eventSource: CGEventSource?
    /// 模拟物理鼠标 125Hz ~ 250Hz 的轮询回报率 (4ms ~ 8ms 一帧)
    private let baseFrameInterval: Double = 0.006
    
    public init() {
        // 使用 hidSystemState 伪装为系统级硬件输入流状态
        self.eventSource = CGEventSource(stateID: .hidSystemState)
    }
    
    // MARK: - 1. 二维截断高斯分布生成随机落点
    
    /// 根据目标控件矩形区域生成符合人类习惯的高斯随机点击坐标
    /// - Parameters:
    ///   - rect: 目标控件的屏幕绝对坐标 (CGWindowList 坐标系，左上角为原点)
    ///   - safeMarginRatio: 边缘安全内缩比例（默认保留 15% 边距不点击）
    public func gaussianTargetPoint(in rect: CGRect, safeMarginRatio: CGFloat = 0.15) -> CGPoint {
        let centerX = rect.midX
        let centerY = rect.midY
        
        // 3σ 覆盖 99.7% 区域，故将 σ 设为有效半宽度的 1/3（即总宽高的 1/6）
        let sigmaX = (rect.width * (1.0 - safeMarginRatio * 2)) / 6.0
        let sigmaY = (rect.height * (1.0 - safeMarginRatio * 2)) / 6.0
        
        let (z0, z1) = boxMullerRandom()
        
        let rawX = centerX + CGFloat(z0) * sigmaX
        let rawY = centerY + CGFloat(z1) * sigmaY
        
        // 边界截断 (Clamping)，防止极小概率飞出按钮外
        let minX = rect.minX + rect.width * safeMarginRatio
        let maxX = rect.maxX - rect.width * safeMarginRatio
        let minY = rect.minY + rect.height * safeMarginRatio
        let maxY = rect.maxY - rect.height * safeMarginRatio
        
        return CGPoint(
            x: min(max(rawX, minX), maxX),
            y: min(max(rawY, minY), maxY)
        )
    }
    
    /// Box-Muller 变换生成一对标准正态分布随机数 N(0, 1)
    private func boxMullerRandom() -> (Double, Double) {
        let u1 = Double.random(in: Double.ulpOfOne...1.0)
        let u2 = Double.random(in: 0.0...1.0)
        let mag = sqrt(-2.0 * log(u1))
        let z0 = mag * cos(2.0 * .pi * u2)
        let z1 = mag * sin(2.0 * .pi * u2)
        return (z0, z1)
    }
    
    // MARK: - 2. 贝塞尔曲线拟人化移动
    
    /// 将鼠标从当前位置沿拟人化贝塞尔曲线平滑移动至目标点
    public func moveHumanLike(to target: CGPoint, targetWidth: CGFloat = 40.0) {
        let start = currentMouseLocation()
        let dx = target.x - start.x
        let dy = target.y - start.y
        let distance = hypot(dx, dy)
        
        // 距离小于 2 像素直接微调，无需生成长轨迹
        if distance < 2.0 {
            postMouseMove(to: target, deltaX: Int64(dx.rounded()), deltaY: Int64(dy.rounded()))
            return
        }
        
        // 1. 基于 Fitts's Law 计算动态移动总耗时 (秒)
        let fittsIndex = log2(Double(distance / max(targetWidth, 10.0)) + 1.0)
        let baseDuration = 0.12 + 0.105 * fittsIndex
        let jitter = Double.random(in: -0.025...0.035)
        let totalDuration = max(0.08, baseDuration + jitter)
        
        // 2. 构建带手腕弧度偏移的三阶贝塞尔控制点 P1, P2
        let (p1, p2) = generateControlPoints(from: start, to: target, distance: distance)
        
        // 3. 计算采样步数与非对称减速指数 k
        let steps = max(Int(totalDuration / baseFrameInterval), 12)
        let easeExponent = Double.random(in: 2.2...2.8) // 指数越大，末端减速瞄准越明显
        
        var lastPoint = start
        
        for step in 1...steps {
            let u = Double(step) / Double(steps)
            // 非线性时间重映射：初段快，末段慢 (Ease-Out)
            let t = 1.0 - pow(1.0 - u, easeExponent)
            
            var currentPos = cubicBezier(t: CGFloat(t), p0: start, p1: p1, p2: p2, p3: target)
            
            // 在轨迹前 85% 叠加生理微颤噪声，末端收敛为 0 确保精准命中
            if u < 0.85 {
                let (nx, ny) = boxMullerRandom()
                let tremorScale = CGFloat(1.0 - u) * 0.8
                currentPos.x += CGFloat(nx) * tremorScale
                currentPos.y += CGFloat(ny) * tremorScale
            }
            
            // 计算整数相对位移 Delta，补全底层 HID 特征
            let stepDeltaX = Int64((currentPos.x - lastPoint.x).rounded())
            let stepDeltaY = Int64((currentPos.y - lastPoint.y).rounded())
            
            postMouseMove(to: currentPos, deltaX: stepDeltaX, deltaY: stepDeltaY)
            lastPoint = currentPos
            
            // 帧间微秒级休眠，加入 ±15% 的时钟抖动防止固定周期特征
            let frameSleep = (totalDuration / Double(steps)) * Double.random(in: 0.85...1.15)
            usleep(useconds_t(frameSleep * 1_000_000))
        }
        
        // 确保最后一帧精确落在目标点
        let finalDx = Int64((target.x - lastPoint.x).rounded())
        let finalDy = Int64((target.y - lastPoint.y).rounded())
        if finalDx != 0 || finalDy != 0 {
            postMouseMove(to: target, deltaX: finalDx, deltaY: finalDy)
        }
    }
    
    /// 生成带有随机法向弧度的贝塞尔控制点
    private func generateControlPoints(from start: CGPoint, to end: CGPoint, distance: CGFloat) -> (CGPoint, CGPoint) {
        let dx = end.x - start.x
        let dy = end.y - start.y
        
        // 单位法向量 (-dy, dx) / distance
        let normX = -dy / distance
        let normY = dx / distance
        
        // 弧度偏移幅度：距离的 8% ~ 22%，随机决定向左侧还是右侧弯曲
        let arcDirection: CGFloat = Bool.random() ? 1.0 : -1.0
        let spread1 = distance * CGFloat.random(in: 0.08...0.22) * arcDirection
        // P2 可同侧弯曲（C型弧线）或轻微反向（S型微调弧线）
        let sCurveFactor: CGFloat = (Double.random(in: 0...1) < 0.75) ? 1.0 : -0.4
        let spread2 = distance * CGFloat.random(in: 0.05...0.16) * arcDirection * sCurveFactor
        
        let t1 = CGFloat.random(in: 0.20...0.38)
        let t2 = CGFloat.random(in: 0.62...0.82)
        
        let p1 = CGPoint(
            x: start.x + dx * t1 + normX * spread1,
            y: start.y + dy * t1 + normY * spread1
        )
        let p2 = CGPoint(
            x: start.x + dx * t2 + normX * spread2,
            y: start.y + dy * t2 + normY * spread2
        )
        return (p1, p2)
    }
    
    /// 三阶贝塞尔曲线插值计算
    private func cubicBezier(t: CGFloat, p0: CGPoint, p1: CGPoint, p2: CGPoint, p3: CGPoint) -> CGPoint {
        let u = 1.0 - t
        let tt = t * t
        let uu = u * u
        let uuu = uu * u
        let ttt = tt * t
        
        let x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x
        let y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
        return CGPoint(x: x, y: y)
    }
    
    // MARK: - 3. 真实物理时延点击
    
    /// 在目标矩形控件内执行完整的“拟人移动 + 停顿瞄准 + 真实按压时长点击”
    public func humanClick(in targetRect: CGRect, doubleClick: Bool = false) {
        // 1. 计算高斯随机落点
        let targetPoint = gaussianTargetPoint(in: targetRect)
        
        // 2. 平滑移动鼠标过去
        moveHumanLike(to: targetPoint, targetWidth: targetRect.width)
        
        // 3. 到达目标后的视觉确认微停顿 (Pre-click pause: 35ms ~ 95ms)
        let preClickPause = generateLogNormalDelay(medianMs: 55.0, sigma: 0.25, minMs: 30.0, maxMs: 120.0)
        usleep(useconds_t(preClickPause * 1000))
        
        // 4. 执行点击（含真实按压驻留耗时 Dwell Time）
        performClickAt(point: targetPoint, clickCount: 1)
        
        if doubleClick {
            // 双击间隔：人类通常在 90ms ~ 165ms 之间
            let interClickDelay = generateLogNormalDelay(medianMs: 115.0, sigma: 0.2, minMs: 85.0, maxMs: 180.0)
            usleep(useconds_t(interClickDelay * 1000))
            performClickAt(point: targetPoint, clickCount: 2)
        }
    }
    
    private func performClickAt(point: CGPoint, clickCount: Int64) {
        guard let downEvent = CGEvent(
            mouseEventSource: eventSource,
            mouseType: .leftMouseDown,
            mouseCursorPosition: point,
            mouseButton: .left
        ), let upEvent = CGEvent(
            mouseEventSource: eventSource,
            mouseType: .leftMouseUp,
            mouseCursorPosition: point,
            mouseButton: .left
        ) else { return }
        
        // 设置连击计数状态（双击时第二次必须为 2，否则 macOS 控件不识别为双击）
        downEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
        upEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
        
        downEvent.post(tap: .cghidEventTap)
        
        // 模拟微动开关物理按压与回弹耗时 (Dwell Time: 对数正态分布，中位数约 78ms)
        let dwellTimeMs = generateLogNormalDelay(medianMs: 78.0, sigma: 0.22, minMs: 52.0, maxMs: 145.0)
        usleep(useconds_t(dwellTimeMs * 1000))
        
        upEvent.post(tap: .cghidEventTap)
    }
    
    /// 生成对数正态分布延迟（符合人类神经反应时间的偏态分布特征：有生理下限、偶有长尾）
    private func generateLogNormalDelay(medianMs: Double, sigma: Double, minMs: Double, maxMs: Double) -> Double {
        let (z, _) = boxMullerRandom()
        let mu = log(medianMs)
        let sample = exp(mu + sigma * z)
        return min(max(sample, minMs), maxMs)
    }
    
    // MARK: - 4. 底层 CGEvent 辅助方法
    
    private func postMouseMove(to point: CGPoint, deltaX: Int64, deltaY: Int64) {
        guard let moveEvent = CGEvent(
            mouseEventSource: eventSource,
            mouseType: .mouseMoved,
            mouseCursorPosition: point,
            mouseButton: .left
        ) else { return }
        
        // 核心防检测：注入底层硬件位移增量字段
        moveEvent.setIntegerValueField(.mouseEventDeltaX, value: deltaX)
        moveEvent.setIntegerValueField(.mouseEventDeltaY, value: deltaY)
        
        moveEvent.post(tap: .cghidEventTap)
    }
    
    private func currentMouseLocation() -> CGPoint {
        return CGEvent(source: nil)?.location ?? .zero
    }
}

### 三、 接入微信窗口换算的调用示例

结合你现有的微信窗口坐标换算逻辑，调用方式非常直观：

Swift
let mouse = HumanMouseController()

// 假设通过 CGWindowListCopyWindowInfo 拿到了微信主窗口 Bounds
let wechatWindowOrigin = CGPoint(x: 100, y: 120)

// 1. 换算顶部“搜索框”的矩形区域（相对左上角偏移 x: 85, y: 32, 宽: 150, 高: 26）
let searchBarRect = CGRect(
    x: wechatWindowOrigin.x + 85,
    y: wechatWindowOrigin.y + 32,
    width: 150,
    height: 26
)

// 2. 执行拟人移动与点击（自动完成：贝塞尔滑行 -> 减速瞄准 -> 高斯落点 -> 对数正态按压）
mouse.humanClick(in: searchBarRect)

### 四、 进一步规避风控的实战调优建议

为什么按键延迟用“对数正态分布（Log-Normal）”而不是均匀随机？
人类肌肉按压微动开关受生理极限约束，不可能快于 40ms，大部分集中在 65ms ~ 95ms，但偶尔会因为手指停顿出现 120ms+ 的长尾。均匀分布（如 random(50...150)）在统计直方图上是平顶的，客户端收集几十次点击做一次 K-S 检验（Kolmogorov-Smirnov test） 就能识破。对数正态分布则能完美拟合人类生物特征。

微信窗口失焦状态下的“首次点击激活”问题
如果微信当前处于后台非激活状态（Inactive），真实用户会先将窗口切到前台，或者第一下点击同时触发窗口激活。为了防止微信检测“后台窗口直接收到精准控件点击”，建议在执行业务点击前，先通过 NSRunningApplication(processIdentifier: wechatPID)?.activate() 唤醒窗口，并等待 150ms ~ 300ms 模拟人眼聚焦时间。

操作完后的“光标移开/静置”习惯
真人在点击完“发送”或输入文字期间，手偶而会无意识地把鼠标往旁边挪开一点，或者保持绝对静止，切忌在每次操作完成后把鼠标瞬移回屏幕固定角落（如 (0, 0)）。

完成鼠标轨迹层后，你可以继续完善以下配套环节：
实现拟人化键盘输入与剪贴板安全上屏
获取微信窗口位置与局部 OCR 校验代码
了解 ESP32-S3 硬件级 HID 物理键鼠方案

---

## 4. 第三部分：第三方驱动（cua-driver）的隐私、风控雷区与能力复用评估

cua-driver（trycua/cua 旗下的开源跨平台底层驱动）无论是从数据隐私（Telemetry 遥测）还是从微信反自动化风控（隐蔽性隐患）来看，直接拿来开箱即用都有非常明显的雷区；同时，它的窗口感知、OCR、直接点击三个模块对微信场景的适配度差异极大，绝不能全盘直接调用。   
ClawDrop

### 一、 cua-driver 的两大核心隐患
#### 1. 数据隐私与本地留痕隐患

默认开启远端遥测（Telemetry）：cua-driver 上游版本默认启用了基于 PostHog 的匿名使用数据上报。虽然官方声明仅上报工具调用频次与环境元数据（不包含截图、键入文本、文件路径或窗口标题），但在自动化敏感业务中，任何默认外联行为都属于隐患。   
Nous Research

规避方式：若要使用，必须先在终端执行 cua telemetry off，或在环境变量中強制注入 DO_NOT_TRACK=1 与 CUA_TELEMETRY=0。

本地轨迹审计录制（Trajectory & History）：cua-driver 支持记录操作前后的屏幕截图作为审计日志（Trajectory Recording）以及本地加密的操作历史（Computer History）。在生产环境中必须确保关闭录制功能，避免在本地磁盘堆积大量微信聊天界面的快照。   
GitHub
+ 1

#### 2. 微信风控层面的“致命暴露”（核心隐患）

cua-driver 在 macOS 上最大的卖点是 “Background Mode（后台免打扰模式）”——即不抢占你的物理鼠标、不把目标窗口切到前台，就能在后台完成点击和输入。为了实现这个特性，它在 macOS 底层做了一系列对微信风控来说极其高危的操作：   
ClawDrop

私有 SkyLight.framework 事件直投：在后台模式下，cua-driver 绕过了标准的 HID 硬件事件流（No HID event tap, no cursor warp），通过 macOS 私有的 SkyLight SPI 直接向目标进程塞入合成点击事件，并在底层强行翻转 AppKit 的激活状态（Active-state）而不真正唤起窗口。微信客户端一旦检测到“窗口处于后台非焦点状态，却持续收到精准的内部点击事件”，几乎可以 100% 判定为自动化脚本。

无障碍树（AX-Tree）高频嗅探：cua-driver 的感知核心依赖读取 macOS 的 Accessibility Tree（无障碍树）来生成控件句柄（Element Ref）。高频触发 AXUIElement 查询不仅容易被客户端感知，而且对于微信这种包含大量自绘 UI 的应用，返回的大多是无意义的匿名框。   
Cua
+ 1

显眼的守护进程签名：安装后它会在后台常驻 CuaDriver.app（Bundle ID 为 com.trycua.driver）守护进程。如果风控策略扫描系统辅助功能授权列表或进程树，这类知名 Agent 驱动的固定标识极易被特征库命中。

### 二、 窗口感知、OCR、直接点击能否直接复用？

将 cua-driver 的能力拆开来看，针对微信自动化的复用评估如下：

| 模块功能 | cua-driver 底层实现机制 | 能否用于微信？ | 风险评估与替代方案 |
| --- | --- | --- | --- |
| **窗口几何感知** (位置/尺寸/截图) | 窗口枚举 + ScreenCaptureKit 后台独立窗口截图 | 可以复用源码思路 (不建议直接跑守护进程) | 获取窗口 Bounds 和单窗口截图本身安全，但建议直接用 Swift 原生 `CGWindowListCopyWindowInfo` 实现（不到 30 行），无需挂载整个守护进程。 |
| **OCR 文字识别** | 独立扩展 cua-perception（ONNX Runtime + PP-OCR + OmniParser） | 能用，但舍近求远 | 跨平台 PaddleOCR 依赖较重；macOS 原生 `Vision.framework` 直接调用 ANE 硬件加速，零外部依赖且速度极快。 |
| **窗口元素感知** (AX-Tree 快照) | 遍历系统 Accessibility 树生成元素坐标与引用 | 严禁用于微信 | 极易暴露自动化意图，且微信包含大量自绘 UI，返回多为匿名框。应坚持相对坐标换算 + 局部图像 OCR。 |
| **直接点击/输入** (Direct Click) | SkyLight 私有 API 进程直投，或瞬移无轨迹点击 | 绝对不能复用 | 为 AI 效率设计，缺乏人类生物特征（无贝塞尔轨迹、无高斯落点、无真实按压时长），直接调用易触发行为风控。 |
### 三、 架构取舍与落地建议

如果你看中了 cua-driver 现成的工程封装，想节省开发时间，最安全的做法是“扒代码思路，不跑它的二进制 Daemon”：   
ClawDrop

剥离后台免打扰幻想，坚持前台拟人交互
不要尝试在后台静默点击微信。微信在正常人类使用场景下，必定是先处于前台激活状态（Active）、真实光标滑入窗口区域、随后产生包含硬件增量（mouseEventDeltaX/Y）的点击。如果为了“不耽误自己用电脑”而需要后台运行，正确做法是利用 macOS 的 Apple Virtualization.framework（例如可以使用同属 Cua 生态但仅负责虚拟机的开源工具 Lume）起一个独立的本地轻量级 macOS 虚拟机，在虚拟机内部跑前台全真模拟。   
ClawDrop

用 macOS 原生 Vision 替代 cua-perception 的 OCR
在 macOS 上做局部 OCR 校验（比如校验微信搜索框下拉列表的第一个名字是不是目标用户），加上 ScreenCaptureKit 截图总共只需几十行 Swift 代码：   
cua.ai

截取搜索结果区域 
(
𝑊
𝑥
+
Δ
𝑥
,
𝑊
𝑦
+
Δ
𝑦
,
220
,
300
)
(W
x
	​

+Δx,W
y
	​

+Δy,220,300) 的 CGImage；

喂给 VNRecognizeTextRequest（设置 .accurate 模式并开启 recognitionLanguages = ["zh-Hans", "en-US"]）；

从返回的 VNRecognizedTextObservation 中读取 boundingBox，直接换算出目标用户名在屏幕上的精确矩形 CGRect。

点击执行层必须接管为我们自定义的 HumanMouseController
拿到上述 OCR 算出的 CGRect（或基于窗口左上角换算出的固定按钮 CGRect）后，不要调用任何第三方驱动的 click(x, y)，而是直接传入上一轮构建的 humanClick(in: targetRect) 方法，确保每一次交互都具备完整的“贝塞尔加减速滑行 → 视觉确认微停顿 → 二维高斯随机落点 → 对数正态按压抬起”全链路生物特征。   
ClawDrop

如果你想直观了解该驱动在 macOS 后台投递输入时的实际表现及其默认开启的遥测状态，可以参考 Cua Driver 在真实 Mac 上的本地测试与隐私实测，视频中演示了其后台无焦点输入的机制并专门提醒了默认遥测的隐私设置问题。   
YouTube

Cua Driver: Open-Source Computer Use, Tested on a Real Mac
TechWealth Hub · 384 次观看

---

## 5. 第四部分：微信 4.x 实测几何归档——可调分割线免疫、左上角独立搜索小窗口与防误判机制

针对 macOS 微信 4.x 实际运行环境的进一步实测（对应脚本 `scripts/wechat-window-locator.swift`、`scripts/wechat-roi-ocr.swift` 与 `scripts/wechat-human-input.swift`），归档以下核心工程事实、小窗口尺寸细节与防误判规范：

### 一、 为什么左侧列表调宽与底部输入框调高不影响左上角定位？

通过对微信主窗口（`942 × 639 pt`）在**“状态 A（初始常规态）”**、**“状态 B（列表最大宽度 + 聊天区最小宽度 + 输入框最大高度）”**与**“状态 C（列表最小宽度 + 聊天视口最小高度）”**三种极值状态下的实测，得到完整的横纵向几何约束矩阵：

| 测量维度 | 状态 A（常规态） | 状态 B（列表拉到最宽） | 状态 C（列表压到最窄） | 极值物理定律与自动化不变量 |
| --- | --- | --- | --- | --- |
| **左侧导航栏 (`navWidth`)** | `60.0 pt` | `60.0 pt` | **`60.0 pt`** | **绝对常数 `60.0 pt`**，不可缩放。 |
| **会话列表分割线 (`sessionListRightX`)** | `293.0 pt`<br>(`listWidth = 233`) | **`549.0 pt`**<br>(`maxListWidth = 489`) | **`220.0 pt`**<br>(**`minListWidth = 160.0`**) | 1. **会话列表最小宽度硬限制：`minListWidth = 160.0 pt`**（分割线最左停在 `x = 60 + 160 = 220.0 pt`）；<br>2. **右侧聊天区最小宽度硬限制：`minChatAreaWidth = 393.0 pt`**（分割线最右停在 `x = Ww - 393.0 pt`）；<br>3. 因此列表宽度动态范围为 **`[160.0, Ww - 453.0]`**。 |
| **右侧聊天标题栏底边 (`chatHeaderBottomY`)** | `51.0 pt` | `51.0 pt` | **`51.0 pt`** | **绝对常数 `51.0 pt`**，不可缩放。 |
| **输入框顶分割线 (`chatInputTopY`)** | `463.0 pt`<br>(`视口=412, 输入框=176`) | **`285.0 pt`（最高极限）**<br>(`minChatHistoryHeight = 234.0`<br>`maxInputHeight = 354.0`) | **`546.0 pt`（最低极限）**<br>(**`minInputHeight = 93.0`**<br>**`maxChatHistoryHeight = 495.0`**) | 1. **聊天视口最小高度：`minChatHistoryHeight = 234.0 pt`**（分割线最高拉到 `y = 51 + 234 = 285.0 pt`，剩余为最大输入框高 `Wh - 285.0 pt`）；<br>2. **底部输入框最小高度：`minInputHeight = 93.0 pt`**（分割线最低压到 `y = Wh - 93.0 = 546.0 pt`，此时聊天视口达到最大高度 `maxChatHistoryHeight = Wh - 51.0 - 93.0 = Wh - 144.0 pt`）；<br>3. **右下角绝对恒定打字点击热区 `(Ww - 350, Wh - 78, 250×26)`**：由于 `minChatAreaWidth = 393pt` 且 `minInputHeight = 93pt`，无论两条分割线处于什么位置，该矩形 **100% 永远处于文本编辑区内部**。 |
| **搜索弹出独立小窗口 (`kCGWindowLayer = 3`)** | `dX=+48, dY=+35`<br>高 `613 pt` | `dX=+48, dY=+35`<br>**宽 `511.0 pt` × 高 `613.0 pt`** | `dX=+48, dY=+35`<br>**最小宽 `368.0 pt` × 高 `613.0 pt`** | 1. 左上角相对主窗口偏移恒定为 **`(+48.0, +35.0)`**；<br>2. 小窗口具有保底最小宽度 **`minPopupWidth = 368.0 pt`**（即使列表压窄到 `160pt`，小窗口也保持 `368pt` 宽以确保搜索结果完整可读），并随列表拉宽最大延展至 `listWidth + 22pt`（如 `511pt`）。 |

因此，在微信桌面端中，虽然**左侧会话列表宽度（`listWidth`）**与**底部输入框高度（`inputHeight`）**均可由用户手动拖拽调整，但以下四大关键交互锚点对分割线拖拽 **100% 免疫**：

| 锚点名称 | 坐标基准 | 相对偏移与尺寸 (`pt`) | 为什么不受分割线拖拽影响？ |
| --- | --- | --- | --- |
| **左侧导航栏图标** | 主窗口左上角 `(Wx, Wy)` | `navWidth = 60`（恒定）<br>头像 `(12, 50, 36×36)`<br>聊天/通讯录/收藏/朋友圈 `x=18, y=110 + 48k (24×24)` | 最左侧导航栏宽度固定为 `60pt`，不可拖拽缩放。 |
| **左上角搜索框安全触发区** | 主窗口左上角 `(Wx, Wy)` | `relX = 74, relY = 16, w = 68, h = 24`<br>（中心点 `Wx + 108, Wy + 26`，或直接快捷键 `Cmd+F`） | 实测会话列表最小宽度为 `160pt`（此时分割线在 `x=220pt`，`+` 号按钮在 `x≈190pt`）。将搜索点击热区收敛在 `[74..142]`，即使列表压到最窄也绝不会误触右侧 `+` 号按钮。 |
| **搜索结果弹出小窗口** | 主窗口左上角 `(Wx, Wy)` | 独立子窗口 `kCGWindowLayer = 3`<br>左上角偏移恒为 `dX = +48, dY = +35`<br>**宽度与左侧聊天列表宽度近似联动** | 输入搜索词后弹出的下拉浮层是 WindowServer 层的独立子窗口（`layer == 3`）。虽然其宽度随左侧会话列表宽度变化，但**其左上角锚点偏移 `(+48, +35)` 与内部左对齐坐标（头像 `x=36`、标题 `x=80`）固定不变**，且其真实动态宽高 `(pw, ph)` 可直接从 `kCGWindowLayer == 3` 元数据零开销实时读取。 |
| **右下角发送按钮** | 主窗口右下角 `(Wx + Ww, Wy + Wh)` | `relX = Ww - 76, relY = Wh - 42, w = 54, h = 24` | 微信 4.x 采用圆角输入卡片：文本编辑区在卡片上层，而表情/文件工具栏与 `发送` 按钮锚定在卡片**右下角**，仅取决于主窗口总宽高 `(Ww, Wh)`，与输入框拉多高无关。 |

### 二、 搜索输入后弹出的“独立小窗口”实测几何规格与悬停滑动

当向左上角搜索框粘贴内容后，`CGWindowListCopyWindowInfo` 实测捕获到微信进程动态创建的独立浮层子窗口：

1. **WindowServer 窗口属性**：
   - `kCGWindowOwnerName`: `"微信"`（与主窗口共享同一个 `kCGWindowOwnerPID`）
   - `kCGWindowLayer`: **`3`**（主窗口 `kCGWindowLayer` 为 `0`，可通过 `layer == 3` 唯一精确锁定该搜索小窗口）
   - **相对主窗口左上角偏移**：**`dX = +48.0 pt, dY = +35.0 pt`**（即 `PopupX = Wx + 48.0`, `PopupY = Wy + 35.0`）
   - **小窗口动态宽高规律**：小窗口宽度**不是固定常数**，而是与左侧聊天列表宽度近似联动（实测样本下为 `Width = 511.0 pt, Height = 613.0 pt`）。由于它是独立的 `Layer = 3` 子窗口，脚本无需写死宽度，直接通过 `CGWindowListCopyWindowInfo` 读取 `layer == 3` 窗口的实时 `kCGWindowBounds`（`pw, ph`）即可获得 100% 精确的当前尺寸。
   - **焦点生命周期**：该 `Layer = 3` 小窗口仅在微信保持前台焦点且搜索框处于激活状态时存在；一旦按 `Escape`、点击搜索结果项或微信失去前台焦点，该子窗口立即销毁。

2. **小窗口内部结构与分组坐标网格（均以小窗口自身左上角 `PopupOrigin = (Wx + 48, Wy + 35)` 为 `(0, 0)` 原点）**：

| 内部元素 | 小窗口内相对坐标 (`pt`) | 实测几何规律说明 |
| --- | --- | --- |
| **白色圆角卡片内边距** | `x: 20..(pw - 20), y: 8..(ph - 20)` | 四周带透明毛玻璃阴影，有效内容区宽度为 `pw - 40 pt`。 |
| **三大核心业务分组栏** (`联系人` / `群聊` / `聊天记录`) | `x = 36.0, h = 12.0`<br>实测样本：`[联系人]` `y = 19.0`、`[群聊]` `y = 181.0`、`[聊天记录]` `y = 405.0` | 分组标题严格左对齐于 `x = 36.0 pt`，作为纵向区间分界线，将下方识别出的条目归入 `contacts`、`groups` 或 `chat_history`。 |
| **结果项头像槽位** | `x: 36.0..68.0` (`32 × 32 pt`) | 真实联系人与群聊左侧必有 `32 × 32 pt` 头像。 |
| **结果项主标题（人名/群名）** | **`x = 75.0 ~ 80.0, h = 14.5 ~ 15.0`**<br>首条联系人固定在 **`(x: 80.0, y: 64.6)`** | 所有联系人与群聊名称统一左对齐于 `x ≈ 80.0 pt`；安全点击行框随小窗口实时宽度 `pw` 动态换算为 `(x: 36, y: 主标题Y - 8, w: pw - 72, h: 42)`。 |
| **结果项副标题** (`包含: xxx` / 摘要) | `x = 76.0 ~ 80.0, y = 主标题Y + 24.0, h = 13.0` | 位于主标题正下方 `+24.0 pt` 处。 |
| **相邻结果行垂直步长 (Row Stride)** | **`ΔY = 64.0 pt`** | 实测群聊区连续三项主标题 `y` 分别为 `216.0 -> 280.0 -> 344.0`，步长精确恒定为 `64.0 pt`。 |
| **【高危】搜索网络结果区块** | 标题 `x = 57.0, y = 113.9`<br>词条 `Q <搜索词>` `x = 38.0, y = 146.9` | 夹在 `[联系人]` 与 `[群聊]` 之间，且直接回显一模一样的搜索词（如 `🔍 测试联系人A`），极易诱发普通 OCR 误判。 |
| **聊天记录右侧日期** | `x = (pw - 92.0) ~ (pw - 35.0)` | 仅出现在 `[聊天记录]` 分组下，随小窗口实时宽度 `pw` 右对齐于 `pw - 35.0 pt`。 |

3. **小窗口悬停与平滑滚动机制（`--scroll-popup`）**：
   - 搜索小窗口（实时宽高 `pw × ph`）内部支持独立纵向滚动（当联系人、群聊或聊天记录较多，或展开更多结果时）；
   - **关键约束**：发送滚轮事件前，必须先通过 `HumanInputController` 将鼠标光标沿贝塞尔轨迹平滑移入小窗口内部动态比例悬停区 `(PopupX + 0.25*pw .. PopupX + 0.70*pw, PopupY + 0.22*ph .. PopupY + 0.67*ph)`，停顿 `90~240ms` 后再分多帧发送 `.pixel` 级 `scrollWheelEvent2Source` 脉冲，否则滚轮事件会落空到后方主窗口的会话列表或聊天记录上。

### 三、 仅截小窗口（零外泄/零干扰）、全粘贴输入铁律与“搜索网络结果”三重防误判

1. **硬件级子窗口单截（`screencapture -l <popupWindowId> -o -x`）**：
   - 在搜索框输入内容后，直接按 `popupWindowId` 捕获 `kCGWindowLayer == 3` 的独立子窗口（系统自动按该子窗口当前实际宽高 `pw × ph` 裁剪，无需写死宽度）；
   - 截图文件中**只包含搜索小窗口本身**，绝不显示或保存小窗口以外的右侧聊天记录、会话列表或桌面背景，彻底消除背景文字对 OCR 的干扰。

2. **微信内全量输入采用剪贴板粘贴铁律（`NSPasteboard` + `Cmd+V`）**：
   - 无论是左上角搜索框输入联系人关键词，还是右下角聊天输入框填入回复草稿，**一律采用剪贴板写入 + 拟人反应停顿（`160~420ms`）+ `Cmd+V`（对数正态按压驻留 `52~130ms`）**，严禁逐字合成键盘事件（彻底规避 macOS 中文输入法候选框拦截与机械打字频率特征）。

3. **严防“搜索网络结果”与副标题误判的三重几何+语义门禁**：
   - **门禁 A（纵向分组区间硬隔离）**：扫描 `x < 70pt` 的分组标题，将 `[y(搜索网络结果), y(下一分组如群聊/聊天记录))` 整个纵向区间标记为 `web_search_FORBIDDEN`，落入该区间的任何同名文本一律拒绝点击；
   - **门禁 B（头像缩进 X 轴硬校验）**：真实联系人与群聊左侧必有 `32 × 32 pt` 头像，其主标题起点必满足 **`relX ∈ [72.0, 95.0] pt`**；而“搜索网络结果”下的放大镜回显词条（如 `Q 测试联系人A`）起点位于 **`relX ≈ 38.0 pt`**，直接从几何坐标上秒拒；
   - **门禁 C（主标题与副标题分离）**：自动剔除前缀为 `包含:`、`共N条相关聊天记录` 或位于某条主标题正下方 `+18 ~ +30 pt` 处的第二行灰字摘要，确保 `clickableContacts` 与 `clickableGroups` 仅返回 100% 安全的首行主标题点击框。

### 四、 右上角 `•••` 聊天详情抽屉与“独立用户信息卡片子窗口”二步唯一身份核验链

在不读取微信数据库、不调用 `AXUIElement` 无障碍树的前提下，如何获取联系人的**唯一不可变 `微信号`（解决同名/同备注好友冲突）**以及完整的个人档案（昵称、备注、电话、标签、描述、地区、个性签名、来源）？实测验证了一条 **100% 免疫分割线拖拽的右上角二步几何链路**：

1. **第一步：点击右上角 `•••` 展开固定宽度聊天信息抽屉**：
   - **触发坐标**：右上角 `•••` 按钮恒定位于主窗口右上角偏移 **`(relX: Ww - 46, relY: 16, w: 28, h: 28)`**（中心点 `(Wx + Ww - 32, Wy + 26)`）；
   - **抽屉精确宽度**：点击后，主窗口右侧内嵌滑出聊天信息抽屉，实测在 `Ww = 941.0 pt` 下抽屉左分割线位于 `x = 686.0 pt`，即**抽屉固定宽度恒为 `W_drawer = 941.0 - 686.0 = 255.0 pt`**（仅锚定于主窗口右边界 `Wx + Ww`）；
   - **抽屉内部元素固定右偏移（相对于主窗口右边界 `Ww`）**：
     - **当前联系人头像（`36 × 36 pt`）**：**`relX = Ww - 237.0, relY = 66.0, w = 36.0, h = 36.0`**（中心点恒为 **`(Wx + Ww - 219.0, Wy + 84.0)`**，下方人名标签位于 `relY = 109.0`）；
     - **`+ 添加` 按钮（`36 × 36 pt`）**：`relX = Ww - 187.0, relY = 66.0`（中心点 `Wx + Ww - 169.0, Wy + 84.0`）；
     - **`查找聊天内容 >`**：`relX = Ww - 241.0, relY = 159.9`；
     - **`消息免打扰` / `置顶聊天`**：`relY = 210.8` / `relY = 244.7`；
     - **`清空聊天记录`**：`relX = Ww - 164.0, relY = 296.0`。

2. **第二步：点击抽屉内联系人头像 `(Wx + Ww - 219, Wy + 84)` 弹出“独立用户信息卡片子窗口”**：
   - 点击头像后，`CGWindowListCopyWindowInfo` 实测捕获到微信进程创建的**独立用户信息子窗口**（拥有独立 `kCGWindowNumber`，可通过 `screencapture -l <cardWindowId> -o -x` **零背景干扰独立单截**）；
   - **用户信息子窗口固定尺寸**：**`Width = 328.0 pt, Height = 640.0 pt`**（Retina 2x 下为 **`656 × 1280 px`**）；
   - **子窗口内部左-右双列键值网格（以 `328 × 640 pt` 卡片左上角为 `(0, 0)` 原点，实测 OCR 耗时 `359ms`）**：

| 区块 | 字段名 / 元素 | 卡片内相对坐标 (`pt`) | 实测提取示例与几何规律 |
| --- | --- | --- | --- |
| **顶部身份区** | 大头像 | `x: 44..108, y: 48..112` (`64×64`) | 位于卡片左上角 |
| **顶部身份区** | 主显示名 + 性别/星标 | `x = 123.0, y = 54.6, h = 16.7` | 粗体大字（如 `测试联系人C`） |
| **顶部身份区** | **`昵称：`** | `x = 124.0, y = 82.0, h = 14.0` | 原始微信昵称 |
| **顶部身份区** | **`微信号：`**（唯一主键） | **`x = 123.0, y = 102.0, h = 11.0`** | 如 `微信号：wx_custom_id_01`（置信度 `1.00`，100% 解决同名联系人消歧） |
| **顶部身份区** | **`地区：`** | `x = 123.0, y = 118.9, h = 13.3` | 如 `地区：南极洲` |
| **朋友资料区** (`y=170`) | 左列标签 (`备注`/`电话`/`标签`/`描述`) | **严格左对齐于 `x = 47.0 pt`**<br>`y = 200 / 227 / 254 / 281`（行距 `27pt`） | 标签列固定在 `x = 47.0 pt` |
| **朋友资料区** (`y=170`) | 右列对应值 | **严格左对齐于 `x = 120.0 ~ 123.0 pt`** | 如 `备注: 测试联系人C` (`y=201`)、`电话: 130...` (`y=227`)、`标签: Gate` (`y=255`)、`描述` (`y=282..301`) |
| **朋友圈入口** | `朋友圈` 标题与缩略图 | `x = 47.0, y = 354.0` | 点击可进入该好友独立朋友圈历史列表 |
| **更多信息区** (`y=423.5`) | `个性签名` / `来源` | 标签 `x = 47.0`，值 **`x = 116.0 ~ 122.0`**<br>`y = 454.9 / 482.0` | 如 `个性签名: 示例签名文本`、`来源: 通过搜索微信号添加` |
| **底部操作栏** (`y=540..586`) | `发消息` / `语音聊天` / `视频聊天` | `x = 69.0 / 140.0 / 212.0, y = 573.0` | 三个图标按钮水平均分卡片底部 |

### 五、 每次执行前的“动态像素分割线聚类与 7 区拓扑实时划分”机制（彻底告别写死长宽高）

为了彻底消除任何写死的长宽高常数（如固定 `listWidth`、`inputHeight` 或抽屉是否展开的假设），`scripts/wechat-window-locator.swift` 在每次执行前先对当前微信窗口执行一次**动态分割线聚类与拓扑区域划分（Live Region Partitioning）**：

1. **三步自动分割线聚类探测**：
   - **纵向分割线聚类（`verticalClusters`）**：在 `[navBarRightX + 80, Ww - 80]` 区间扫描所有纵向连续度 $>78\%$ 的 `1px` 分割线并对相邻 `<4pt` 的像素列聚类求均值：
     - 第 1 条竖线恒为会话列表右边界 `sessionListRightX`；
     - 若存在第 2 条竖线（且距离 `sessionListRightX > 150pt`），则自动判定**右侧 `•••` 聊天信息抽屉已展开**，并将其坐标记为 `rightDrawerLeftX`，同时将主聊天区右边界 `chatRightX` 自动从 `Ww` 收缩至 `rightDrawerLeftX`（连带将底部的 `发送` 按钮坐标同步左移至 `chatRightX - 76`）！
   - **横向分割线聚类（`horizontalClusters`）**：在当前主聊天区水平范围 `[sessionListRightX + 24, chatRightX - 24]` 内扫描横向连续分割线，自动定位顶部标题栏底边 `chatHeaderBottomY` 与底部输入框顶边 `chatInputTopY`。
   - **活动子窗口合并（`activeChildWindows`）**：同步检查 `CGWindowListCopyWindowInfo` 中同一 PID 下 `wId != mainWinId` 的独立浮动子窗口，自动识别 `search_popup_window`（左上角偏移 `(+48, +35)`）或 `profile_card_window`（`328 × 640 pt` 用户信息卡片）。

2. **实时生成的 7 大一级拓扑区域（`regions`）与自适应二级子锚点（`subAnchors`）**：
   - `1_nav_sidebar`：`[0, 0, navBarRightX, Wh]`（左侧导航栏）
   - `2_search_top_bar`：`[navBarRightX, 0, listW, chatHeaderBottomY]`（左上搜索与加号栏，内含自适应宽度的 `search_input_box` 与紧贴 `sessionListRightX - 34` 的 `search_plus_btn`）
   - `3_session_list`：`[navBarRightX, chatHeaderBottomY, listW, Wh - chatHeaderBottomY]`（左侧会话列表区）
   - `4_chat_header`：`[sessionListRightX, 0, Ww - sessionListRightX, chatHeaderBottomY]`（聊天顶部标题与功能栏，内含 `chat_title_text_roi` 与 `chat_more_dots_btn`）
   - `5_chat_message_viewport`：`[sessionListRightX, chatHeaderBottomY, chatW, historyH]`（聊天消息历史视口）
   - `6_chat_input_panel`：`[sessionListRightX, chatInputTopY, chatW, inputH]`（聊天底部输入卡片总区，内含上层自适应高宽的 `chat_input_text_editor`、下层左侧 `chat_input_bottom_toolbar` 与随 `chatRightX` 自适应左移的 `chat_send_btn`）
   - `7_right_info_drawer`（仅当 `rightDrawerExpanded == true` 时动态生成）：`[rightDrawerLeftX, chatHeaderBottomY, Ww - rightDrawerLeftX, Wh - chatHeaderBottomY]`（内含 `drawer_contact_avatar` 与 `drawer_add_btn`）

### 六、 已落地的四套可复用脚本清单与标准调用方式

上述全部机制已固化为仓库 `scripts/` 目录下的四个独立原生 Swift 脚本（零外部依赖，直接通过系统 `/usr/bin/swift` 调用）：

| 脚本文件 | 核心职责 | 典型复用命令 |
| --- | --- | --- |
| `scripts/wechat-window-locator.swift` | 实时像素分割线聚类与 7 区拓扑动态划分（支持生成彩色区域划分标注图） | `swift scripts/wechat-window-locator.swift --annotate /tmp/wechat_regions.png` |
| `scripts/wechat-roi-ocr.swift` | 独立搜索小窗口（`--popup-only`）、独立用户名片卡（`--profile-card`）或动态区域（`--region`）单截 + Vision ANE OCR + 三重防误判门禁 | `swift scripts/wechat-roi-ocr.swift --popup-only --target-name "测试联系人B"`<br>`swift scripts/wechat-roi-ocr.swift --region chat_title_text_roi`<br>`swift scripts/wechat-roi-ocr.swift --profile-card` |
| `scripts/wechat-human-input.swift` | Box-Muller 高斯随机落点、三阶贝塞尔手腕弧度、Fitts's Law 末端减速、`mouseEventDeltaX/Y` 硬件增量注入、全剪贴板粘贴（`Cmd+V`）与小窗口悬停平滑滚轮 | `swift scripts/wechat-human-input.swift --target-region search_input_box --paste "测试联系人B" --select-all --execute`<br>`swift scripts/wechat-human-input.swift --scroll-popup -220 --execute` |
| `scripts/wechat-send-message.swift` | **端到端总控脚本**：串联唤醒 $
ightarrow$ 动态划分搜索 $
ightarrow$ 小窗口三重门禁选人（支持翻页）$
ightarrow$ 标题栏二次核验 $
ightarrow$ 可选资料卡提取 $
ightarrow$ 粘贴草稿/发送 $
ightarrow$ 视口上屏核验（返回 `CONFIRMED` / `UNCERTAIN` / `REJECTED`）并自动安全清理临时截图 | **直接发送**：<br>`swift scripts/wechat-send-message.swift --to "测试联系人B" --message "hi (By Yance"`<br>**仅写草稿（不发送）**：<br>`swift scripts/wechat-send-message.swift --to "测试联系人B" --message "草稿" --draft-only`<br>**提取联系人唯一微信号与资料卡**：<br>`swift scripts/wechat-send-message.swift --to "测试联系人C" --inspect-profile` |

### 七、 微信搜索框能力矩阵实测：自定义微信号、原始 `wxid_`、同名用户展开滚动与 `ⓘ` 悬浮预览

通过对单字母同名用户（`"H"`）、自定义微信号（`"custom_id_demo"`）以及微信底层原始 ID（`"wxid_raw_demo_001"`）的实测对比，归档以下关键搜索行为与工程处理准则：

| 搜索输入类型 | 实测样本 | 搜索小窗口 (`Layer = 3`) 内部表现 | 自动化适配与防误判策略 |
| --- | --- | --- | --- |
| **自定义微信号** (`Custom WeChat ID`) | `custom_id_demo` | `[联系人]` 下第 1 行主标题显示备注/昵称 **`[mdd]`** (`x=79, y=55`)，正下方 `+24pt` 副标题显示 **`[微信号：custom_id_demo]`** (`x=79, y=79`) | 当副标题命中 `微信号：<query>`（或 `昵称：<query>`）时，自动向上回溯 `-24pt` 提取其父级显示名（`mdd`），点击该行并在步骤 4 核验聊天标题栏是否为 `[mdd]`。 |
| **原始内部 ID** (`wxid_...`) | `wxid_raw_demo_001` | **无 `[联系人]` 分组**！顶部直接出现绿底放大镜 **`[网络查找微信号：wxid_raw_demo_001]`** (`x=81, y=33`) 及下方 `[搜索网络结果]` | 微信客户端搜索框不支持按原始 `wxid_` 检索本地好友。门禁检测到仅存在 `网络查找微信号` 时立即返回 `REJECTED` 拦截，绝不误点触发陌生人网络查找。 |
| **同名 / 单字母高频词** | `H`（匹配 1019 人） | 首屏仅展示前 3 条拼音首字母为 `H` 的常联系好友（如 `Host-Demo`、`胡永晨`、`黄雷基`），下方出现折叠按钮 **`[查看全部(1019)]`** (`x=36, y=239/335`) | 1. **进程内保焦展开**：必须在同一进程内点击 `[查看全部(N)]`（避免子进程退出引发微信短暂失焦导致 `Layer=3` 小窗口闪退）；<br>2. **Trackpad 相位滚动**：合成滚轮必须注入 `kCGScrollWheelEventIsContinuous = 1` 与 `kCGScrollWheelEventScrollPhase`（`1 Began -> 2 Changed -> 4 Ended`），否则小窗口忽略滚轮事件；<br>3. **左侧文字安全区点击**：滚动悬停与点击统一落在左侧 `x ∈ [85, 180] pt`，避开右侧 `x ≈ pw - 50 pt` 的 `ⓘ` 悬浮预览图标。 |
| **行右侧 `ⓘ` 悬浮预览图标** | 悬停于 `(px + pw - 50, py + rowY)` | **不点击、仅悬停**时，微信在小窗口右侧再弹出一个独立的 `kCGWindowLayer = 3` 悬浮预览窗口（尺寸 **`458 × 528 pt`**），展示与该联系人的近期聊天记录摘要 | 普通切入会话时**不需要触发右侧 `ⓘ` 图标**，直接点击左侧人名文字区即可进入聊天页面；`--match-index <N>` 与 `--inspect-profile`（右上角 `•••` $
ightarrow$ 抽屉头像 $
ightarrow$ `328 × 608~640 pt` 资料卡）可完整提取同名用户的唯一微信号（如实测提取出 `H` 的微信号 `wx_custom_id_02`、地区 `广西 北海`、签名 `示例个性签名`）。 |

