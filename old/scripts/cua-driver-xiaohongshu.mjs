#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CuaDriverClient, selectWindow } from "./cua-driver-wechat.mjs";

const DEFAULT_DRIVER = process.env.YANCE_CUA_DRIVER_PATH ?? "cua-driver";
const BUNDLE_ID = "com.xingin.discover";
const APP_NAME = "小红书";
const delay = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));
const print = (text) => process.stdout.write(`${text}\n`);

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
  return value || label;
}

export function findVisibleConversation(elements, contact) {
  const prefix = `${contact},`;
  return (elements ?? []).find((element) => (
    element.role === "AXStaticText" && elementText(element).startsWith(prefix)
  )) ?? null;
}

export function findChatTitle(elements, windowFrame) {
  return (elements ?? []).find((element) => (
    element.role === "AXStaticText"
      && element.frame
      && element.frame.y < windowFrame.y + 100
      && !elementText(element).includes(",")
  )) ?? null;
}

export function parseVisibleMessages(elements, windowFrame) {
  const middle = windowFrame.x + windowFrame.w / 2;
  return (elements ?? [])
    .filter((element) => element.role === "AXTextArea" && elementText(element) && element.frame)
    .filter((element) => element.frame.y < windowFrame.y + windowFrame.h - 55)
    .map((element) => {
      const content = elementText(element);
      const centerX = element.frame.x + element.frame.w / 2;
      let speaker = centerX > middle ? "self" : "other";
      if (content.includes("撤回了一条消息")) speaker = "system";
      return { content, speaker, element };
    });
}

export function findRecallAction(elements) {
  return (elements ?? []).find((element) => elementText(element) === "撤回") ?? null;
}

export function findProfileMessageButton(elements, contact) {
  const hasExactIdentity = (elements ?? []).some((element) => elementText(element) === contact);
  if (!hasExactIdentity) return null;
  return elements.find((element) => element.role === "AXButton" && elementText(element) === "发私信") ?? null;
}

async function locateTarget(client) {
  const apps = await client.call("list_apps", {});
  const app = apps.apps?.find((candidate) => candidate.bundle_id === BUNDLE_ID);
  if (!app?.running || !app.pid) throw new Error("小红书 App 未运行");
  const windows = await client.call("list_windows", { pid: app.pid });
  const window = selectWindow(windows.windows, app.pid);
  if (!window) throw new Error("未找到小红书主窗口");
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
  if (!Array.isArray(state.elements)) throw new Error("小红书窗口未返回结构化 AX elements");
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

function findCancel(elements) {
  return elements.find((element) => element.role === "AXButton" && elementText(element) === "取消") ?? null;
}

function findBack(elements) {
  return elements.find((element) => element.role === "AXButton" && ["navi back", "返回"].includes(elementText(element))) ?? null;
}

function isMessageList(elements) {
  return elements.some((element) => element.role === "AXHeading" && elementText(element) === "消息");
}

async function ensureMessageList(client, target) {
  let triedMessagesTab = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await snapshot(client, target);
    if (isMessageList(state.elements)) return state;
    const cancel = findCancel(state.elements);
    if (cancel) {
      await clickElement(client, target, state, cancel);
      await delay(300);
      continue;
    }
    const back = findBack(state.elements);
    if (back) {
      await clickElement(client, target, state, back);
      await delay(300);
      continue;
    }
    if (!triedMessagesTab) {
      triedMessagesTab = true;
      const scale = await screenshotScale(client, target);
      await client.call("click", {
        pid: target.pid,
        window_id: target.windowID,
        session: client.session,
        x: target.window.bounds.width * 0.7 * scale,
        y: (target.window.bounds.height - 18) * scale,
        delivery_mode: "foreground",
      });
    }
    await delay(300);
  }
  throw new Error("无法返回小红书消息列表");
}

async function screenshotScale(client, target) {
  const screenshotPath = resolve(`.cua-driver-xhs-${randomBytes(4).toString("hex")}.png`);
  try {
    const state = await client.call("get_window_state", {
      pid: target.pid,
      window_id: target.windowID,
      session: client.session,
      screenshot_out_file: screenshotPath,
      max_depth: 2,
      max_elements: 20,
    });
    return Number(state.screenshot_scale) || 1;
  } finally {
    await unlink(screenshotPath).catch(() => {});
  }
}

async function waitForConversation(client, target, contact) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await delay(300);
    const chatState = await snapshot(client, target);
    const title = findChatTitle(chatState.elements, chatState.elements[0].frame);
    if (elementText(title) === contact) return chatState;
  }
  throw new Error(`打开聊天后未核对到联系人：${contact}`);
}

async function searchConversation(client, target, contact) {
  const scale = await screenshotScale(client, target);
  await client.call("click", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    x: (target.window.bounds.width - 62) * scale,
    y: 62 * scale,
    delivery_mode: "foreground",
  });
  await delay(300);
  const searchState = await snapshot(client, target);
  if (!findCancel(searchState.elements)) throw new Error("未进入小红书搜索页");

  await client.call("type_text", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    x: target.window.bounds.width * 0.36 * scale,
    y: 60 * scale,
    text: contact,
    delivery_mode: "foreground",
    delay_ms: 40,
  });
  await delay(500);
  await client.call("click", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    x: 150 * scale,
    y: 133 * scale,
    delivery_mode: "foreground",
  });

  for (let attempt = 0; attempt < 6; attempt++) {
    await delay(300);
    const profileState = await snapshot(client, target);
    const messageButton = findProfileMessageButton(profileState.elements, contact);
    if (!messageButton) continue;
    await clickElement(client, target, profileState, messageButton);
    return waitForConversation(client, target, contact);
  }
  throw new Error(`搜索后未核对到联系人主页：${contact}`);
}

export async function openConversationBySearch(client, target, contact) {
  await ensureMessageList(client, target);
  return searchConversation(client, target, contact);
}

export async function openConversation(client, target, contact) {
  const initial = await snapshot(client, target);
  const currentTitle = findChatTitle(initial.elements, initial.elements[0].frame);
  if (elementText(currentTitle) === contact) return initial;

  const listState = await ensureMessageList(client, target);
  const conversation = findVisibleConversation(listState.elements, contact);
  if (!conversation) return searchConversation(client, target, contact);
  await clickElement(client, target, listState, conversation);
  return waitForConversation(client, target, contact);
}

function findInput(elements) {
  return (elements ?? [])
    .filter((element) => element.role === "AXTextArea" && !elementText(element) && element.frame)
    .sort((left, right) => right.frame.y - left.frame.y)[0] ?? null;
}

function findDraft(elements, message, windowFrame) {
  return (elements ?? []).find((element) => (
    element.role === "AXTextArea"
      && elementText(element) === message
      && element.frame?.y > windowFrame.y + windowFrame.h - 70
  )) ?? null;
}

function findNewestOwnMessage(elements, message, windowFrame) {
  const middle = windowFrame.x + windowFrame.w / 2;
  return (elements ?? [])
    .filter((element) => (
      element.role === "AXTextArea"
        && elementText(element) === message
        && element.frame?.x > middle
        && element.frame.y < windowFrame.y + windowFrame.h - 70
    ))
    .sort((left, right) => right.frame.y - left.frame.y)[0] ?? null;
}

function localCenter(element, target) {
  return {
    x: element.frame.x - target.window.bounds.x + element.frame.w / 2,
    y: element.frame.y - target.window.bounds.y + element.frame.h / 2,
  };
}

function sendPhysicalReturn() {
  return new Promise((resolvePromise, rejectPromise) => {
    const script = `tell application "${APP_NAME}" to activate\ndelay 0.1\ntell application "System Events" to key code 36`;
    const child = spawn("/usr/bin/osascript", ["-e", script], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`发送 Return 失败：${stderr.trim() || `exit ${code}`}`));
    });
  });
}

export async function sendAndRecall(client, target, contact, message) {
  const chatState = await openConversation(client, target, contact);
  const input = findInput(chatState.elements);
  if (!input) throw new Error("未找到小红书聊天输入框");
  await clickElement(client, target, chatState, input, "foreground");
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
  const windowFrame = draftState.elements[0].frame;
  if (!findDraft(draftState.elements, message, windowFrame)) {
    throw new Error("输入框未显示待发送消息，停止发送");
  }

  await sendPhysicalReturn();
  await delay(500);
  const sentState = await snapshot(client, target);
  const sent = findNewestOwnMessage(sentState.elements, message, sentState.elements[0].frame);
  if (!sent) throw new Error("未验证到已发送消息，停止撤回");

  const point = localCenter(sent, target);
  await client.call("drag", {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    from_x: point.x,
    from_y: point.y,
    to_x: point.x,
    to_y: point.y,
    duration_ms: 1200,
    steps: 2,
    button: "left",
    delivery_mode: "foreground",
  });
  await delay(200);

  const menuState = await snapshot(client, target);
  const recall = findRecallAction(menuState.elements);
  if (!recall) throw new Error("长按菜单中未找到撤回");
  await clickElement(client, target, menuState, recall, "foreground");
  await delay(500);

  const finalState = await snapshot(client, target);
  const recalled = finalState.elements.some((element) => elementText(element).includes("你撤回了一条消息"));
  if (!recalled) throw new Error("未验证到撤回成功提示");
  return finalState;
}

function usage() {
  print(`Usage:
  node scripts/cua-driver-xiaohongshu.mjs state
  node scripts/cua-driver-xiaohongshu.mjs find --contact 联系人
  node scripts/cua-driver-xiaohongshu.mjs search --contact 联系人
  node scripts/cua-driver-xiaohongshu.mjs send-recall --contact 联系人 --message 你好 --confirm-send

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
  if (!["state", "find", "search", "send-recall"].includes(command)) throw new Error(`Unknown command: ${command}`);
  const options = parseOptions(rest);
  const driverPath = options.driver ?? environment.YANCE_CUA_DRIVER_PATH ?? DEFAULT_DRIVER;
  if (!driverPath.startsWith("/")) throw new Error("--driver 必须是绝对路径");
  if (command !== "state" && !options.contact) throw new Error(`${command} requires --contact`);
  if (command === "send-recall" && !options.message) throw new Error("send-recall requires --message");
  if (command === "send-recall" && !options.confirmSend) throw new Error("send-recall requires --confirm-send");

  await access(driverPath, fsConstants.X_OK);
  const client = new CuaDriverClient(driverPath, `yance-xiaohongshu-${randomBytes(6).toString("hex")}`);
  let failure = null;
  try {
    await client.startSession();
    const target = await locateTarget(client);
    if (command === "state") {
      const state = await snapshot(client, target);
      const frame = state.elements[0].frame;
      const title = findChatTitle(state.elements, frame);
      print(JSON.stringify({
        contact: elementText(title) || null,
        messages: parseVisibleMessages(state.elements, frame).map(({ content, speaker }) => ({ content, speaker })),
      }, null, 2));
    } else if (command === "find" || command === "search") {
      const open = command === "search" ? openConversationBySearch : openConversation;
      await open(client, target, options.contact);
      print(`已打开小红书聊天：${options.contact}`);
    } else {
      await sendAndRecall(client, target, options.contact, options.message);
      print(`已向 ${options.contact} 发送并撤回：${options.message}`);
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
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
