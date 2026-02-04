import { internalDB } from './internalDB';

export class AIService {
  private async getApiKey(): Promise<string | null> {
    return await internalDB.getSetting('deepseek_api_key');
  }

  async chat(messages: { role: 'system' | 'user' | 'assistant', content: string }[]): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('未配置 DeepSeek API Key，请在设置中配置。');
    }

    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `请求失败: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error: any) {
      console.error('DeepSeek API Error:', error);
      throw error;
    }
  }
}

export const aiService = new AIService();
