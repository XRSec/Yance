import assert from "node:assert/strict";
import test from "node:test";

import {
  conversationTitleMatches,
  countUnindexedChildren,
  enrichElements,
  extractIdentifierMap,
  mergeOlderMessages,
  parseNonNegativeInteger,
  parseOptions,
  parsePositiveInteger,
  parseWeChatState,
  resolveDriverPath,
  selectWindow,
  visibleHistorySignature,
} from "./cua-driver-wechat.mjs";

const treeMarkdown = `- [0] AXWindow "微信"
  - [1] AXStaticText "测试群(3)" [id=current_chat_name_label]
  - [2] AXList "消息" [id=chat_message_list actions=[raise]]
    - [3] AXStaticText "10:20"
    - [4] AXStaticText "你好" [id=chat_bubble_item_view]
    - [5] AXStaticText "图片" [id=chat_bubble_item_view]
    - [6] AXStaticText "语音通话 01:20" [id=chat_bubble_item_view]
    - [7] AXStaticText "virtual_cell"
  - [8] AXList "会话" [id=session_list actions=[raise]]
  - [9] AXTextArea "" [id=chat_input_field]
  - [10] AXButton "会话" [id=session_item_测试联系人, actions=[press]]`;

const elements = [
  { element_index: 0, element_token: "w", role: "AXWindow", label: "微信", value: null, parent_index: null, depth: 0 },
  { element_index: 1, element_token: "t", role: "AXStaticText", label: "测试群(3)", value: null, parent_index: 0, depth: 1 },
  { element_index: 2, element_token: "l", role: "AXList", label: "消息", value: null, parent_index: 0, depth: 1 },
  { element_index: 3, element_token: "d", role: "AXStaticText", label: "10:20", value: null, parent_index: 2, depth: 2 },
  { element_index: 4, element_token: "m1", role: "AXStaticText", label: "你好", value: null, parent_index: 2, depth: 2 },
  { element_index: 5, element_token: "m2", role: "AXStaticText", label: "图片", value: null, parent_index: 2, depth: 2 },
  { element_index: 6, element_token: "m3", role: "AXStaticText", label: "语音通话 01:20", value: null, parent_index: 2, depth: 2 },
  { element_index: 7, element_token: "v", role: "AXStaticText", label: "virtual_cell", value: null, parent_index: 2, depth: 2 },
  { element_index: 8, element_token: "s", role: "AXList", label: "会话", value: null, parent_index: 0, depth: 1 },
  { element_index: 9, element_token: "i", role: "AXTextArea", label: "", value: null, parent_index: 0, depth: 1 },
  { element_index: 10, element_token: "c", role: "AXButton", label: "测试联系人", value: null, parent_index: 8, depth: 2 },
];

test("extracts Markdown identifiers and joins them to structured elements", () => {
  const identifiers = extractIdentifierMap(treeMarkdown);
  assert.equal(identifiers.get(2), "chat_message_list");
  assert.equal(identifiers.get(10), "session_item_测试联系人");
  const enriched = enrichElements(elements, treeMarkdown);
  assert.equal(enriched[9].identifier, "chat_input_field");
  assert.equal(enriched[0].identifier, null);
});

test("detects unindexed AX children without parsing their private content", () => {
  const markdown = `- [0] AXWindow "微信"
  - [1] AXList "消息" [id=chat_message_list actions=[raise]]
    - AXStaticText "第一条"
    - AXStaticText "第二条"
  - [2] AXButton "更多"`;
  assert.equal(countUnindexedChildren(markdown, "chat_message_list"), 2);
  assert.equal(countUnindexedChildren(markdown, "session_list"), 0);
});

test("parses structured WeChat messages with time and message types", () => {
  const parsed = parseWeChatState({
    pid: 42,
    window_id: 99,
    snapshot_id: "s00000001",
    elements,
    tree_markdown: treeMarkdown,
  });
  assert.equal(parsed.contact, "测试群(3)");
  assert.deepEqual(parsed.messages.map(({ displayedTime, type, content, speaker }) => ({
    displayedTime,
    type,
    content,
    speaker,
  })), [
    { displayedTime: "10:20", type: "text", content: "你好", speaker: "unknown" },
    { displayedTime: "10:20", type: "image", content: "图片", speaker: "unknown" },
    { displayedTime: "10:20", type: "call", content: "语音通话 01:20", speaker: "unknown" },
  ]);
  assert.equal(JSON.parse(visibleHistorySignature(parsed)).some((entry) => entry.includes("virtual_cell")), false);
});

test("uses Cua Driver's observed big-title identifier when the legacy title identifier is absent", () => {
  const markdown = treeMarkdown.replace("id=current_chat_name_label", "id=big_title_line_h_view");
  const parsed = parseWeChatState({
    pid: 42,
    window_id: 99,
    snapshot_id: "s00000002",
    elements,
    tree_markdown: markdown,
  });
  assert.equal(parsed.contact, "测试群(3)");
});

test("matches exact titles and numeric group-size suffixes only", () => {
  assert.equal(conversationTitleMatches("测试联系人", "测试联系人"), true);
  assert.equal(conversationTitleMatches("测试群(12)", "测试群"), true);
  assert.equal(conversationTitleMatches("测试群(成员)", "测试群"), false);
  assert.equal(conversationTitleMatches("另一个测试群(12)", "测试群"), false);
});

test("merges overlapping older and newer message pages", () => {
  const message = (content) => ({ displayedTime: null, type: "text", content });
  assert.deepEqual(
    mergeOlderMessages([message("一"), message("二")], [message("二"), message("三")]),
    [message("一"), message("二"), message("三")],
  );
});

test("selects the highest visible current-Space window without relying on array order", () => {
  const windows = [
    { pid: 7, window_id: 1, title: "微信", bounds: { width: 900, height: 600 }, is_on_screen: false, on_current_space: false, z_index: 100 },
    { pid: 7, window_id: 2, title: "", bounds: { width: 500, height: 500 }, is_on_screen: true, on_current_space: true, z_index: 20 },
    { pid: 7, window_id: 3, title: "微信", bounds: { width: 900, height: 600 }, is_on_screen: true, on_current_space: true, z_index: 10 },
  ];
  assert.equal(selectWindow(windows, 7).window_id, 2);
  assert.equal(selectWindow(windows.slice(0, 1), 7).window_id, 1);
});

test("validates CLI options and driver path precedence", () => {
  assert.deepEqual(parseOptions(["--count", "5", "--pages", "3"]), { count: "5", pages: "3" });
  assert.throws(() => parseOptions(["contact"]), /Unexpected argument/);
  assert.throws(() => parseOptions(["--count"]), /requires a value/);
  assert.equal(parsePositiveInteger(undefined, "--count", "20"), 20);
  assert.equal(parseNonNegativeInteger("0", "--interval", "1000"), 0);
  assert.throws(() => parsePositiveInteger("0", "--count", "20"), /positive integer/);
  assert.equal(resolveDriverPath({ driver: "/cli/driver" }, { YANCE_CUA_DRIVER_PATH: "/env/driver" }), "/cli/driver");
  assert.equal(resolveDriverPath({}, { YANCE_CUA_DRIVER_PATH: "/env/driver" }), "/env/driver");
  assert.throws(() => resolveDriverPath({ driver: "relative-driver" }, {}), /absolute paths/);
});
