# Yance 旧实现归档

> **停止维护**：本目录仅保留规划重启前的历史代码与实验记录。当前产品方向以 [`../docs/`](../docs/README.md) 为准；请勿将本目录视为现行架构、受支持实现、可直接发布的产品或 current quick start。归档内容不随现行规划同步，只有可证明的文档事实错误、安全风险说明或失效跳转可做最小修正。

## 原项目说明

> 理解上下文，帮你制定更好的表达。

跨平台 AI 沟通副驾驶。macOS 后端是聊天采集、记忆、LLM 与实际发送的唯一来源；Android 端是只供用户决策的移动审批收件箱，Web 端提供管理面板。

---

## 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                 macOS Server (Swift)                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ AX Collector │  │ Vision / OCR │  │  LLM Gateway   │  │
│  │ (AXUIElement)│  │(ScreenCapture│  │ (OpenAI/Claude │  │
│  │              │  │ + Vision.fw) │  │  /Gemini/Local)│  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│         ▼                 ▼                   │           │
│  ┌─────────────────────────────┐              │           │
│  │     Context Normalizer      │──────────────┘           │
│  │ (统一消息格式 + 去重 + 方向)  │                          │
│  └──────────┬──────────────────┘                          │
│             ▼                                             │
│  ┌─────────────────────────────┐                          │
│  │     SQLite Store            │                          │
│  │  conversations              │                          │
│  │  messages                   │                          │
│  │  summaries                  │                          │
│  │  memories                   │                          │
│  └──────────┬──────────────────┘                          │
│             ▼                                             │
│  ┌─────────────────────────────┐                          │
│  │     HTTP API (Vapor)        │ ◄── :8080                │
│  │  POST /api/reply            │                          │
│  │  POST /api/optimize         │                          │
│  │  GET  /api/memory/:contact  │                          │
│  │  GET  /api/conversations    │                          │
│  │  GET  /api/health           │                          │
│  └─────────────────────────────┘                          │
└──────────────────────────────────────────────────────────┘
        ▲               ▲
        │               │
┌───────┴────────┐ ┌────┴──────────┐
│ Android Client │ │ Web Dashboard │
│   (Kotlin)     │ │ (TypeScript)  │
└────────────────┘ └───────────────┘
```

---

## Android 端开发指南

### 职责

Android 端是**移动审批收件箱**，不读取其他 App、不运行 LLM，也不执行真实发送。它只负责：

1. 展示 macOS 后端汇总的微信、小红书、闲鱼待处理任务；
2. 展示 AI 候选回复，或把用户草稿交给后端润色；
3. 让用户明确确认最终文本；
4. 把确认结果交回 macOS 后端，由后端执行发送。

Android 仅声明网络权限，不需要无障碍、TalkBack、悬浮窗或 OCR 权限。

### 当前 Mock 流程

```text
主页 / 微信 / 小红书 / 闲鱼
        │
        ▼
选择待处理消息
        │
        ├── 选择 AI 候选
        ├── Mock 重新生成
        └── 输入草稿并 Mock 润色
        │
        ▼
二次确认最终回复
        │
        ▼
Mock 标记为已发送（不会调用任何聊天 App）
```

`MockTaskRepository` 是当前唯一数据源。任务使用 `taskId + version + reply` 创建确认快照；候选变化后，旧确认不能提交，避免重复或过期发送。

### 同步策略

- **前台**：Activity 在 `onStart` 订阅仓库，在 `onStop` 关闭订阅。远程仓库接入后，这一订阅边界用于建立和关闭 SSE。
- **后台**：远程数据源接入后由 `WorkManager` 每 15 分钟刷新一次；这是 Android 周期任务允许的最短间隔。
- **Mock 模式**：没有远程数据源，不建立伪 SSE 连接，也不调度无意义后台任务。
- **恢复前台**：重新订阅单一数据源并刷新界面，不在后台维持 5 秒轮询或长连接。

首版仍只使用 Mock 数据，服务端任务列表、SSE 和发送任务接口尚未加入。新增接口时必须同步更新本文件与 `AGENTS.md`。

### Android 模块

| 模块 | 说明 |
| --- | --- |
| `MainActivity` | 分类收件箱、任务详情、回复选择和二次确认 |
| `TaskRepository` | 前台订阅、刷新和审批操作边界 |
| `MockTaskRepository` | 当前 Mock 任务及状态变更 |
| `TaskSyncWorker` | 远程数据源接入后的 15 分钟后台同步调度 |
| `ApprovalModels` | 渠道、任务、候选回复和确认快照 |
| `ApiClient` | 现有 `/api/reply`、`/api/optimize` 局域网客户端 |

---

## API 详细文档

所有请求/响应均为 JSON，`Content-Type: application/json`。

### `POST /api/reply`

根据聊天上下文生成回复建议。

**Request:**

```json
{
  "app": "com.tencent.mm",
  "contact": "张三",
  "messages": [
    {
      "direction": "incoming",
      "text": "你好，两居室还有吗？",
      "messageType": "text",
      "confidence": 0.95,
      "contentHash": "a1b2c3d4"
    },
    {
      "direction": "incoming",
      "text": "预算6000左右",
      "messageType": "text",
      "confidence": 0.92,
      "contentHash": "e5f6g7h8"
    }
  ],
  "intent": "",
  "timestamp": 1724567890000
}
```

- `messages`: 按时间正序，最新的在最后
- `intent`: 用户想表达的意思（可选，为空则纯靠上下文生成）
- `confidence`: 文本提取置信度，OCR 场景可能低于 1.0
- `contentHash`: 用于服务端去重，推荐 MD5(text)

**Response:**

```json
{
  "suggestions": [
    {
      "id": "sug_001",
      "style": "professional",
      "text": "您好！目前还有两套两居室，一套朝南6200元，一套朝北5800元。请问您方便什么时候来看房？",
      "reasoning": "对方明确了户型和预算，直接给出匹配房源并推进看房"
    },
    {
      "id": "sug_002",
      "style": "casual",
      "text": "有的有的～正好有两套适合你的，价格也在预算内。你看明天或后天有空吗？",
      "reasoning": "轻松语气降低压力，快速推进"
    },
    {
      "id": "sug_003",
      "style": "direct",
      "text": "有，5800和6200两个价位，什么时候看？",
      "reasoning": "最短回复，适合对方也偏直接的沟通风格"
    }
  ],
  "context_used": {
    "recent_messages": 2,
    "summaries": 0,
    "memories": 1
  }
}
```

### `POST /api/optimize`

优化用户已经输入的草稿。

**Request:**

```json
{
  "app": "com.tencent.mm",
  "contact": "张三",
  "draft": "有的你什么时候来看",
  "style": "professional",
  "context_messages": [
    {
      "direction": "incoming",
      "text": "两居室还有吗",
      "messageType": "text",
      "confidence": 0.95,
      "contentHash": "a1b2c3d4"
    }
  ]
}
```

- `context_messages`: 可选，如果 Android 端已有上下文可以一并发送
- `style`: `professional` / `casual` / `direct` / `warm`

**Response:**

```json
{
  "optimized": "有的，请问您什么时候方便过来看房？我可以提前安排。",
  "changes": "补充礼貌用语，添加跟进动作",
  "alternatives": [
    "有的！您方便的话我安排一下看房时间？"
  ]
}
```

### `GET /api/memory/{contact}`

获取联系人记忆（Web 面板用）。

**Response:**

```json
{
  "contact": "张三",
  "first_seen": "2024-03-15T10:00:00Z",
  "last_active": "2024-08-25T14:30:00Z",
  "message_count": 47,
  "preferences": [
    "预算6000元左右",
    "偏好两居室",
    "浦东区域"
  ],
  "relationship": "潜在租客",
  "open_tasks": [
    "周五发送浦东房源列表"
  ],
  "recent_summaries": [
    {
      "period": "2024-08-20 ~ 2024-08-25",
      "summary": "对方在寻找浦东两居室，预算约6000元，月底前入住。已约周六看房。"
    }
  ]
}
```

### `GET /api/conversations`

获取对话列表。

**Response:**

```json
{
  "conversations": [
    {
      "contact": "张三",
      "app": "com.tencent.mm",
      "last_message": "预算6000左右",
      "last_active": "2024-08-25T14:30:00Z",
      "message_count": 47,
      "unanalyzed": 3
    }
  ],
  "total": 1
}
```

### `GET /api/health`

服务健康检查。

**Response:**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime_seconds": 3600,
  "db_size_bytes": 1048576,
  "models_available": ["gpt-4o", "claude-sonnet-4"],
  "active_model": "gpt-4o"
}
```

### 错误格式

所有错误返回统一结构：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "messages array is empty"
  }
}
```

错误码：

| Code | HTTP | 说明 |
|------|------|------|
| `INVALID_REQUEST` | 400 | 请求参数缺失或格式错误 |
| `UNKNOWN_APP` | 400 | 不支持的包名 |
| `LLM_ERROR` | 502 | LLM 调用失败 |
| `LLM_TIMEOUT` | 504 | LLM 响应超时 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `INTERNAL` | 500 | 服务器内部错误 |

---

## 网络发现

Android 需要找到同一局域网内的 macOS Server：

### 方案 1：mDNS / Bonjour（推荐）

macOS 端使用 `NetService` 注册服务：

```
服务类型: _yance._tcp.
端口: 8080
TXT: version=0.1.0
```

Android 端使用 `NsdManager` 发现：

```kotlin
val nsdManager = getSystemService(NSD_SERVICE) as NsdManager
nsdManager.discoverServices("_yance._tcp.", NsdManager.PROTOCOL_DNS_SD, listener)
```

### 方案 2：手动配置

设置页面输入 macOS IP 地址和端口。

### 方案 3：二维码

macOS 端展示包含 `http://{ip}:{port}` 的二维码，Android 扫码连接。

建议 v1 先实现方案 2（手动配置），方案 1 作为 v1.1 优化。

---

## 开发环境

| 组件 | 要求 |
|------|------|
| macOS Server | macOS 14+, Xcode 16+, Swift 6 |
| Android | Android Studio, minSdk 30 (Android 11), targetSdk 37 |
| Web | Node.js 22+, TypeScript |

```bash
# 克隆
git clone <repo> && cd yance

# macOS
cd server && swift build && swift run

# Web
cd web && npm install && npm run dev

# Android
cd android && ./gradlew assembleDebug
# 或用 Android Studio 打开 android/ 目录
```

---

## 项目结构

```
yance/
├── README.md
├── AGENTS.md
├── server/                     # macOS Backend (Swift)
│   ├── Package.swift
│   └── Sources/Yance/
│       ├── main.swift
│       ├── API/                # HTTP 路由
│       ├── Accessibility/      # AXUIElement 采集
│       ├── Vision/             # OCR Pipeline
│       ├── LLM/                # 模型调用
│       ├── Store/              # SQLite 存储
│       ├── Context/            # 上下文整理 + 去重
│       └── Models/             # 数据模型
├── android/                    # Android Client (Kotlin)
│   ├── app/
│   │   └── src/main/
│   │       ├── java/.../yance/
│   │       │   ├── data/           # 任务仓库与 Mock 数据
│   │       │   ├── api/            # 局域网 HTTP Client
│   │       │   ├── sync/           # WorkManager 后台同步
│   │       │   └── model/          # 审批与聊天数据类
│   │       ├── res/
│   │       └── AndroidManifest.xml
│   ├── build.gradle.kts
│   └── settings.gradle.kts
└── web/                        # Web Dashboard (TypeScript)
    ├── package.json
    ├── src/
    └── index.html
```

---

## 里程碑

### M1: Android Mock 审批收件箱

- [x] 主页、微信、小红书、闲鱼分类
- [x] AI 候选、草稿润色和重新生成 Mock
- [x] 二次确认后 Mock 完成任务
- [x] 移除 Android 无障碍、悬浮窗和 OCR

### M2: 局域网任务同步

- [ ] Server: 待处理任务列表与幂等确认接口
- [ ] Android: 前台 SSE 订阅与断线重连
- [ ] Android: WorkManager 15 分钟后台同步
- [ ] 确认 API 格式双端一致

### M3: 真实审批闭环

- [ ] Server: 接收确认并执行发送任务
- [ ] Server: 对话记忆、阶段摘要
- [ ] Android: 接入 `/api/optimize` 与候选重新生成
- [ ] Web: 基础管理面板

### M4: 多渠道任务

- [ ] 微信任务接入
- [ ] 小红书任务接入
- [ ] 闲鱼任务接入

---

## License

UNSPECIFIED
