#!/usr/bin/env node
/**
 * MCP 桥端到端测试（需要 AiSqlBoy 正在运行且已开启 MCP 服务）
 *
 * 与 mcp-smoke-test.mjs 的区别：那个用 HTTP 桩模拟后端，这个连真实服务，
 * 并且用应用自带的 Electron 二进制以 Node 模式启动桥 —— 即客户端配置里实际执行的命令。
 *
 * 运行：npm run test:mcp:e2e
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const bridgePath = path.join(repoRoot, 'packages', 'mcp-server', 'index.mjs');

const failures = [];
const check = (name, ok, detail = '') => {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

function endpointCandidates() {
  const names = ['aisqlboy', 'AiSqlBoy'];
  const home = os.homedir();
  const dirs = [];
  if (process.env.APPDATA) for (const n of names) dirs.push(path.join(process.env.APPDATA, n));
  for (const n of names) dirs.push(path.join(home, 'Library', 'Application Support', n));
  for (const n of names) dirs.push(path.join(home, '.config', n));
  return dirs;
}

const endpointDir = endpointCandidates().find((dir) =>
  fs.existsSync(path.join(dir, 'mcp-endpoint.json'))
);

if (!endpointDir) {
  console.log('未找到 mcp-endpoint.json —— 请先启动 AiSqlBoy 并在设置中开启 MCP 服务');
  process.exit(1);
}

const endpoint = JSON.parse(fs.readFileSync(path.join(endpointDir, 'mcp-endpoint.json'), 'utf8'));
console.log(`MCP 端到端测试（端口 ${endpoint.port}，userData ${endpointDir}）`);

// 客户端配置里使用的运行时就是 Electron 二进制
let electronPath;
try {
  electronPath = require('electron');
} catch {
  electronPath = process.execPath;
}

const child = spawn(electronPath, [bridgePath], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const responses = [];
const stdoutLines = [];
let stderrText = '';
child.stderr.on('data', (chunk) => (stderrText += chunk.toString()));

readline.createInterface({ input: child.stdout }).on('line', (line) => {
  stdoutLines.push(line);
  try {
    responses.push(JSON.parse(line));
  } catch {
    // 非 JSON 由断言捕获
  }
});

const send = (payload) => child.stdin.write(`${JSON.stringify(payload)}\n`);

function waitFor(predicate, timeoutMs = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const hit = responses.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - started > timeoutMs) return reject(new Error('等待响应超时'));
      setTimeout(tick, 40);
    };
    tick();
  });
}

try {
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } },
  });
  const init = await waitFor((m) => m.id === 1);
  check('Electron 以 Node 模式成功启动桥', init?.result?.serverInfo?.name === 'aisqlboy', JSON.stringify(init));

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = await waitFor((m) => m.id === 2);
  const tools = list?.result?.tools ?? [];
  check('工具清单来自真实服务', tools.length >= 7, `拿到 ${tools.length} 个`);
  check('包含 describe_table', tools.some((t) => t.name === 'describe_table'));

  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_connections', arguments: {} } });
  const conns = await waitFor((m) => m.id === 3);
  const connText = conns?.result?.content?.[0]?.text ?? '';
  check('list_connections 返回真实连接', connText.includes('可用连接') || connText.includes('没有保存任何连接'), connText.slice(0, 120));

  send({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'run_query', arguments: { connectionId: 999999, sql: 'SELECT 1' } },
  });
  const badConn = await waitFor((m) => m.id === 4);
  check(
    '不存在的连接返回可读错误',
    badConn?.result?.isError === true && /连接不存在/.test(badConn?.result?.content?.[0]?.text ?? ''),
    JSON.stringify(badConn?.result?.content?.[0]?.text).slice(0, 120)
  );

  send({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'run_query', arguments: { connectionId: 999999, sql: 'DROP TABLE x' } },
  });
  const blocked = await waitFor((m) => m.id === 5);
  const blockedText = blocked?.result?.content?.[0]?.text ?? '';
  check('DDL 被只读守卫拦截', blocked?.result?.isError === true && !/执行成功/.test(blockedText), blockedText.slice(0, 120));

  check('stdout 全部是合法 JSON-RPC', stdoutLines.length === responses.length, `${stdoutLines.length}/${responses.length}`);
  if (stderrText.trim()) {
    console.log(`  info 桥日志：${stderrText.trim().split('\n')[0]}`);
  }
} catch (error) {
  failures.push(`异常：${error.message}`);
  console.log(`  FAIL 测试流程异常 — ${error.message}`);
} finally {
  child.kill();
}

console.log('');
if (failures.length === 0) {
  console.log('全部通过');
  process.exit(0);
} else {
  console.log(`失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}
