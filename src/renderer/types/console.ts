import type { QueryResultSet } from '../../shared/types';

export interface ConsoleTab {
  id: string;
  connectionId?: number;
  name: string;
  sql: string;
  results?: any[];
  columns?: string[];
  /** 多语句执行时每条语句的结果；单条执行时为长度 1 的数组 */
  resultSets?: QueryResultSet[];
  /** 当前展示的结果集下标 */
  activeResultIndex?: number;
  executing: boolean;
  error?: string;
  dbName?: string;
  tableName?: string;
  isDirty?: boolean;
  savedSql?: string;
  currentPage?: number;
  pageSize?: number;
  executionTime?: number;
  hasMore?: boolean;
  isAutoLimited?: boolean;
  totalCount?: number;
}
