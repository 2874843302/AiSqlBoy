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
  activeConnection: { id?: number; type?: string; name?: string; readOnly?: boolean } | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  setToast: (toast: { message: string; type: 'error' | 'success' | 'info' } | null) => void;
  onRestoreDbTable: (db: string | null, table: string | null) => void;
  /** 切换连接（用于点开会话/新建会话时将会话所属连接设为当前连接） */
  onConnect: (config: ConnectionConfig) => Promise<void> | void;
};

const STREAMING_TIMESTAMP = -1;

export const useAgent = ({ savedConnections, activeConnection, selectedDatabase, selectedTable, setToast, onRestoreDbTable, onConnect }: UseAgentArgs) => {
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentInput, setAgentInput] = useState('');
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [permissionLevel, setPermissionLevel] = useState<AgentPermissionLevel>('readonly');

  // 只读连接：Agent 权限强制锁死为 readonly，不允许切换
  const connectionReadOnly = !!activeConnection?.readOnly;
  useEffect(() => {
    if (connectionReadOnly) setPermissionLevel('readonly');
  }, [connectionReadOnly]);

  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentIteration, setAgentIteration] = useState(0);
  const [streamingContent, setStreamingContent] = useState('');

  // 会话持久化 — 按连接分组
  const [conversationsByConn, setConversationsByConn] = useState<Record<number, AgentConversation[]>>({});
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // 当前会话所属的连接 ID
  const currentConvConnIdRef = useRef<number | null>(null);

  // 后端会话按会话隔离保存（切换会话不销毁，切回可续上下文）
  const sessionByConvRef = useRef<Map<string, string>>(new Map());
  // 进行中请求对应的后端会话（流式 token 路由与停止按钮用）
  const inFlightSessionRef = useRef<string | null>(null);
  // 进行中请求所属的会话 ID
  const [pendingConvId, setPendingConvId] = useState<string | null>(null);
  const currentConvIdRef = useRef<string | null>(null);
  useEffect(() => { currentConvIdRef.current = currentConversationId; }, [currentConversationId]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ============ 流式 token 监听 ============
  useEffect(() => {
    const handler = (data: { sessionId: string; delta: string }) => {
      if (data.sessionId !== inFlightSessionRef.current) return;
      setStreamingContent((prev) => prev + data.delta);
    };
    window.electronAPI.onAgentStreamToken(handler);
    return () => { window.electronAPI.offAgentStreamToken(); };
  }, []);

  // ============ 会话持久化：统一保存入口（携带库表上下文） ============
  const persistConversation = useCallback(async (
    convId: string,
    connId: number,
    msgs: AgentMessage[],
    titleOverride?: string,
  ) => {
    const title = titleOverride || msgs.find((m) => m.role === 'user')?.content?.slice(0, 40) || '新会话';
    await window.electronAPI.agentSaveConversation({
      id: convId,
      connection_id: connId,
      title,
      messages: JSON.stringify(msgs.filter((m) => m.timestamp !== STREAMING_TIMESTAMP)),
      selected_db: selectedDatabase ?? null,
      selected_table: selectedTable ?? null,
    });
  }, [selectedDatabase, selectedTable]);

  // ============ 会话持久化：防抖自动保存 ============
  const scheduleSave = useCallback((messages: AgentMessage[], convId: string | null, connId: number | null) => {
    if (!convId || !connId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persistConversation(convId, connId, messages);
    }, 1000);
  }, [persistConversation]);

  useEffect(() => {
    if (currentConversationId && agentMessages.length > 0) {
      scheduleSave(agentMessages, currentConversationId, currentConvConnIdRef.current);
    }
  }, [agentMessages, currentConversationId, scheduleSave]);

  // ============ 连接切换：后端会话失效 + 非当前连接的会话保存后收起 ============
  const activeConnId = activeConnection?.id ?? null;
  const prevActiveConnIdRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevActiveConnIdRef.current;
    prevActiveConnIdRef.current = activeConnId;
    if (prev === undefined || prev === activeConnId) return;

    // 连接已变化：销毁全部后端会话（旧会话的连接校验已失效）
    for (const sid of sessionByConvRef.current.values()) {
      window.electronAPI.agentDestroySession(sid);
    }
    sessionByConvRef.current.clear();
    inFlightSessionRef.current = null;
    setPendingConvId(null);

    // 当前会话不属于新连接：先保存（含库表上下文）再清空视图，等待用户重新选择/新建会话
    const convConnId = currentConvConnIdRef.current;
    if (convConnId && convConnId !== activeConnId && currentConversationId) {
      void persistConversation(currentConversationId, convConnId, agentMessages);
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      setCurrentConversationId(null);
      currentConvConnIdRef.current = null;
      setAgentMessages([]);
      setStreamingContent('');
      setAgentError(null);
      setAgentIteration(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnId]);

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
      saveTimerRef.current = null;
      if (currentConversationId && currentConvConnIdRef.current) {
        void persistConversation(currentConversationId, currentConvConnIdRef.current, agentMessages);
      }
    }
    for (const sid of sessionByConvRef.current.values()) {
      window.electronAPI.agentDestroySession(sid);
    }
    sessionByConvRef.current.clear();
    inFlightSessionRef.current = null;
    setShowAgentPanel(false);
  }, [agentMessages, currentConversationId, persistConversation]);

  // ============ 新建会话（指定连接） ============
  const handleNewConversation = useCallback(async (connectionId: number) => {
    // 保存旧会话
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentConversationId && currentConvConnIdRef.current) {
      await persistConversation(currentConversationId, currentConvConnIdRef.current, agentMessages);
    }

    // 目标连接非当前连接时先切换连接，保证下方库选择器与新会话一致
    if (connectionId !== activeConnection?.id) {
      const config = savedConnections.find((c) => c.id === connectionId);
      if (config) await onConnect(config);
    }

    const newConvId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await window.electronAPI.agentSaveConversation({
      id: newConvId, connection_id: connectionId, title: '新会话', messages: '[]',
      selected_db: selectedDatabase ?? null, selected_table: selectedTable ?? null,
    });
    setCurrentConversationId(newConvId);
    currentConvConnIdRef.current = connectionId;
    setAgentMessages([]);
    setAgentError(null);
    setAgentIteration(0);
    setPermissionLevel('readonly');
    await loadAllConversations();
  }, [activeConnection, agentMessages, currentConversationId, loadAllConversations, onConnect, persistConversation, savedConnections, selectedDatabase, selectedTable]);

  // ============ 选择已有会话 ============
  const handleSelectConversation = useCallback(async (convId: string) => {
    // 保存旧会话
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (currentConversationId && currentConvConnIdRef.current) {
      await persistConversation(currentConversationId, currentConvConnIdRef.current, agentMessages);
    }

    const conv = await window.electronAPI.agentGetConversation(convId);
    if (conv) {
      // 会话所属连接非当前连接时先切换，保证后续库表恢复在正确连接上执行
      if (conv.connection_id !== activeConnection?.id) {
        const config = savedConnections.find((c) => c.id === conv.connection_id);
        if (config) await onConnect(config);
      }
      let messages: AgentMessage[] = [];
      try { messages = JSON.parse(conv.messages || '[]'); } catch { messages = []; }
      setCurrentConversationId(convId);
      currentConvConnIdRef.current = conv.connection_id;
      setAgentMessages(messages);
      setAgentError(null);
      setAgentIteration(0);
      // 恢复会话记录的库表上下文
      onRestoreDbTable(conv.selected_db ?? null, conv.selected_table ?? null);
    }
  }, [activeConnection, agentMessages, currentConversationId, onConnect, onRestoreDbTable, persistConversation, savedConnections]);

  // ============ 删除会话 ============
  const handleDeleteConversation = useCallback(async (convId: string) => {
    await window.electronAPI.agentDeleteConversation(convId);
    const sid = sessionByConvRef.current.get(convId);
    if (sid) {
      window.electronAPI.agentDestroySession(sid);
      sessionByConvRef.current.delete(convId);
      if (inFlightSessionRef.current === sid) inFlightSessionRef.current = null;
    }
    if (convId === currentConversationId) {
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

  // ============ 创建后端 Agent 会话（按当前会话隔离） ============
  // convIdOverride：首条消息新建会话时 state 尚未重渲染，闭包里的
  // currentConversationId 还是旧值，必须显式传入新会话 ID
  const ensureBackendSession = useCallback(async (convIdOverride?: string): Promise<string | null> => {
    const convId = convIdOverride || currentConversationId;
    if (!activeConnection?.id || !selectedDatabase || !convId) return null;
    const existing = sessionByConvRef.current.get(convId);
    if (existing) return existing;

    const result = await window.electronAPI.agentCreateSession({
      connectionId: activeConnection.id,
      dbType: activeConnection.type || 'unknown',
      dbName: selectedDatabase,
      permissionLevel: connectionReadOnly ? 'readonly' : permissionLevel,
    });
    if (result.success && result.sessionId) {
      sessionByConvRef.current.set(convId, result.sessionId);
      return result.sessionId;
    }
    return null;
  }, [activeConnection, selectedDatabase, currentConversationId, permissionLevel, connectionReadOnly]);

  // ============ 处理 Agent 响应（按归属会话路由） ============
  const processAgentResponse = useCallback(async (response: AgentResponse, convId: string): Promise<void> => {
    setStreamingContent('');
    setAgentLoading(false);
    setPendingConvId(null);
    inFlightSessionRef.current = null;

    const newMessages = response.type === 'error' ? [] : response.messages;
    const isCurrent = convId === currentConvIdRef.current;

    // 响应归属的会话不是当前展示会话：合并写入该会话的存储记录，不污染当前视图
    if (!isCurrent) {
      if (newMessages.length > 0) {
        try {
          const conv = await window.electronAPI.agentGetConversation(convId);
          if (conv) {
            let stored: AgentMessage[] = [];
            try { stored = JSON.parse(conv.messages || '[]'); } catch { stored = []; }
            await window.electronAPI.agentSaveConversation({
              ...conv,
              messages: JSON.stringify([...stored, ...newMessages]),
            });
          }
        } catch { /* 存储合并不影响当前视图，静默失败 */ }
      }
      return;
    }

    const append = (prev: AgentMessage[]) => {
      const withoutStreaming = prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP);
      return [...withoutStreaming, ...newMessages];
    };
    switch (response.type) {
      case 'messages':
      case 'pending_approval':
      case 'finished':
        setAgentMessages(append);
        setAgentIteration(response.iteration);
        break;
      case 'max_iterations':
        setAgentMessages(append);
        setAgentIteration(response.iteration);
        setAgentError('Agent 已达到最大执行步数，请继续对话或调整需求');
        break;
      case 'error':
        setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
        setAgentError(response.error);
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
        selected_db: selectedDatabase ?? null, selected_table: selectedTable ?? null,
      });
      setCurrentConversationId(convId);
      currentConvConnIdRef.current = activeConnection.id;
      await loadAllConversations();
    }

    const sessionId = await ensureBackendSession(convId);
    if (!sessionId) { setToast({ message: '创建 Agent 会话失败', type: 'error' }); return; }

    const baseMessage = agentInput;
    const contextPrefix = selectedTable ? `[上下文: 当前选定的表是 ${selectedTable}] ` : '';
    const sentMessage = contextPrefix + baseMessage;

    setAgentInput('');
    setAgentLoading(true);
    setPendingConvId(convId);
    inFlightSessionRef.current = sessionId;
    setAgentError(null);
    setStreamingContent('');
    setAgentMessages((prev) => [
      ...prev,
      { role: 'user', content: baseMessage, timestamp: Date.now() },
      { role: 'assistant', content: '', actions: [], timestamp: STREAMING_TIMESTAMP },
    ]);

    try {
      const response = await window.electronAPI.agentChat(sessionId, sentMessage);
      await processAgentResponse(response, convId);
    } catch (err: any) {
      setAgentLoading(false);
      setPendingConvId(null);
      inFlightSessionRef.current = null;
      if (convId === currentConvIdRef.current) {
        setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
        setAgentError(err.message || 'Agent 请求失败');
      }
    }
  }, [agentInput, agentLoading, activeConnection, selectedDatabase, selectedTable, currentConversationId, ensureBackendSession, loadAllConversations, processAgentResponse, setToast]);

  // ============ 批准/拒绝 ============
  const runApproval = useCallback(async (actionId: string, approved: boolean) => {
    const convId = currentConvIdRef.current;
    const sessionId = convId ? sessionByConvRef.current.get(convId) : undefined;
    if (!convId || !sessionId) return;
    setAgentLoading(true); setPendingConvId(convId); inFlightSessionRef.current = sessionId;
    setAgentError(null); setStreamingContent('');
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: '', actions: [], timestamp: STREAMING_TIMESTAMP }]);
    try {
      const response = await window.electronAPI.agentApprove(sessionId, actionId, approved);
      setAgentMessages((prev) => prev.map((msg) => msg.role === 'assistant' && msg.actions
        ? { ...msg, actions: msg.actions.map((a: AgentAction) => a.id === actionId ? { ...a, status: approved ? ('approved' as const) : ('rejected' as const) } : a) }
        : msg));
      await processAgentResponse(response, convId);
    } catch (err: any) {
      setAgentLoading(false);
      setPendingConvId(null);
      inFlightSessionRef.current = null;
      if (convId === currentConvIdRef.current) {
        setAgentMessages((prev) => prev.filter((m) => m.timestamp !== STREAMING_TIMESTAMP));
        setAgentError(err.message || '审批操作失败');
      }
    }
  }, [processAgentResponse]);

  const handleApproveAction = useCallback(async (actionId: string) => {
    await runApproval(actionId, true);
  }, [runApproval]);

  const handleRejectAction = useCallback(async (actionId: string) => {
    await runApproval(actionId, false);
  }, [runApproval]);

  // ============ 停止当前 Agent 任务 ============
  const handleCancelAgent = useCallback(async () => {
    if (!inFlightSessionRef.current) return;
    // 后端循环检测到中止标志后会正常返回响应，pending 的 agentChat 会随之 resolve
    await window.electronAPI.agentCancel(inFlightSessionRef.current);
  }, []);

  const handleClearSession = useCallback(async () => {
    if (currentConversationId) {
      const sid = sessionByConvRef.current.get(currentConversationId);
      if (sid) {
        window.electronAPI.agentDestroySession(sid);
        sessionByConvRef.current.delete(currentConversationId);
        if (inFlightSessionRef.current === sid) inFlightSessionRef.current = null;
      }
    }
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
    if (connectionReadOnly) {
      setToast({ message: '当前连接为只读模式，Agent 权限已锁定为只读', type: 'info' });
      return;
    }
    setPermissionLevel(level);
    const sid = currentConvIdRef.current ? sessionByConvRef.current.get(currentConvIdRef.current) : undefined;
    if (sid) {
      window.electronAPI.agentUpdatePermission(sid, level).then((result) => {
        if (!result.success) setToast({ message: result.error || '更新权限失败', type: 'error' });
      });
    }
  }, [connectionReadOnly, setToast]);

  const displayMessages = useMemo(() => {
    const mapped = streamingContent
      ? agentMessages.map((m) => m.timestamp === STREAMING_TIMESTAMP ? { ...m, content: streamingContent } : m)
      : agentMessages;
    // 过滤空的流式占位消息（思考中指示器已提供反馈，避免空白气泡）
    return mapped.filter((m) => !(
      m.timestamp === STREAMING_TIMESTAMP && m.role === 'assistant' && !m.content && (!m.actions || m.actions.length === 0)
    ));
  }, [agentMessages, streamingContent]);

  // 当前会话所属连接
  const currentConvConnectionId = currentConvConnIdRef.current;

  return {
    showAgentPanel,
    // 仅当进行中的请求属于当前会话时才对外报 loading（思考指示器/停止按钮）
    agentLoading: agentLoading && pendingConvId === currentConversationId,
    // 任意会话有任务进行中（禁用输入/发送）
    agentBusy: agentLoading,
    agentInput, setAgentInput,
    agentMessages: displayMessages,
    permissionLevel,
    // 只读连接下 Agent 权限锁定，UI 禁用切换入口
    permissionLocked: connectionReadOnly,
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
    handleCancelAgent,
    handleApproveAction,
    handleRejectAction,
    handleClearSession,
    handlePermissionChange,
  };
};
