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
  oracle: [
    'NUMBER',
    'NUMBER(19)',
    'VARCHAR2(255)',
    'NVARCHAR2(255)',
    'CLOB',
    'DATE',
    'TIMESTAMP',
    'FLOAT',
    'BLOB',
    'RAW(16)'
  ],
  sqlite: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC']
} as const;
