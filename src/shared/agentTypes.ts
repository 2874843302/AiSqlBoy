/**
 * Agent 模式共享类型定义
 * 主进程与渲染进程共用
 */

/** Agent 权限级别 */
export type AgentPermissionLevel = 'readonly' | 'write-confirm' | 'full-control';

/** SQL 操作分类 */
export type SqlCategory =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'DDL'
  | 'DANGEROUS';

/** Agent 可调用的工具名称 */
export type AgentToolName =
  | 'list_tables'
  | 'get_schema'
  | 'execute_sql'
  | 'finish';

/** Agent 会话状态 */
export type AgentSessionStatus =
  | 'idle'
  | 'thinking'
  | 'awaiting_approval'
  | 'finished'
  | 'error'
  | 'max_iterations';

/** Agent 动作（从 AI 回复中解析出的工具调用请求） */
export interface AgentAction {
  id: string;
  tool: AgentToolName;
  reason: string;
  sql?: string;
  tables?: string[];
  /** SQL 安全分类（仅 execute_sql） */
  category?: SqlCategory;
  /** 动作状态 */
  status: 'pending' | 'auto-executed' | 'approved' | 'rejected' | 'executing' | 'done' | 'error';
  /** 执行结果 */
  result?: AgentActionResult;
  /** 时间戳 */
  timestamp: number;
}

/** 动作执行结果 */
export interface AgentActionResult {
  success: boolean;
  columns?: string[];
  data?: any[];
  affectedRows?: number;
  error?: string;
  truncated?: boolean;
  /** 执行耗时 ms */
  executionTime?: number;
}

/** Agent 对话消息 */
export type AgentMessage =
  | {
      role: 'user';
      content: string;
      timestamp: number;
    }
  | {
      role: 'assistant';
      content: string;
      /** 本次回复关联的动作 */
      actions?: AgentAction[];
      timestamp: number;
    }
  | {
      role: 'tool_result';
      actionId: string;
      tool: AgentToolName;
      result: AgentActionResult;
      timestamp: number;
    };

/** Agent 会话 */
export interface AgentSession {
  id: string;
  connectionId: number;
  dbType: string;
  dbName: string;
  permissionLevel: AgentPermissionLevel;
  messages: AgentMessage[];
  pendingAction: AgentAction | null;
  iteration: number;
  status: AgentSessionStatus;
  createdAt: number;
  /** 缓存的表名列表，避免每次迭代都查询数据库 */
  cachedTableNames: string[] | null;
}

/**
 * 主进程返回给渲染进程的 Agent 响应。
 * 由于 IPC 是请求-响应模式，而 Agent 循环是多步的，
 * 每次 IPC 调用返回一个 "步骤结果"。
 */
export type AgentResponse =
  | {
      type: 'messages';
      /** 本次步骤新增的消息（含可能已自动执行的动作） */
      messages: AgentMessage[];
      status: AgentSessionStatus;
      iteration: number;
    }
  | {
      type: 'pending_approval';
      action: AgentAction;
      messages: AgentMessage[];
      status: 'awaiting_approval';
      iteration: number;
    }
  | {
      type: 'finished';
      messages: AgentMessage[];
      status: 'finished';
      iteration: number;
    }
  | {
      type: 'max_iterations';
      messages: AgentMessage[];
      status: 'max_iterations';
      iteration: number;
    }
  | {
      type: 'error';
      error: string;
      status: 'error';
    };

/** IPC 请求参数 */
export interface AgentChatRequest {
  sessionId: string;
  message: string;
}

export interface AgentApprovalRequest {
  sessionId: string;
  actionId: string;
  approved: boolean;
}

export interface AgentCreateSessionRequest {
  connectionId: number;
  dbType: string;
  dbName: string;
  permissionLevel: AgentPermissionLevel;
}

/** Agent 设置 key */
export const AGENT_SETTING_KEYS = {
  permissionLevel: 'agent_permission_level',
  maxIterations: 'agent_max_iterations',
  selectLimit: 'agent_select_limit',
} as const;

/** Agent 默认配置 */
export const AGENT_DEFAULTS = {
  maxIterations: 50,
  selectLimit: 200,
  executionTimeout: 30000,
} as const;
