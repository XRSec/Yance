#!/usr/bin/env node

import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Transform } from "node:stream";

const realClient = process.env.YANCE_REAL_CU_CLIENT ?? join(
  process.env.CODEX_HOME ?? join(homedir(), ".codex"),
  "computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
);
const startedAt = new Date();
const logPath = process.env.YANCE_CU_METADATA_LOG ?? join(
  "local-data/computer-use-hook",
  `${startedAt.toISOString().replaceAll(":", "-")}-${process.pid}.jsonl`,
);

mkdirSync(dirname(logPath), { recursive: true });
const pending = new Map();

function log(event) {
  const record = `${JSON.stringify({ timestamp: new Date().toISOString(), proxyPid: process.pid, ...event })}\n`;
  try {
    appendFileSync(logPath, record);
  } catch (error) {
    process.stderr.write(`[computer-use-proxy] metadata log failed: ${error.name}\n`);
  }
}

function pngMetadata(data) {
  try {
    const bytes = Buffer.from(data, "base64");
    const isPng = bytes.length >= 24
      && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return {
      bytes: bytes.length,
      ...(isPng ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) } : {}),
    };
  } catch {
    return { decodeError: true };
  }
}

function responseMetadata(message) {
  const result = message.result;
  if (!result || typeof result !== "object") return { resultType: result === null ? "null" : typeof result };
  const content = Array.isArray(result.content)
    ? result.content.map((item) => {
      const metadata = { type: item?.type ?? "unknown" };
      if (item?.type === "image" && typeof item.data === "string") {
        Object.assign(metadata, pngMetadata(item.data));
      }
      return metadata;
    })
    : undefined;
  return {
    resultType: Array.isArray(result) ? "array" : "object",
    resultKeys: Object.keys(result).sort(),
    ...(content ? { content } : {}),
    ...(typeof result.isError === "boolean" ? { isError: result.isError } : {}),
  };
}

function requestMetadata(message) {
  const params = message.params && typeof message.params === "object" ? message.params : {};
  const tool = message.method === "tools/call" ? params.name : undefined;
  const args = tool && params.arguments && typeof params.arguments === "object" ? params.arguments : {};
  return {
    jsonrpc: message.jsonrpc,
    method: message.method,
    id: message.id,
    paramKeys: Object.keys(params).sort(),
    ...(tool ? {
      tool,
      argumentKeys: Object.keys(args).sort(),
      ...(typeof args.app === "string" ? { app: args.app } : {}),
      ...(Number.isInteger(args.element_index) ? { element_index: args.element_index } : {}),
    } : {}),
  };
}

function inspectLine(direction, line) {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    log({ direction, event: "non-json-line", bytes: Buffer.byteLength(line) });
    return;
  }

  if (typeof message.method === "string") {
    const metadata = requestMetadata(message);
    if (message.id !== undefined) pending.set(String(message.id), metadata);
    log({ direction, event: message.id === undefined ? "notification" : "request", ...metadata });
    return;
  }

  const request = message.id === undefined ? undefined : pending.get(String(message.id));
  if (message.id !== undefined) pending.delete(String(message.id));
  log({
    direction,
    event: "response",
    id: message.id,
    ...(request?.method ? { requestMethod: request.method } : {}),
    ...(request?.tool ? { tool: request.tool } : {}),
    ...(message.error && typeof message.error === "object" ? {
      error: {
        keys: Object.keys(message.error).sort(),
        ...(typeof message.error.code === "number" || typeof message.error.code === "string"
          ? { code: message.error.code }
          : {}),
        messagePresent: typeof message.error.message === "string",
      },
    } : responseMetadata(message)),
  });
}

class MetadataTap extends Transform {
  constructor(direction) {
    super();
    this.direction = direction;
    this.buffer = "";
  }

  _transform(chunk, _encoding, callback) {
    this.push(chunk);
    this.buffer += chunk.toString("utf8");
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) inspectLine(this.direction, line.replace(/\r$/, ""));
    callback();
  }

  _flush(callback) {
    if (this.buffer) inspectLine(this.direction, this.buffer);
    callback();
  }
}

log({
  event: "proxy-start",
  parentPid: process.ppid,
  realClient,
  command: process.argv[2] ?? null,
  argumentCount: Math.max(0, process.argv.length - 2),
});

const child = spawn(realClient, process.argv.slice(2), { stdio: ["pipe", "pipe", "pipe"] });
log({ event: "client-start", clientPid: child.pid });

process.stdin.pipe(new MetadataTap("codex-to-client")).pipe(child.stdin);
child.stdout.pipe(new MetadataTap("client-to-codex")).pipe(process.stdout);
child.stderr.on("data", (chunk) => {
  log({ event: "client-stderr", bytes: chunk.length });
  process.stderr.write(chunk);
});

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    log({ event: "proxy-signal", signal });
    child.kill(signal);
  });
}

child.once("error", (error) => {
  log({ event: "client-error", error: { name: error.name, code: error.code ?? null } });
});

child.once("exit", (code, signal) => {
  log({ event: "client-exit", code, signal });
  process.exitCode = code ?? (signal ? 1 : 0);
});
