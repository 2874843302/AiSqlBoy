import { AI_SETTING_KEYS } from '../../shared/aiSettings';
import { defaultModelForVendor, getVendorBaseUrl, type AiVendorId } from '../../shared/aiProviderPresets';
import { internalDB } from './internalDB';

const LEGACY_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const LEGACY_MODEL = 'deepseek-v4-pro';

/** 将用户填写的 Base URL 规范为 …/chat/completions */
export function resolveOpenAiCompatibleChatUrl(baseUrlRaw: string): string {
  const trimmed = baseUrlRaw.trim().replace(/\/+$/, '');
  if (!trimmed) return LEGACY_CHAT_URL;
  if (trimmed.toLowerCase().endsWith('/chat/completions')) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/chat/completions`;
}

function appendApiVersion(url: string, apiVersion: string): string {
  const v = apiVersion.trim();
  if (!v) return url;
  if (/[?&]api-version=/i.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}api-version=${encodeURIComponent(v)}`;
}

function resolveModel(opts: { vendor: AiVendorId; baseConfigured: boolean; modelRaw: string | null }): string {
  const m = (opts.modelRaw || '').trim();
  if (m) return m;
  if (!opts.baseConfigured) return LEGACY_MODEL;
  return defaultModelForVendor(opts.vendor) || LEGACY_MODEL;
}

export class AIService {
  private async getApiKey(): Promise<string | null> {
    return await internalDB.getSetting(AI_SETTING_KEYS.apiKey);
  }

  async chat(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('未配置 API Key，请在设置中填写。');
    }

    const vendorRaw = await internalDB.getSetting(AI_SETTING_KEYS.providerVendor);
    const vendor: AiVendorId =
      vendorRaw === 'deepseek' ||
      vendorRaw === 'qwen' ||
      vendorRaw === 'moonshot' ||
      vendorRaw === 'doubao' ||
      vendorRaw === 'zhipu' ||
      vendorRaw === 'minimax'
        ? vendorRaw
        : 'deepseek';

    const baseRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiBaseUrl);
    const modelRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiModel);
    const apiVersionRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiApiVersion);

    const effectiveBase = baseRaw && baseRaw.trim() ? baseRaw : getVendorBaseUrl(vendor);

    const url = appendApiVersion(
      effectiveBase && effectiveBase.trim() ? resolveOpenAiCompatibleChatUrl(effectiveBase) : LEGACY_CHAT_URL,
      apiVersionRaw || ''
    );
    const model = resolveModel({ vendor, baseConfigured: !!(effectiveBase && effectiveBase.trim()), modelRaw });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      headers.Authorization = `Bearer ${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let message = `请求失败: ${response.status}`;
        try {
          const error = JSON.parse(text) as { error?: { message?: string }; message?: string };
          message = error.error?.message || error.message || message;
        } catch {
          if (text) message = text.slice(0, 500);
        }
        throw new Error(message);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error: unknown) {
      console.error('OpenAI-compatible API error:', error);
      throw error;
    }
  }

  /**
   * 流式聊天：逐 token 返回结果
   * @param onToken 每收到一个 token 片段时回调
   * @returns 完整的回复文本
   */
  async chatStream(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    onToken: (delta: string) => void
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('未配置 API Key，请在设置中填写。');
    }

    const vendorRaw = await internalDB.getSetting(AI_SETTING_KEYS.providerVendor);
    const vendor: AiVendorId =
      vendorRaw === 'deepseek' ||
      vendorRaw === 'qwen' ||
      vendorRaw === 'moonshot' ||
      vendorRaw === 'doubao' ||
      vendorRaw === 'zhipu' ||
      vendorRaw === 'minimax'
        ? vendorRaw
        : 'deepseek';

    const baseRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiBaseUrl);
    const modelRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiModel);
    const apiVersionRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiApiVersion);

    const effectiveBase = baseRaw && baseRaw.trim() ? baseRaw : getVendorBaseUrl(vendor);

    const url = appendApiVersion(
      effectiveBase && effectiveBase.trim() ? resolveOpenAiCompatibleChatUrl(effectiveBase) : LEGACY_CHAT_URL,
      apiVersionRaw || ''
    );
    const model = resolveModel({ vendor, baseConfigured: !!(effectiveBase && effectiveBase.trim()), modelRaw });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `请求失败: ${response.status}`;
      try {
        const error = JSON.parse(text) as { error?: { message?: string }; message?: string };
        message = error.error?.message || error.message || message;
      } catch {
        if (text) message = text.slice(0, 500);
      }
      throw new Error(message);
    }

    // 解析 SSE 流
    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按行处理 SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后不完整的一行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onToken(delta);
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    return fullContent;
  }

  /**
   * 带原生 Function Calling 的流式调用（OpenAI 兼容 tools 协议）。
   * 同时收集正文文本与 tool_calls（参数按流式片段拼接）。
   * @param tools OpenAI tools 定义；传 undefined 时等价于普通 chatStream
   */
  async chatStreamWithTools(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    tools: Array<Record<string, unknown>> | undefined,
    onToken: (delta: string) => void
  ): Promise<{ content: string; toolCalls: { name: string; arguments: string }[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('未配置 API Key，请在设置中填写。');
    }

    const vendorRaw = await internalDB.getSetting(AI_SETTING_KEYS.providerVendor);
    const vendor: AiVendorId =
      vendorRaw === 'deepseek' ||
      vendorRaw === 'qwen' ||
      vendorRaw === 'moonshot' ||
      vendorRaw === 'doubao' ||
      vendorRaw === 'zhipu' ||
      vendorRaw === 'minimax'
        ? vendorRaw
        : 'deepseek';

    const baseRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiBaseUrl);
    const modelRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiModel);
    const apiVersionRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiApiVersion);

    const effectiveBase = baseRaw && baseRaw.trim() ? baseRaw : getVendorBaseUrl(vendor);

    const url = appendApiVersion(
      effectiveBase && effectiveBase.trim() ? resolveOpenAiCompatibleChatUrl(effectiveBase) : LEGACY_CHAT_URL,
      apiVersionRaw || ''
    );
    const model = resolveModel({ vendor, baseConfigured: !!(effectiveBase && effectiveBase.trim()), modelRaw });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    headers.Authorization = `Bearer ${apiKey}`;

    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      let message = `请求失败: ${response.status}`;
      try {
        const error = JSON.parse(text) as { error?: { message?: string }; message?: string };
        message = error.error?.message || error.message || message;
      } catch {
        if (text) message = text.slice(0, 500);
      }
      throw new Error(message);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';
    // 按 index 累积流式 tool_calls 片段
    const toolCallAcc = new Map<number, { name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            onToken(delta.content);
          }
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === 'number' ? tc.index : 0;
              const acc = toolCallAcc.get(idx) || { name: '', arguments: '' };
              if (tc.function?.name) acc.name += tc.function.name;
              if (tc.function?.arguments) acc.arguments += tc.function.arguments;
              toolCallAcc.set(idx, acc);
            }
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    return {
      content: fullContent,
      toolCalls: [...toolCallAcc.values()].filter((tc) => tc.name),
    };
  }
}

export const aiService = new AIService();
