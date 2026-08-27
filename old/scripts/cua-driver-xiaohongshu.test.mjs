import assert from "node:assert/strict";
import test from "node:test";

import {
  elementText,
  findChatTitle,
  findProfileMessageButton,
  findRecallAction,
  findVisibleConversation,
  parseOptions,
  parseVisibleMessages,
} from "./cua-driver-xiaohongshu.mjs";

test("parses CLI options", () => {
  assert.deepEqual(
    parseOptions(["--contact", "测试联系人 A", "--message", "测试消息", "--confirm-send"]),
    { contact: "测试联系人 A", message: "测试消息", confirmSend: true },
  );
  assert.throws(() => parseOptions(["contact"]), /Unexpected argument/);
  assert.throws(() => parseOptions(["--contact"]), /requires a value/);
});

test("reads AX value before label", () => {
  assert.equal(elementText({ value: "测试消息", label: "草稿" }), "测试消息");
  assert.equal(elementText({ label: "撤回" }), "撤回");
});

test("matches only an exact visible conversation prefix", () => {
  const exact = { role: "AXStaticText", label: "测试联系人 A, 最新消息, 10:00" };
  const elements = [
    { role: "AXStaticText", label: "测试联系人 A2, 最新消息, 10:00" },
    exact,
  ];
  assert.equal(findVisibleConversation(elements, "测试联系人 A"), exact);
});

test("finds the top chat title", () => {
  const frame = { x: 100, y: 200, w: 550, h: 791 };
  const title = { role: "AXStaticText", label: "测试联系人 A", frame: { x: 150, y: 250, w: 100, h: 20 } };
  assert.equal(findChatTitle([
    { role: "AXStaticText", label: "10:00", frame: { x: 300, y: 500, w: 40, h: 20 } },
    title,
  ], frame), title);
});

test("parses visible messages and speaker side", () => {
  const frame = { x: 100, y: 200, w: 550, h: 791 };
  const parsed = parseVisibleMessages([
    { role: "AXTextArea", value: "对方消息", frame: { x: 120, y: 400, w: 120, h: 30 } },
    { role: "AXTextArea", value: "我方消息", frame: { x: 350, y: 450, w: 250, h: 30 } },
    { role: "AXTextArea", value: "你撤回了一条消息 重新编辑", frame: { x: 300, y: 500, w: 200, h: 30 } },
    { role: "AXTextArea", value: "草稿", frame: { x: 150, y: 960, w: 400, h: 30 } },
  ], frame);
  assert.deepEqual(parsed.map(({ content, speaker }) => ({ content, speaker })), [
    { content: "对方消息", speaker: "other" },
    { content: "我方消息", speaker: "self" },
    { content: "你撤回了一条消息 重新编辑", speaker: "system" },
  ]);
});

test("finds profile message action only after exact identity match", () => {
  const message = { role: "AXButton", label: "发私信" };
  const elements = [{ role: "AXButton", label: "测试联系人 A" }, message];
  assert.equal(findProfileMessageButton(elements, "测试联系人 A"), message);
  assert.equal(findProfileMessageButton(elements, "测试联系人 A2"), null);
});

test("finds recall action", () => {
  const recall = { role: "AXStaticText", label: "撤回" };
  assert.equal(findRecallAction([{ label: "复制" }, recall]), recall);
});
