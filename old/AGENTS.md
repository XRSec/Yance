# Archived Yance AI Development Guide

> 本文件仅适用于 `old/` 中停止维护的历史实现。当前项目方向以 [`../docs/`](../docs/README.md) 为准。

## Entry-point rules

- macOS backend is the single source of truth for chat context, memory, and LLM.
- Android and Web are clients — they POST context and GET suggestions, never run LLM locally in v1.
- All LLM calls go through `server/Sources/Yance/LLM/`.
- All persistence goes through `server/Sources/Yance/Store/`.

## Safety

- Default: read-only observation. Writing to input boxes or clicking send requires explicit user action.
- Never auto-send messages. Suggestions are displayed; user confirms.
- Chat content stays on the local network (macOS ↔ Android). No cloud relay in v1.
- 历史设计目标曾计划使用 SQLCipher/Keychain 做本地加密；当前归档快照证据不足，不能声称 SQLite 文件已加密。

## Verification

```bash
# Swift
cd server && swift build

# Web
cd web && npx tsc --noEmit

# Android
cd android && ./gradlew assembleDebug
```

## API contract

- `POST /api/reply` — context in, suggestions out
- `POST /api/optimize` — draft in, refined text out
- `GET /api/memory/:contact` — contact memory
- `GET /api/conversations` — conversation list
- `GET /api/health` — server status

Do not add endpoints without updating this file and `README.md`.
