export const DB_TYPES = {
  mysql: [
    'INT',
    'BIGINT',
    'VARCHAR(255)',
    'TEXT',
    'DATETIME',
    'TIMESTAMP',
    'DECIMAL(10,2)',
    'TINYINT',
    'JSON',
    'BLOB'
  ],
  postgresql: [
    'INTEGER',
    'BIGINT',
    'VARCHAR(255)',
    'TEXT',
    'TIMESTAMP',
    'BOOLEAN',
    'NUMERIC',
    'JSONB',
    'UUID',
    'BYTEA'
  ],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC']
} as const;
