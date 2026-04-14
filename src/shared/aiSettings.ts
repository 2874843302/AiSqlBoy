/** 主进程 aiService 与渲染层设置表单共用 */
export const AI_SETTING_KEYS = {
  apiKey: 'deepseek_api_key',
  openaiBaseUrl: 'ai_openai_base_url',
  openaiModel: 'ai_openai_model',
  openaiApiVersion: 'ai_openai_api_version',
  /** deepseek | openai | azure | custom */
  providerVendor: 'ai_provider_vendor',
} as const;
