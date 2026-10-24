#!/usr/bin/env swift
// =============================================================================
// wechat-send-message.swift
// 职责：macOS 微信 4.x 零无障碍树 (Zero-AXUIElement)、零写死宽高、全链路拟人化发信与身份提取总控脚本。
// 核心特性：
//   1. 进程内保焦搜索与滚动：在同一个进程内完成“搜索框粘贴 -> 自动点击 [查看全部(N)] 展开 ->
//      Trackpad 相位滚动 (scrollPhase 1->2->4) 翻页 -> 拟人点击目标行”，避免子进程切换导致 Layer=3 小窗口失焦闪退；
//   2. 支持按【备注/昵称】或【自定义微信号 (如 custom_id_demo)】搜索定位：
//      自动识别副标题 "微信号：xxx" 并回溯其上方 -24pt 的联系人主标题名称用于聊天标题栏二次核验；
//   3. 严密防误判：拦截原始 wxid_ 触发的【网络查找微信号】、【搜索网络结果】与【聊天记录】；
//   4. 支持 --exact-match (同名短字符如 "H" 精确匹配) 与 --match-index <N> (多同名候选按序号选择)。
// 用法：
//   swift scripts/wechat-send-message.swift --to "测试联系人B" --message "hi (By Yance"
//   swift scripts/wechat-send-message.swift --to "custom_id_demo" [--message "你好" --draft-only]
//   swift scripts/wechat-send-message.swift --to "H" --exact-match [--inspect-profile]
// =============================================================================

import Foundation
import CoreGraphics
import AppKit
import Vision

struct StepTrace: Codable {
    let step: String
    let status: String
    let detail: String
}

struct ExecutionResult: Codable {
    let action: String
    let targetQuery: String
    let targetType: String
    let matchedTargetTitle: String?
    let verifiedHeaderTitle: String?
    let profileCardFields: [String]?
    let messageBody: String?
    let certainty: String
    let elapsedMs: Double
    let traces: [StepTrace]
}

let scriptDir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().path
let locatorScript = "\(scriptDir)/wechat-window-locator.swift"
let ocrScript = "\(scriptDir)/wechat-roi-ocr.swift"
let inputScript = "\(scriptDir)/wechat-human-input.swift"

func getArg(_ flag: String) -> String? {
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: flag), idx + 1 < args.count {
        return args[idx + 1]
    }
    return nil
}

func runSwiftJson(_ scriptPath: String, _ extraArgs: [String]) -> [String: Any]? {
    let p = Process()
    let pipe = Pipe()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/swift")
    p.arguments = [scriptPath] + extraArgs
    p.standardOutput = pipe
    try? p.run()
    p.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
}

func safeCleanup(_ paths: [String]) {
    let existing = paths.filter { FileManager.default.fileExists(atPath: $0) }
    guard !existing.isEmpty else { return }
    let rmTool = "/opt/xrsec/.env/rmfile"
    if FileManager.default.isExecutableFile(atPath: rmTool) {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: rmTool)
        p.arguments = existing
        try? p.run()
        p.waitUntilExit()
    } else {
        for path in existing {
            try? FileManager.default.removeItem(atPath: path)
        }
    }
}

let args = CommandLine.arguments
guard let targetQuery = getArg("--to"), !targetQuery.isEmpty else {
    fputs("Usage: swift scripts/wechat-send-message.swift --to <联系人/群名/自定义微信号> [--message <文本>] [--draft-only] [--exact-match] [--match-index 0] [--inspect-profile]\n", stderr)
    exit(1)
}

let messageBody = getArg("--message")
let draftOnly = args.contains("--draft-only")
let inspectProfile = args.contains("--inspect-profile")
let exactMatch = args.contains("--exact-match")
let matchIndex = Int(getArg("--match-index") ?? "0") ?? 0
let targetType = getArg("--type") ?? "contact"
let maxScrollAttempts = Int(getArg("--max-scrolls") ?? "8") ?? 8

let tStart = CFAbsoluteTimeGetCurrent()
var traces: [StepTrace] = []
var tempFiles: [String] = []
let pidTag = ProcessInfo.processInfo.processIdentifier
let eventSource = CGEventSource(stateID: .hidSystemState)

func moveSmooth(to end: CGPoint, steps: Int = 14) {
    let start = CGEvent(source: nil)?.location ?? end
    var last = start
    for i in 1...steps {
        let u = Double(i) / Double(steps)
        let t = 1.0 - pow(1.0 - u, 2.4)
        let cur = CGPoint(x: start.x + (end.x - start.x) * CGFloat(t), y: start.y + (end.y - start.y) * CGFloat(t))
        if let ev = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: cur, mouseButton: .left) {
            ev.setIntegerValueField(.mouseEventDeltaX, value: Int64((cur.x - last.x).rounded()))
            ev.setIntegerValueField(.mouseEventDeltaY, value: Int64((cur.y - last.y).rounded()))
            ev.post(tap: .cghidEventTap)
        }
        last = cur
        usleep(6_000)
    }
}

func clickInProcess(_ pt: CGPoint, waitUs: useconds_t = 350_000) {
    moveSmooth(to: pt, steps: 14)
    usleep(45_000)
    if let d = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left),
       let u = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left) {
        d.setIntegerValueField(.mouseEventClickState, value: 1)
        u.setIntegerValueField(.mouseEventClickState, value: 1)
        d.post(tap: .cghidEventTap)
        usleep(72_000)
        u.post(tap: .cghidEventTap)
    }
    usleep(waitUs)
}

func trackpadScrollInProcess(at pt: CGPoint, deltaY: Int32) {
    moveSmooth(to: pt, steps: 8)
    usleep(80_000)
    let phases: [(Int64, Int32)] = [(1, 0), (2, deltaY / 5), (2, deltaY / 4), (2, deltaY / 4), (2, deltaY / 5), (2, deltaY / 10), (4, 0)]
    for (phase, dy) in phases {
        if let ev = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0) {
            ev.location = pt
            ev.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
            ev.setIntegerValueField(.scrollWheelEventScrollPhase, value: phase)
            ev.post(tap: .cghidEventTap)
        }
        usleep(15_000)
    }
    usleep(260_000)
}

func finish(action: String, matched: String?, header: String?, profile: [String]?, certainty: String, exitCode: Int32) -> Never {
    safeCleanup(tempFiles)
    let elapsed = ((CFAbsoluteTimeGetCurrent() - tStart) * 10000).rounded() / 10
    let report = ExecutionResult(
        action: action,
        targetQuery: targetQuery,
        targetType: targetType,
        matchedTargetTitle: matched,
        verifiedHeaderTitle: header,
        profileCardFields: profile,
        messageBody: messageBody,
        certainty: certainty,
        elapsedMs: elapsed,
        traces: traces
    )
    let enc = JSONEncoder()
    enc.outputFormatting = [.prettyPrinted, .sortedKeys]
    if let data = try? enc.encode(report), let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(exitCode)
}

// Step 0: 查找并唤醒微信主窗口
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
var wechatPid: Int32 = 0
var wx = 0.0, wy = 0.0
if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
    for w in list {
        let owner = w[kCGWindowOwnerName as String] as? String ?? ""
        let layer = w[kCGWindowLayer as String] as? Int ?? -1
        if (owner == "微信" || owner == "WeChat") && layer == 0,
           let p = w[kCGWindowOwnerPID as String] as? Int32,
           let b = w[kCGWindowBounds as String] as? [String: Any],
           let x = b["X"] as? Double, let y = b["Y"] as? Double,
           let width = b["Width"] as? Double, width > 350 {
            wechatPid = p; wx = x; wy = y
            break
        }
    }
}
guard wechatPid != 0 else {
    traces.append(StepTrace(step: "0_activate_wechat", status: "FAILED", detail: "未在当前屏幕上找到微信主窗口"))
    finish(action: "error", matched: nil, header: nil, profile: nil, certainty: "REJECTED", exitCode: 2)
}
NSRunningApplication(processIdentifier: wechatPid)?.activate()
usleep(240_000)
traces.append(StepTrace(step: "0_activate_wechat", status: "OK", detail: "已唤醒微信 (PID: \(wechatPid))"))

// 先按一次 Escape 确保旧搜索浮层清空，再点击左上角搜索框安全锚点 (wx + 108, wy + 26) 并通过 Cmd+V 粘贴
if let d = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: true),
   let u = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: false) {
    d.post(tap: .cghidEventTap); usleep(45_000); u.post(tap: .cghidEventTap)
}
usleep(180_000)

let searchClickPt = CGPoint(x: wx + 108.0 + Double.random(in: -12.0...12.0), y: wy + 26.0 + Double.random(in: -3.0...3.0))
clickInProcess(searchClickPt, waitUs: 240_000)

NSPasteboard.general.clearContents()
NSPasteboard.general.setString(targetQuery, forType: .string)
usleep(40_000)
for key: CGKeyCode in [0, 9] { // Cmd+A -> Cmd+V
    if let d = CGEvent(keyboardEventSource: eventSource, virtualKey: key, keyDown: true),
       let u = CGEvent(keyboardEventSource: eventSource, virtualKey: key, keyDown: false) {
        d.flags = .maskCommand; u.flags = .maskCommand
        d.post(tap: .cghidEventTap); usleep(65_000); u.post(tap: .cghidEventTap)
        usleep(120_000)
    }
}
usleep(520_000)
traces.append(StepTrace(step: "1_search_paste", status: "OK", detail: "已在进程内拟人点击搜索框 (\(round(searchClickPt.x*10)/10), \(round(searchClickPt.y*10)/10)) 并通过 Cmd+V 粘贴 '\(targetQuery)'"))

// Step 2: 进程内对 Layer=3 独立搜索小窗口做 OCR + 三重门禁过滤 + 自动点击 [查看全部(N)] + Trackpad 相位滚动
func findPopupBounds() -> (id: Int, x: Double, y: Double, w: Double, h: Double)? {
    guard let wl = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { return nil }
    for w in wl {
        let pid = w[kCGWindowOwnerPID as String] as? Int32 ?? 0
        let layer = w[kCGWindowLayer as String] as? Int ?? 0
        if pid == wechatPid && layer > 0,
           let id = w[kCGWindowNumber as String] as? Int,
           let b = w[kCGWindowBounds as String] as? [String: Any],
           let x = b["X"] as? Double, let y = b["Y"] as? Double,
           let wVal = b["Width"] as? Double, let hVal = b["Height"] as? Double,
           abs((x - wx) - 48.0) < 20.0 {
            return (id, x, y, wVal, hVal)
        }
    }
    return nil
}

func scanPopupOnce(_ pop: (id: Int, x: Double, y: Double, w: Double, h: Double)) -> (matches: [(title: String, clickPt: CGPoint)], expandBtnPt: CGPoint?, hasStrangerLookupOnly: Bool) {
    let tmp = "/tmp/wechat_inproc_popup_\(pidTag).png"
    tempFiles.append(tmp)
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    p.arguments = ["-l", "\(pop.id)", "-o", "-x", tmp]
    try? p.run(); p.waitUntilExit()
    guard let nsImg = NSImage(contentsOfFile: tmp),
          let cgImg = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        return ([], nil, false)
    }
    var raw: [(text: String, rx: Double, ry: Double, rw: Double, rh: Double)] = []
    let req = VNRecognizeTextRequest { r, _ in
        guard let obs = r.results as? [VNRecognizedTextObservation] else { return }
        for o in obs {
            guard let top = o.topCandidates(1).first else { continue }
            let b = o.boundingBox
            let rx = ((Double(b.origin.x) * pop.w) * 10).rounded() / 10
            let ry = (((1.0 - Double(b.origin.y) - Double(b.size.height)) * pop.h) * 10).rounded() / 10
            let rw = ((Double(b.size.width) * pop.w) * 10).rounded() / 10
            let rh = ((Double(b.size.height) * pop.h) * 10).rounded() / 10
            raw.append((top.string, rx, ry, rw, rh))
        }
    }
    req.recognitionLevel = VNRequestTextRecognitionLevel.accurate
    req.recognitionLanguages = ["zh-Hans", "en-US"]
    req.usesLanguageCorrection = true
    try? VNImageRequestHandler(cgImage: cgImg, options: [:]).perform([req])

    var headers: [String: Double] = [:]
    var expandPt: CGPoint? = nil
    var sawStrangerLookup = false

    for item in raw {
        let t = item.text.trimmingCharacters(in: .whitespaces)
        if t.contains("网络查找微信号") { sawStrangerLookup = true }
        if item.rx < 70.0 {
            if t == "联系人" || t == "常使用" || t == "最常使用" || t == "最近使用" {
                if headers["contacts"] == nil { headers["contacts"] = item.ry }
            } else if t.contains("搜索网络结果") || t.contains("网络查找") {
                headers["web_search_FORBIDDEN"] = item.ry
            } else if t == "群聊" {
                headers["groups"] = item.ry
            } else if t == "聊天记录" {
                headers["chat_history"] = item.ry
            } else if t == "功能" || t == "公众号" || t == "小程序" {
                headers["features_FORBIDDEN"] = item.ry
            } else if t.hasPrefix("查看全部") && item.ry < 380.0 {
                expandPt = CGPoint(x: pop.x + item.rx + 36.0, y: pop.y + item.ry + 6.0)
            }
        }
    }

    func sectionForY(_ y: Double) -> String {
        if headers.isEmpty { return "contacts" }
        let sorted = headers.sorted { $0.value < $1.value }
        var cur = "contacts"
        for (sec, hy) in sorted {
            if y >= hy - 3.0 { cur = sec } else { break }
        }
        return cur
    }

    var hits: [(title: String, clickPt: CGPoint)] = []
    for item in raw {
        let t = item.text.trimmingCharacters(in: .whitespaces)
        let sec = sectionForY(item.ry)
        let secAllowed = (targetType == "contact") ? (sec == "contacts") : ((targetType == "group") ? (sec == "groups") : (sec == "contacts" || sec == "groups"))
        guard secAllowed else { continue }
        guard item.rx >= 70.0 && item.rx <= 105.0 else { continue }
        guard !t.contains("网络查找微信号") && !t.hasPrefix("Q ") && !t.hasPrefix("包含") && !t.hasPrefix("描述：") && !t.hasPrefix("标签：") && !t.hasPrefix("地区：") else { continue }

        // 情况 A：匹配到 "微信号：xxx" 或 "昵称：xxx" 副标题，回溯上方 -24pt 的主标题！
        if t.hasPrefix("微信号：") || t.hasPrefix("微信号:") || t.hasPrefix("昵称：") || t.hasPrefix("昵称:") {
            if t.localizedCaseInsensitiveContains(targetQuery) {
                let parentTitle = raw.first(where: { $0.rx >= 70.0 && $0.rx <= 105.0 && (item.ry - $0.ry) >= 18.0 && (item.ry - $0.ry) <= 30.0 })?.text ?? targetQuery
                let clickY = pop.y + item.ry - 14.0
                hits.append((parentTitle, CGPoint(x: pop.x + 115.0, y: clickY)))
            }
            continue
        }

        // 过滤位于主标题正下方 +24pt 的普通副标题
        let hasParentAbove = raw.contains { other in
            other.rx >= 70.0 && other.rx <= 105.0 && (item.ry - other.ry) >= 18.0 && (item.ry - other.ry) <= 30.0 &&
            !other.text.hasPrefix("描述") && !other.text.hasPrefix("标签") && !other.text.hasPrefix("微信号")
        }
        if hasParentAbove { continue }

        let isMatch = exactMatch
            ? (t.caseInsensitiveCompare(targetQuery) == .orderedSame)
            : t.localizedCaseInsensitiveContains(targetQuery)
        if isMatch {
            hits.append((t, CGPoint(x: pop.x + 115.0, y: pop.y + item.ry + 6.0)))
        }
    }

    return (hits, expandPt, sawStrangerLookup && hits.isEmpty && headers["contacts"] == nil)
}

var selectedHit: (title: String, clickPt: CGPoint)? = nil
var didClickExpand = false
var seenTotal = 0

for attempt in 0...maxScrollAttempts {
    guard let pop = findPopupBounds() else { break }
    let scan = scanPopupOnce(pop)
    if scan.hasStrangerLookupOnly {
        traces.append(StepTrace(step: "2_popup_ocr_filter", status: "REJECTED", detail: "输入 '\(targetQuery)' 仅触发【网络查找微信号】陌生人搜索入口（原始 wxid_ 不支持在客户端搜索框直接检索本地会话），已安全拦截！"))
        break
    }
    if !scan.matches.isEmpty {
        if seenTotal + scan.matches.count > matchIndex {
            let idx = max(0, matchIndex - seenTotal)
            selectedHit = scan.matches[min(idx, scan.matches.count - 1)]
            traces.append(StepTrace(step: "2_popup_ocr_filter", status: "OK", detail: "在第 \(attempt + 1) 次扫描中锁定安全目标 [\(selectedHit!.title)] (本屏匹配 \(scan.matches.count) 项)"))
            break
        } else {
            seenTotal += scan.matches.count
        }
    }
    // 若首屏未命中且存在 [查看全部(N)]，在进程内直接点击展开（不切换进程，绝不失焦！）
    if !didClickExpand, let expPt = scan.expandBtnPt {
        didClickExpand = true
        clickInProcess(expPt, waitUs: 420_000)
        traces.append(StepTrace(step: "2a_expand_all_contacts", status: "OK", detail: "已在进程内点击 [查看全部(N)] 展开完整联系人列表"))
        continue
    }
    if attempt < maxScrollAttempts {
        // 在小窗口左侧文字安全区 (pop.x + 125, pop.y + 300) 发送真实 Trackpad 相位滚动
        trackpadScrollInProcess(at: CGPoint(x: pop.x + 125.0, y: pop.y + 300.0), deltaY: -280)
    }
}

guard let hit = selectedHit else {
    if let d = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: true),
       let u = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: false) {
        d.post(tap: .cghidEventTap); usleep(45_000); u.post(tap: .cghidEventTap)
    }
    finish(action: "search_target", matched: nil, header: nil, profile: nil, certainty: "REJECTED", exitCode: 4)
}

// Step 3: 在进程内直接拟人点击命中的联系人行 (避开右侧 x > pw-70 的 ⓘ 悬浮预览区)
clickInProcess(hit.clickPt, waitUs: 460_000)
traces.append(StepTrace(step: "3_click_search_result", status: "OK", detail: "已拟人点击搜索结果 [\(hit.title)] 左侧文字安全区 (\(round(hit.clickPt.x*10)/10), \(round(hit.clickPt.y*10)/10))"))

// Step 4: 发送前二次核验！重新执行实时区域划分，仅截 chat_title_text_roi 核验标题
let titleImgPath = "/tmp/wechat_title_\(pidTag).png"
tempFiles.append(titleImgPath)
guard let titleReport = runSwiftJson(ocrScript, ["--region", "chat_title_text_roi", "--capture", titleImgPath]),
      let titleBlocks = titleReport["blocks"] as? [[String: Any]] else {
    traces.append(StepTrace(step: "4_verify_chat_header", status: "FAILED", detail: "无法读取聊天标题栏"))
    finish(action: "verify_header", matched: hit.title, header: nil, profile: nil, certainty: "REJECTED", exitCode: 5)
}

let headerTitle = titleBlocks.compactMap { $0["text"] as? String }.joined(separator: " ").trimmingCharacters(in: .whitespaces)
guard headerTitle.localizedCaseInsensitiveContains(hit.title) || hit.title.localizedCaseInsensitiveContains(headerTitle) || headerTitle.localizedCaseInsensitiveContains(targetQuery) else {
    traces.append(StepTrace(step: "4_verify_chat_header", status: "REJECTED", detail: "标题栏二次核验不匹配：期望 [\(hit.title)]，实际为 [\(headerTitle)]，已熔断停止！"))
    finish(action: "verify_header", matched: hit.title, header: headerTitle, profile: nil, certainty: "REJECTED", exitCode: 6)
}
traces.append(StepTrace(step: "4_verify_chat_header", status: "OK", detail: "标题栏二次核验通过：当前会话确认为 [\(headerTitle)]"))

// 可选：进程内保焦点击右上角 ••• -> 点击抽屉内头像 -> 捕获 328×640 独立用户信息卡片
var profileFields: [String]? = nil
if inspectProfile {
    // 获取主窗口当前宽度 Ww
    var curWw = 941.0
    if let wl = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
        for w in wl {
            if (w[kCGWindowOwnerPID as String] as? Int32) == wechatPid && (w[kCGWindowLayer as String] as? Int) == 0,
               let b = w[kCGWindowBounds as String] as? [String: Any],
               let wVal = b["Width"] as? Double, wVal > 350 {
                curWw = wVal; break
            }
        }
    }
    if let part = runSwiftJson(locatorScript, []),
       let expanded = part["rightDrawerExpanded"] as? Bool, !expanded {
        clickInProcess(CGPoint(x: wx + curWw - 32.0, y: wy + 26.0), waitUs: 480_000)
    }
    // 点击右侧抽屉左上角联系人头像 (wx + curWw - 219, wy + 84)
    clickInProcess(CGPoint(x: wx + curWw - 219.0, y: wy + 84.0), waitUs: 550_000)

    // 在进程内直接找到 328×640 独立用户信息子窗口并立即单截 + OCR！
    if let wl = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
        for w in wl {
            if (w[kCGWindowOwnerPID as String] as? Int32) == wechatPid,
               let cId = w[kCGWindowNumber as String] as? Int,
               let b = w[kCGWindowBounds as String] as? [String: Any],
               let cw = b["Width"] as? Double, let ch = b["Height"] as? Double,
               abs(cw - 328.0) < 20.0 {
                let cardImgPath = "/tmp/wechat_card_\(pidTag).png"
                tempFiles.append(cardImgPath)
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
                p.arguments = ["-l", "\(cId)", "-o", "-x", cardImgPath]
                try? p.run(); p.waitUntilExit()
                if let nsImg = NSImage(contentsOfFile: cardImgPath),
                   let cgImg = nsImg.cgImage(forProposedRect: nil, context: nil, hints: nil) {
                    var fields: [String] = []
                    let req = VNRecognizeTextRequest { r, _ in
                        guard let obs = r.results as? [VNRecognizedTextObservation] else { return }
                        for o in obs {
                            if let top = o.topCandidates(1).first { fields.append(top.string) }
                        }
                    }
                    req.recognitionLevel = VNRequestTextRecognitionLevel.accurate
                    req.recognitionLanguages = ["zh-Hans", "en-US"]
                    req.usesLanguageCorrection = true
                    try? VNImageRequestHandler(cgImage: cgImg, options: [:]).perform([req])
                    profileFields = fields
                    traces.append(StepTrace(step: "4b_inspect_profile_card", status: "OK", detail: "已提取独立用户信息子窗口 (\(fields.count) 个字段, 尺寸 \(Int(cw))×\(Int(ch)))"))
                }
                break
            }
        }
    }
    if let d = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: true),
       let u = CGEvent(keyboardEventSource: eventSource, virtualKey: 53, keyDown: false) {
        d.post(tap: .cghidEventTap); usleep(50_000); u.post(tap: .cghidEventTap)
    }
    usleep(220_000)
    if messageBody == nil {
        finish(action: "inspect_profile", matched: hit.title, header: headerTitle, profile: profileFields, certainty: "CONFIRMED", exitCode: 0)
    }
}

guard let msg = messageBody, !msg.isEmpty else {
    finish(action: "navigate_only", matched: hit.title, header: headerTitle, profile: profileFields, certainty: "CONFIRMED", exitCode: 0)
}

// Step 5: 拟人点击动态划分出的 chat_input_text_editor -> Cmd+V 粘贴正文
_ = runSwiftJson(inputScript, ["--target-region", "chat_input_text_editor", "--paste", msg, "--execute"])
usleep(180_000)
traces.append(StepTrace(step: "5_paste_message_body", status: "OK", detail: "已拟人点击 chat_input_text_editor 并通过 Cmd+V 粘贴正文 (\(msg.count) 字符)"))

if draftOnly {
    traces.append(StepTrace(step: "6_draft_only_complete", status: "OK", detail: "draft.write 模式：仅填入草稿，不触发发送"))
    finish(action: "draft.write", matched: hit.title, header: headerTitle, profile: profileFields, certainty: "CONFIRMED", exitCode: 0)
}

// Step 6: 拟人点击动态划分出的 chat_send_btn 发送消息
guard let sendStep = runSwiftJson(inputScript, ["--target-region", "chat_send_btn", "--execute"]) else {
    traces.append(StepTrace(step: "6_click_send_btn", status: "FAILED", detail: "点击发送按钮失败"))
    finish(action: "message.send", matched: hit.title, header: headerTitle, profile: profileFields, certainty: "UNCERTAIN", exitCode: 7)
}
traces.append(StepTrace(step: "6_click_send_btn", status: "OK", detail: "已拟人点击 chat_send_btn，高斯落点: \(sendStep["gaussianTargetPoint"] ?? [:])"))
usleep(480_000)

// Step 7: 发送后上屏核验
let sentImgPath = "/tmp/wechat_sent_\(pidTag).png"
tempFiles.append(sentImgPath)
var sendCertainty = "UNCERTAIN"
if let verifyReport = runSwiftJson(ocrScript, ["--region", "5_chat_message_viewport", "--capture", sentImgPath]),
   let vBlocks = verifyReport["blocks"] as? [[String: Any]] {
    let recentTexts = vBlocks.suffix(8).compactMap { $0["text"] as? String }
    let prefixProbe = String(msg.prefix(min(6, msg.count))).replacingOccurrences(of: "(", with: "").trimmingCharacters(in: .whitespaces)
    if recentTexts.contains(where: { $0.localizedCaseInsensitiveContains(prefixProbe) }) {
        sendCertainty = "CONFIRMED"
        traces.append(StepTrace(step: "7_post_send_verify", status: "CONFIRMED", detail: "已在消息视口底部核验到上屏文本: \(recentTexts.suffix(3))"))
    } else {
        traces.append(StepTrace(step: "7_post_send_verify", status: "UNCERTAIN", detail: "已点击发送但未在视口底部匹配到特征前缀，严禁自动重试！"))
    }
}

finish(action: "message.send", matched: hit.title, header: headerTitle, profile: profileFields, certainty: sendCertainty, exitCode: 0)
