import { useState } from 'react';
import type { RefObject, Dispatch, SetStateAction } from 'react';
import type { ConsoleTab } from '../types/console';

type UseSqlSelectionAIArgs = {
  activeConnectionType?: string;
  activeConsoleId: string | null;
  consoles: ConsoleTab[];
  setConsoles: Dispatch<SetStateAction<ConsoleTab[]>>;
  showAISelectionInput: boolean;
  setShowAISelectionInput: Dispatch<SetStateAction<boolean>>;
  setToast: Dispatch<SetStateAction<{ message: string; type: 'error' | 'success' | 'info' } | null>>;
  aiPopupRef: RefObject<HTMLDivElement | null>;
};

export const useSqlSelectionAI = ({
  activeConnectionType,
  activeConsoleId,
  consoles,
  setConsoles,
  showAISelectionInput,
  setShowAISelectionInput,
  setToast
}: UseSqlSelectionAIArgs) => {
  const [selectedSql, setSelectedSql] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [aiSelectionPrompt, setAISelectionPrompt] = useState('');
  const [aiSelectionLoading, setAISelectionLoading] = useState(false);
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);

  const handleSelection = () => {
    setTimeout(() => {
      const textarea = document.querySelector('.sql-editor-container textarea') as HTMLTextAreaElement | null;
      if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
        const selected = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
        setSelectedSql(selected);
        setSelectionRange({ start: textarea.selectionStart, end: textarea.selectionEnd });

        const div = document.createElement('div');
        const style = window.getComputedStyle(textarea);
        const properties = [
          'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
          'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
          'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
          'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
          'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
          'textDecoration', 'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordBreak',
          'wordWrap'
        ];
        properties.forEach((prop) => {
          // @ts-ignore
          div.style[prop] = style[prop];
        });

        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.wordWrap = 'break-word';
        div.style.top = '0';
        div.style.left = '0';

        const textBefore = textarea.value.substring(0, textarea.selectionStart);
        const span = document.createElement('span');
        span.textContent = textBefore;
        div.appendChild(span);

        const marker = document.createElement('span');
        marker.textContent = '|';
        div.appendChild(marker);

        document.body.appendChild(div);
        const markerRect = marker.getBoundingClientRect();
        const divRect = div.getBoundingClientRect();
        setSelectionPosition({
          x: markerRect.left - divRect.left + textarea.offsetLeft - textarea.scrollLeft,
          y: markerRect.top - divRect.top + textarea.offsetTop - textarea.scrollTop
        });
        document.body.removeChild(div);
      } else if (!showAISelectionInput) {
        setSelectedSql('');
        setSelectionRange(null);
        setSelectionPosition(null);
      }
    }, 0);
  };

  const handleAISelectionSubmit = async () => {
    if (!aiSelectionPrompt.trim() || aiSelectionLoading || !selectedSql) return;

    setAISelectionLoading(true);
    try {
      const activeConsole = consoles.find((c) => c.id === activeConsoleId);

      let schemaContext = '';
      try {
        if (activeConsole?.tableName) {
          const cols = await window.electronAPI.getTableColumns(activeConsole.tableName);
          schemaContext = `当前表: ${activeConsole.tableName}\n结构:\n${cols.map((c) => `${c.name} (${c.type})`).join(', ')}`;
        } else {
          const tableList = await window.electronAPI.getTables();
          const schemaPromises = tableList.map(async (t) => {
            const cols = await window.electronAPI.getTableColumns(t.name);
            return `${t.name} (${cols.map((c) => `${c.name} ${c.type}`).join(', ')})`;
          });
          const schemas = await Promise.all(schemaPromises);
          schemaContext = schemas.length > 0 ? `当前数据库完整结构:\n${schemas.join('\n')}` : '（未获取到数据库结构）';
        }
      } catch (err) {
        console.error('Failed to fetch schema for AI:', err);
      }

      const prompt = `
你是一个 SQL 专家。
当前数据库类型: ${activeConnectionType || '未知'}
${schemaContext}

**严格指令：**
1. **禁止幻想**：你必须严格使用上方提供的真实数据库结构。严禁使用任何不存在的表名或字段名。
2. **准确修改**：如果用户的指令是修改 SQL，请结合提供的结构信息，确保修改后的 SQL 字段名和表名完全匹配真实数据库。
3. **拒绝猜测**：如果指令涉及到的信息在提供的结构中不存在，请告知用户你无法根据当前结构完成该操作，而不是自行假设。

当前选中的 SQL 代码如下：
\`\`\`sql
${selectedSql}
\`\`\`

用户的指令是：${aiSelectionPrompt}

请只返回修改后的 SQL 代码块（包裹在 \`\`\`sql ... \`\`\` 中），或者针对结构给出专业的建议。
`;

      const result = await window.electronAPI.aiChat([{ role: 'user', content: prompt }]);
      if (result.success && result.response) {
        const sqlMatch = result.response.match(/```sql\n([\s\S]*?)\n```/) || result.response.match(/```([\s\S]*?)\n```/);
        if (sqlMatch) {
          const newSql = sqlMatch[1];
          if (selectionRange && activeConsoleId) {
            setConsoles((prev) =>
              prev.map((c) => {
                if (c.id !== activeConsoleId) return c;
                const fullSql = c.sql;
                const updatedSql = fullSql.substring(0, selectionRange.start) + newSql + fullSql.substring(selectionRange.end);
                return { ...c, sql: updatedSql };
              })
            );
          }
          setShowAISelectionInput(false);
          setAISelectionPrompt('');
          setSelectedSql('');
          setSelectionRange(null);
        } else {
          setToast({ message: result.response, type: 'info' });
          setShowAISelectionInput(false);
        }
      } else {
        setToast({ message: result.error || 'AI 响应失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setAISelectionLoading(false);
    }
  };

  const closeSelectionInput = () => {
    setShowAISelectionInput(false);
  };

  const resetSelectionState = () => {
    setSelectedSql('');
    setSelectionRange(null);
    setSelectionPosition(null);
    setShowAISelectionInput(false);
  };

  return {
    selectedSql,
    showAISelectionInput,
    aiSelectionPrompt,
    setAISelectionPrompt,
    aiSelectionLoading,
    selectionPosition,
    handleSelection,
    handleAISelectionSubmit,
    closeSelectionInput,
    resetSelectionState
  };
};
