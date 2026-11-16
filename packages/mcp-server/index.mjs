#!/usr/bin/env node
/**
 * aisqlboy-mcp — AiSqlBoy 的 MCP stdio 桥
 *
 * 零依赖：手写 newline-delimited JSON-RPC 2.0，避免 npx 安装时拉一堆包。
 * 职责很窄：把 MCP 客户端的 tools/list、tools/call 转发给本机运行中的 AiSqlBoy。
 * 工具定义不在本包内，取自后端 tools/list，保证只有一份事实源。
 *
 * 铁律：stdout 只用来写 JSON-RPC。任何日志、警告、堆栈一律走 stderr，
 * 否则客户端会解析失败并断开连接。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SERVER_NAME = 'aisqlboy';
const SERVER_VERSION = '1.0.0';
const FALLBACK_PROTOCOL = '2024-11-05';
const ENDPOINT_FILENAME = 'mcp-endpoint.json';

function log(...args) {
  console.error('[aisqlboy-mcp]', ...args);
}

function writeMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function writeResult(id, result) {
  writeMessage({ jsonrpc: '2.0', id, result });
}

function writeError(id, code, message) {
  writeMessage({ jsonrpc: '2.0', id, error: { code, message } });
}

/** AiSqlBoy 的 userData 目录候选（打包后为 productName，开发态为 package name） */
function candidateDirs() {
  const dirs = [];
  const explicit = process.env.AISQLBOY_USER_DATA;
  if (explicit) dirs.push(explicit);

  const names = ['AiSqlBoy', 'aisqlboy'];
  const home = os.homedir();

  if (process.platform === 'win32' && process.env.APPDATA) {
    for (const name of names) dirs.push(path.join(process.env.APPDATA, name));
  } else if (process.platform === 'darwin') {
    for (const name of names) dirs.push(path.join(home, 'Library', 'Application Support', name));
  } else {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    for (const name of names) dirs.push(path.join(configHome, name));
  }
  return dirs;
}

function readEndpoint() {
  for (const dir of candidateDirs()) {
    const file = path.join(dir, ENDPOINT_FILENAME);
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (data && data.port && data.token) return data;
    } catch {
      // 该目录下没有端点文件，继续探测
    }
  }
  return null;
}

function missingEndpointHint() {
  return (
    `找不到 AiSqlBoy 的本地端点文件（${ENDPOINT_FILENAME}）。\n` +
    `请确认：1) AiSqlBoy 正在运行；2) 设置页已开启「MCP 服务」。\n` +
    `如 userData 目录非默认位置，可设置环境变量 AISQLBOY_USER_DATA 指向它。\n` +
    `已探测：${candidateDirs().join(' | ')}`
  );
}

async function rpcOnce(method, params) {
  const endpoint = readEndpoint();
  if (!endpoint) throw new Error(missingEndpointHint());

  const response = await fetch(`http://127.0.0.1:${endpoint.port}/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${endpoint.token}`,
    },
    body: JSON.stringify({ method, params }),
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`后端返回非 JSON 内容（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }

  if (!payload.ok) throw new Error(payload.error || '后端调用失败');
  return payload.result;
}

/**
 * 调用后端。失败时重试一次 —— 通常是 AiSqlBoy 重启导致端口变化，
 * 重试会重新读取端点文件拿到新端口。
 */
async function rpc(method, params) {
  try {
    return await rpcOnce(method, params);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return await rpcOnce(method, params);
    } catch {
      throw firstError;
    }
  }
}

async function handleMessage(message) {
  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case 'initialize': {
        writeResult(id, {
          // 回显客户端版本，避免版本协商失败
          protocolVersion: params?.protocolVersion || FALLBACK_PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
        return;
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return;

      case 'ping':
        writeResult(id, {});
        return;

      case 'tools/list': {
        const result = await rpc('tools/list', {});
        writeResult(id, { tools: result?.tools || [] });
        return;
      }
      case 'tools/call': {
        const result = await rpc('tools/call', {
          name: params?.name,
          arguments: params?.arguments || {},
        });
        writeResult(id, result);
        return;
      }
      case 'resources/list':
        writeResult(id, { resources: [] });
        return;
      case 'prompts/list':
        writeResult(id, { prompts: [] });
        return;
      default:
        if (isNotification) return;
        writeError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    log('处理消息失败：', error?.message || error);
    if (isNotification) return;
    if (method === 'tools/call') {
      // 工具层错误按 MCP 约定作为结果返回，让模型能读到原因并自我纠正
      writeResult(id, {
        content: [{ type: 'text', text: `调用失败：${error?.message || '未知错误'}` }],
        isError: true,
      });
      return;
    }
    writeError(id, -32603, error?.message || '内部错误');
  }
}

function main() {
  const endpoint = readEndpoint();
  if (endpoint) {
    log(`已连接 AiSqlBoy v${endpoint.version || '?'}（127.0.0.1:${endpoint.port}）`);
  } else {
    log('未找到本地端点，等待 AiSqlBoy 启动…');
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  // 串行处理，保证响应顺序与请求一致
  let queue = Promise.resolve();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      log('忽略非法 JSON 行');
      return;
    }

    queue = queue.then(() => handleMessage(message)).catch((error) => {
      log('消息处理异常：', error?.message || error);
    });
  });

  rl.on('close', () => {
    log('stdin 已关闭，退出');
    process.exit(0);
  });

  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
  process.on('uncaughtException', (error) => {
    log('未捕获异常：', error?.stack || error);
  });
  process.on('unhandledRejection', (reason) => {
    log('未处理的 Promise 拒绝：', reason);
  });
}

main();
