// 辅助函数：判断是否为时间类型并返回 input 类型
export const getTimeInputType = (type: string): 'datetime-local' | 'date' | 'time' | null => {
  if (!type) return null;
  const t = type.toUpperCase();
  if (t.includes('DATETIME') || t.includes('TIMESTAMP')) return 'datetime-local';
  if (t.includes('DATE')) return 'date';
  if (t.includes('TIME')) return 'time';
  return null;
};

/** 判断列类型是否为布尔类型 */
export const isBooleanType = (type: string): boolean => {
  if (!type) return false;
  const t = type.toUpperCase();
  // MySQL: tinyint(1), boolean; PostgreSQL: boolean, bool; SQL Server: bit; Oracle: number(1) 也常作布尔
  return t.includes('BOOL') || t === 'TINYINT(1)' || t === 'BIT';
};

// 辅助函数：格式化时间值为 input 要求的格式
export const formatTimeForInput = (value: any, inputType: string) => {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value.toString();

    const pad = (n: number) => n.toString().padStart(2, '0');
    if (inputType === 'datetime-local') {
      // YYYY-MM-DDTHH:mm
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } else if (inputType === 'date') {
      // YYYY-MM-DD
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    } else if (inputType === 'time') {
      // HH:mm
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
  } catch (e) {
    return value.toString();
  }
  return value.toString();
};

export const formatDateForDisplay = (date: Date, colType?: string) => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const t = (colType || '').toUpperCase();

  if (t.includes('DATE') && !t.includes('DATETIME') && !t.includes('TIMESTAMP')) {
    return `${yyyy}-${mm}-${dd}`;
  }
  if (t.includes('TIME') && !t.includes('DATETIME') && !t.includes('TIMESTAMP')) {
    return `${hh}:${mi}:${ss}`;
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

export const sanitizeDisplayText = (val: any, colType?: string) => {
  if (val === null) return 'NULL';
  if (val === undefined) return '';
  let text = '';
  if (val instanceof Date) {
    text = formatDateForDisplay(val, colType);
  } else if (typeof val === 'string') {
    text = val;
  } else if (typeof val === 'object') {
    try {
      text = JSON.stringify(val);
    } catch {
      text = String(val);
    }
  } else {
    text = String(val);
  }
  // 过滤不可见控制字符，避免出现类似 " 0" 的异常显示
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
};

export const formatRedisValue = (val: any) => {
  if (val === null || val === undefined) return '""';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '\\"')}"`;
};
