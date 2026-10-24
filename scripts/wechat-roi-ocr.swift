#!/usr/bin/env swift
// =============================================================================
// wechat-roi-ocr.swift
// 职责：不读取 AXUIElement 无障碍树，针对微信左上角独立搜索小窗口 (kCGWindowLayer == 3,
//       左上角偏移 +48,+35，宽度随左侧聊天列表动态变化) 执行硬件级隔离单截与 Apple Vision OCR。
// 核心防误判与分组机制：
//   1. 仅截取独立搜索小窗口 (-l <popupWinId>)，绝不显示或保存小窗口以外的聊天内容；
//   2. 自动识别 [联系人 / 搜索网络结果 / 群聊 / 聊天记录 / 功能] 分组纵坐标区间；
//   3. 三重防误判门禁（严防误触“搜索网络结果”下的词条或“聊天记录”摘要）：
//      - 门禁 A (纵向区间锁)：凡落入 [搜索网络结果] 区间的词条一律标记为 web_search_FORBIDDEN；
//      - 门禁 B (头像缩进 X 轴锁)：真实联系人/群聊左侧必有 32×32 头像，标题起点必在 x ∈ [72, 95] pt；
//        而“搜索网络结果”下的 "Q 关键词" 起点在 x ≈ 38..62 pt，直接从几何上剔除；
//      - 门禁 C (副标题/摘要剔除)：自动剔除 "包含:"、"共X条相关聊天记录" 及带右侧日期的记录行。
// 用法：
//   swift scripts/wechat-roi-ocr.swift --popup-only [--target-name "测试联系人A"]
//   swift scripts/wechat-roi-ocr.swift --profile-card
//   swift scripts/wechat-roi-ocr.swift --roi 295,10,250,36
// =============================================================================

import Foundation
import CoreGraphics
import AppKit
import Vision

struct OCRBlock: Codable {
    let text: String
    let section: String
    let role: String
    let isSafeClickableTarget: Bool
    let rejectReason: String?
    let confidence: Float
    let relativeRect: [String: Double]
    let screenRect: [String: Double]
    let safeClickRowScreenRect: [String: Double]?
}

struct SearchPopupOCRReport: Codable {
    let captureMode: String
    let targetWindowId: Int
    let targetWindowLayer: Int
    let mainWindowBounds: [String: Double]
    let capturedBounds: [String: Double]
    let offsetFromMainWindow: [String: Double]
    let popupHoverCenterScreenPoint: [String: Double]
    let imagePixelSize: [String: Int]
    let backingScaleFactor: Double
    let ocrElapsedMs: Double
    let sectionHeadersY: [String: Double]
    let clickableContacts: [OCRBlock]
    let clickableGroups: [OCRBlock]
    let blocks: [OCRBlock]
}

func getArg(_ flag: String) -> String? {
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: flag), idx + 1 < args.count {
        return args[idx + 1]
    }
    return nil
}

let args = CommandLine.arguments
let popupOnly = args.contains("--popup-only") || (!args.contains("--roi") && !args.contains("--region") && !args.contains("--profile-card"))
let targetNameFilter = getArg("--target-name")
let exactMatchOnly = args.contains("--exact-match")

let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
guard let windowList = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else {
    fputs("Error: CGWindowListCopyWindowInfo failed\n", stderr)
    exit(1)
}

var mainWin: [String: Any]? = nil
var wechatPid: Int = 0
for w in windowList {
    let owner = w[kCGWindowOwnerName as String] as? String ?? ""
    let layer = w[kCGWindowLayer as String] as? Int ?? -1
    if (owner == "微信" || owner == "WeChat") && layer == 0,
       let b = w[kCGWindowBounds as String] as? [String: Any],
       let width = b["Width"] as? Double, width > 300 {
        mainWin = w
        wechatPid = w[kCGWindowOwnerPID as String] as? Int ?? 0
        break
    }
}

guard let mWin = mainWin,
      let mBounds = mWin[kCGWindowBounds as String] as? [String: Any],
      let wx = mBounds["X"] as? Double,
      let wy = mBounds["Y"] as? Double,
      let ww = mBounds["Width"] as? Double,
      let wh = mBounds["Height"] as? Double,
      let mainWinId = mWin[kCGWindowNumber as String] as? Int else {
    fputs("Error: WeChat main window not found\n", stderr)
    exit(2)
}

let profileCardMode = args.contains("--profile-card")
var popupWin: [String: Any]? = nil
var profileCardWin: [String: Any]? = nil
for w in windowList {
    let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
    let wId = w[kCGWindowNumber as String] as? Int ?? 0
    let layer = w[kCGWindowLayer as String] as? Int ?? 0
    if pid == wechatPid && wId != mainWinId {
        if let b = w[kCGWindowBounds as String] as? [String: Any],
           let bw = b["Width"] as? Double {
            if abs(bw - 328.0) < 16.0 {
                profileCardWin = w
            } else if layer > 0 {
                popupWin = w
            }
        }
    }
}

let capturePath = getArg("--capture") ?? "/tmp/wechat_local_roi.png"
var captureMode = "main-window-roi"
var targetWinId = mainWinId
var targetLayer = 0
var capX = wx
var capY = wy
var capW = ww
var capH = wh

let proc = Process()
proc.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")

if profileCardMode,
   let cWin = profileCardWin,
   let cWinId = cWin[kCGWindowNumber as String] as? Int,
   let cLayer = cWin[kCGWindowLayer as String] as? Int,
   let cBounds = cWin[kCGWindowBounds as String] as? [String: Any],
   let cx = cBounds["X"] as? Double,
   let cy = cBounds["Y"] as? Double,
   let cw = cBounds["Width"] as? Double,
   let ch = cBounds["Height"] as? Double {
    captureMode = "isolated-profile-card-window"
    targetWinId = cWinId
    targetLayer = cLayer
    capX = cx
    capY = cy
    capW = cw
    capH = ch
    proc.arguments = ["-l", "\(cWinId)", "-o", "-x", capturePath]
} else if let regionId = getArg("--region") {
    // 先实时运行 wechat-window-locator.swift 动态划分区域，按区域 ID 提取精确局部矩形！
    let locProc = Process()
    let pipe = Pipe()
    locProc.executableURL = URL(fileURLWithPath: "/usr/bin/swift")
    locProc.arguments = ["scripts/wechat-window-locator.swift"]
    locProc.standardOutput = pipe
    try? locProc.run()
    locProc.waitUntilExit()
    let outData = pipe.fileHandleForReading.readDataToEndOfFile()
    if let json = try? JSONSerialization.jsonObject(with: outData) as? [String: Any] {
        let subAnchors = json["subAnchors"] as? [String: [String: Any]] ?? [:]
        let regions = json["regions"] as? [String: [String: Any]] ?? [:]
        let boxDict = subAnchors[regionId] ?? regions[regionId]
        if let sr = boxDict?["screenRect"] as? [String: Double],
           let x = sr["x"], let y = sr["y"], let w = sr["width"], let h = sr["height"] {
            captureMode = "dynamic-partition-region:\(regionId)"
            capX = x; capY = y; capW = w; capH = h
            proc.arguments = ["-R", "\(Int(capX)),\(Int(capY)),\(Int(capW)),\(Int(capH))", "-x", capturePath]
        }
    }
} else if let roiStr = getArg("--roi") {
    let parts = roiStr.split(separator: ",").compactMap { Double($0) }
    if parts.count == 4 {
        captureMode = "strict-local-rect"
        capX = wx + parts[0]
        capY = wy + parts[1]
        capW = parts[2]
        capH = parts[3]
        proc.arguments = ["-R", "\(Int(capX)),\(Int(capY)),\(Int(capW)),\(Int(capH))", "-x", capturePath]
    } else {
        proc.arguments = ["-l", "\(mainWinId)", "-o", "-x", capturePath]
    }
} else if popupOnly {
    if let pWin = popupWin,
       let pWinId = pWin[kCGWindowNumber as String] as? Int,
       let pLayer = pWin[kCGWindowLayer as String] as? Int,
       let pBounds = pWin[kCGWindowBounds as String] as? [String: Any],
       let px = pBounds["X"] as? Double,
       let py = pBounds["Y"] as? Double,
       let pw = pBounds["Width"] as? Double,
       let ph = pBounds["Height"] as? Double {
        captureMode = "isolated-search-popup-window"
        targetWinId = pWinId
        targetLayer = pLayer
        capX = px
        capY = py
        capW = pw
        capH = ph
        proc.arguments = ["-l", "\(pWinId)", "-o", "-x", capturePath]
    } else {
        captureMode = "top-left-popup-rect-fallback"
        capX = wx + 48.0
        capY = wy + 35.0
        capW = min(max(255.0, ww - 453.0 + 22.0), ww - 48.0)
        capH = min(613.0, wh - 35.0)
        proc.arguments = ["-R", "\(Int(capX)),\(Int(capY)),\(Int(capW)),\(Int(capH))", "-x", capturePath]
    }
}

try proc.run()
proc.waitUntilExit()

guard let nsImage = NSImage(contentsOfFile: capturePath),
      let cgImage = nsImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Error: Failed to load captured image at \(capturePath)\n", stderr)
    exit(3)
}

let imgW = cgImage.width
let imgH = cgImage.height
let scale = Double(imgW) / capW

let t0 = CFAbsoluteTimeGetCurrent()
var rawItems: [(text: String, conf: Float, rx: Double, ry: Double, rw: Double, rh: Double)] = []

let request = VNRecognizeTextRequest { req, _ in
    guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
    for obs in observations {
        guard let topCandidate = obs.topCandidates(1).first else { continue }
        let box = obs.boundingBox
        let relX = Double(box.origin.x) * capW
        let relY = (1.0 - Double(box.origin.y) - Double(box.size.height)) * capH
        let relW = Double(box.size.width) * capW
        let relH = Double(box.size.height) * capH
        rawItems.append((topCandidate.string, topCandidate.confidence, relX, relY, relW, relH))
    }
}
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])
let elapsedMs = ((CFAbsoluteTimeGetCurrent() - t0) * 10000).rounded() / 10

let round1 = { (v: Double) -> Double in (v * 10).rounded() / 10 }

// 1. 识别分组标题行 (联系人 / 搜索网络结果 / 群聊 / 聊天记录 / 功能)
var sectionHeaders: [String: Double] = [:]
for item in rawItems {
    let trimmed = item.text.trimmingCharacters(in: .whitespaces)
    if item.rx < 70.0 {
        if trimmed == "联系人" || trimmed == "常使用" || trimmed == "最常使用" || trimmed == "最近使用" {
            sectionHeaders["contacts"] = round1(item.ry)
        } else if trimmed.contains("搜索网络结果") || trimmed.contains("网络查找") {
            sectionHeaders["web_search_FORBIDDEN"] = round1(item.ry)
        } else if trimmed == "群聊" {
            sectionHeaders["groups"] = round1(item.ry)
        } else if trimmed == "聊天记录" {
            sectionHeaders["chat_history"] = round1(item.ry)
        } else if trimmed == "功能" || trimmed == "公众号" || trimmed == "小程序" {
            sectionHeaders["features_FORBIDDEN"] = round1(item.ry)
        }
    }
}

func classifySection(y: Double, headers: [String: Double]) -> String {
    if headers.isEmpty { return (captureMode == "isolated-search-popup-window") ? "contacts" : "roi_direct" }
    let sorted = headers.sorted { $0.value < $1.value }
    var current = "unknown_top"
    for (sec, hy) in sorted {
        if y >= hy - 3.0 {
            current = sec
        } else {
            break
        }
    }
    return current
}

// 2. 对每个文本块执行三重防误判校验
let blocks: [OCRBlock] = rawItems.map { item in
    let trimmed = item.text.trimmingCharacters(in: .whitespaces)
    let sec = classifySection(y: item.ry, headers: sectionHeaders)

    var role = "content"
    var isSafe = false
    var rejectReason: String? = nil

    if sectionHeaders.values.contains(where: { abs($0 - item.ry) < 3.5 }) && item.rx < 70.0 {
        role = "section_header"
        rejectReason = "分组栏标题不可点击"
    } else if sec == "web_search_FORBIDDEN" {
        role = "web_search_item"
        rejectReason = "位于【搜索网络结果】危险区间，严禁点击以防触发网络搜索/公众号跳转"
    } else if sec == "features_FORBIDDEN" {
        role = "feature_item"
        rejectReason = "位于【功能/公众号】区间，非私聊或群聊联系人"
    } else if sec == "chat_history" {
        role = "chat_history_item"
        rejectReason = "位于【聊天记录】区间，非直接会话入口"
    } else if sec == "contacts" || sec == "groups" {
        // 门禁 B：检查是否满足 32×32 头像右侧的主标题缩进 (relX 必须在 72..95 pt)
        if item.rx < 70.0 {
            role = "icon_or_search_prefix"
            rejectReason = "X坐标(\(round1(item.rx))pt < 70pt) 未对齐头像右侧主标题线(80pt)，疑似放大镜搜索词条"
        } else if item.rx > max(150.0, capW - 110.0) {
            role = "right_accessory"
            rejectReason = "位于小窗口右侧时间戳/折叠按钮区 (rx > capW - 110)"
        } else if trimmed.hasPrefix("网络查找") || trimmed.contains("网络查找微信号") {
            role = "stranger_network_lookup_FORBIDDEN"
            rejectReason = "原始 wxid_ 触发【网络查找微信号】陌生人搜索入口，非本地好友会话，严禁点击"
        } else if trimmed.hasPrefix("微信号:") || trimmed.hasPrefix("微信号：") || trimmed.hasPrefix("昵称:") || trimmed.hasPrefix("昵称：") {
            role = "contact_id_or_nickname_subtitle"
            // 若用户按自定义微信号 (如 custom_id_demo) 搜索，副标题命中时可安全点击其上方 -24pt 的联系人行！
            if let filter = targetNameFilter, trimmed.localizedCaseInsensitiveContains(filter) && sec == "contacts" {
                isSafe = true
                rejectReason = nil
            } else {
                rejectReason = "属于微信号/昵称副标题且未命中搜索词"
            }
        } else if trimmed.hasPrefix("包含:") || trimmed.hasPrefix("包含：") || trimmed.hasPrefix("共") {
            role = "item_subtitle"
            rejectReason = "属于结果项第二行副标题（如 '包含：xxx'），主标题在其上方 -24pt 处"
        } else if trimmed.hasPrefix("Q ") || trimmed.hasPrefix("🔍") {
            role = "search_query_echo"
            rejectReason = "带有搜索放大镜前缀，属于搜索网络结果词条"
        } else {
            // 检查是否为某条主标题正下方 ~24pt 的副标题
            let hasParentTitleAbove = rawItems.contains { other in
                other.rx >= 70.0 && other.rx <= 95.0 &&
                (item.ry - other.ry) >= 18.0 && (item.ry - other.ry) <= 30.0
            }
            if hasParentTitleAbove {
                role = "item_subtitle"
                rejectReason = "位于主标题正下方 +24pt，判定为副标题行"
            } else {
                role = (sec == "contacts") ? "contact_primary_title" : "group_primary_title"
                if let filter = targetNameFilter {
                    let matched = exactMatchOnly
                        ? (trimmed.caseInsensitiveCompare(filter) == .orderedSame)
                        : trimmed.localizedCaseInsensitiveContains(filter)
                    if !matched {
                        isSafe = false
                        rejectReason = exactMatchOnly ? "与目标名称 '\(filter)' 不精确相等" : "与目标名称过滤词 '\(filter)' 不匹配"
                    } else {
                        isSafe = true
                    }
                } else {
                    isSafe = true
                }
            }
        }
    } else if sec == "roi_direct" {
        role = "roi_text"
        isSafe = true
    } else {
        rejectReason = "未处于联系人或群聊分组区间"
    }

    let isExpandContactsBtn = trimmed.hasPrefix("查看全部") && (sec == "contacts" || item.ry < 380.0)
    if isExpandContactsBtn {
        role = "expand_contacts_button"
    }
    let rowYOffset = (role == "contact_id_or_nickname_subtitle") ? -24.0 : -6.0
    let safeRowRect: [String: Double]? = (isSafe || isExpandContactsBtn) ? [
        "x": round1(capX + 36.0),
        "y": round1(capY + item.ry + rowYOffset),
        "width": 170.0,
        "height": 32.0
    ] : nil

    var displayText = item.text
    if role == "contact_id_or_nickname_subtitle" && isSafe {
        if let parent = rawItems.first(where: { $0.rx >= 70.0 && $0.rx <= 105.0 && (item.ry - $0.ry) >= 18.0 && (item.ry - $0.ry) <= 30.0 }) {
            displayText = parent.text
        }
    }
    return OCRBlock(
        text: displayText,
        section: sec,
        role: role,
        isSafeClickableTarget: isSafe,
        rejectReason: rejectReason,
        confidence: item.conf,
        relativeRect: [
            "x": round1(item.rx),
            "y": round1(item.ry),
            "width": round1(item.rw),
            "height": round1(item.rh)
        ],
        screenRect: [
            "x": round1(capX + item.rx),
            "y": round1(capY + item.ry),
            "width": round1(item.rw),
            "height": round1(item.rh)
        ],
        safeClickRowScreenRect: safeRowRect
    )
}

let report = SearchPopupOCRReport(
    captureMode: captureMode,
    targetWindowId: targetWinId,
    targetWindowLayer: targetLayer,
    mainWindowBounds: ["x": wx, "y": wy, "width": ww, "height": wh],
    capturedBounds: ["x": capX, "y": capY, "width": capW, "height": capH],
    offsetFromMainWindow: ["dX": round1(capX - wx), "dY": round1(capY - wy)],
    popupHoverCenterScreenPoint: ["x": round1(capX + capW * 0.45), "y": round1(capY + capH * 0.45)],
    imagePixelSize: ["width": imgW, "height": imgH],
    backingScaleFactor: scale,
    ocrElapsedMs: elapsedMs,
    sectionHeadersY: sectionHeaders,
    clickableContacts: blocks.filter { $0.section == "contacts" && $0.isSafeClickableTarget },
    clickableGroups: blocks.filter { $0.section == "groups" && $0.isSafeClickableTarget },
    blocks: blocks
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
if let data = try? encoder.encode(report), let str = String(data: data, encoding: .utf8) {
    print(str)
}
