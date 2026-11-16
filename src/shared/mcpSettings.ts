/**
 * MCP 相关设置项
 * 主进程（读取以决定注册哪些工具）与渲染进程（设置页开关）共用
 */

export const MCP_SETTING_KEYS = {
  /** 'true' 时启动本地 MCP 服务 */
  enabled: 'mcp_enabled',
  /** 'true' 时额外注册写操作工具 execute_sql */
  allowWrite: 'mcp_allow_write',
  /** 单次查询返回行数上限，默认 200 */
  maxRows: 'mcp_max_rows',
} as const;

export const MCP_DEFAULTS = {
  maxRows: 200,
  maxRowsLimit: 1000,
  executionTimeout: 30000,
} as const;

/** 客户端配置片段里使用的包名 */
export const MCP_SERVER_PACKAGE = 'aisqlboy-mcp';
