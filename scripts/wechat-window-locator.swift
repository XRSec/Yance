#!/usr/bin/env swift
// =============================================================================
// wechat-window-locator.swift
// 职责：零硬编码长宽高，每次执行时先通过 CGWindowListCopyWindowInfo + 内存像素梯度扫描，
//       自动探测当前微信窗口的所有纵/横 1px 分割线（含是否展开了右侧 ••• 抽屉、是否弹出了
//       搜索小窗口或用户信息子窗口），将界面动态划分为精确的功能区域 (Regions) 与子锚点，
//       并支持 --annotate 输出带彩色网格的区域划分核验图。
// 用法：
//   swift scripts/wechat-window-locator.swift [--annotate /tmp/wechat_regions.png]
// =============================================================================

import Foundation
import CoreGraphics
import AppKit

struct RegionBox: Codable {
    let id: String
    let label: String
    let windowRelativeRect: [String: Double]
    let screenRect: [String: Double]

    init(id: String, label: String, origin: CGPoint, x: Double, y: Double, w: Double, h: Double) {
        let r1 = { (v: Double) -> Double in (v * 10).rounded() / 10 }
        self.id = id
        self.label = label
        self.windowRelativeRect = ["x": r1(x), "y": r1(y), "width": r1(w), "height": r1(h)]
        self.screenRect = ["x": r1(Double(origin.x) + x), "y": r1(Double(origin.y) + y), "width": r1(w), "height": r1(h)]
    }
}

struct ChildPopupInfo: Codable {
    let kind: String
    let windowId: Int
    let layer: Int
    let screenBounds: [String: Double]
    let relativeToMainWindow: [String: Double]
}

struct DynamicPartitionReport: Codable {
    let windowId: Int
    let pid: Int
    let partitionElapsedMs: Double
    let windowBounds: [String: Double]
    let rightDrawerExpanded: Bool
    let detectedDividers: [String: Double?]
    let activeChildWindows: [ChildPopupInfo]
    let regions: [String: RegionBox]
    let subAnchors: [String: RegionBox]
}

func getArg(_ flag: String) -> String? {
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: flag), idx + 1 < args.count {
        return args[idx + 1]
    }
    return nil
}

let t0 = CFAbsoluteTimeGetCurrent()
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    fputs("Error: Unable to query CGWindowListCopyWindowInfo\n", stderr)
    exit(1)
}

var mainWin: [String: Any]? = nil
var wechatPid: Int = 0
for w in windowList {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if (owner == "微信" || owner == "WeChat") && layer == 0,
       let b = w[kCGWindowBounds as String] as? [String: Any],
       let width = b["Width"] as? Double, width > 400 {
        mainWin = w
        wechatPid = w[kCGWindowOwnerPID as String] as? Int ?? 0
        break
    }
}

guard let win = mainWin,
      let winId = win[kCGWindowNumber as String] as? Int,
      let bounds = win[kCGWindowBounds as String] as? [String: Any],
      let wx = bounds["X"] as? Double,
      let wy = bounds["Y"] as? Double,
      let ww = bounds["Width"] as? Double,
      let wh = bounds["Height"] as? Double else {
    fputs("Error: On-screen WeChat main window not found\n", stderr)
    exit(2)
}

// 1. 扫描微信进程下的所有活动子窗口（搜索小窗口 Layer=3 或 用户信息卡片窗口）
var childPopups: [ChildPopupInfo] = []
for w in windowList {
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
    let wId = w[kCGWindowNumber as String] as? Int ?? 0
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    if pid == wechatPid && wId != winId,
       let b = w[kCGWindowBounds as String] as? [String: Any],
       let cx = b["X"] as? Double,
       let cy = b["Y"] as? Double,
       let cw = b["Width"] as? Double,
       let ch = b["Height"] as? Double {
        let kind = (layer == 3 || abs((cx - wx) - 48.0) < 8.0) ? "search_popup_window" : "profile_card_window"
        childPopups.append(ChildPopupInfo(
            kind: kind,
            windowId: wId,
            layer: layer,
            screenBounds: ["x": cx, "y": cy, "width": cw, "height": ch],
            relativeToMainWindow: ["dX": cx - wx, "dY": cy - wy, "width": cw, "height": ch]
        ))
    }
}

// 2. 截取当前主窗口像素并实时探测所有纵/横分割线（不写死任何长宽高）
let tempCap = "/tmp/wechat_partition_probe_\(ProcessInfo.processInfo.processIdentifier).png"
let proc = Process()
proc.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
proc.arguments = ["-l", "\(winId)", "-o", "-x", tempCap]
try proc.run()
proc.waitUntilExit()

guard let nsImg = NSImage(contentsOfFile: tempCap),
      let cgImg = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Error: Unable to capture WeChat window for partitioning\n", stderr)
    exit(3)
}
try? FileManager.default.removeItem(atPath: tempCap)

let imgW = cgImg.width
let imgH = cgImg.height
let scale = Double(imgW) / ww

let bytesPerPixel = 4
let bytesPerRow = imgW * bytesPerPixel
var rawData = [UInt8](repeating: 0, count: imgH * bytesPerRow)
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: &rawData, width: imgW, height: imgH, bitsPerComponent: 8, bytesPerRow: bytesPerRow, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(cgImg, in: CGRect(x: 0, y: 0, width: imgW, height: imgH))

func pixelRGB(_ x: Int, _ y: Int) -> (Int, Int, Int) {
    let offset = y * bytesPerRow + x * bytesPerPixel
    return (Int(rawData[offset]), Int(rawData[offset + 1]), Int(rawData[offset + 2]))
}

// 2.1 自动探测第一条竖线：左侧导航栏右边界 (navBarRightX)
var navBarRightX = 60.0
let midY = imgH / 2
for ptX in 45...85 {
    let px = Int(Double(ptX) * scale)
    if px + 2 < imgW {
        let (r1, g1, b1) = pixelRGB(px - 1, midY)
        let (r2, g2, b2) = pixelRGB(px + 1, midY)
        if abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2) > 12 {
            navBarRightX = Double(ptX)
            break
        }
    }
}

// 2.2 自动聚类探测窗口内所有贯穿纵向的 1px 分割线（可同时识别会话列表右边界 + 右侧 ••• 抽屉左边界！）
var rawVerticalLines: [Double] = []
let yScanStart = Int(Double(imgH) * 0.16)
let yScanEnd = Int(Double(imgH) * 0.84)
for px in Int((navBarRightX + 80.0) * scale)...Int((ww - 80.0) * scale) {
    var edgeHits = 0
    var totalSamples = 0
    for py in stride(from: yScanStart, to: yScanEnd, by: 6) {
        let (rc, gc, bc) = pixelRGB(px, py)
        let (rl, gl, bl) = pixelRGB(max(0, px - 2), py)
        let (rr, gr, br) = pixelRGB(min(imgW - 1, px + 2), py)
        if abs(rc - rl) + abs(gc - gl) + abs(bc - bl) > 5 || abs(rc - rr) + abs(gc - gr) + abs(bc - br) > 5 {
            edgeHits += 1
        }
        totalSamples += 1
    }
    if Double(edgeHits) / Double(max(1, totalSamples)) > 0.78 {
        rawVerticalLines.append(Double(px) / scale)
    }
}

// 对相邻 4pt 内的候选竖线聚类求均值
var verticalClusters: [Double] = []
var currentCluster: [Double] = []
for x in rawVerticalLines {
    if let last = currentCluster.last, x - last > 4.0 {
        verticalClusters.append((currentCluster.reduce(0, +) / Double(currentCluster.count) * 2).rounded() / 2)
        currentCluster = [x]
    } else {
        currentCluster.append(x)
    }
}
if !currentCluster.isEmpty {
    verticalClusters.append((currentCluster.reduce(0, +) / Double(currentCluster.count) * 2).rounded() / 2)
}

let sessionListRightX = verticalClusters.first ?? 272.0
var rightDrawerLeftX: Double? = nil
if verticalClusters.count >= 2, let lastV = verticalClusters.last, lastV > sessionListRightX + 150.0 {
    rightDrawerLeftX = lastV
}
let chatRightX = rightDrawerLeftX ?? ww

// 2.3 在主聊天工作区 [sessionListRightX, chatRightX] 内自动探测顶部标题栏底边与底部输入框顶边
var rawHorizontalLines: [Double] = []
let xScanStart = Int((sessionListRightX + 24.0) * scale)
let xScanEnd = Int((chatRightX - 24.0) * scale)
if xScanStart < xScanEnd {
    for py in Int(36.0 * scale)...Int((wh - 40.0) * scale) {
        var edgeHits = 0
        var totalSamples = 0
        for px in stride(from: xScanStart, to: xScanEnd, by: 6) {
            let (rc, gc, bc) = pixelRGB(px, py)
            let (ru, gu, bu) = pixelRGB(px, max(0, py - 2))
            let (rd, gd, bd) = pixelRGB(px, min(imgH - 1, py + 2))
            if abs(rc - ru) + abs(gc - gu) + abs(bc - bu) > 5 || abs(rc - rd) + abs(gc - gd) + abs(bc - bd) > 5 {
                edgeHits += 1
            }
            totalSamples += 1
        }
        if Double(edgeHits) / Double(max(1, totalSamples)) > 0.75 {
            rawHorizontalLines.append(Double(py) / scale)
        }
    }
}

var horizontalClusters: [Double] = []
currentCluster = []
for y in rawHorizontalLines {
    if let last = currentCluster.last, y - last > 4.0 {
        horizontalClusters.append((currentCluster.reduce(0, +) / Double(currentCluster.count) * 2).rounded() / 2)
        currentCluster = [y]
    } else {
        currentCluster.append(y)
    }
}
if !currentCluster.isEmpty {
    horizontalClusters.append((currentCluster.reduce(0, +) / Double(currentCluster.count) * 2).rounded() / 2)
}

let chatHeaderBottomY = horizontalClusters.first(where: { $0 >= 40.0 && $0 <= 70.0 }) ?? 51.0
let chatInputTopY = horizontalClusters.last(where: { $0 >= 180.0 && $0 <= wh - 65.0 }) ?? (wh - 176.0)

// 3. 根据实时探测出的分割线，动态划分当前窗口的所有一级功能区域 (Regions) 与二级子锚点 (SubAnchors)
let origin = CGPoint(x: wx, y: wy)
let listW = sessionListRightX - navBarRightX
let chatW = chatRightX - sessionListRightX
let historyH = chatInputTopY - chatHeaderBottomY
let inputH = wh - chatInputTopY

var regions: [String: RegionBox] = [:]
regions["1_nav_sidebar"] = RegionBox(
    id: "1_nav_sidebar", label: "左侧导航栏",
    origin: origin, x: 0, y: 0, w: navBarRightX, h: wh
)
regions["2_search_top_bar"] = RegionBox(
    id: "2_search_top_bar", label: "左上搜索与加号栏",
    origin: origin, x: navBarRightX, y: 0, w: listW, h: chatHeaderBottomY
)
regions["3_session_list"] = RegionBox(
    id: "3_session_list", label: "左侧会话列表区",
    origin: origin, x: navBarRightX, y: chatHeaderBottomY, w: listW, h: wh - chatHeaderBottomY
)
regions["4_chat_header"] = RegionBox(
    id: "4_chat_header", label: "聊天顶部标题与功能栏",
    origin: origin, x: sessionListRightX, y: 0, w: ww - sessionListRightX, h: chatHeaderBottomY
)
regions["5_chat_message_viewport"] = RegionBox(
    id: "5_chat_message_viewport", label: "聊天消息历史视口",
    origin: origin, x: sessionListRightX, y: chatHeaderBottomY, w: chatW, h: historyH
)
regions["6_chat_input_panel"] = RegionBox(
    id: "6_chat_input_panel", label: "聊天底部输入卡片总区",
    origin: origin, x: sessionListRightX, y: chatInputTopY, w: chatW, h: inputH
)
if let drawerX = rightDrawerLeftX {
    regions["7_right_info_drawer"] = RegionBox(
        id: "7_right_info_drawer", label: "右侧聊天详情抽屉 (已展开)",
        origin: origin, x: drawerX, y: chatHeaderBottomY, w: ww - drawerX, h: wh - chatHeaderBottomY
    )
}

// 基于实时划分出的 Region 进一步派生内部精确交互子锚点（随所属 Region 自动伸缩！）
var subAnchors: [String: RegionBox] = [:]
subAnchors["search_input_box"] = RegionBox(
    id: "search_input_box", label: "搜索输入框 (动态随列表宽度伸缩)",
    origin: origin, x: navBarRightX + 14, y: 14, w: max(68, listW - 56), h: 26
)
subAnchors["search_plus_btn"] = RegionBox(
    id: "search_plus_btn", label: "发起群聊 (+) 按钮",
    origin: origin, x: sessionListRightX - 34, y: 14, w: 24, h: 24
)
subAnchors["chat_title_text_roi"] = RegionBox(
    id: "chat_title_text_roi", label: "当前聊天对象标题核验区",
    origin: origin, x: sessionListRightX + 16, y: 12, w: max(80, (ww - sessionListRightX) - 140), h: 30
)
subAnchors["chat_more_dots_btn"] = RegionBox(
    id: "chat_more_dots_btn", label: "右上角 (•••) 聊天详情按钮",
    origin: origin, x: ww - 46, y: 14, w: 28, h: 26
)
subAnchors["chat_input_text_editor"] = RegionBox(
    id: "chat_input_text_editor", label: "输入框上层：文本编辑区 (随 chatRightX 与 chatInputTopY 自适应)",
    origin: origin, x: sessionListRightX + 16, y: chatInputTopY + 10, w: max(80, chatW - 32), h: max(28, inputH - 56)
)
subAnchors["chat_input_bottom_toolbar"] = RegionBox(
    id: "chat_input_bottom_toolbar", label: "输入框下层左侧：表情/文件/截图工具栏",
    origin: origin, x: sessionListRightX + 16, y: wh - 42, w: min(210, chatW - 110), h: 26
)
subAnchors["chat_send_btn"] = RegionBox(
    id: "chat_send_btn", label: "输入框下层右侧：发送按钮 (随 chatRightX 自适应)",
    origin: origin, x: chatRightX - 76, y: wh - 42, w: 54, h: 24
)
if let drawerX = rightDrawerLeftX {
    subAnchors["drawer_contact_avatar"] = RegionBox(
        id: "drawer_contact_avatar", label: "右侧抽屉内：联系人头像 (点击弹出用户信息窗口)",
        origin: origin, x: drawerX + 18, y: chatHeaderBottomY + 15, w: 36, h: 36
    )
    subAnchors["drawer_add_btn"] = RegionBox(
        id: "drawer_add_btn", label: "右侧抽屉内：(+ 添加) 按钮",
        origin: origin, x: drawerX + 68, y: chatHeaderBottomY + 15, w: 36, h: 36
    )
}

let elapsedMs = ((CFAbsoluteTimeGetCurrent() - t0) * 10000).rounded() / 10

// 4. 可选：生成带彩色分区框与子锚点框的可视化核验图
if let annotatePath = getArg("--annotate") {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: imgW, pixelsHigh: imgH,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    if let gCtx = NSGraphicsContext.current?.cgContext {
        gCtx.draw(cgImg, in: CGRect(x: 0, y: 0, width: imgW, height: imgH))

        func toCG(_ box: RegionBox) -> CGRect {
            let rx = box.windowRelativeRect["x"] ?? 0
            let ry = box.windowRelativeRect["y"] ?? 0
            let rw = box.windowRelativeRect["width"] ?? 0
            let rh = box.windowRelativeRect["height"] ?? 0
            return CGRect(x: rx * scale, y: Double(imgH) - (ry + rh) * scale, width: rw * scale, height: rh * scale)
        }

        // 画一级功能分区边界（蓝色粗框）
        gCtx.setStrokeColor(NSColor.systemBlue.cgColor)
        gCtx.setLineWidth(4.0)
        for (_, reg) in regions {
            gCtx.stroke(toCG(reg).insetBy(dx: 2, dy: 2))
        }

        // 画二级交互子锚点（绿色精确热区框）
        gCtx.setStrokeColor(NSColor.systemGreen.cgColor)
        gCtx.setLineWidth(3.0)
        for (_, sub) in subAnchors {
            let rect = toCG(sub)
            gCtx.setFillColor(NSColor.systemGreen.withAlphaComponent(0.14).cgColor)
            gCtx.fill(rect)
            gCtx.stroke(rect)
        }

        // 在每个一级分区左上角绘制分区标签名
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.boldSystemFont(ofSize: CGFloat(12.0 * scale)),
            .foregroundColor: NSColor.white,
            .backgroundColor: NSColor.systemBlue.withAlphaComponent(0.85)
        ]
        for (_, reg) in regions.sorted(by: { $0.key < $1.key }) {
            let rx = (reg.windowRelativeRect["x"] ?? 0) * scale + 8
            let ry = Double(imgH) - ((reg.windowRelativeRect["y"] ?? 0) * scale + 28 * scale)
            let str = NSString(string: " \(reg.id): \(reg.label) ")
            str.draw(at: NSPoint(x: rx, y: ry), withAttributes: attrs)
        }
    }
    NSGraphicsContext.restoreGraphicsState()
    if let png = rep.representation(using: .png, properties: [:]) {
        try? png.write(to: URL(fileURLWithPath: annotatePath))
    }
}

let report = DynamicPartitionReport(
    windowId: winId,
    pid: wechatPid,
    partitionElapsedMs: elapsedMs,
    windowBounds: ["x": wx, "y": wy, "width": ww, "height": wh],
    rightDrawerExpanded: (rightDrawerLeftX != nil),
    detectedDividers: [
        "navBarRightX": navBarRightX,
        "sessionListRightX": sessionListRightX,
        "rightDrawerLeftX": rightDrawerLeftX,
        "chatHeaderBottomY": chatHeaderBottomY,
        "chatInputTopY": chatInputTopY
    ],
    activeChildWindows: childPopups,
    regions: regions,
    subAnchors: subAnchors
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
if let data = try? encoder.encode(report), let str = String(data: data, encoding: .utf8) {
    print(str)
}
