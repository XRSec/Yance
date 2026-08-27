# Cua Driver 微信聊天记录采集

`scripts/cua-driver-wechat.mjs` 通过本机 Cua Driver daemon 读取微信的结构化 Accessibility tree 和窗口截图。脚本不依赖 ChatGPT、Codex、模型或 API Key。

## 前提检查

生产默认使用 `YANCE_CUA_DRIVER_PATH` 指定的驱动；未设置时从 `PATH` 查找 `cua-driver`。

运行前检查驱动、daemon 和权限：

```bash
cua-driver --version
cua-driver status
cua-driver permissions status --json
```

预期符号链接目标为 `/Applications/CuaDriver.app/Contents/MacOS/cua-driver`。daemon 必须正在运行，Accessibility 和 Screen Recording 必须为 `true`。脚本使用 Node.js 内置模块，不需要额外 npm 依赖。

## 命令

以下历史命令的相对路径仅在仓库的 `old/` 目录作为当前工作目录时成立；它们不是现行 quick start。

```bash
# 列出 Cua Driver 可见的 App
node scripts/cua-driver-wechat.mjs list-apps

# 去敏读取微信当前窗口状态，并在本地保存 AX tree 和截图
node scripts/cua-driver-wechat.mjs state \
  --app com.tencent.xinWeChat

# 连续保存三次 AX tree、截图和像素诊断
node scripts/cua-driver-wechat.mjs diagnose-capture \
  --app com.tencent.xinWeChat \
  --samples 3 \
  --interval 500

# 读取指定会话最近 20 条消息
node scripts/cua-driver-wechat.mjs wechat \
  --contact 测试联系人 \
  --count 20 \
  --pages 12
```

参数：

```text
--driver <absolute-path>  覆盖驱动路径
--output <directory>      本地记录根目录，默认 local-data/computer-use
--app <bundle-id>         目标 App，默认 com.tencent.xinWeChat
--contact <name>          精确联系人或群聊名称
--count <n>               需要的消息数量，默认 20
--pages <n>               最多向上翻页次数，默认 12
--samples <n>             截图诊断次数，默认 5
--interval <ms>           截图诊断间隔，默认 1000
```

驱动路径优先级固定为 `--driver`、`YANCE_CUA_DRIVER_PATH`、`PATH` 中的 `cua-driver`。使用 `--driver` 或环境变量覆盖时必须提供绝对路径。

## 驱动和窗口模型

每条命令建立一个短期 `yance-wechat-*` session，并在成功、失败、SIGINT 或 SIGTERM 后调用 `end_session`。脚本不会停止共享 daemon、清理其他 session 或调用全局 revoke。

微信定位按以下顺序进行：

```text
精确 bundle ID → 真实 PID → layer-0 window ID → get_window_state
```

`get_window_state` 使用 `structured elements` 作为内容和动作 token 的主要来源。Cua Driver 0.22.1 尚未把微信 AX identifier 放入结构化元素，因此脚本只从同一次 snapshot 的 `tree_markdown` 中补充 `element_index → identifier`，不会把 Markdown 恢复为主解析协议。

当前还存在一个必须失败而不能猜测的边界：如果微信会话项或消息气泡只以无 index 的 Markdown 行出现，脚本无法得到 element token、frame 或结构化消息节点。此时会话切换会进入安全搜索拒绝；当前会话采集会明确失败，不会把 `capturedCount: 0` 写成成功记录。升级驱动或微信后应先用 `state`/`diagnose-capture` 确认这些节点已经进入结构化 elements。

每次元素动作前都会重新 snapshot，优先立即使用新的 `element_token`。点击、滚动和 Home 默认使用 background delivery，不把微信抢到前台。

## 本地记录

每次微信采集创建独立目录：

```text
local-data/computer-use/<联系人>/<采集时间>/
├── record.json
├── run-status.json
├── selection/
├── raw/
└── screenshots/
```

`record.json` 保持 `schemaVersion: 1`，`source` 为 `cua-driver`。记录包含 App、会话、采集数量、历史边界和消息，但不包含 daemon socket、session、element token、权限、capability 或凭据。

Accessibility 无法可靠判断聊天气泡方向，因此 `speaker` 保持为 `unknown`。发送方识别需要后续经过验证的本地截图视觉流程。

`run-status.json` 通过临时文件和 rename 原子更新，记录 `starting`、窗口读取、会话选择、采集、完成、失败、中断或截图检查阶段。

## 截图保护

窗口截图由 `get_window_state.screenshot_out_file` 直接写入运行目录。脚本用 `sips` 转换后按每 4 像素采样：

- 截图缺失：`COMPUTER_USE_SCREENSHOT_UNAVAILABLE`
- 非白像素比例低于 1.5%：`COMPUTER_USE_SCREENSHOT_BLANK`

任一情况都会停止 UI 操作，不生成成功记录，并将运行状态设为 `needs-computer-use-inspection`。微信位于其他显示器或 Space 时，即使 AX tree 正常也可能取得空白截图。

## 会话选择与安全限制

如果当前标题与目标匹配，脚本直接读取当前会话。否则只执行以下安全路径：

1. 必要时关闭微信二级窗口；
2. 打开“微信”消息入口；
3. 把普通会话列表移到顶部；
4. 点击精确的 `session_item_<联系人>`；
5. 重新读取窗口并核对标题。

普通列表找不到目标时，脚本只用 `set_value` 写入搜索框并核对实际值。当前微信搜索浮层没有可靠的 AX 结果节点，因此脚本会保存搜索状态并明确失败；不会按 Return，也不会按固定坐标盲点第一项。

脚本在任何滚动前拒绝公众号和非标准聊天，并在每次动作后复核聊天标题和消息列表。整个生产流程不会输入聊天正文、点击发送、按 Return、写剪贴板、上传文件、自动发送消息或调用 LLM。

本文档引用的相对脚本路径以 `old/` 为当前工作目录；归档快照中没有独立的 `scripts/WECHAT_COMPUTER_USE_FINDINGS.md`，因此不能把该文件描述为现存证据。
