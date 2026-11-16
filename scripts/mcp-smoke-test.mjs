#!/usr/bin/env node
/**
 * aisqlboy-mcp 协议层冒烟测试
 *
 * 不需要启动 Electron：用一个 HTTP 桩模拟 AiSqlBoy 的 RPC 端点，
 * 验证 stdio 桥能否正确发现端点、握手、转发工具列表与工具调用，
 * 以及 stdout 是否只输出 JSON-RPC（这是本地 MCP 最常见的翻车点）。
 *
 * 运行：node scripts/mcp-smoke-test.mjs
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgePath = path.join(__dirname, '..', 'packages', 'mcp-server', 'index.mjs');
const TOKEN = 'test-token';

const fakeTools = [
  {
    name: 'list_connections',
    description: '列出已保存的连接',
    inputSchema: { type: 'object', properties: {} },
  },
];

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisqlboy-mcp-test-'));
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.url !== '/rpc' || req.method !== 'POST') {
      send(404, { ok: false, error: 'not found' });
      return;
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      send(401, { ok: false, error: '鉴权失败：token 不匹配' });
      return;
    }

    const { method, params } = JSON.parse(body || '{}');
    if (method === 'tools/list') {
      send(200, { ok: true, result: { tools: fakeTools } });
      return;
    }
    if (method === 'tools/call') {
      send(200, {
        ok: true,
        result: {
          content: [{ type: 'text', text: `called:${params?.name}|args:${JSON.stringify(params?.arguments ?? {})}` }],
        },
      });
      return;
    }
    send(200, { ok: false, error: `未知方法：${method}` });
  });
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
fs.writeFileSync(
  path.join(tmpDir, 'mcp-endpoint.json'),
  JSON.stringify({ port, token: TOKEN, pid: process.pid, version: 'test' })
);

const child = spawn(process.execPath, [bridgePath], {
  env: { ...process.env, AISQLBOY_USER_DATA: tmpDir },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const responses = [];
const stdoutLines = [];
let stderrText = '';

child.stderr.on('data', (chunk) => (stderrText += chunk.toString()));

const rl = readline.createInterface({ input: child.stdout });
rl.on('line', (line) => {
  stdoutLines.push(line);
  try {
    responses.push(JSON.parse(line));
  } catch {
    // 非 JSON 输出记入失败断言
  }
});

function send(payload) {
  child.stdin.write(`${JSON.stringify(payload)}\n`);
}

function waitFor(predicate, timeoutMs = 3000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = responses.find(predicate);
      if (found) return resolve(found);
      if (Date.now() - started > timeoutMs) return reject(new Error('等待响应超时'));
      setTimeout(tick, 30);
    };
    tick();
  });
}

console.log('MCP 桥冒烟测试');

try {
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
  const init = await waitFor((m) => m.id === 1);
  check('initialize 返回 serverInfo', init?.result?.serverInfo?.name === 'aisqlboy', JSON.stringify(init));
  check('initialize 回显协议版本', init?.result?.protocolVersion === '2024-11-05');

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const list = await waitFor((m) => m.id === 2);
  check('tools/list 透传后端工具', list?.result?.tools?.[0]?.name === 'list_connections', JSON.stringify(list));

  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_connections', arguments: { a: 1 } } });
  const call = await waitFor((m) => m.id === 3);
  check(
    'tools/call 透传参数',
    call?.result?.content?.[0]?.text === 'called:list_connections|args:{"a":1}',
    JSON.stringify(call)
  );

  send({ jsonrpc: '2.0', id: 4, method: 'unknown/method' });
  const unknown = await waitFor((m) => m.id === 4);
  check('未知方法返回 -32601', unknown?.error?.code === -32601, JSON.stringify(unknown));

  // token 失效场景：换掉端点文件再调用，桥应回退到首次错误并给出可读提示
  fs.writeFileSync(
    path.join(tmpDir, 'mcp-endpoint.json'),
    JSON.stringify({ port, token: 'wrong-token', pid: process.pid, version: 'test' })
  );
  send({ jsonrpc: '2.0', id: 5, method: 'tools/list' });
  const denied = await waitFor((m) => m.id === 5);
  check('鉴权失败时返回 -32603 且带原因', denied?.error?.code === -32603 && /token/.test(denied?.error?.message || ''), JSON.stringify(denied));

  check('stdout 全部是合法 JSON-RPC', stdoutLines.length === responses.length, `${stdoutLines.length} 行 / ${responses.length} 条可解析`);
  check('所有响应都带 jsonrpc 2.0', responses.every((m) => m.jsonrpc === '2.0'));
  check('日志走 stderr 而非 stdout', stderrText.includes('[aisqlboy-mcp]'), stderrText.slice(0, 120));
} catch (error) {
  failures.push(`异常：${error.message}`);
  console.log(`  FAIL 测试流程异常 — ${error.message}`);
} finally {
  child.kill();
  server.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // 临时目录清理失败不影响结论
  }
}

console.log('');
if (failures.length === 0) {
  console.log('全部通过');
  process.exit(0);
} else {
  console.log(`失败 ${failures.length} 项：${failures.join('、')}`);
  process.exit(1);
}
