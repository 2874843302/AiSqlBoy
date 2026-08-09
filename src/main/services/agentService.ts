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
import { classifySql, hasMultipleStatements, ensureSelectLimit, isAllowed, requiresApproval } from './sqlSecurity';
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

// ============================================================
//  会话管理
// ============================================================

class AgentService {
  private sessions = new Map<string, AgentSession>();
  /** 当前活跃的数据库驱动（与 App 的 currentDriver 共享引用） */
  private driver: IDatabaseDriver | null = null;
  /** 流式 token 回调（由主进程 IPC 设置，用于向前端推送增量文本） */
  private streamCallback: ((sessionId: string, delta: string) => void) | null = null;

  /** 设置流式 token 回调 */
  setStreamCallback(cb: ((sessionId: string, delta: string) => void) | null): void {
    this.streamCallback = cb;
  }

  /** 设置当前数据库驱动（由主进程 index.ts 在连接数据库时调用） */
  setDriver(driver: IDatabaseDriver | null): void {
    this.driver = driver;
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

    const now = Date.now();

    // 添加用户消息
    session.messages.push({ role: 'user', content: userMessage, timestamp: now });
    session.status = 'thinking';

    return this.runAgentLoop(session);
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
      return this.runAgentLoop(session, [toolResultMsg]);
    }

    // 用户批准 — 先执行动作，再继续循环
    action.status = 'approved';
    return this.executeApprovedActionAndContinue(session, action);
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

    while (session.iteration < maxIterations) {
      session.iteration++;
      session.status = 'thinking';

      try {
        // 构建 AI 请求
        const aiMessages = await this.buildAiMessages(session);

        // 调用 AI（流式）
        const aiResponse = await aiService.chatStream(
          aiMessages,
          (delta: string) => {
            if (this.streamCallback) {
              this.streamCallback(session.id, delta);
            }
          }
        );

        // 解析 AI 回复中的 action
        const parsed = this.parseAction(aiResponse);

        const now = Date.now();

        if (parsed.action) {
          // AI 请求执行工具
          const action: AgentAction = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            tool: parsed.action.tool,
            reason: parsed.action.reason || '',
            sql: parsed.action.sql,
            tables: parsed.action.tables,
            category: parsed.action.sql ? classifySql(parsed.action.sql) : undefined,
            status: 'pending',
            timestamp: now,
          };

          // 记录 assistant 消息（含动作）
          const assistantMsg: AgentMessage = {
            role: 'assistant',
            content: parsed.text || (action.reason || ''),
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
            content: parsed.text,
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
  //  工具执行
  // ============================================================

  private async executeTool(session: AgentSession, action: AgentAction): Promise<AgentActionResult> {
    if (!this.driver) {
      return { success: false, error: '数据库未连接' };
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
      // SELECT 自动加 LIMIT
      if (action.category === 'SELECT') {
        const selectLimit = await this.getSelectLimit();
        const ensured = ensureSelectLimit(sql, selectLimit);
        sql = ensured.sql;
        if (ensured.modified) {
          // 告知 AI 加了 LIMIT
        }
      }

      const result = await this.driver!.executeQuery(sql);
      const executionTime = Date.now() - startTime;

      // 对 SELECT 结果进行截断
      if (action.category === 'SELECT' && result.data) {
        const selectLimit = await this.getSelectLimit();
        const truncated = result.data.length > selectLimit;
        if (truncated) {
          result.data = result.data.slice(0, selectLimit);
        }
        return {
          success: true,
          columns: result.columns,
          data: result.data,
          truncated,
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
            const actionObj: Record<string, string> = { tool: action.tool };
            if (action.reason) actionObj.reason = action.reason;
            if (action.sql) actionObj.sql = action.sql;
            if (action.tables && action.tables.length > 0) actionObj.tables = JSON.stringify(action.tables);
            content += `\n\`\`\`action\n${JSON.stringify(actionObj, null, 2)}\n\`\`\``;
          }
        }
        messages.push({ role: 'assistant', content });
      } else if (msg.role === 'tool_result') {
        // 将工具结果格式化为 AI 可理解的内容
        const resultText = formatToolResult(msg.tool, msg.result);
        const statusHint = msg.result?.success
          ? '操作已成功执行。请根据结果判断任务是否完成：若完成请调用 finish 工具总结；若还需继续执行其他操作，请直接调用相应工具。'
          : '操作执行失败。请根据错误信息调整策略，重新调用工具或调用 finish 结束任务。';
        messages.push({
          role: 'user',
          content: `[工具执行结果 - ${msg.tool}]\n${resultText}\n\n${statusHint}`,
        });
      }
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

export const agentService = new AgentService();
