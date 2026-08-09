import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type {
  AgentMessage,
  AgentAction,
  AgentPermissionLevel,
  AgentResponse,
} from '../../shared/agentTypes';
import type { ConnectionConfig } from '../../shared/types';

export type AgentConversation = {
  id: string;
  connection_id: number;
  title: string;
  selected_db?: string | null;
  selected_table?: string | null;
  created_at?: string;
  updated_at?: string;
};

type UseAgentArgs = {
  savedConnections: ConnectionConfig[];
  activeConnection: { id?: number; type?: string; name?: string } | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' } | null) => void;
  onRestoreDbTable: (db: string | null, table: string | null) => void;
};

const STREAMING_TIMESTAMP = -1;

export const useAgent = ({ savedConnections, activeConnection, selectedDatabase, selectedTable, setToast, onRestoreDbTable }: UseAgentArgs) => {
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [permissionLevel, setPermissionLevel] = useState<AgentPermissionLevel>('readonly');
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentIteration, setAgentIteration] = useState(0);
  const [streamingContent, setStreamingContent] = useState('');

  // 会话持久化 — 按连接分组
  const [conversationsByConn, setConversationsByConn] = useState<Record<number, AgentConversation[]>>({});
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // 当前会话所属的连接 ID
  const currentConvConnIdRef = useRef<number | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ 流式 token 监听 ============
  useEffect(() => {
    const handler = (data: { sessionId: string; delta: string }) => {
      if (data.sessionId !== sessionIdRef.current) return;
      setStreamingContent((prev) => prev + data.delta);
    };
    window.electronAPI.onAgentStreamToken(handler);
    return () => { window.electronAPI.offAgentStreamToken(); };
  }, []);

  // ============ 会话持久化：防抖自动保存 ============
  const scheduleSave = useCallback((messages: AgentMessage[], convId: string | null, connId: number | null) => {
    if (!convId || !connId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const title = messages.find((m) => m.role === 'user')?.content?.slice(0, 40) || '新会话';
      await window.electronAPI.agentSaveConversation({
        id: convId, connection_id: connId, title,
        messages: JSON.stringify(messages.filter((m) => m.timestamp !== STREAMING_TIMESTAMP)),
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (currentConversationId && agentMessages.length > 0) {
      scheduleSave(agentMessages, currentConversationId, currentConvConnIdRef.current);
    }
  }, [agentMessages, currentConversationId, scheduleSave]);

  // ============ 加载所有连接的会话 ============
  const loadAllConversations = useCallback(async () => {
    const result: Record<number, AgentConversation[]> = {};
    for (const conn of savedConnections) {
      if (!conn.id) continue;
      try {
        const list = await window.electronAPI.agentGetConversations(conn.id);
        result[conn.id] = list || [];
      } catch {
        result[conn.id] = [];
      }
    }
    setConversationsByConn(result);
  }, [savedConnections]);

  // ============ 打开 Agent 模式 ============
  const handleOpenAgent = useCallback(async () => {
    setShowAgentPanel(true);
    await loadAllConversations();
  }, [loadAllConversations]);

  // ============ 关闭 Agent 模式 ============
  const handleCloseAgent = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      if (currentConversationId && currentConvConnIdRef.current) {
        const title = agentMessages.find((m) => m.role === 'user')?.content?.slice(0, 40) || '新会话';
        window.electronAPI.agentSaveConversation({
          id: currentConversationId, connection_id: currentConvConnIdRef.current,
          title, messages: JSON.stringify(agentMessages.filter((m) => m.timestamp !== STREAMING_TIMESTAMP)),
        });
      }
    }
    if (sessionIdRef.current) {
      window.electronAPI.agentDestroySession(sessionIdRef.current);
      sessionIdRef.current = null;
    }
    setShowAgentPanel(false);
  }, [agentMessages, currentConversationId]);

  // ============ 新建会话（指定连接） ============
  const handleNewConversation = useCallback(async (connectionId: number) => {
    // 保存旧会话
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentConversationId && currentConvConnIdRef.current) {
      const title = agentMessages.find((m) => m.role === 'user')?.content?.slice(0, 40) || '新会话';
      await window.electronAPI.agentSaveConversation({
        id: currentConversationId, connection_id: currentConvConnIdRef.current,
        title, messages: JSON.stringify(agentMessages.filter((m) => m.timestamp !== STREAMING_TIMESTAMP)),
      });
    }
    if (sessionIdRef.current) {
      await window.electronAPI.agentDestroySession(sessionIdRef.current);
      sessionIdRef.current = null;
    }

    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await window.electronAPI.agentSaveConversation({
      id: newConvId, connection_id: connectionId, title: '新会话', messages: '[]',
    });
    setCurrentConversationId(newConvId);
    currentConvConnIdRef.current = connectionId;
    setAgentMessages([]);
    setAgentError(null);
    setAgentIteration(0);
    setStreamingContent('');
    setPermissionLevel('readonly');
    await loadAllConversations();
  }, [agentMessages, currentConversationId, loadAllConversations]);

  // ============ 选择已有会话 ============
  const handleSelectConversation = useCallback(async (convId: string) => {
    // 保存旧会话
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentConversationId && currentConvConnIdRef.current) {
      const title = agentMessages.find((m) => m.role === 'user')?.content?.slice(0, 40) || '新会话';
      await window.electronAPI.agentSaveConversation({
        id: currentConversationId, connection_id: currentConvConnIdRef.current,
        title, messages: JSON.stringify(agentMessages.filter((m) => m.timestamp !== STREAMING_TIMESTAMP)),
      });
    }
    if (sessionIdRef.current) {
      await window.electronAPI.agentDestroySession(sessionIdRef.current);
      sessionIdRef.current = null;
    }

    const conv = await window.electronAPI.agentGetConversation(convId);
    if (conv) {
      let messages: AgentMessage[] = [];
      try { messages = JSON.parse(conv.messages || '[]'); } catch { messages = []; }
      setCurrentConversationId(convId);
      currentConvConnIdRef.current = conv.connection_id;
      setAgentMessages(messages);
      setAgentError(null);
      setAgentIteration(0);
      setStreamingContent('');
    }
  }, [agentMessages, currentConversationId]);

  // ============ 删除会话 ============
  const handleDeleteConversation = useCallback(async (convId: string) => {
    await window.electronAPI.agentDeleteConversation(convId);
    if (convId === currentConversationId) {
      if (sessionIdRef.current) {
        await window.electronAPI.agentDestroySession(sessionIdRef.current);
        sessionIdRef.current = null;
      }
      setCurrentConversationId(null);
      currentConvConnIdRef.current = null;
      setAgentMessages([]);
      setAgentError(null);
      setAgentIteration(0);
    }
    await loadAllConversations();
  }, [currentConversationId, loadAllConversations]);

  // ============ 重命名会话 ============
  const handleRenameConversation = useCallback(async (convId: string, title: string) => {
    await window.electronAPI.agentRenameConversation(convId, title);
    await loadAllConversations();
  }, [loadAllConversations]);

  // ============ 创建后端 Agent 会话 ============
  const ensureBackendSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!activeConnection?.id || !selectedDatabase || !currentConversationId) return null;

    const result = await window.electronAPI.agentCreateSession({
      connectionId: activeConnection.id,
      dbType: activeConnection.type || 'unknown',
      dbName: selectedDatabase,
      permissionLevel,
    });
    if (result.success && result.sessionId) {
      sessionIdRef.current = result.sessionId;
      return result.sessionId;
    }
    return null;
  }, [activeConnection, selectedDatabase, currentConversationId, permissionLevel]);

  // ============ 处理 Agent 响应 ============
  const processAgentResponse = useCallback(async (response: AgentResponse): Promise<void> => {
    setStreamingContent('');
    const append = (prev: AgentMessage[]) => {
      const withoutStreaming = prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP);
      return [...withoutStreaming, ...response.messages];
    };
    switch (response.type) {
      case 'messages':
      case 'pending_approval':
      case 'finished':
        setAgentMessages(append);
        setAgentIteration(response.iteration);
        setAgentLoading(false);
        break;
      case 'max_iterations':
        setAgentMessages(append);
        setAgentIteration(response.iteration);
        setAgentError('Agent 已达到最大执行步数，请继续对话或调整需求');
        setAgentLoading(false);
        break;
      case 'error':
        setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
        setAgentError(response.error);
        setAgentLoading(false);
        break;
    }
  }, []);

  // ============ 发送消息 ============
  const handleAgentSubmit = useCallback(async () => {
    if (!agentInput.trim() || agentLoading) return;
    if (!activeConnection?.id) { setToast({ message: '请先连接数据库', type: 'error' }); return; }
    if (!selectedDatabase) { setToast({ message: '请先选择数据库', type: 'error' }); return; }

    let convId = currentConversationId;
    if (!convId) {
      convId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await window.electronAPI.agentSaveConversation({
        id: convId, connection_id: activeConnection.id, title: agentInput.slice(0, 40), messages: '[]',
      });
      setCurrentConversationId(convId);
      currentConvConnIdRef.current = activeConnection.id;
      await loadAllConversations();
    }

    const sessionId = await ensureBackendSession();
    if (!sessionId) { setToast({ message: '创建 Agent 会话失败', type: 'error' }); return; }

    const baseMessage = agentInput;
    const contextPrefix = selectedTable ? `[上下文: 当前选定的表是 ${selectedTable}] ` : '';
    const sentMessage = contextPrefix + baseMessage;

    setAgentInput('');
    setAgentLoading(true);
    setAgentError(null);
    setStreamingContent('');
    setAgentMessages((prev) => [
      ...prev,
      { role: 'user', content: baseMessage, timestamp: Date.now() },
      { role: 'assistant', content: '', actions: [], timestamp: STREAMING_TIMESTAMP },
    ]);

    try {
      const response = await window.electronAPI.agentChat(sessionId, sentMessage);
      await processAgentResponse(response);
    } catch (err: any) {
      setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
      setAgentError(err.message || 'Agent 请求失败');
      setAgentLoading(false);
    }
  }, [agentInput, agentLoading, activeConnection, selectedDatabase, selectedTable, currentConversationId, ensureBackendSession, loadAllConversations, processAgentResponse, setToast]);

  // ============ 批准/拒绝 ============
  const handleApproveAction = useCallback(async (actionId: string) => {
    if (!sessionIdRef.current) return;
    setAgentLoading(true); setAgentError(null); setStreamingContent('');
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '', actions: [], timestamp: STREAMING_TIMESTAMP }]);
    try {
      const response = await window.electronAPI.agentApprove(sessionIdRef.current, actionId, true);
      setAgentMessages((prev) => prev.map((msg) => msg.role === 'assistant' && msg.actions
        ? { ...msg, actions: msg.actions.map((a: AgentAction) => a.id === actionId ? { ...a, status: 'approved' as const } : a) }
        : msg));
      await processAgentResponse(response);
    } catch (err: any) {
      setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
      setAgentError(err.message || '审批操作失败'); setAgentLoading(false);
    }
  }, [processAgentResponse]);

  const handleRejectAction = useCallback(async (actionId: string) => {
    if (!sessionIdRef.current) return;
    setAgentLoading(true); setAgentError(null); setStreamingContent('');
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '', actions: [], timestamp: STREAMING_TIMESTAMP }]);
    try {
      const response = await window.electronAPI.agentApprove(sessionIdRef.current, actionId, false);
      setAgentMessages((prev) => prev.map((msg) => msg.role === 'assistant' && msg.actions
        ? { ...msg, actions: msg.actions.map((a: AgentAction) => a.id === actionId ? { ...a, status: 'rejected' as const } : a) }
        : msg));
      await processAgentResponse(response);
    } catch (err: any) {
      setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
      setAgentError(err.message || '拒绝操作失败'); setAgentLoading(false);
    }
  }, [processAgentResponse]);

  const handleClearSession = useCallback(async () => {
    if (sessionIdRef.current) { await window.electronAPI.agentDestroySession(sessionIdRef.current); sessionIdRef.current = null; }
    setAgentMessages([]); setAgentError(null); setAgentIteration(0); setStreamingContent('');
    if (currentConversationId && currentConvConnIdRef.current) {
      await window.electronAPI.agentSaveConversation({
        id: currentConversationId, connection_id: currentConvConnIdRef.current, title: '新会话', messages: '[]',
        selected_db: selectedDatabase, selected_table: selectedTable,
      });
      await loadAllConversations();
    }
  }, [currentConversationId, loadAllConversations, selectedDatabase, selectedTable]);

  const handlePermissionChange = useCallback((level: AgentPermissionLevel) => {
    setPermissionLevel(level);
    if (sessionIdRef.current) {
      window.electronAPI.agentUpdatePermission(sessionIdRef.current, level).then((result) => {
        if (!result.success) setToast({ message: result.error || '更新权限失败', type: 'error' });
      });
    }
  }, [setToast]);

  const displayMessages = useMemo(() => {
    if (!streamingContent) return agentMessages;
    return agentMessages.map((m) => m.timestamp === STREAMING_TIMESTAMP ? { ...m, content: streamingContent } : m);
  }, [agentMessages, streamingContent]);

  // 当前会话所属连接
  const currentConvConnectionId = currentConvConnIdRef.current;

  return {
    showAgentPanel,
    agentLoading,
    agentInput, setAgentInput,
    agentMessages: displayMessages,
    permissionLevel,
    agentError,
    agentIteration,
    // 会话管理
    conversationsByConn,
    currentConversationId,
    currentConvConnectionId,
    handleOpenAgent,
    handleCloseAgent,
    handleNewConversation,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    // 对话操作
    handleAgentSubmit,
    handleApproveAction,
    handleRejectAction,
    handleClearSession,
    handlePermissionChange,
  };
};
