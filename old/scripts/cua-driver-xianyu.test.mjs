import assert from "node:assert/strict";
import test from "node:test";

import {
  elementText,
  findExactConversation,
  findRecallAction,
  parseOptions,
  visibleChatText,
} from "./cua-driver-xianyu.mjs";

test("parses options and requires values", () => {
  assert.deepEqual(
    parseOptions(["--contact", "测试联系人 A", "--message", "测试消息", "--confirm-send"]),
    { contact: "测试联系人 A", message: "测试消息", confirmSend: true },
  );
  assert.throws(() => parseOptions(["contact"]), /Unexpected argument/);
  assert.throws(() => parseOptions(["--contact"]), /requires a value/);
});

test("prefers semantic value over generic image value", () => {
  assert.equal(elementText({ value: "测试联系人 C", label: "联系人" }), "测试联系人 C");
  assert.equal(elementText({ value: "图片", label: "撤回" }), "撤回");
});

test("finds the first exact chat result instead of a fuzzy contact", () => {
  const elements = [
    { role: "AXGenericElement", value: "测试联系人 C2", frame: { y: 100 } },
    { role: "AXGenericElement", value: "测试联系人 C", frame: { y: 300 } },
    { role: "AXGenericElement", value: "测试联系人 C", frame: { y: 200 } },
  ];
  assert.equal(findExactConversation(elements, "测试联系人 C"), elements[2]);
});

test("finds the recall menu action", () => {
  const recall = { role: "AXImage", label: "撤回", value: "图片" };
  assert.equal(findRecallAction([{ label: "复制" }, recall]), recall);
});

test("extracts visible chat text before the navigation controls", () => {
  const elements = [
    { role: "AXGenericElement", value: "闲鱼私聊" },
    { role: "AXGenericElement", value: "测试消息" },
    { role: "AXGenericElement", label: "已读" },
    { role: "AXImage", label: "系统提示" },
    { role: "AXImage", label: "返回" },
    { role: "AXGenericElement", value: "更多" },
  ];
  assert.deepEqual(visibleChatText(elements), ["测试消息", "系统提示"]);
});
