import { AI_SETTING_KEYS } from '../../shared/aiSettings';
import { internalDB } from './internalDB';

const LEGACY_CHAT_URL = 'https://api.deepseek.com/chat/completions';
const LEGACY_MODEL = 'deepseek-chat';

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

function resolveModel(baseConfigured: boolean, modelRaw: string | null): string {
  const m = (modelRaw || '').trim();
  if (m) return m;
  return baseConfigured ? 'gpt-3.5-turbo' : LEGACY_MODEL;
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

    const baseRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiBaseUrl);
    const modelRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiModel);
    const apiVersionRaw = await internalDB.getSetting(AI_SETTING_KEYS.openaiApiVersion);

    const baseConfigured = !!(baseRaw && baseRaw.trim());
    const url = appendApiVersion(
      baseConfigured ? resolveOpenAiCompatibleChatUrl(baseRaw!) : LEGACY_CHAT_URL,
      apiVersionRaw || ''
    );
    const model = resolveModel(baseConfigured, modelRaw);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
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
}

export const aiService = new AIService();
