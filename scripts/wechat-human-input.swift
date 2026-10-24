#!/usr/bin/env swift
// =============================================================================
// wechat-human-input.swift
// 职责：实现文档中的 HumanMouseController、小窗口悬停平滑滚动与剪贴板粘贴输入控制器：
//   1. Box-Muller 二维截断高斯落点 + 三阶贝塞尔手腕弧度 + Fitts's Law 非对称减速瞄准；
//   2. CGEvent 底层 mouseEventDeltaX / mouseEventDeltaY 硬件增量注入 + 对数正态按压时长；
//   3. 微信内所有文本输入统一采用剪贴板粘贴 (--paste "文本"，写入 NSPasteboard + 拟人停顿 + Cmd+V)，
//      严禁逐字敲击键盘（彻底规避中文输入法状态干扰与逐字键入节奏特征）；
//   4. 搜索小窗口平滑滚动 (--scroll-popup <deltaY>)：先将鼠标沿贝塞尔轨迹移入左上角搜索小窗口
//      (Wx+48, Wy+35, 511×613) 内部中心区域悬停，再分帧发送像素级滚轮事件 (.pixel)。
// 用法：
//   swift scripts/wechat-human-input.swift --rect 1069,1589,96,24 [--paste "测试联系人A"] [--select-all] [--execute]
//   swift scripts/wechat-human-input.swift --scroll-popup -240 [--execute]
// =============================================================================

import Foundation
import CoreGraphics
import AppKit

public final class HumanInputController {
    private let eventSource: CGEventSource?
    private let baseFrameInterval: Double = 0.006

    public init() {
        self.eventSource = CGEventSource(stateID: .hidSystemState)
    }

    public func gaussianTargetPoint(in rect: CGRect, safeMarginRatio: CGFloat = 0.15) -> CGPoint {
        let centerX = rect.midX
        let centerY = rect.midY
        let sigmaX = (rect.width * (1.0 - safeMarginRatio * 2)) / 6.0
        let sigmaY = (rect.height * (1.0 - safeMarginRatio * 2)) / 6.0
        let (z0, z1) = boxMullerRandom()
        let rawX = centerX + CGFloat(z0) * sigmaX
        let rawY = centerY + CGFloat(z1) * sigmaY
        let minX = rect.minX + rect.width * safeMarginRatio
        let maxX = rect.maxX - rect.width * safeMarginRatio
        let minY = rect.minY + rect.height * safeMarginRatio
        let maxY = rect.maxY - rect.height * safeMarginRatio
        return CGPoint(
            x: min(max(rawX, minX), maxX),
            y: min(max(rawY, minY), maxY)
        )
    }

    private func boxMullerRandom() -> (Double, Double) {
        let u1 = Double.random(in: Double.ulpOfOne...1.0)
        let u2 = Double.random(in: 0.0...1.0)
        let mag = sqrt(-2.0 * log(u1))
        let z0 = mag * cos(2.0 * .pi * u2)
        let z1 = mag * sin(2.0 * .pi * u2)
        return (z0, z1)
    }

    public func buildTrajectory(from start: CGPoint, to target: CGPoint, targetWidth: CGFloat = 40.0) -> (durationMs: Double, frames: [(point: CGPoint, deltaX: Int64, deltaY: Int64, sleepUs: UInt32)]) {
        let dx = target.x - start.x
        let dy = target.y - start.y
        let distance = hypot(dx, dy)
        if distance < 2.0 {
            return (10.0, [(target, Int64(dx.rounded()), Int64(dy.rounded()), 6000)])
        }

        let fittsIndex = log2(Double(distance / max(targetWidth, 10.0)) + 1.0)
        let baseDuration = 0.12 + 0.105 * fittsIndex
        let jitter = Double.random(in: -0.025...0.035)
        let totalDuration = max(0.08, baseDuration + jitter)

        let (p1, p2) = generateControlPoints(from: start, to: target, distance: distance)
        let steps = max(Int(totalDuration / baseFrameInterval), 12)
        let easeExponent = Double.random(in: 2.2...2.8)

        var lastPoint = start
        var frames: [(point: CGPoint, deltaX: Int64, deltaY: Int64, sleepUs: UInt32)] = []

        for step in 1...steps {
            let u = Double(step) / Double(steps)
            let t = 1.0 - pow(1.0 - u, easeExponent)
            var currentPos = cubicBezier(t: CGFloat(t), p0: start, p1: p1, p2: p2, p3: target)

            if u < 0.85 {
                let (nx, ny) = boxMullerRandom()
                let tremorScale = CGFloat(1.0 - u) * 0.8
                currentPos.x += CGFloat(nx) * tremorScale
                currentPos.y += CGFloat(ny) * tremorScale
            }

            let stepDeltaX = Int64((currentPos.x - lastPoint.x).rounded())
            let stepDeltaY = Int64((currentPos.y - lastPoint.y).rounded())
            let frameSleep = (totalDuration / Double(steps)) * Double.random(in: 0.85...1.15)
            frames.append((currentPos, stepDeltaX, stepDeltaY, UInt32(frameSleep * 1_000_000)))
            lastPoint = currentPos
        }

        let finalDx = Int64((target.x - lastPoint.x).rounded())
        let finalDy = Int64((target.y - lastPoint.y).rounded())
        if finalDx != 0 || finalDy != 0 {
            frames.append((target, finalDx, finalDy, 4000))
        }
        return (totalDuration * 1000.0, frames)
    }

    private func generateControlPoints(from start: CGPoint, to end: CGPoint, distance: CGFloat) -> (CGPoint, CGPoint) {
        let dx = end.x - start.x
        let dy = end.y - start.y
        let normX = -dy / distance
        let normY = dx / distance
        let arcDirection: CGFloat = Bool.random() ? 1.0 : -1.0
        let spread1 = distance * CGFloat.random(in: 0.08...0.22) * arcDirection
        let sCurveFactor: CGFloat = (Double.random(in: 0...1) < 0.75) ? 1.0 : -0.4
        let spread2 = distance * CGFloat.random(in: 0.05...0.16) * arcDirection * sCurveFactor
        let t1 = CGFloat.random(in: 0.20...0.38)
        let t2 = CGFloat.random(in: 0.62...0.82)
        let p1 = CGPoint(x: start.x + dx * t1 + normX * spread1, y: start.y + dy * t1 + normY * spread1)
        let p2 = CGPoint(x: start.x + dx * t2 + normX * spread2, y: start.y + dy * t2 + normY * spread2)
        return (p1, p2)
    }

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

    public func generateLogNormalDelay(medianMs: Double, sigma: Double, minMs: Double, maxMs: Double) -> Double {
        let (z, _) = boxMullerRandom()
        let mu = log(medianMs)
        let sample = exp(mu + sigma * z)
        return min(max(sample, minMs), maxMs)
    }

    /// 剪贴板粘贴输入（微信内唯一允许的文本输入方式，严禁逐字键入）
    public func pasteText(_ text: String, selectAllFirst: Bool = false, execute: Bool = false) -> [String: Any] {
        let prePastePauseMs = generateLogNormalDelay(medianMs: 240.0, sigma: 0.22, minMs: 160.0, maxMs: 420.0)
        let cmdADwellMs = generateLogNormalDelay(medianMs: 68.0, sigma: 0.20, minMs: 48.0, maxMs: 115.0)
        let betweenShortcutPauseMs = generateLogNormalDelay(medianMs: 110.0, sigma: 0.22, minMs: 75.0, maxMs: 190.0)
        let cmdVDwellMs = generateLogNormalDelay(medianMs: 74.0, sigma: 0.22, minMs: 52.0, maxMs: 130.0)
        let postPasteRenderWaitMs = generateLogNormalDelay(medianMs: 520.0, sigma: 0.18, minMs: 380.0, maxMs: 780.0)

        if execute {
            usleep(useconds_t(prePastePauseMs * 1000))
            let pb = NSPasteboard.general
            pb.clearContents()
            pb.setString(text, forType: .string)
            usleep(40_000)

            if selectAllFirst {
                sendCommandChord(keyCode: 0, dwellMs: cmdADwellMs) // Cmd + A
                usleep(useconds_t(betweenShortcutPauseMs * 1000))
            }
            sendCommandChord(keyCode: 9, dwellMs: cmdVDwellMs) // Cmd + V
            usleep(useconds_t(postPasteRenderWaitMs * 1000))
        }

        return [
            "inputMethod": "clipboard_paste_only (Cmd+V)",
            "charByCharTypingAllowed": false,
            "selectAllFirst": selectAllFirst,
            "textLength": text.count,
            "prePastePauseMs": round(prePastePauseMs * 10) / 10,
            "cmdVDwellMs": round(cmdVDwellMs * 10) / 10,
            "postPasteRenderWaitMs": round(postPasteRenderWaitMs * 10) / 10
        ]
    }

    /// 先将鼠标拟人化移入搜索小窗口左侧文字安全悬停区（避开右侧 x > pw-70 的 ⓘ 悬浮预览图标），
    /// 再发送带 kCGScrollWheelEventIsContinuous=1 与 scrollPhase (began=1 -> changed=2 -> ended=4) 的真实触控板滚动！
    public func hoverAndScrollPopup(popupRect: CGRect, totalDeltaY: Int32, execute: Bool = false) -> [String: Any] {
        // 严格限制悬停在左侧文字区域 [80..200pt]，绝不碰右侧 ⓘ 预览图标 (pw - 54pt)
        let hoverRect = CGRect(
            x: popupRect.origin.x + 85.0,
            y: popupRect.origin.y + popupRect.height * 0.30,
            width: min(115.0, max(60.0, popupRect.width - 170.0)),
            height: max(120.0, popupRect.height * 0.35)
        )
        let start = CGEvent(source: nil)?.location ?? CGPoint(x: 200, y: 200)
        let hoverTarget = gaussianTargetPoint(in: hoverRect)
        let (moveDurationMs, moveFrames) = buildTrajectory(from: start, to: hoverTarget, targetWidth: hoverRect.width)
        let preScrollPauseMs = generateLogNormalDelay(medianMs: 120.0, sigma: 0.20, minMs: 80.0, maxMs: 200.0)

        let weights: [Double] = [0.10, 0.22, 0.28, 0.22, 0.12, 0.06]
        var scrollPulses: [Int32] = []
        var accumulated: Int32 = 0
        for i in 0..<weights.count {
            let pulse = (i == weights.count - 1)
                ? (totalDeltaY - accumulated)
                : Int32((Double(totalDeltaY) * weights[i]).rounded())
            scrollPulses.append(pulse)
            accumulated += pulse
        }

        if execute {
            for f in moveFrames {
                postMouseMove(to: f.point, deltaX: f.deltaX, deltaY: f.deltaY)
                usleep(f.sleepUs)
            }
            usleep(useconds_t(preScrollPauseMs * 1000))

            // 1. Phase Began (1)
            if let beginEv = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 1, wheel1: 0, wheel2: 0, wheel3: 0) {
                beginEv.location = hoverTarget
                beginEv.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
                beginEv.setIntegerValueField(.scrollWheelEventScrollPhase, value: 1)
                beginEv.post(tap: .cghidEventTap)
            }
            usleep(12_000)

            // 2. Phase Changed (2)
            for pulse in scrollPulses {
                if let changeEv = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 1, wheel1: pulse, wheel2: 0, wheel3: 0) {
                    changeEv.location = hoverTarget
                    changeEv.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
                    changeEv.setIntegerValueField(.scrollWheelEventScrollPhase, value: 2)
                    changeEv.post(tap: .cghidEventTap)
                }
                let stepSleepMs = generateLogNormalDelay(medianMs: 15.0, sigma: 0.15, minMs: 10.0, maxMs: 25.0)
                usleep(useconds_t(stepSleepMs * 1000))
            }

            // 3. Phase Ended (4)
            if let endEv = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 1, wheel1: 0, wheel2: 0, wheel3: 0) {
                endEv.location = hoverTarget
                endEv.setIntegerValueField(.scrollWheelEventIsContinuous, value: 1)
                endEv.setIntegerValueField(.scrollWheelEventScrollPhase, value: 4)
                endEv.post(tap: .cghidEventTap)
            }
        }

        return [
            "action": "hover_and_scroll_search_popup",
            "executed": execute,
            "popupBounds": ["x": popupRect.origin.x, "y": popupRect.origin.y, "width": popupRect.width, "height": popupRect.height],
            "hoverTargetPoint": ["x": round(hoverTarget.x * 10) / 10, "y": round(hoverTarget.y * 10) / 10],
            "moveDurationMs": round(moveDurationMs * 10) / 10,
            "preScrollPauseMs": round(preScrollPauseMs * 10) / 10,
            "totalScrollDeltaPx": totalDeltaY,
            "scrollPulses": scrollPulses
        ]
    }

    public func humanClick(in targetRect: CGRect, pasteAfterClick: String? = nil, selectAll: Bool = false, execute: Bool = false) -> [String: Any] {
        let start = CGEvent(source: nil)?.location ?? CGPoint(x: 200, y: 200)
        let targetPoint = gaussianTargetPoint(in: targetRect)
        let (durationMs, frames) = buildTrajectory(from: start, to: targetPoint, targetWidth: targetRect.width)
        let preClickPauseMs = generateLogNormalDelay(medianMs: 55.0, sigma: 0.25, minMs: 30.0, maxMs: 120.0)
        let dwellTimeMs = generateLogNormalDelay(medianMs: 78.0, sigma: 0.22, minMs: 52.0, maxMs: 145.0)

        if execute {
            for f in frames {
                postMouseMove(to: f.point, deltaX: f.deltaX, deltaY: f.deltaY)
                usleep(f.sleepUs)
            }
            usleep(useconds_t(preClickPauseMs * 1000))
            performClickAt(point: targetPoint, clickCount: 1, dwellTimeMs: dwellTimeMs)
        }

        var result: [String: Any] = [
            "executed": execute,
            "startPoint": ["x": round(start.x * 10) / 10, "y": round(start.y * 10) / 10],
            "gaussianTargetPoint": ["x": round(targetPoint.x * 10) / 10, "y": round(targetPoint.y * 10) / 10],
            "fittsMoveDurationMs": round(durationMs * 10) / 10,
            "frameCount": frames.count,
            "preClickPauseMs": round(preClickPauseMs * 10) / 10,
            "dwellTimeMs": round(dwellTimeMs * 10) / 10,
            "sampleFrames": frames.prefix(4).map { [
                "x": round($0.point.x * 10) / 10,
                "y": round($0.point.y * 10) / 10,
                "deltaX": $0.deltaX,
                "deltaY": $0.deltaY
            ] }
        ]

        if let textToPaste = pasteAfterClick {
            result["pasteOperation"] = pasteText(textToPaste, selectAllFirst: selectAll, execute: execute)
        }
        return result
    }

    private func sendCommandChord(keyCode: CGKeyCode, dwellMs: Double) {
        guard let down = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: true),
              let up = CGEvent(keyboardEventSource: eventSource, virtualKey: keyCode, keyDown: false) else { return }
        down.flags = .maskCommand
        up.flags = .maskCommand
        down.post(tap: .cghidEventTap)
        usleep(useconds_t(dwellMs * 1000))
        up.post(tap: .cghidEventTap)
    }

    private func performClickAt(point: CGPoint, clickCount: Int64, dwellTimeMs: Double) {
        guard let downEvent = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
              let upEvent = CGEvent(mouseEventSource: eventSource, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left) else { return }
        downEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
        upEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
        downEvent.post(tap: .cghidEventTap)
        usleep(useconds_t(dwellTimeMs * 1000))
        upEvent.post(tap: .cghidEventTap)
    }

    private func postMouseMove(to point: CGPoint, deltaX: Int64, deltaY: Int64) {
        guard let moveEvent = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: point, mouseButton: .left) else { return }
        moveEvent.setIntegerValueField(.mouseEventDeltaX, value: deltaX)
        moveEvent.setIntegerValueField(.mouseEventDeltaY, value: deltaY)
        moveEvent.post(tap: .cghidEventTap)
    }
}

func getArg(_ flag: String) -> String? {
    let args = CommandLine.arguments
    if let idx = args.firstIndex(of: flag), idx + 1 < args.count {
        return args[idx + 1]
    }
    return nil
}

let args = CommandLine.arguments
let execute = args.contains("--execute")
let selectAll = args.contains("--select-all")
let pasteStr = getArg("--paste")
let controller = HumanInputController()

if let scrollStr = getArg("--scroll-popup"), let deltaY = Int32(scrollStr) {
    // 优先直接从 WindowServer 读取 Layer == 3 搜索小窗口的实时动态 Bounds；若未弹出则按左上角偏移与列表宽度估算
    var popupRect = CGRect(x: 1043, y: 1608, width: 280, height: 613)
    let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] {
        var wechatPid = 0
        for w in list {
            let owner = w[kCGWindowOwnerName as String] as? String ?? ""
            let layer = w[kCGWindowLayer as String] as? Int ?? -1
            if (owner == "微信" || owner == "WeChat") && layer == 0,
               let b = w[kCGWindowBounds as String] as? [String: Any],
               let wx = b["X"] as? Double, let wy = b["Y"] as? Double,
               let ww = b["Width"] as? Double, ww > 300 {
                wechatPid = w[kCGWindowOwnerPID as String] as? Int ?? 0
                popupRect = CGRect(x: wx + 48.0, y: wy + 35.0, width: 280.0, height: 613.0)
                break
            }
        }
        if wechatPid != 0 {
            for w in list {
                let pid = w[kCGWindowOwnerPID as String] as? Int ?? 0
                let layer = w[kCGWindowLayer as String] as? Int ?? 0
                if pid == wechatPid && layer > 0,
                   let pb = w[kCGWindowBounds as String] as? [String: Any],
                   let px = pb["X"] as? Double, let py = pb["Y"] as? Double,
                   let pw = pb["Width"] as? Double, let ph = pb["Height"] as? Double {
                    popupRect = CGRect(x: px, y: py, width: pw, height: ph)
                    break
                }
            }
        }
    }
    let res = controller.hoverAndScrollPopup(popupRect: popupRect, totalDeltaY: deltaY, execute: execute)
    if let data = try? JSONSerialization.data(withJSONObject: res, options: [.prettyPrinted, .sortedKeys]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
} else {
    var rect = CGRect(x: 1069, y: 1589, width: 96, height: 24)
    if let regionId = getArg("--target-region") {
        // 每次执行前先实时运行 wechat-window-locator.swift 划分区域，零硬编码长宽高！
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
                rect = CGRect(x: x, y: y, width: w, height: h)
            }
        }
    } else if let rectStr = getArg("--rect") {
        let parts = rectStr.split(separator: ",").compactMap { Double($0) }
        if parts.count == 4 {
            rect = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
        }
    }
    let res = controller.humanClick(in: rect, pasteAfterClick: pasteStr, selectAll: selectAll, execute: execute)
    if let data = try? JSONSerialization.data(withJSONObject: res, options: [.prettyPrinted, .sortedKeys]),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
}
