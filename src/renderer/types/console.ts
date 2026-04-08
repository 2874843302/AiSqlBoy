export interface ConsoleTab {
  id: string;
  connectionId?: number;
  name: string;
  sql: string;
  results?: any[];
  columns?: string[];
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
