#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CUA_DRIVER = process.env.YANCE_CUA_DRIVER_PATH ?? "cua-driver";
const DEFAULT_APP = "com.tencent.xinWeChat";
const DEFAULT_OUTPUT = "local-data/computer-use";
const DRIVER_TIMEOUT_MS = 120_000;
const DRIVER_CLEANUP_TIMEOUT_MS = 10_000;

class InterruptedError extends Error {
  constructor(signal) {
    super(`Interrupted by ${signal}`);
    this.name = "InterruptedError";
    this.signal = signal;
  }
}

export class CuaDriverClient {
  constructor(driverPath, session) {
    this.driverPath = driverPath;
    this.session = session;
    this.activeProcess = null;
    this.started = false;
  }

  async call(tool, argumentsObject = {}, timeoutMs = DRIVER_TIMEOUT_MS) {
    const result = await callDriver(
      this.driverPath,
      tool,
      argumentsObject,
      timeoutMs,
      (child) => { this.activeProcess = child; },
    );
    this.activeProcess = null;
    if (result?.status === "refused") {
      const code = result.refusal?.code ?? "refused";
      const message = result.refusal?.message ?? "request refused";
      throw new Error(`cua-driver ${tool} refused (${code}): ${message}`);
    }
    return result;
  }

  async startSession() {
    await this.call("start_session", { session: this.session });
    this.started = true;
  }

  async endSession() {
    if (!this.started) return;
    this.started = false;
    await this.call("end_session", { session: this.session }, DRIVER_CLEANUP_TIMEOUT_MS);
  }

  cancelActive() {
    this.activeProcess?.kill("SIGTERM");
  }
}

function sanitizeStderr(stderr) {
  const compact = stderr.replace(/[\u0000-\u001f]+/g, " ").trim();
  return compact.length > 800 ? `${compact.slice(0, 800)}…` : compact;
}

export function callDriver(driverPath, tool, argumentsObject, timeoutMs, onProcess = () => {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(driverPath, ["call", tool, JSON.stringify(argumentsObject)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    onProcess(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer = null;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      rejectPromise(new Error(`Unable to start cua-driver tool ${tool}: ${error.message}`));
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (timedOut) {
        rejectPromise(new Error(`cua-driver tool ${tool} timed out after ${timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        const diagnostic = sanitizeStderr(stderr);
        rejectPromise(new Error(
          `cua-driver tool ${tool} failed (code=${code}, signal=${signal ?? "none"})${diagnostic ? `: ${diagnostic}` : ""}`,
        ));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout));
      } catch {
        rejectPromise(new Error(`cua-driver tool ${tool} returned invalid JSON`));
      }
    });
  });
}

export function extractIdentifierMap(treeMarkdown) {
  const identifiers = new Map();
  for (const line of (treeMarkdown ?? "").split("\n")) {
    const match = line.match(/^\s*-\s+\[(\d+)]\s+.*?\[id=([^\s\]]+)/);
    if (match) identifiers.set(Number(match[1]), match[2].replace(/,$/, ""));
  }
  return identifiers;
}

export function enrichElements(elements, treeMarkdown) {
  const identifiers = extractIdentifierMap(treeMarkdown);
  return (elements ?? []).map((element) => ({
    ...element,
    identifier: identifiers.get(element.element_index) ?? null,
  }));
}

export function countUnindexedChildren(treeMarkdown, parentIdentifier) {
  const lines = (treeMarkdown ?? "").split("\n");
  const parentLineIndex = lines.findIndex((line) => line.includes(`[id=${parentIdentifier}`));
  if (parentLineIndex < 0) return 0;
  const parentIndent = lines[parentLineIndex].match(/^\s*/)[0].length;
  let count = 0;
  for (const line of lines.slice(parentLineIndex + 1)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= parentIndent) break;
    if (/^\s*-\s+(?!\[\d+])AX/.test(line)) count++;
  }
  return count;
}

function elementText(element) {
  const value = typeof element?.value === "string" ? element.value.trim() : "";
  const label = typeof element?.label === "string" ? element.label.trim() : "";
  return value && value !== "搜索" ? value : label;
}

function isTimeLabel(value) {
  return /^(?:昨天\s+)?\d{1,2}:\d{2}$/.test(value)
    || /^\d{4}[年/-]\d{1,2}[月/-]\d{1,2}/.test(value);
}

function isDescendant(element, ancestorIndex, byIndex) {
  let parentIndex = element.parent_index;
  while (parentIndex !== null && parentIndex !== undefined) {
    if (parentIndex === ancestorIndex) return true;
    parentIndex = byIndex.get(parentIndex)?.parent_index;
  }
  return false;
}

export function parseWeChatState(result, appRecord = null, windowRecord = null) {
  if (!Array.isArray(result?.elements)) {
    throw new Error("get_window_state returned no structured elements");
  }
  const elements = enrichElements(result.elements, result.tree_markdown);
  const byIndex = new Map(elements.map((element) => [element.element_index, element]));
  const messageList = elements.find((element) => element.identifier === "chat_message_list") ?? null;
  const sessionList = elements.find((element) => element.identifier === "session_list") ?? null;
  const currentChat = elements.find((element) => element.identifier === "current_chat_name_label")
    ?? elements.find((element) => element.identifier === "big_title_line_h_view")
    ?? null;
  const listElements = messageList
    ? elements.filter((element) => isDescendant(element, messageList.element_index, byIndex))
    : [];
  const messages = [];
  let displayedTime = null;

  for (const element of listElements) {
    const text = elementText(element);
    if (element.identifier !== "chat_bubble_item_view") {
      if (element.role === "AXStaticText" && isTimeLabel(text)) displayedTime = text;
      continue;
    }
    if (!text) continue;
    messages.push({
      elementIndex: element.element_index,
      displayedTime,
      contact: elementText(currentChat) || null,
      speaker: "unknown",
      type: text === "图片" ? "image" : text.includes("语音通话") ? "call" : "text",
      content: text,
    });
  }

  return {
    app: appRecord ? {
      path: appRecord.launch_path ?? null,
      bundleID: appRecord.bundle_id,
      pid: appRecord.pid,
      windowID: result.window_id,
    } : { pid: result.pid, windowID: result.window_id },
    window: windowRecord,
    windowTitle: windowRecord?.title ?? elementText(elements.find((element) => element.role === "AXWindow")) ?? null,
    contact: elementText(currentChat) || null,
    snapshotId: result.snapshot_id,
    elements,
    messageList,
    unindexedMessageNodeCount: countUnindexedChildren(result.tree_markdown, "chat_message_list"),
    sessionList,
    messages,
    treeMarkdown: result.tree_markdown ?? "",
  };
}

export function visibleHistorySignature(parsed) {
  if (!parsed.messageList) return null;
  const byIndex = new Map(parsed.elements.map((element) => [element.element_index, element]));
  const values = parsed.elements
    .filter((element) => isDescendant(element, parsed.messageList.element_index, byIndex))
    .filter((element) => elementText(element) !== "virtual_cell")
    .map((element) => [
      element.role ?? null,
      element.identifier ?? null,
      element.label ?? null,
      element.value ?? null,
    ]);
  return JSON.stringify(values);
}

export function messageKey(message) {
  return `${message.displayedTime ?? ""}\u0000${message.type}\u0000${message.content}`;
}

export function mergeOlderMessages(older, newer) {
  const maximum = Math.min(older.length, newer.length);
  let overlap = 0;
  for (let size = 1; size <= maximum; size++) {
    const olderKeys = older.slice(-size).map(messageKey);
    const newerKeys = newer.slice(0, size).map(messageKey);
    if (olderKeys.every((key, index) => key === newerKeys[index])) overlap = size;
  }
  return [...older.slice(0, older.length - overlap), ...newer];
}

export function conversationTitleMatches(observed, expected) {
  if (observed === expected) return true;
  if (!observed?.startsWith(`${expected}(`) || !observed.endsWith(")")) return false;
  return /^\d+$/.test(observed.slice(expected.length + 1, -1));
}

function findMessagesTab(elements) {
  return elements.find((element) => element.role === "AXButton" && elementText(element) === "微信") ?? null;
}

function findCloseButton(elements) {
  return elements.find((element) => element.role === "AXButton" && /关闭/.test(elementText(element))) ?? null;
}

function findVisibleConversation(elements, contact) {
  return elements.find((element) => element.identifier === `session_item_${contact}`) ?? null;
}

function findSearchField(elements) {
  return elements.find((element) => (
    element.role === "AXTextArea" || element.role === "AXTextField"
  ) && element.label === "搜索") ?? null;
}

function isStandardChat(elements) {
  return elements.some((element) => element.identifier === "chat_input_field");
}

function isOfficialAccount(elements) {
  return elements.some((element) => element.identifier === "brand_profile_button");
}

function getSearchValue(elements) {
  const search = findSearchField(elements);
  return typeof search?.value === "string" && search.value !== "搜索" ? search.value : "";
}

export function selectWindow(windows, pid) {
  const candidates = (windows ?? []).filter((window) => (
    window.pid === pid
      && Number(window.bounds?.width) >= 100
      && Number(window.bounds?.height) >= 100
  ));
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const leftVisible = left.is_on_screen === true && left.on_current_space === true ? 1 : 0;
    const rightVisible = right.is_on_screen === true && right.on_current_space === true ? 1 : 0;
    if (leftVisible !== rightVisible) return rightVisible - leftVisible;
    const leftMain = left.title === "微信" ? 1 : 0;
    const rightMain = right.title === "微信" ? 1 : 0;
    if (leftMain !== rightMain && leftVisible === 0) return rightMain - leftMain;
    const leftZ = Number.isInteger(left.z_index) ? left.z_index : -1;
    const rightZ = Number.isInteger(right.z_index) ? right.z_index : -1;
    return rightZ - leftZ;
  })[0];
}

async function locateApp(client, bundleID, allowLaunch) {
  let response = await client.call("list_apps", {});
  let app = response.apps?.find((candidate) => candidate.bundle_id === bundleID) ?? null;
  if ((!app?.running || app.pid <= 0) && allowLaunch) {
    await client.call("launch_app", { bundle_id: bundleID });
    await delay(500);
    response = await client.call("list_apps", {});
    app = response.apps?.find((candidate) => candidate.bundle_id === bundleID) ?? null;
  }
  if (!app) throw new Error(`App '${bundleID}' is not installed`);
  if (!app.running || app.pid <= 0) throw new Error(`App '${bundleID}' is not running`);
  return app;
}

async function locateTarget(client, bundleID, allowLaunch = true) {
  const app = await locateApp(client, bundleID, allowLaunch);
  const response = await client.call("list_windows", { pid: app.pid });
  const window = selectWindow(response.windows, app.pid);
  if (!window) throw new Error(`App '${bundleID}' has no usable top-level window`);
  return { app, window, pid: app.pid, windowID: window.window_id };
}

async function readWindowState(client, target, screenshotPath = null) {
  const argumentsObject = {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
    include_screenshot: screenshotPath !== null,
  };
  if (screenshotPath) {
    const absolutePath = resolve(screenshotPath);
    await mkdir(dirname(absolutePath), { recursive: true });
    argumentsObject.screenshot_out_file = absolutePath;
  }
  const result = await client.call("get_window_state", argumentsObject);
  if (!Array.isArray(result.elements) || result.elements.length === 0) {
    throw new Error(`get_window_state returned no elements for window ${target.windowID}`);
  }
  return parseWeChatState(result, target.app, target.window);
}

function actionArguments(client, target, parsed, element, includeDeliveryMode = true) {
  const argumentsObject = {
    pid: target.pid,
    window_id: target.windowID,
    session: client.session,
  };
  if (element.element_token) argumentsObject.element_token = element.element_token;
  else {
    argumentsObject.element_index = element.element_index;
    argumentsObject.snapshot_id = parsed.snapshotId;
  }
  if (includeDeliveryMode) argumentsObject.delivery_mode = "background";
  return argumentsObject;
}

async function actOnFreshElement(client, target, findElement, tool, extraArguments = {}) {
  const parsed = await readWindowState(client, target);
  const element = findElement(parsed);
  if (!element) throw new Error(`Required element for ${tool} was not found`);
  await actOnParsedElement(client, target, parsed, element, tool, extraArguments);
}

async function actOnParsedElement(client, target, parsed, element, tool, extraArguments = {}) {
  const includeDeliveryMode = tool !== "set_value";
  await client.call(tool, {
    ...actionArguments(client, target, parsed, element, includeDeliveryMode),
    ...extraArguments,
  });
}

async function closeSecondaryWindow(client, target, parsed, bundleID) {
  const closeButton = findCloseButton(parsed.elements);
  if (closeButton) {
    await actOnParsedElement(client, target, parsed, closeButton, "click");
  } else {
    await client.call("press_key", {
      pid: target.pid,
      window_id: target.windowID,
      key: "escape",
      delivery_mode: "background",
      session: client.session,
    });
  }
  await delay(300);
  const nextTarget = await locateTarget(client, bundleID);
  if (nextTarget.windowID === target.windowID && nextTarget.window.title !== "微信") {
    throw new Error("WeChat secondary window could not be closed safely");
  }
  return nextTarget;
}

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function safeName(value) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 80) || "unknown";
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeRunStatus(directory, status) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, "run-status.json");
  const temporaryPath = `${path}.tmp`;
  await writeJson(temporaryPath, status);
  await rename(temporaryPath, path);
}

function runProcess(command, argumentsList) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, argumentsList, { stdio: "ignore" });
    child.once("error", rejectPromise);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with code ${code}`));
    });
  });
}

export async function analyzeScreenshot(imagePath) {
  try {
    await access(imagePath);
  } catch {
    return { status: "missing", imagePath };
  }
  const bitmapPath = `${imagePath}.analysis.bmp`;
  try {
    await runProcess("/usr/bin/sips", ["-s", "format", "bmp", imagePath, "--out", bitmapPath]);
    const bitmap = await readFile(bitmapPath);
    const pixelOffset = bitmap.readUInt32LE(10);
    const width = bitmap.readInt32LE(18);
    const height = Math.abs(bitmap.readInt32LE(22));
    const bitsPerPixel = bitmap.readUInt16LE(28);
    if (width < 1 || height < 1 || (bitsPerPixel !== 24 && bitsPerPixel !== 32)) {
      throw new Error(`Unsupported BMP layout: ${width}x${height}, ${bitsPerPixel} bpp`);
    }
    const bytesPerPixel = bitsPerPixel / 8;
    const rowStride = Math.ceil((width * bitsPerPixel) / 32) * 4;
    let samples = 0;
    let nonWhiteSamples = 0;
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const offset = pixelOffset + (y * rowStride) + (x * bytesPerPixel);
        const blue = bitmap[offset];
        const green = bitmap[offset + 1];
        const red = bitmap[offset + 2];
        if (red < 245 || green < 245 || blue < 245) nonWhiteSamples++;
        samples++;
      }
    }
    const nonWhiteRatio = samples === 0 ? 0 : nonWhiteSamples / samples;
    return {
      status: "analyzed",
      imagePath,
      width,
      height,
      nonWhiteRatio,
      blank: nonWhiteRatio < 0.015,
    };
  } finally {
    await rm(bitmapPath, { force: true });
  }
}

function assertScreenshotVisible(analysis, label) {
  if (analysis.status === "missing") {
    const error = new Error(`Cua Driver screenshot is missing at ${label}`);
    error.code = "COMPUTER_USE_SCREENSHOT_UNAVAILABLE";
    throw error;
  }
  if (analysis.blank) {
    const error = new Error(`Cua Driver screenshot is blank at ${label}: ${analysis.imagePath}`);
    error.code = "COMPUTER_USE_SCREENSHOT_BLANK";
    error.screenshotAnalysis = analysis;
    throw error;
  }
}

async function captureState(client, target, rawPath, screenshotPath, label) {
  await mkdir(dirname(resolve(rawPath)), { recursive: true });
  await mkdir(dirname(resolve(screenshotPath)), { recursive: true });
  const parsed = await readWindowState(client, target, screenshotPath);
  await writeFile(rawPath, parsed.treeMarkdown);
  const screenshot = await analyzeScreenshot(resolve(screenshotPath));
  assertScreenshotVisible(screenshot, label);
  return { parsed, screenshot };
}

async function saveSelectionState(client, target, directory, name) {
  return captureState(
    client,
    target,
    join(directory, "selection", `${name}.txt`),
    join(directory, "selection", `${name}.png`),
    name,
  );
}

async function savePage(client, target, directory, pageNumber) {
  const pageName = `page-${String(pageNumber).padStart(2, "0")}`;
  return captureState(
    client,
    target,
    join(directory, "raw", `${pageName}.txt`),
    join(directory, "screenshots", `${pageName}.png`),
    pageName,
  );
}

export function parseOptions(argumentsList) {
  const options = {};
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (!key || Object.hasOwn(options, key)) throw new Error(`Invalid or repeated option: ${argument}`);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    options[key] = value;
    index++;
  }
  return options;
}

export function parsePositiveInteger(value, optionName, defaultValue) {
  const candidate = value ?? defaultValue;
  if (!/^\d+$/.test(String(candidate)) || Number(candidate) < 1) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return Number(candidate);
}

export function parseNonNegativeInteger(value, optionName, defaultValue) {
  const candidate = value ?? defaultValue;
  if (!/^\d+$/.test(String(candidate))) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return Number(candidate);
}

export function resolveDriverPath(options, environment = process.env) {
  const driverPath = options.driver ?? environment.YANCE_CUA_DRIVER_PATH ?? DEFAULT_CUA_DRIVER;
  if (!isAbsolute(driverPath)) throw new Error("--driver and YANCE_CUA_DRIVER_PATH must be absolute paths");
  return driverPath;
}

function validateOptions(command, options) {
  const common = new Set(["driver", "output"]);
  const allowed = {
    "list-apps": common,
    state: new Set([...common, "app"]),
    "diagnose-capture": new Set([...common, "app", "samples", "interval"]),
    wechat: new Set([...common, "app", "contact", "count", "pages"]),
  }[command];
  if (!allowed) throw new Error(`Unknown command: ${command}`);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw new Error(`Unknown option for ${command}: --${key}`);
  }
  if (command === "wechat" && !options.contact?.trim()) {
    throw new Error("wechat requires --contact <name>");
  }
  if (command === "wechat") {
    parsePositiveInteger(options.count, "--count", "20");
    parsePositiveInteger(options.pages, "--pages", "12");
  }
  if (command === "diagnose-capture") {
    parsePositiveInteger(options.samples, "--samples", "5");
    parseNonNegativeInteger(options.interval, "--interval", "1000");
  }
}

function checkInterrupted(interrupt) {
  if (interrupt.signal) throw new InterruptedError(interrupt.signal);
}

async function runListApps(client) {
  const result = await client.call("list_apps", {});
  console.log(JSON.stringify(result, null, 2));
}

function redactedState(parsed, screenshot) {
  return {
    app: parsed.app,
    window: parsed.window ? {
      window_id: parsed.window.window_id,
      pid: parsed.window.pid,
      title: parsed.window.title,
      bounds: parsed.window.bounds,
      z_index: parsed.window.z_index,
      is_on_screen: parsed.window.is_on_screen,
      on_current_space: parsed.window.on_current_space,
    } : null,
    snapshotId: parsed.snapshotId,
    elementCount: parsed.elements.length,
    elements: parsed.elements.map((element) => ({
      elementIndex: element.element_index,
      role: element.role,
      identifier: element.identifier?.startsWith("session_item_")
        ? "session_item_<redacted>"
        : element.identifier,
      frame: element.frame,
    })),
    screenshot,
  };
}

async function runState(client, options) {
  const app = options.app ?? DEFAULT_APP;
  const capturedAt = new Date();
  const directory = join(
    options.output ?? DEFAULT_OUTPUT,
    "state",
    capturedAt.toISOString().replaceAll(":", "-"),
  );
  const target = await locateTarget(client, app);
  const { parsed, screenshot } = await captureState(
    client,
    target,
    join(directory, "state.txt"),
    join(directory, "state.png"),
    "state",
  );
  console.log(JSON.stringify(redactedState(parsed, screenshot), null, 2));
}

async function runDiagnoseCapture(client, options, interrupt) {
  const app = options.app ?? DEFAULT_APP;
  const samples = parsePositiveInteger(options.samples, "--samples", "5");
  const interval = parseNonNegativeInteger(options.interval, "--interval", "1000");
  const capturedAt = new Date();
  const directory = join(
    options.output ?? DEFAULT_OUTPUT,
    "capture-diagnostics",
    capturedAt.toISOString().replaceAll(":", "-"),
  );
  const diagnosticSamples = [];
  for (let index = 0; index < samples; index++) {
    checkInterrupted(interrupt);
    const target = await locateTarget(client, app);
    const name = `sample-${String(index).padStart(2, "0")}`;
    const { parsed, screenshot } = await captureState(
      client,
      target,
      join(directory, "raw", `${name}.txt`),
      join(directory, "screenshots", `${name}.png`),
      name,
    );
    diagnosticSamples.push({
      sequence: index + 1,
      capturedAt: new Date().toISOString(),
      pid: target.pid,
      windowID: target.windowID,
      elementCount: parsed.elements.length,
      screenshot,
    });
    console.error(
      `[capture] ${index + 1}/${samples}: ${screenshot.width}x${screenshot.height}, nonWhiteRatio=${screenshot.nonWhiteRatio.toFixed(4)}`,
    );
    if (index + 1 < samples) await delay(interval);
  }
  const diagnostic = {
    source: "cua-driver",
    capturedAt: capturedAt.toISOString(),
    app,
    samples: diagnosticSamples,
  };
  await writeJson(join(directory, "capture-diagnostic.json"), diagnostic);
  console.log(`Saved: ${resolve(directory, "capture-diagnostic.json")}`);
}

async function runWechat(client, options, interrupt) {
  const appBundleID = options.app ?? DEFAULT_APP;
  const contact = options.contact.trim();
  const count = parsePositiveInteger(options.count, "--count", "20");
  const maximumPages = parsePositiveInteger(options.pages, "--pages", "12");
  const capturedAt = new Date();
  const runDirectory = join(
    options.output ?? DEFAULT_OUTPUT,
    safeName(contact),
    capturedAt.toISOString().replaceAll(":", "-"),
  );
  const runStatus = {
    status: "running",
    stage: "starting",
    contact,
    requestedCount: count,
    startedAt: capturedAt.toISOString(),
    updatedAt: capturedAt.toISOString(),
  };
  const checkpoint = async (stage, details = {}) => {
    Object.assign(runStatus, details, { stage, updatedAt: new Date().toISOString() });
    await writeRunStatus(runDirectory, runStatus);
  };
  await checkpoint("starting");

  try {
    checkInterrupted(interrupt);
    let target = await locateTarget(client, appBundleID);
    let capture = await saveSelectionState(client, target, runDirectory, "initial-state");
    let parsed = capture.parsed;
    let selectionMethod = "current-conversation";
    await checkpoint("initial-state-read", { observedContact: parsed.contact });

    if (!conversationTitleMatches(parsed.contact, contact)) {
      if (!parsed.sessionList && parsed.windowTitle !== "微信") {
        target = await closeSecondaryWindow(client, target, parsed, appBundleID);
        parsed = await readWindowState(client, target);
      }

      if (!conversationTitleMatches(parsed.contact, contact)) {
        if (!parsed.sessionList) {
          if (!findMessagesTab(parsed.elements)) throw new Error("WeChat Messages tab was not found");
          await actOnFreshElement(client, target, (state) => findMessagesTab(state.elements), "click");
          await delay(300);
          target = await locateTarget(client, appBundleID);
        }
        capture = await saveSelectionState(client, target, runDirectory, "messages-tab");
        parsed = capture.parsed;
        await checkpoint("messages-tab-opened", { observedContact: parsed.contact });
        if (!parsed.sessionList) throw new Error("WeChat session list was not found");

        if (getSearchValue(parsed.elements)) {
          const search = findSearchField(parsed.elements);
          if (!search) throw new Error("WeChat search field was not found while clearing search");
          await actOnParsedElement(client, target, parsed, search, "set_value", { value: "" });
          await delay(300);
          target = await locateTarget(client, appBundleID);
          capture = await saveSelectionState(client, target, runDirectory, "search-cleared");
          parsed = capture.parsed;
          if (getSearchValue(parsed.elements)) throw new Error("WeChat search field could not be cleared");
        }

        await actOnFreshElement(client, target, (state) => state.sessionList, "press_key", { key: "home" });
        await delay(300);
        target = await locateTarget(client, appBundleID);
        capture = await saveSelectionState(client, target, runDirectory, "session-list-top");
        parsed = capture.parsed;
        const visibleConversation = findVisibleConversation(parsed.elements, contact);
        if (visibleConversation) {
          await actOnParsedElement(
            client,
            target,
            parsed,
            visibleConversation,
            "click",
          );
          selectionMethod = "visible-session-list";
          await delay(300);
          target = await locateTarget(client, appBundleID);
          capture = await saveSelectionState(client, target, runDirectory, "conversation-opened");
          parsed = capture.parsed;
        } else {
          const search = findSearchField(parsed.elements);
          if (!search) throw new Error("WeChat search field was not found");
          await actOnParsedElement(
            client,
            target,
            parsed,
            search,
            "set_value",
            { value: contact },
          );
          await delay(300);
          target = await locateTarget(client, appBundleID);
          capture = await saveSelectionState(client, target, runDirectory, "search-results");
          parsed = capture.parsed;
          const observedSearchValue = getSearchValue(parsed.elements);
          await checkpoint("search-text-entered", { observedSearchValue });
          if (observedSearchValue !== contact) {
            throw new Error("WeChat search value changed or was not entered");
          }
          throw new Error("WeChat search results cannot be selected safely from Accessibility; refusing to press Return");
        }
      }
    }

    if (!conversationTitleMatches(parsed.contact, contact)) {
      throw new Error("Opened WeChat conversation does not match the requested contact");
    }
    const openedContact = parsed.contact;
    await checkpoint("conversation-verified", { observedContact: openedContact, selectionMethod });
    if (!isStandardChat(parsed.elements)) {
      const conversationKind = isOfficialAccount(parsed.elements) ? "official-account" : "unsupported";
      throw new Error(`Conversation is ${conversationKind}; only standard direct and group chats are supported`);
    }
    if (!parsed.messageList) throw new Error("WeChat message list was not found");
    if (parsed.messages.length === 0 && parsed.unindexedMessageNodeCount > 0) {
      throw new Error(
        "Cua Driver did not expose WeChat message bubbles as structured elements; refusing to report an empty successful capture",
      );
    }

    await checkpoint("finding-latest-messages");
    let bottomSignature = visibleHistorySignature(parsed);
    let unchangedDownwardScrolls = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      checkInterrupted(interrupt);
      await actOnFreshElement(client, target, (state) => state.messageList, "scroll", {
        direction: "down",
        by: "page",
        amount: 1,
      });
      await delay(300);
      target = await locateTarget(client, appBundleID);
      capture = await saveSelectionState(
        client,
        target,
        runDirectory,
        `latest-${String(attempt + 1).padStart(2, "0")}`,
      );
      parsed = capture.parsed;
      if (parsed.contact !== openedContact) throw new Error("Conversation changed while finding latest messages");
      if (!parsed.messageList) throw new Error("Message list disappeared while finding latest messages");
      const currentSignature = visibleHistorySignature(parsed);
      unchangedDownwardScrolls = currentSignature === bottomSignature ? unchangedDownwardScrolls + 1 : 0;
      bottomSignature = currentSignature;
      if (unchangedDownwardScrolls >= 2) break;
    }
    if (unchangedDownwardScrolls < 2) {
      throw new Error("Could not confirm the latest-message boundary after 10 downward scrolls");
    }

    await checkpoint("collecting-messages");
    capture = await savePage(client, target, runDirectory, 0);
    parsed = capture.parsed;
    let messages = parsed.messages;
    let historyPages = 0;
    let previousHistorySignature = visibleHistorySignature(parsed);
    let unchangedUpwardScrolls = 0;
    let historyEnd = messages.length >= count
      ? { status: "not-checked", reason: "requested-count-reached" }
      : { status: "unknown", reason: "not-enough-observations" };

    while (messages.length < count && historyPages < maximumPages) {
      checkInterrupted(interrupt);
      await actOnFreshElement(client, target, (state) => state.messageList, "scroll", {
        direction: "up",
        by: "page",
        amount: 1,
      });
      await delay(500);
      target = await locateTarget(client, appBundleID);
      historyPages++;
      capture = await savePage(client, target, runDirectory, historyPages);
      parsed = capture.parsed;
      if (parsed.contact !== openedContact) throw new Error("Conversation changed during history collection");
      if (!parsed.messageList) throw new Error("Message list disappeared during history collection");

      const historySignature = visibleHistorySignature(parsed);
      const merged = mergeOlderMessages(parsed.messages, messages);
      if (merged.length > messages.length) {
        unchangedUpwardScrolls = 0;
        historyEnd = { status: "more-found", reason: "older-messages-added" };
      } else if (historySignature !== null && historySignature === previousHistorySignature) {
        unchangedUpwardScrolls++;
        historyEnd = {
          status: unchangedUpwardScrolls >= 3 ? "exhausted" : "unknown",
          reason: "unchanged-after-upward-scroll",
          unchangedUpwardScrolls,
        };
      } else {
        unchangedUpwardScrolls = 0;
        historyEnd = { status: "unknown", reason: "visible-history-changed-without-mergeable-messages" };
      }
      messages = merged;
      previousHistorySignature = historySignature;
      await checkpoint("collecting-history", {
        capturedCount: messages.length,
        historyEnd,
        pagesSaved: historyPages + 1,
      });
      if (historyEnd.status === "exhausted") break;
    }

    if (messages.length >= count) {
      historyEnd = { status: "not-checked", reason: "requested-count-reached" };
    } else if (historyEnd.status !== "exhausted" && historyPages >= maximumPages) {
      historyEnd = { status: "unknown", reason: "page-limit-reached", maximumPages };
    }

    const selected = messages.slice(-count).map((message, index) => ({ sequence: index + 1, ...message }));
    const record = {
      schemaVersion: 1,
      source: "cua-driver",
      capturedAt: capturedAt.toISOString(),
      app: parsed.app,
      conversation: { contact, observedContact: openedContact, selectionMethod },
      requestedCount: count,
      capturedCount: selected.length,
      historyEnd,
      speakerDetection: "unavailable-from-accessibility-tree",
      messages: selected,
    };
    await writeJson(join(runDirectory, "record.json"), record);
    await checkpoint("completed", { status: "completed", capturedCount: selected.length });
    console.log(`Captured ${selected.length} message(s); conversation selection: ${selectionMethod}`);
    console.log(`Saved: ${resolve(runDirectory, "record.json")}`);
  } catch (error) {
    if (interrupt.signal || error instanceof InterruptedError) {
      await checkpoint("interrupted", { status: "interrupted", signal: interrupt.signal ?? error.signal });
    } else {
      const screenshotUnavailable = error.code === "COMPUTER_USE_SCREENSHOT_BLANK"
        || error.code === "COMPUTER_USE_SCREENSHOT_UNAVAILABLE";
      const status = screenshotUnavailable ? "needs-computer-use-inspection" : "failed";
      await checkpoint(status, {
        status,
        error: error.message,
        screenshotAnalysis: error.screenshotAnalysis,
      });
    }
    throw error;
  }
}

function usage() {
  console.log(`Usage:
  node scripts/cua-driver-wechat.mjs list-apps
  node scripts/cua-driver-wechat.mjs state --app com.tencent.xinWeChat
  node scripts/cua-driver-wechat.mjs diagnose-capture --app com.tencent.xinWeChat --samples 5 --interval 1000
  node scripts/cua-driver-wechat.mjs wechat --contact 测试联系人 --count 20 --pages 12

Options:
  --driver <absolute-path>  cua-driver path (default: YANCE_CUA_DRIVER_PATH or PATH)
  --output <directory>      Local record root (default: local-data/computer-use)
  --app <bundle-id>         Target app (default: com.tencent.xinWeChat)
  --contact <name>          Exact WeChat contact or group name
  --count <n>               Requested message count (default: 20)
  --pages <n>               Maximum upward-scroll pages (default: 12)
  --samples <n>             Capture diagnostic sample count (default: 5)
  --interval <ms>           Capture diagnostic interval (default: 1000)`);
}

export async function runCli(argumentsList = process.argv.slice(2), environment = process.env) {
  const [command, ...rest] = argumentsList;
  if (!command || command === "--help" || command === "help") {
    usage();
    return 0;
  }
  const options = parseOptions(rest);
  validateOptions(command, options);
  const driverPath = resolveDriverPath(options, environment);
  await access(driverPath, fsConstants.X_OK);
  const session = `yance-wechat-${randomBytes(6).toString("hex")}`;
  const client = new CuaDriverClient(driverPath, session);
  const interrupt = { signal: null };
  const handleSignal = (signal) => {
    if (!interrupt.signal) interrupt.signal = signal;
    client.cancelActive();
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  let failure = null;

  try {
    await client.startSession();
    if (command === "list-apps") await runListApps(client);
    else if (command === "state") await runState(client, options);
    else if (command === "diagnose-capture") await runDiagnoseCapture(client, options, interrupt);
    else await runWechat(client, options, interrupt);
  } catch (error) {
    failure = error;
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    try {
      await client.endSession();
    } catch (cleanupError) {
      if (failure || interrupt.signal) console.error(`[cleanup] ${cleanupError.message}`);
      else failure = cleanupError;
    }
  }

  if (interrupt.signal) return interrupt.signal === "SIGINT" ? 130 : 143;
  if (failure) throw failure;
  return 0;
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
