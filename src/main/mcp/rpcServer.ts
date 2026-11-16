/**
 * 本地 MCP RPC 端点
 *
 * 只监听 127.0.0.1 的随机端口，用一次性 token 鉴权。
 * 端口与 token 写入 userData/mcp-endpoint.json（权限 0600），由 stdio 桥读取后握手。
 *
 * 为什么不让 MCP 客户端直接连数据库：
 * 驱动是 native 模块（sqlite3 / oracledb），二次分发要重走 ABI 打包；
 * 复用已运行实例还能免费获得系统级加密的凭据、授权库白名单与只读守卫。
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { buildToolList, executeTool } from './tools';
import { driverPool } from './driverPool';

const ENDPOINT_FILENAME = 'mcp-endpoint.json';
const MAX_BODY_BYTES = 1024 * 1024;

let server: Server | null = null;
let token = '';
let port = 0;

export function getEndpointFilePath(): string {
  return path.join(app.getPath('userData'), ENDPOINT_FILENAME);
}

export function isMcpRunning(): boolean {
  return server !== null;
}

export function getMcpStatus(): { running: boolean; port: number; endpointFile: string; poolSize: number } {
  return {
    running: isMcpRunning(),
    port,
    endpointFile: getEndpointFilePath(),
    poolSize: driverPool.size,
  };
}

function timingSafeEqualText(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function handleRpc(method: string, params: any): Promise<unknown> {
  switch (method) {
    case 'ping':
      return { app: 'AiSqlBoy', version: app.getVersion(), pid: process.pid };
    case 'tools/list':
      return { tools: await buildToolList() };
    case 'tools/call': {
      const name = String(params?.name || '');
      if (!name) throw new Error('tools/call 缺少 name');
      return await executeTool(name, params?.arguments ?? {});
    }
    case 'pool/stats':
      return { size: driverPool.size };
    default:
      throw new Error(`未知方法：${method}`);
  }
}

export async function startMcpServer(): Promise<{ port: number; endpointFile: string }> {
  if (server) {
    return { port, endpointFile: getEndpointFilePath() };
  }

  token = crypto.randomBytes(32).toString('hex');

  server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // 双保险：即便绑定被改写，也拒绝非本机来源
    const remote = req.socket.remoteAddress || '';
    if (!(remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
      sendJson(res, 403, { ok: false, error: '仅允许本机访问' });
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true, running: true });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/rpc') {
      sendJson(res, 404, { ok: false, error: 'Not Found' });
      return;
    }

    const auth = req.headers.authorization || '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!provided || !timingSafeEqualText(provided, token)) {
      sendJson(res, 401, { ok: false, error: '鉴权失败：token 不匹配。请确认 AiSqlBoy 正在运行且 MCP 服务已开启' });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const method = String(body?.method || '');
      if (!method) {
        sendJson(res, 400, { ok: false, error: '缺少 method' });
        return;
      }
      const result = await handleRpc(method, body?.params);
      sendJson(res, 200, { ok: true, result });
    } catch (error: any) {
      sendJson(res, 200, { ok: false, error: error?.message || '内部错误' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => {
      server!.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;

  const endpointFile = getEndpointFilePath();
  const payload = {
    port,
    token,
    pid: process.pid,
    version: app.getVersion(),
    startedAt: Date.now(),
  };
  fs.writeFileSync(endpointFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

  console.log(`[mcp] 本地 MCP 服务已启动：127.0.0.1:${port}`);
  return { port, endpointFile };
}

export async function stopMcpServer(): Promise<void> {
  if (!server) return;
  const closing = server;
  server = null;
  token = '';
  port = 0;

  // 先删端点文件：即使随后进程立即退出，桥也不会读到指向死端口的配置
  try {
    fs.rmSync(getEndpointFilePath(), { force: true });
  } catch {
    // 文件可能已被清理，忽略
  }

  await new Promise<void>((resolve) => closing.close(() => resolve()));
  await driverPool.disposeAll();
  console.log('[mcp] 本地 MCP 服务已停止');
}
