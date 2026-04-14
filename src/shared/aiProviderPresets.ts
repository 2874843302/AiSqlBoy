export type AiVendorId = 'deepseek' | 'openai' | 'azure' | 'custom';

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
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { id: 'azure', label: 'Azure OpenAI', baseUrl: '' },
  { id: 'custom', label: '自定义', baseUrl: '' },
];

export const AI_VENDOR_MODELS: Record<AiVendorId, AiModelOption[]> = {
  deepseek: [
    { value: 'deepseek-chat', label: 'deepseek-chat' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4-turbo', label: 'gpt-4-turbo' },
    { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    { value: 'o1', label: 'o1' },
    { value: 'o1-mini', label: 'o1-mini' },
  ],
  azure: [
    { value: 'gpt-4', label: 'gpt-4（须与部署名一致）' },
    { value: 'gpt-35-turbo', label: 'gpt-35-turbo' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  ],
  custom: [],
};

/** 第三行：api-version 查询参数；Azure 常用，其它厂商一般选「不附加」 */
export const AI_VERSION_OPTIONS: Record<AiVendorId, AiVersionOption[]> = {
  deepseek: [{ value: '', label: '不附加 api-version' }],
  openai: [{ value: '', label: '不附加 api-version' }],
  azure: [
    { value: '', label: '不附加（若 URL 已含 api-version）' },
    { value: '2024-10-21', label: '2024-10-21' },
    { value: '2024-06-01', label: '2024-06-01' },
    { value: '2024-02-15-preview', label: '2024-02-15-preview' },
    { value: '2023-12-01-preview', label: '2023-12-01-preview' },
  ],
  custom: [
    { value: '', label: '不附加 api-version' },
    { value: '2024-02-15-preview', label: '2024-02-15-preview（Azure 兼容网关）' },
    { value: '2024-06-01', label: '2024-06-01' },
  ],
};

export function getVendorBaseUrl(vendor: AiVendorId): string {
  const row = AI_VENDOR_LIST.find((v) => v.id === vendor);
  return row?.baseUrl ?? '';
}

export function inferVendorFromStoredBase(baseRaw: string | null | undefined): AiVendorId {
  const base = (baseRaw || '').trim().toLowerCase();
  if (!base) return 'deepseek';
  if (base.includes('deepseek.com')) return 'deepseek';
  if (base.includes('api.openai.com')) return 'openai';
  if (base.includes('openai.azure.com')) return 'azure';
  return 'custom';
}

export function defaultModelForVendor(vendor: AiVendorId): string {
  const list = AI_VENDOR_MODELS[vendor];
  if (list.length > 0) return list[0].value;
  return '';
}
