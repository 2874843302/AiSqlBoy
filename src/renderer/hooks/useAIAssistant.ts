import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ConsoleTab } from '../types/console';

type AIMessage = { role: 'user' | 'assistant'; content: string };
type AIContext = { type: 'database' | 'table'; name: string } | null;

type UseAIAssistantArgs = {
  activeConnection: { id?: number; type?: string } | null;
  selectedDatabase: string | null;
  activeConsoleId: string | null;
  consoles: ConsoleTab[];
  setConsoles: Dispatch<SetStateAction<ConsoleTab[]>>;
  setActiveConsoleId: Dispatch<SetStateAction<string | null>>;
  setContextMenu: Dispatch<SetStateAction<{ x: number; y: number; type: 'table' | 'database' | 'row' | 'console'; target: string } | null>>;
  setToast: Dispatch<SetStateAction<{ message: string; type: 'error' | 'success' | 'info' } | null>>;
};

export const useAIAssistant = ({
  activeConnection,
  selectedDatabase,
  activeConsoleId,
  consoles,
  setConsoles,
  setActiveConsoleId,
  setContextMenu,
  setToast
}: UseAIAssistantArgs) => {
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiLoading, setAILoading] = useState(false);
  const [aiPrompt, setAIPrompt] = useState('');
  const [aiMessages, setAIMessages] = useState<AIMessage[]>([]);
  const [aiContext, setAIContext] = useState<AIContext>(null);

  const handleOpenAIModal = async (type: 'database' | 'table', name: string) => {
    if (aiContext?.type !== type || aiContext?.name !== name) {
      setAIMessages([]);
      setAIContext({ type, name });
    }
    setAIPrompt('');
    setShowAIModal(true);
    setContextMenu(null);
  };

  const handleAIChat = async () => {
    if (!aiPrompt.trim() || aiLoading) return;

    const userMsg = aiPrompt;
    setAIPrompt('');
    setAIMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setAILoading(true);

    try {
      let schemaInfo = '';
      if (aiContext?.type === 'table') {
        const cols = await window.electronAPI.getTableColumns(aiContext.name);
        schemaInfo = `当前表: ${aiContext.name}\n结构:\n${cols.map((c) => `${c.name} (${c.type})`).join(', ')}`;
      } else if (aiContext?.type === 'database') {
        const tableList = await window.electronAPI.getTables();
        const schemaPromises = tableList.map(async (t) => {
          const cols = await window.electronAPI.getTableColumns(t.name);
          return `${t.name} (${cols.map((c) => `${c.name} ${c.type}`).join(', ')})`;
        });
        const schemas = await Promise.all(schemaPromises);
        schemaInfo = `当前数据库: ${aiContext.name}\n完整结构:\n${schemas.join('\n')}`;
      }

      const messages = [
        {
          role: 'system',
          content: `你是一个专业的 SQL 专家。
当前数据库类型: ${activeConnection?.type}
${schemaInfo}

**重要准则：**
1. **严禁假设**：你必须严格基于上方提供的“完整结构”进行 SQL 编写。严禁捏造不存在的表名或字段名。
2. **准确性**：如果用户的需求涉及到的表或字段在结构中找不到，请直接指出缺失信息，不要尝试猜测。
3. **多表关联**：如果需要关联查询，请根据结构中的字段名进行逻辑关联。
4. **输出规范**：请直接给出 SQL 代码块，并附带简要说明。如果是查询请求，请尽量生成完整的 SELECT 语句。`
        },
        ...aiMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg }
      ];

      const res = await window.electronAPI.aiChat(messages);
      if (res.success && res.response) {
        setAIMessages((prev) => [...prev, { role: 'assistant', content: res.response! }]);
      } else {
        setToast({ message: res.error || 'AI 响应失败', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    } finally {
      setAILoading(false);
    }
  };

  const handleApplyAISQL = (content: string) => {
    const sqlMatch = content.match(/```sql\n([\s\S]*?)\n```/) || content.match(/```([\s\S]*?)\n```/);
    const sql = sqlMatch ? sqlMatch[1] : content;

    if (activeConsoleId) {
      setConsoles((prev) =>
        prev.map((c) => {
          if (c.id === activeConsoleId) {
            const currentSql = c.sql.trim();
            const updatedSql = currentSql ? `${currentSql}\n\n${sql}` : sql;
            return { ...c, sql: updatedSql };
          }
          return c;
        })
      );
      setToast({ message: '已追加到控制台', type: 'success' });
      return;
    }

    const id = Math.random().toString(36).substr(2, 9);
    const newConsole: ConsoleTab = {
      id,
      connectionId: activeConnection?.id,
      name: `AI 生成 - ${aiContext?.name || '查询'}`,
      sql,
      executing: false,
      dbName: selectedDatabase || undefined,
      tableName: aiContext?.type === 'table' ? aiContext.name : undefined,
      isDirty: true,
      savedSql: ''
    };

    setConsoles((prev) => [...prev, newConsole]);
    setActiveConsoleId(id);
  };

  return {
    showAIModal,
    setShowAIModal,
    aiLoading,
    aiPrompt,
    setAIPrompt,
    aiMessages,
    aiContext,
    handleOpenAIModal,
    handleAIChat,
    handleApplyAISQL
  };
};
