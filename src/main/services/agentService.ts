/**
 * Agent Service — Agent 模式核心引擎
 *
 * 负责：
 * 1. 管理 Agent 会话
 * 2. 驱动 Agent 循环（AI → 解析 action → 安全检查 → 执行 → 反馈 → 继续）
 * 3. 工具执行（list_tables / get_schema / execute_sql / finish）
 * 4. 权限控制和安全检查
 */

import { aiService } from './aiService';
import { internalDB } from './internalDB';
import { IDatabaseDriver } from './drivers/types';
import { classifySql, hasMultipleStatements, ensureSelectLimit, isAllowed, requiresApproval, buildImpactPreviewSql, checkAllowedDatabaseSql } from '../../shared/sqlSecurity';
import { buildAgentSystemPrompt, formatToolResult } from '../../shared/agentPrompt';
import {
  AGENT_DEFAULTS,
  AGENT_SETTING_KEYS,
  type AgentAction,
  type AgentActionResult,
  type AgentMessage,
  type AgentPermissionLevel,
  type AgentResponse,
  type AgentSession,
  type AgentToolName,
} from '../../shared/agentTypes';

/** 原生 Function Calling 工具定义（OpenAI tools 协议） */
const AGENT_TOOL_DEFINITIONS: Array<Record<string, unknown>> = [
  {
    type: 'function',
    function: {
      name: 'list_tables',
      description: '列出当前数据库的所有表',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '执行此操作的原因' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: '获取指定表的结构（列名、类型、是否可空、主键等）',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '执行此操作的原因' },
          tables: { type: 'array', items: { type: 'string' }, description: '要查看的表名数组，留空表示获取所有表' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_sql',
      description: '执行一条 SQL 语句',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '执行此操作的原因' },
          sql: { type: 'string', description: '要执行的 SQL 语句' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'finish',
      description: '任务完成，给出面向用户的最终总结',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: '给用户的最终总结内容' },
        },
      },
    },
  },
];

// ============================================================
//  会话管理
// ============================================================

class AgentService {
  private sessions = new Map<string, AgentSession>();
  /** 当前活跃的数据库驱动（与 App 的 currentDriver 共享引用） */
  private driver: IDatabaseDriver | null = null;
  /** 当前驱动对应的连接 ID，用于校验会话是否仍在原连接上 */
  private driverConnectionId: number | undefined = undefined;
  /** 限库连接包授权访问的数据库白名单（null 表示不限） */
  private allowedDatabases: string[] | null = null;
  /** 流式 token 回调（由主进程 IPC 设置，用于向前端推送增量文本） */
  private streamCallback: ((sessionId: string, delta: string) => void) | null = null;

  /** 设置流式 token 回调 */
  setStreamCallback(cb: ((sessionId: string, delta: string) => void) | null): void {
    this.streamCallback = cb;
  }

  /** 设置当前数据库驱动（由主进程 index.ts 在连接数据库时调用）；限库连接包同时传入授权库白名单 */
  setDriver(driver: IDatabaseDriver | null, connectionId?: number, allowedDatabases?: string[] | null): void {
    this.driver = driver;
    this.driverConnectionId = connectionId;
    this.allowedDatabases = allowedDatabases ?? null;
  }

  /** 请求中止会话中正在运行的 Agent 循环 */
  cancelSession(sessionId: string): { success: boolean } {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false };
    session.cancelRequested = true;
    return { success: true };
  }

  /** 创建新的 Agent 会话 */
  async createSession(params: {
    connectionId: number;
    dbType: string;
    dbName: string;
    permissionLevel: AgentPermissionLevel;
  }): Promise<string> {
    const sessionId = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const session: AgentSession = {
      id: sessionId,
      connectionId: params.connectionId,
      dbType: params.dbType,
      dbName: params.dbName,
      permissionLevel: params.permissionLevel,
      messages: [],
      pendingAction: null,
      iteration: 0,
      status: 'idle',
      createdAt: Date.now(),
      cachedTableNames: null,
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  /** 获取会话 */
  getSession(sessionId: string): AgentSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** 销毁会话 */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** 更新会话权限级别（保留历史消息） */
  updatePermission(sessionId: string, level: AgentPermissionLevel): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: '会话不存在' };
    }
    session.permissionLevel = level;
    return { success: true };
  }

  /** 获取配置的最大迭代轮数 */
  private async getMaxIterations(): Promise<number> {
    const stored = await internalDB.getSetting(AGENT_SETTING_KEYS.maxIterations);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return AGENT_DEFAULTS.maxIterations;
  }

  /** 获取配置的 SELECT 行数限制 */
  private async getSelectLimit(): Promise<number> {
    const stored = await internalDB.getSetting(AGENT_SETTING_KEYS.selectLimit);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return AGENT_DEFAULTS.selectLimit;
  }

  /** 获取配置的 SQL 执行超时（ms） */
  private async getExecutionTimeout(): Promise<number> {
    const stored = await internalDB.getSetting(AGENT_SETTING_KEYS.executionTimeout);
    if (stored) {
      const n = parseInt(stored, 10);
      if (!isNaN(n) && n > 0) return n;
    }
    return AGENT_DEFAULTS.executionTimeout;
  }

  /** 为 Promise 包装超时，避免慢查询/锁等待卡死整个 Agent 循环 */
  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}执行超时（超过 ${Math.round(ms / 1000)} 秒）`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ============================================================
  //  Agent 主循环
  // ============================================================

  /**
   * 处理用户消息：启动/继续 Agent 循环
   * 这是一个迭代过程，每次调用 AI 后解析返回：
   * - 纯文本 → 返回 messages
   * - action + 自动执行 → 执行后继续循环
   * - action + 需审批 → 暂停返回 pending_approval
   * - finish → 返回 finished
   */
  async handleMessage(sessionId: string, userMessage: string): Promise<AgentResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { type: 'error', error: '会话不存在', status: 'error' };
    }

    if (!this.driver) {
      return { type: 'error', error: '数据库未连接', status: 'error' };
    }

    if (session.running) {
      return { type: 'error', error: 'Agent 正在执行中，请等待当前任务完成或点击停止', status: 'error' };
    }

    const now = Date.now();

    // 添加用户消息
    session.messages.push({ role: 'user', content: userMessage, timestamp: now });
    // 每条用户消息开启新的一轮：重置迭代计数与中止标志，
    // 避免历史轮次累计导致误触发最大迭代限制
    session.iteration = 0;
    session.cancelRequested = false;
    session.status = 'thinking';

    session.running = true;
    try {
      return await this.runAgentLoop(session);
    } finally {
      session.running = false;
    }
  }

  /**
   * 处理用户审批
   */
  async handleApproval(sessionId: string, actionId: string, approved: boolean): Promise<AgentResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { type: 'error', error: '会话不存在', status: 'error' };
    }

    if (!session.pendingAction || session.pendingAction.id !== actionId) {
      return { type: 'error', error: '无待审批的动作', status: 'error' };
    }

    const action = session.pendingAction;
    session.pendingAction = null;
    const now = Date.now();

    if (!approved) {
      // 用户拒绝
      action.status = 'rejected';
      const result: AgentActionResult = {
        success: false,
        error: '用户拒绝了此操作',
      };
      const toolResultMsg: AgentMessage = {
        role: 'tool_result',
        actionId: action.id,
        tool: action.tool,
        result,
        timestamp: now,
      };
      session.messages.push(toolResultMsg);

      // 将拒绝信息反馈给 AI，让它调整策略（传递累积消息）
      session.running = true;
      try {
        return await this.runAgentLoop(session, [toolResultMsg]);
      } finally {
        session.running = false;
      }
    }

    // 用户批准 — 先执行动作，再继续循环
    action.status = 'approved';
    session.running = true;
    try {
      return await this.executeApprovedActionAndContinue(session, action);
    } finally {
      session.running = false;
    }
  }

  /**
   * 执行已批准的动作并继续循环（非递归入口）
   */
  private async executeApprovedActionAndContinue(
    session: AgentSession,
    action: AgentAction
  ): Promise<AgentResponse> {
    const collectedMessages: AgentMessage[] = [];

    action.status = 'executing';
    const result = await this.executeTool(session, action);
    action.result = result;
    action.status = result.success ? 'done' : 'error';

    const now = Date.now();
    const toolResultMsg: AgentMessage = {
      role: 'tool_result',
      actionId: action.id,
      tool: action.tool,
      result,
      timestamp: now,
    };
    session.messages.push(toolResultMsg);
    collectedMessages.push(toolResultMsg);

    // 继续循环（传递累积消息）
    return this.runAgentLoop(session, collectedMessages);
  }

  /**
   * Agent 循环核心
   * @param accumulatedMessages 从上一轮累积的消息（跨迭代传递）
   */
  private async runAgentLoop(session: AgentSession, accumulatedMessages: AgentMessage[] = []): Promise<AgentResponse> {
    const maxIterations = await this.getMaxIterations();
    const newMessages = accumulatedMessages;
    // 记录进入本次调用时的迭代数，用于判断是否为多步任务的后续 AI 调用
    const startIteration = session.iteration;

    while (session.iteration < maxIterations) {
      // 用户请求中止
      if (session.cancelRequested) {
        session.cancelRequested = false;
        session.status = 'finished';
        const cancelMsg: AgentMessage = {
          role: 'assistant',
          content: '已停止执行。如需继续，请重新发送指令。',
          actions: [],
          timestamp: Date.now(),
        };
        session.messages.push(cancelMsg);
        newMessages.push(cancelMsg);
        return {
          type: 'finished',
          messages: newMessages,
          status: 'finished',
          iteration: session.iteration,
        };
      }

      session.iteration++;
      session.status = 'thinking';

      // 多步任务时在流式输出间插入分隔，避免前端把多轮 delta 拼成一段难以阅读
      if (session.iteration > startIteration + 1 && this.streamCallback) {
        this.streamCallback(session.id, '\n\n---\n\n');
      }

      try {
        // 构建 AI 请求
        const aiMessages = await this.buildAiMessages(session);

        const onToken = (delta: string) => {
          if (this.streamCallback) {
            this.streamCallback(session.id, delta);
          }
        };

        // 调用 AI（优先原生 Function Calling，不支持时降级文本协议，偶发失败自动重试一次）
        const aiResult = await this.callAi(session, aiMessages, onToken);

        // 解析动作：优先原生 tool_calls，回退到 action 代码块解析
        let parsedAction: ParsedAction | null = null;
        let displayText = aiResult.text;
        if (aiResult.toolCall) {
          parsedAction = this.parseToolCall(aiResult.toolCall.name, aiResult.toolCall.arguments);
        }
        if (!parsedAction) {
          const legacy = this.parseAction(aiResult.text);
          parsedAction = legacy.action;
          displayText = legacy.text;
        }

        const now = Date.now();

        if (parsedAction) {
          // AI 请求执行工具
          const action: AgentAction = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            tool: parsedAction.tool,
            reason: parsedAction.reason || '',
            sql: parsedAction.sql,
            tables: parsedAction.tables,
            category: parsedAction.sql ? classifySql(parsedAction.sql) : undefined,
            status: 'pending',
            timestamp: now,
          };

          // 记录 assistant 消息（含动作）
          const assistantMsg: AgentMessage = {
            role: 'assistant',
            content: displayText || (action.reason || ''),
            actions: [action],
            timestamp: now,
          };
          session.messages.push(assistantMsg);
          newMessages.push(assistantMsg);

          // finish 工具
          if (action.tool === 'finish') {
            action.status = 'done';
            session.status = 'finished';
            return {
              type: 'finished',
              messages: newMessages,
              status: 'finished',
              iteration: session.iteration,
            };
          }

          // 安全检查和权限控制
          const securityResult = this.checkSecurity(session, action);

          if (!securityResult.allowed) {
            // 不允许执行，将拒绝信息反馈给 AI
            const result: AgentActionResult = {
              success: false,
              error: securityResult.reason,
            };
            action.status = 'error';
            action.result = result;

            const toolResultMsg: AgentMessage = {
              role: 'tool_result',
              actionId: action.id,
              tool: action.tool,
              result,
              timestamp: Date.now(),
            };
            session.messages.push(toolResultMsg);
            newMessages.push(toolResultMsg);
            continue; // 继续循环让 AI 调整策略
          }

          if (securityResult.needsApproval) {
            // 审批前先预览 UPDATE/DELETE 的影响行数，帮助用户判断
            if ((action.category === 'UPDATE' || action.category === 'DELETE') && action.sql) {
              action.impactPreview = await this.previewImpact(action.sql);
            }
            // 需要用户审批，暂停循环
            session.pendingAction = action;
            session.status = 'awaiting_approval';
            return {
              type: 'pending_approval',
              action,
              messages: newMessages,
              status: 'awaiting_approval',
              iteration: session.iteration,
            };
          }

          // 自动执行 — 在 while 循环内直接执行，避免递归
          action.status = 'executing';
          const autoResult = await this.executeTool(session, action);
          action.result = autoResult;
          action.status = autoResult.success ? 'done' : 'error';

          const autoResultMsg: AgentMessage = {
            role: 'tool_result',
            actionId: action.id,
            tool: action.tool,
            result: autoResult,
            timestamp: Date.now(),
          };
          session.messages.push(autoResultMsg);
          newMessages.push(autoResultMsg);
          continue; // 继续循环，不递归

        } else {
          // 纯文本回复（无 action）
          const assistantMsg: AgentMessage = {
            role: 'assistant',
            content: displayText,
            actions: [],
            timestamp: now,
          };
          session.messages.push(assistantMsg);
          newMessages.push(assistantMsg);

          // AI 没有调用 finish 但返回了纯文本，视为结束
          session.status = 'finished';
          return {
            type: 'messages',
            messages: newMessages,
            status: 'finished',
            iteration: session.iteration,
          };
        }

      } catch (error: any) {
        session.status = 'error';
        return {
          type: 'error',
          error: error.message || 'Agent 执行出错',
          status: 'error',
        };
      }
    }

    // 达到最大迭代轮数
    session.status = 'max_iterations';
    return {
      type: 'max_iterations',
      messages: newMessages,
      status: 'max_iterations',
      iteration: session.iteration,
    };
  }

  // ============================================================
  //  安全检查
  // ============================================================

  private checkSecurity(
    session: AgentSession,
    action: AgentAction
  ): { allowed: boolean; needsApproval: boolean; reason?: string } {
    // execute_sql 需要安全检查
    if (action.tool === 'execute_sql' && action.sql) {
      // 多语句检测
      if (hasMultipleStatements(action.sql)) {
        return {
          allowed: false,
          needsApproval: false,
          reason: '安全限制：Agent 模式下禁止一次执行多条 SQL 语句，请拆分为多次执行。',
        };
      }

      // 限库连接包：禁止 Agent 访问白名单以外的数据库
      if (this.allowedDatabases) {
        const dbDenyReason = checkAllowedDatabaseSql(action.sql, this.allowedDatabases);
        if (dbDenyReason) {
          return { allowed: false, needsApproval: false, reason: dbDenyReason };
        }
      }

      const category = action.category || classifySql(action.sql);
      action.category = category;

      // 权限检查
      if (!isAllowed(category, session.permissionLevel)) {
        const reason =
          session.permissionLevel === 'readonly'
            ? `当前为只读模式，不允许执行 ${category} 操作。请告知用户切换到更高权限级别。`
            : `当前权限级别不允许执行 ${category} 操作。`;
        return { allowed: false, needsApproval: false, reason };
      }

      // 是否需要审批
      if (requiresApproval(category, session.permissionLevel)) {
        return { allowed: true, needsApproval: true };
      }

      return { allowed: true, needsApproval: false };
    }

    // 其他工具（list_tables, get_schema）是只读的，自动允许
    return { allowed: true, needsApproval: false };
  }

  // ============================================================
  //  AI 调用与动作解析
  // ============================================================

  /**
   * 调用 AI：优先原生 Function Calling；
   * 若端点不支持 tools 参数则本会话降级为 action 文本协议；
   * 偶发失败（限流/网络抖动）自动重试一次。
   */
  private async callAi(
    session: AgentSession,
    aiMessages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    onToken: (delta: string) => void
  ): Promise<{ text: string; toolCall: { name: string; arguments: string } | null }> {
    const invokeOnce = async (): Promise<{ text: string; toolCall: { name: string; arguments: string } | null }> => {
      if (!session.nativeToolsDisabled) {
        try {
          const r = await aiService.chatStreamWithTools(aiMessages, AGENT_TOOL_DEFINITIONS, onToken);
          return { text: r.content, toolCall: r.toolCalls[0] || null };
        } catch (e: any) {
          // 仅当错误信息明确指向 tools/function 不支持时才降级；网络/限流错误照旧抛出重试
          const msg = String(e?.message || '').toLowerCase();
          const networkLike = /timeout|network|fetch|socket|econn|etimedout|failed to fetch/.test(msg);
          if (/tool|function/.test(msg) && !networkLike) {
            session.nativeToolsDisabled = true;
          } else {
            throw e;
          }
        }
      }
      const text = await aiService.chatStream(aiMessages, onToken);
      return { text, toolCall: null };
    };

    try {
      return await invokeOnce();
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
      return await invokeOnce();
    }
  }

  /** 解析原生 tool_calls 的参数为内部动作结构 */
  private parseToolCall(name: string, argsStr: string): ParsedAction | null {
    const validTools: AgentToolName[] = ['list_tables', 'get_schema', 'execute_sql', 'finish'];
    if (!validTools.includes(name as AgentToolName)) return null;

    let args: any = {};
    try {
      args = argsStr && argsStr.trim() ? JSON.parse(argsStr) : {};
    } catch {
      // 参数 JSON 解析失败时容错提取主要字段
      const extract = (field: string): string | null => {
        const re = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`);
        const m = (argsStr || '').match(re);
        return m ? m[1] : null;
      };
      args = { reason: extract('reason'), sql: extract('sql') };
    }

    return {
      tool: name as AgentToolName,
      reason: typeof args.reason === 'string' ? args.reason : (typeof args.summary === 'string' ? args.summary : ''),
      sql: typeof args.sql === 'string' ? args.sql : undefined,
      tables: Array.isArray(args.tables) ? args.tables.map((t: any) => String(t)).filter(Boolean) : undefined,
    };
  }

  /** 审批前预览 UPDATE/DELETE 的影响行数（失败不阻塞审批流程） */
  private async previewImpact(sql: string): Promise<{ affectedRows: number | null; error?: string }> {
    if (!this.driver) return { affectedRows: null };
    const previewSql = buildImpactPreviewSql(sql);
    if (!previewSql) return { affectedRows: null };
    try {
      const timeout = await this.getExecutionTimeout();
      const result = await this.withTimeout(this.driver.executeQuery(previewSql), timeout, '影响面预览');
      const row = result.data?.[0];
      const raw = row ? Object.values(row)[0] : null;
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      return Number.isFinite(n) ? { affectedRows: n } : { affectedRows: null };
    } catch (e: any) {
      return { affectedRows: null, error: e.message };
    }
  }

  // ============================================================
  //  工具执行
  // ============================================================

  private async executeTool(session: AgentSession, action: AgentAction): Promise<AgentActionResult> {
    if (!this.driver) {
      return { success: false, error: '数据库未连接' };
    }

    // 校验会话绑定的连接仍是当前活跃连接，防止切换连接后 SQL 打到错误的库
    if (this.driverConnectionId !== undefined && session.connectionId !== this.driverConnectionId) {
      return { success: false, error: '数据库连接已切换，当前 Agent 会话已失效，请新建会话' };
    }

    const startTime = Date.now();

    try {
      switch (action.tool) {
        case 'list_tables':
          return await this.executeListTables(session);

        case 'get_schema':
          return await this.executeGetSchema(session, action);

        case 'execute_sql':
          return await this.executeSql(session, action);

        default:
          return { success: false, error: `未知工具: ${action.tool}` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || '工具执行异常',
        executionTime: Date.now() - startTime,
      };
    }
  }

  /** 执行 list_tables 工具 */
  private async executeListTables(session: AgentSession): Promise<AgentActionResult> {
    try {
      const tables = await this.driver!.getTables();
      return {
        success: true,
        columns: ['name'],
        data: tables,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** 执行 get_schema 工具 */
  private async executeGetSchema(session: AgentSession, action: AgentAction): Promise<AgentActionResult> {
    try {
      const tables = action.tables && action.tables.length > 0
        ? action.tables
        : (await this.driver!.getTables()).map((t: any) => t.name);

      const schemaPromises = tables.map(async (tableName: string) => {
        const columns = await this.driver!.getTableColumns(tableName);
        return { tableName, columns };
      });

      const schemas = await Promise.all(schemaPromises);

      // 将结构展平为行数据
      const data: any[] = [];
      for (const s of schemas) {
        for (const col of s.columns) {
          data.push({
            table: s.tableName,
            name: col.name,
            type: col.type,
            nullable: col.nullable,
            primaryKey: col.primaryKey,
            defaultValue: col.defaultValue,
            comment: col.comment,
          });
        }
      }

      return {
        success: true,
        columns: ['table', 'name', 'type', 'nullable', 'primaryKey', 'defaultValue', 'comment'],
        data,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** 执行 execute_sql 工具 */
  private async executeSql(session: AgentSession, action: AgentAction): Promise<AgentActionResult> {
    if (!action.sql) {
      return { success: false, error: '未提供 SQL 语句' };
    }

    const startTime = Date.now();
    let sql = action.sql.trim();

    try {
      // SELECT 自动加行数限制（按数据库方言）
      const selectLimit = action.category === 'SELECT' ? await this.getSelectLimit() : 0;
      if (action.category === 'SELECT') {
        sql = ensureSelectLimit(sql, selectLimit, session.dbType).sql;
      }

      // 超时保护，避免慢查询/锁等待卡死整个 Agent 循环
      const executionTimeout = await this.getExecutionTimeout();
      const result = await this.withTimeout(
        this.driver!.executeQuery(sql),
        executionTimeout,
        'SQL'
      );
      const executionTime = Date.now() - startTime;

      // DDL 执行成功后失效表名缓存，保证后续 system prompt 中的表列表是最新的
      if (action.category === 'DDL') {
        session.cachedTableNames = null;
      }

      // 对 SELECT 结果进行截断（作为驱动未遵守 LIMIT 时的安全网）
      if (action.category === 'SELECT' && result.data && result.data.length > selectLimit) {
        return {
          success: true,
          columns: result.columns,
          data: result.data.slice(0, selectLimit),
          truncated: true,
          executionTime,
        };
      }

      return {
        success: true,
        columns: result.columns,
        data: result.data,
        affectedRows: result.affectedRows,
        executionTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  // ============================================================
  //  AI 消息构建
  // ============================================================

  private async buildAiMessages(session: AgentSession): Promise<{ role: 'system' | 'user' | 'assistant'; content: string }[]> {
    // 构建初始的 schema 信息
    let schemaInfo = '（未获取到数据库结构，请先调用 get_schema 工具获取）';
    try {
      // 使用缓存避免每次迭代都查询数据库
      if (!session.cachedTableNames) {
        const tables = await this.driver!.getTables();
        session.cachedTableNames = tables.map((t: any) => t.name);
      }
      if (session.cachedTableNames.length > 0) {
        const tableNames = session.cachedTableNames.join(', ');
        schemaInfo = `数据库中的表：${tableNames}\n（如需查看具体表结构，请调用 get_schema 工具）`;
      }
    } catch {
      // 忽略错误，使用默认提示
    }

    const systemPrompt = buildAgentSystemPrompt({
      dbType: session.dbType,
      dbName: session.dbName,
      schemaInfo,
      permissionLevel: session.permissionLevel,
      useNativeTools: !session.nativeToolsDisabled,
    });

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // 将历史消息转换为 AI 消息格式
    for (const msg of session.messages) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        // 重建 assistant 消息，包含原始文本和 action 块
        let content = msg.content || '';
        if (msg.actions && msg.actions.length > 0) {
          for (const action of msg.actions) {
            const actionObj: Record<string, unknown> = { tool: action.tool };
            if (action.reason) actionObj.reason = action.reason;
            if (action.sql) actionObj.sql = action.sql;
            if (action.tables && action.tables.length > 0) actionObj.tables = action.tables;
            content += `\n\`\`\`action\n${JSON.stringify(actionObj, null, 2)}\n\`\`\``;
          }
        }
        messages.push({ role: 'assistant', content });
      } else if (msg.role === 'tool_result') {
        // 将工具结果格式化为 AI 可理解的内容（限长避免 token 爆炸）
        let resultText = formatToolResult(msg.tool, msg.result);
        if (resultText.length > 3000) {
          resultText = resultText.slice(0, 3000) + '\n（内容过长已截断）';
        }
        const statusHint = msg.result?.success
          ? '操作已成功执行。请根据结果判断任务是否完成：若完成请调用 finish 工具总结；若还需继续执行其他操作，请直接调用相应工具。'
          : '操作执行失败。请根据错误信息调整策略，重新调用工具或调用 finish 结束任务。';
        messages.push({
          role: 'user',
          content: `[工具执行结果 - ${msg.tool}]\n${resultText}\n\n${statusHint}`,
        });
      }
    }

    // 上下文裁剪：历史过长时仅保留最近的消息，控制 token 成本
    const MAX_AI_MESSAGES = 60;
    const historyCount = messages.length - 1; // 不含 system
    if (historyCount > MAX_AI_MESSAGES) {
      const kept = messages.slice(messages.length - MAX_AI_MESSAGES);
      return [
        messages[0],
        { role: 'user', content: '（更早的对话历史已省略，请基于最近的上下文继续任务）' },
        ...kept,
      ];
    }

    return messages;
  }

  // ============================================================
  //  Action 解析
  // ============================================================

  /**
   * 从 AI 回复中解析 action 块
   * AI 可以在回复中包含 ```action ... ``` 代码块
   */
  private parseAction(response: string): { text: string; action: ParsedAction | null } {
    // 尝试匹配 ```action ... ``` 代码块
    const actionMatch = response.match(/```action\s*\n([\s\S]*?)\n```/);

    if (!actionMatch) {
      return { text: response, action: null };
    }

    const actionJsonStr = actionMatch[1].trim();
    let action: ParsedAction | null = null;

    try {
      action = JSON.parse(actionJsonStr);
    } catch {
      // JSON 解析失败，尝试容错提取
      // 使用边界感知的正则：字段值以 " 后跟 , 或 } 结束，避免 SQL 中含双引号时截断
      const extractField = (json: string, field: string): string | null => {
        const re = new RegExp(`"${field}"\\s*:\\s*"([\\s\\S]*?)"\\s*[,}]`);
        const m = json.match(re);
        return m ? m[1] : null;
      };

      const toolMatch = actionJsonStr.match(/"tool"\s*:\s*"([^"]+)"/);
      const reasonMatch = extractField(actionJsonStr, 'reason');
      const sqlMatch = extractField(actionJsonStr, 'sql');
      const tablesMatch = actionJsonStr.match(/"tables"\s*:\s*\[([\s\S]*?)\]/);

      if (toolMatch) {
        action = {
          tool: toolMatch[1] as AgentToolName,
          reason: reasonMatch || '',
          sql: sqlMatch || undefined,
          tables: tablesMatch?.[1]
            ? tablesMatch[1].split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean)
            : undefined,
        };
      }
    }

    // 提取 action 块之外的文本
    const text = response.replace(/```action\s*\n[\s\S]*?\n```/, '').trim();

    return { text: text || (action?.reason || ''), action };
  }
}

interface ParsedAction {
  tool: AgentToolName;
  reason?: string;
  sql?: string;
  tables?: string[];
}

/**
 * 持久化前瘦身：截断工具结果中的完整查询数据，
 * 避免大会话把内部库撑到 MB 级（保留前 20 行供历史回显）
 */
export function sanitizeAgentMessagesForStorage(messagesJson: string): string {
  try {
    const messages = JSON.parse(messagesJson);
    if (!Array.isArray(messages)) return messagesJson;
    const MAX_ROWS = 20;
    const slim = (result: any) => {
      if (result?.data && Array.isArray(result.data) && result.data.length > MAX_ROWS) {
        result.data = result.data.slice(0, MAX_ROWS);
        result.truncated = true;
      }
    };
    for (const msg of messages) {
      if (!msg) continue;
      if (msg.role === 'tool_result') slim(msg.result);
      if (msg.role === 'assistant' && Array.isArray(msg.actions)) {
        for (const a of msg.actions) slim(a?.result);
      }
    }
    return JSON.stringify(messages);
  } catch {
    return messagesJson;
  }
}

export const agentService = new AgentService();
