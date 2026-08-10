import React from 'react';

export const isJsonLike = (val: any) => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'object') return true;
  if (typeof val !== 'string') return false;
  if (!val.trim().startsWith('{') && !val.trim().startsWith('[')) return false;
  try {
    const result = JSON.parse(val);
    return (typeof result === 'object' && result !== null) || Array.isArray(result);
  } catch (e) {
    return false;
  }
};

export const escapeRegExp = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const formatJson = (val: any) => {
  try {
    if (typeof val === 'string') {
      return JSON.stringify(JSON.parse(val), null, 2);
    }
    return JSON.stringify(val, null, 2);
  } catch (e) {
    return String(val);
  }
};

/**
 * 将 JSON 字符串按语法着色为 JSX 元素。
 * 支持高亮：key、string、number、boolean、null、punctuation
 */
export const renderJsonSyntax = (jsonStr: string): React.ReactNode => {
  // 正则匹配 JSON 的各个 token
  // 顺序很重要：先匹配 string（含 key），再 number、boolean、null
  const tokenRegex = /("(?:[^"\\]|\\.)*"\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b|\b(true|false)\b|\b(null)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = tokenRegex.exec(jsonStr)) !== null) {
    // 前面的普通文本（标点、空白）
    if (match.index > lastIndex) {
      parts.push(jsonStr.slice(lastIndex, match.index));
    }

    const [full, keyPart, strPart, numPart, boolPart, nullPart] = match;

    if (keyPart) {
      // key: "keyName":
      parts.push(
        <span key={`k-${keyCounter++}`} className="json-key">{keyPart}</span>
      );
    } else if (strPart) {
      parts.push(
        <span key={`s-${keyCounter++}`} className="json-string">{strPart}</span>
      );
    } else if (numPart) {
      parts.push(
        <span key={`n-${keyCounter++}`} className="json-number">{numPart}</span>
      );
    } else if (boolPart) {
      parts.push(
        <span key={`b-${keyCounter++}`} className="json-boolean">{boolPart}</span>
      );
    } else if (nullPart) {
      parts.push(
        <span key={`nl-${keyCounter++}`} className="json-null">{nullPart}</span>
      );
    }

    lastIndex = match.index + full.length;
  }

  // 尾部普通文本
  if (lastIndex < jsonStr.length) {
    parts.push(jsonStr.slice(lastIndex));
  }

  return parts;
};
