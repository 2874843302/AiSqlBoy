export type AiVendorId =
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'doubao'
  | 'zhipu'
  | 'minimax';

export interface AiModelOption {
  value: string;
  label: string;
}

export interface AiVersionOption {
  value: string;
  label: string;
}

export const AI_VENDOR_LIST: { id: AiVendorId; label: string; baseUrl: string }[] = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com' },
  { id: 'qwen', label: '通义千问（兼容 OpenAI）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'moonshot', label: 'Moonshot / Kimi（兼容 OpenAI）', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'doubao', label: '火山方舟 / 豆包（兼容 OpenAI）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'zhipu', label: '智谱 GLM（兼容 OpenAI）', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'minimax', label: 'MiniMax（兼容 OpenAI）', baseUrl: 'https://api.minimax.chat/v1' },
];

export const AI_VENDOR_MODELS: Record<AiVendorId, AiModelOption[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'deepseek-chat' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner' },
  ],
  qwen: [
    { value: 'qwen-plus', label: 'qwen-plus' },
    { value: 'qwen-turbo', label: 'qwen-turbo' },
    { value: 'qwen-max', label: 'qwen-max' },
  ],
  moonshot: [
    { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
    { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    { value: 'moonshot-v1-128k', label: 'moonshot-v1-128k' },
  ],
  doubao: [
    { value: 'doubao-pro-32k', label: 'doubao-pro-32k' },
    { value: 'doubao-lite-32k', label: 'doubao-lite-32k' },
  ],
  zhipu: [
    { value: 'glm-4-plus', label: 'glm-4-plus' },
    { value: 'glm-4', label: 'glm-4' },
    { value: 'glm-4-air', label: 'glm-4-air' },
  ],
  minimax: [
    { value: 'abab6.5-chat', label: 'abab6.5-chat' },
    { value: 'abab6-chat', label: 'abab6-chat' },
  ],
};

/** 第三行：api-version 查询参数；国产兼容网关默认不附加 */
export const AI_VERSION_OPTIONS: Record<AiVendorId, AiVersionOption[]> = {
  deepseek: [{ value: '', label: '不附加 api-version' }],
  qwen: [{ value: '', label: '不附加 api-version' }],
  moonshot: [{ value: '', label: '不附加 api-version' }],
  doubao: [{ value: '', label: '不附加 api-version' }],
  zhipu: [{ value: '', label: '不附加 api-version' }],
  minimax: [{ value: '', label: '不附加 api-version' }],
};

export function getVendorBaseUrl(vendor: AiVendorId): string {
  const row = AI_VENDOR_LIST.find((v) => v.id === vendor);
  return row?.baseUrl ?? '';
}

export function inferVendorFromStoredBase(baseRaw: string | null | undefined): AiVendorId {
  const base = (baseRaw || '').trim().toLowerCase();
  if (!base) return 'deepseek';
  if (base.includes('deepseek.com')) return 'deepseek';
  if (base.includes('dashscope.aliyuncs.com')) return 'qwen';
  if (base.includes('moonshot.cn')) return 'moonshot';
  if (base.includes('volces.com')) return 'doubao';
  if (base.includes('bigmodel.cn')) return 'zhipu';
  if (base.includes('minimax.chat')) return 'minimax';
  // 历史 OpenAI/Azure/自定义配置统一回落到 deepseek
  return 'deepseek';
}

export function defaultModelForVendor(vendor: AiVendorId): string {
  const list = AI_VENDOR_MODELS[vendor];
  if (list.length > 0) return list[0].value;
  return '';
}
