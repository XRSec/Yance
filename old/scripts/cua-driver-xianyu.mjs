#!/usr/bin/env node

import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CuaDriverClient, selectWindow } from "./cua-driver-wechat.mjs";

const DEFAULT_DRIVER = process.env.YANCE_CUA_DRIVER_PATH ?? "cua-driver";
const XIANYU_BUNDLE_ID = "com.taobao.fleamarket";

const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

export function parseOptions(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (name === "confirm-send") {
      options.confirmSend = true;
      continue;
    }
    const value = argumentsList[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    options[name] = value;
  }
  return options;
}

export function elementText(element) {
  const value = typeof element?.value === "string" ? element.value.trim() : "";
  const label = typeof element?.label === "string" ? element.label.trim() : "";
  return value && value !== "图片" ? value : label;
}

export function findExactConversation(elements, contact) {
  return (elements ?? [])
    .filter((element) => element.role === "AXGenericElement" && elementText(element) === contact)
    .sort((left, right) => (left.frame?.y ?? Infinity) - (right.frame?.y ?? Infinity))[0] ?? null;
}

export function findRecallAction(elements) {
  return (elements ?? []).find((element) => element.label === "撤回") ?? null;
}

export function visibleChatText(elements) {
  const window = (elements ?? []).find((element) => element.role === "AXWindow")?.frame;
  const excluded = new Set([
    "闲鱼私聊", "头像", "已读", "未读", "返回", "返回按钮", "更多",
    "商品图片", "商品信息", "语音按钮", "表情按钮", "更多选择", "想跟TA说点什么...",
  ]);
  const values = [];
  for (const element of elements ?? []) {
    if (!["AXGenericElement", "AXStaticText", "AXImage"].includes(element.role)) continue;
    const text = elementText(element);
    if (!text || excluded.has(text)) continue;
    if (/^(?:\d{1,2}:\d{2}\s*)?(?:已读|未读)$/.test(text)) continue;
    if (window && element.frame) {
      const centerY = element.frame.y + element.frame.h / 2;
      if (centerY < window.y + 190 || centerY > window.y + window.h - 50) continue;
    }
    if (!values.includes(text)) values.push(text);
  }
  return values;
}

async function locateTarget(client) {
  const apps = await client.call("list_apps", {});
  const app = apps.apps?.find((candidate) => candidate.bundle_id === XIANYU_BUNDLE_ID);
  if (!app?.running || !app.pid) throw new Error("闲鱼 App 未运行");
  const windows = await client.call("list_windows", { pid: app.pid });
  const window = selectWindow(windows.windows, app.pid);
  if (!window) throw new Error("未找到闲鱼主窗口");
  return { pid: app.pid, windowID: window.window_id, window };
}

async function snapshot(client, target) {
  const state = await client.call("get_window_state", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    include_screenshot: false,
    max_depth: 25,
    max_elements: 500,
  });
  if (!Array.isArray(state.elements)) throw new Error("闲鱼窗口未返回结构化 AX elements");
  return state;
}

async function clickElement(client, target, state, element, deliveryMode = "background") {
  const argumentsObject = {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    delivery_mode: deliveryMode,
  };
  if (element.element_token) argumentsObject.element_token = element.element_token;
  else {
    argumentsObject.element_index = element.element_index;
    argumentsObject.snapshot_id = state.snapshot_id;
  }
  await client.call("click", argumentsObject);
}

function findBack(elements) {
  return elements.find((element) => ["返回", "返回按钮"].includes(elementText(element))) ?? null;
}

function findMessagesTab(elements) {
  return elements.find((element) => element.role === "AXButton" && /^消息(?:\s+\d+)?$/.test(element.label ?? "")) ?? null;
}

function findSearchInput(elements) {
  return elements.find((element) => element.label === "搜索聊天记录/联系人/服务号") ?? null;
}

function searchInputValue(element) {
  return typeof element?.value === "string" ? element.value : "";
}

function findSearchTrigger(elements) {
  return elements.find((element) => {
    const text = elementText(element);
    return text === "搜索" && element.label !== "搜索聊天记录/联系人/服务号";
  }) ?? null;
}

async function openSearch(client, target) {
  let openedByScript = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const state = await snapshot(client, target);
    const input = findSearchInput(state.elements);
    if (input && openedByScript) return { state, input };
    if (input) {
      const cancel = state.elements.find((element) => elementText(element) === "取消");
      if (!cancel) throw new Error("闲鱼搜索页未找到取消按钮");
      await clickElement(client, target, state, cancel);
      await delay(300);
      continue;
    }

    const search = findSearchTrigger(state.elements);
    if (search) {
      await clickElement(client, target, state, search);
      openedByScript = true;
      await delay(300);
      continue;
    }

    const messages = findMessagesTab(state.elements);
    if (messages) {
      await clickElement(client, target, state, messages);
      await delay(300);
      continue;
    }

    const back = findBack(state.elements);
    if (back) {
      await clickElement(client, target, state, back);
      await delay(300);
      continue;
    }
    await delay(300);
  }
  throw new Error("无法从当前闲鱼页面进入消息搜索");
}

function localCenter(element, target) {
  if (!element.frame) throw new Error("目标 AX 元素缺少 frame");
  return {
    x: element.frame.x - target.window.bounds.x + element.frame.w / 2,
    y: element.frame.y - target.window.bounds.y + element.frame.h / 2,
  };
}

export async function findConversation(client, target, contact) {
  let { input } = await openSearch(client, target);
  await client.call("bring_to_front", { pid: target.pid, window_id: target.windowID });
  if (searchInputValue(input)) {
    const point = localCenter(input, target);
    await client.call("click", {
      pid: target.pid,
      window_id: target.windowID,
      session: client.session,
      x: target.window.bounds.width - 60,
      y: point.y,
      delivery_mode: "foreground",
    });
    await delay(200);
    const clearedState = await snapshot(client, target);
    input = findSearchInput(clearedState.elements);
    if (searchInputValue(input)) throw new Error("无法清空闲鱼搜索框");
  }
  const point = localCenter(input, target);
  await client.call("click", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    ...point,
    delivery_mode: "foreground",
  });
  await client.call("type_text", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    text: contact,
    delivery_mode: "foreground",
    delay_ms: 30,
  });
  await delay(500);

  const resultState = await snapshot(client, target);
  const observedInput = findSearchInput(resultState.elements);
  if (searchInputValue(observedInput) !== contact) throw new Error("未能核对搜索框内容");
  const result = findExactConversation(resultState.elements, contact);
  if (!result) throw new Error(`未找到精确聊天记录：${contact}`);
  await clickElement(client, target, resultState, result);
  for (let attempt = 0; attempt < 6; attempt++) {
    await delay(300);
    const chatState = await snapshot(client, target);
    const contactVisible = chatState.elements.some((element) => elementText(element).includes(contact));
    if (contactVisible) return chatState;
  }
  throw new Error(`打开聊天后未能核对联系人：${contact}`);
}

function findBottomDraft(elements, text, target) {
  const bottom = target.window.bounds.y + target.window.bounds.height;
  return elements.find((element) => (
    elementText(element) === text
      && element.frame
      && element.frame.y > bottom - 100
  )) ?? null;
}

function findNewestOwnMessage(elements, text, target) {
  const middle = target.window.bounds.x + target.window.bounds.width / 2;
  return elements
    .filter((element) => elementText(element) === text && element.frame?.x > middle)
    .sort((left, right) => right.frame.y - left.frame.y)[0] ?? null;
}

export async function sendAndRecall(client, target, contact, message) {
  await findConversation(client, target, contact);
  await client.call("bring_to_front", { pid: target.pid, window_id: target.windowID });

  const inputPoint = { x: target.window.bounds.width * 0.38, y: target.window.bounds.height - 24 };
  await client.call("click", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    ...inputPoint,
    delivery_mode: "foreground",
  });
  await client.call("type_text", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    text: message,
    delivery_mode: "foreground",
    delay_ms: 50,
  });
  await delay(300);

  const draftState = await snapshot(client, target);
  if (!findBottomDraft(draftState.elements, message, target)) {
    throw new Error("输入框未显示待发送消息，已停止发送");
  }

  await client.call("click", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    x: target.window.bounds.width - 28,
    y: target.window.bounds.height - 24,
    delivery_mode: "foreground",
  });
  await delay(500);

  const sentState = await snapshot(client, target);
  const sentMessage = findNewestOwnMessage(sentState.elements, message, target);
  if (!sentMessage) throw new Error("未验证到已发送消息，停止撤回");
  const messagePoint = localCenter(sentMessage, target);

  await client.call("drag", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    from_x: messagePoint.x,
    from_y: messagePoint.y,
    to_x: messagePoint.x,
    to_y: messagePoint.y,
    duration_ms: 1200,
    steps: 2,
    button: "left",
    delivery_mode: "foreground",
  });
  await delay(200);

  const menuState = await snapshot(client, target);
  const recall = findRecallAction(menuState.elements);
  if (!recall) throw new Error("长按菜单中未找到撤回按钮");
  await clickElement(client, target, menuState, recall, "foreground");
  await delay(500);

  const finalState = await snapshot(client, target);
  const recalled = finalState.elements.some((element) => elementText(element).includes("你撤回了一条消息"));
  if (!recalled) throw new Error("未验证到撤回成功提示");
  return finalState;
}

function usage() {
  console.log(`Usage:
  node scripts/cua-driver-xianyu.mjs state
  node scripts/cua-driver-xianyu.mjs find --contact 联系人
  node scripts/cua-driver-xianyu.mjs send-recall --contact 联系人 --message 你好 --confirm-send

Options:
  --driver <absolute-path>  cua-driver 路径
  --contact <name>          精确联系人名称
  --message <text>          要发送并撤回的文本
  --confirm-send            明确允许真实发送操作`);
}

export async function runCli(argumentsList = process.argv.slice(2), environment = process.env) {
  const [command, ...rest] = argumentsList;
  if (!command || command === "help" || command === "--help") {
    usage();
    return 0;
  }
  if (!["state", "find", "send-recall"].includes(command)) throw new Error(`Unknown command: ${command}`);
  const options = parseOptions(rest);
  const driverPath = options.driver ?? environment.YANCE_CUA_DRIVER_PATH ?? DEFAULT_DRIVER;
  if (!driverPath.startsWith("/")) throw new Error("--driver 必须是绝对路径");
  if (command !== "state" && !options.contact) throw new Error(`${command} requires --contact`);
  if (command === "send-recall" && !options.message) throw new Error("send-recall requires --message");
  if (command === "send-recall" && !options.confirmSend) {
    throw new Error("send-recall requires --confirm-send");
  }

  await access(driverPath, fsConstants.X_OK);
  const client = new CuaDriverClient(driverPath, `yance-xianyu-${randomBytes(6).toString("hex")}`);
  let failure = null;
  try {
    await client.startSession();
    const target = await locateTarget(client);
    if (command === "state") {
      const state = await snapshot(client, target);
      console.log(JSON.stringify({
        contact: state.elements.find((element) => element.label?.includes("会员名"))?.label ?? null,
        visibleText: visibleChatText(state.elements),
      }, null, 2));
    } else if (command === "find") {
      await findConversation(client, target, options.contact);
      console.log(`已打开闲鱼聊天：${options.contact}`);
    } else {
      await sendAndRecall(client, target, options.contact, options.message);
      console.log(`已向 ${options.contact} 发送并撤回：${options.message}`);
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      await client.endSession();
    } catch (cleanupError) {
      if (!failure) failure = cleanupError;
    }
  }
  if (failure) throw failure;
  return 0;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
