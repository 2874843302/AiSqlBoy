import { useEffect, useState } from 'react';
import { AI_SETTING_KEYS } from '../../shared/aiSettings';
import { UI_SETTING_KEYS } from '../../shared/uiSettings';
import {
  AI_VENDOR_LIST,
  AI_VENDOR_MODELS,
  AI_VERSION_OPTIONS,
  type AiVendorId,
  defaultModelForVendor,
  getVendorBaseUrl,
  inferVendorFromStoredBase,
} from '../../shared/aiProviderPresets';
import { DEFAULT_UI_FONT_STACK, type ThemeMode } from '../components/settings/SettingsModal';

export const useSettings = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'ai' | 'ui' | 'update'>('ai');
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyPlain, setShowApiKeyPlain] = useState(false);
  const [providerVendor, setProviderVendor] = useState<AiVendorId>('deepseek');
  const [providerModel, setProviderModel] = useState('');
  const [providerApiVersion, setProviderApiVersion] = useState('');

  const [uiFontFamily, setUiFontFamily] = useState<string>(DEFAULT_UI_FONT_STACK);
  const [uiThemeMode, setUiThemeMode] = useState<ThemeMode>('system');

  const loadAiSettings = async () => {
    const savedKey = await window.electronAPI.getSetting(AI_SETTING_KEYS.apiKey);
    if (savedKey) setApiKey(savedKey);
    else setApiKey('');
    const base = (await window.electronAPI.getSetting(AI_SETTING_KEYS.openaiBaseUrl)) ?? '';
    const model = (await window.electronAPI.getSetting(AI_SETTING_KEYS.openaiModel)) ?? '';
    const ver = (await window.electronAPI.getSetting(AI_SETTING_KEYS.openaiApiVersion)) ?? '';
    let vendor = (await window.electronAPI.getSetting(AI_SETTING_KEYS.providerVendor)) as AiVendorId | null;
    if (!vendor || !AI_VENDOR_LIST.some((v) => v.id === vendor)) {
      vendor = inferVendorFromStoredBase(base);
    }
    setProviderVendor(vendor);
    const models = AI_VENDOR_MODELS[vendor];
    const modelInList = models.some((m) => m.value === model);
    if (!models.length) {
      setProviderModel(model);
    } else if (model && modelInList) {
      setProviderModel(model);
    } else {
      setProviderModel(defaultModelForVendor(vendor));
    }
    const verOpts = AI_VERSION_OPTIONS[vendor];
    if (ver && verOpts.some((o) => o.value === ver)) {
      setProviderApiVersion(ver);
    } else if (ver) {
      setProviderApiVersion(ver);
    } else {
      setProviderApiVersion(verOpts[0]?.value ?? '');
    }
  }

  const applyUiFontFamily = (fontFamily: string) => {
    const stack = (fontFamily && fontFamily.trim()) ? fontFamily : DEFAULT_UI_FONT_STACK;
    // Tailwind v4 通过 --font-sans 控制 font-family；同时设置 html/body 兜底。
    document.documentElement.style.setProperty('--font-sans', stack);
    document.documentElement.style.fontFamily = stack;
    document.body.style.fontFamily = stack;
  }

  const applyUiThemeMode = (mode: ThemeMode) => {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved: 'light' | 'dark' =
      mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
    document.documentElement.setAttribute('data-theme', resolved);
    document.body.setAttribute('data-theme', resolved);
  }

  const loadUiSettings = async () => {
    const savedFont = await window.electronAPI.getSetting(UI_SETTING_KEYS.fontFamily);
    const next = savedFont && savedFont.trim() ? savedFont : DEFAULT_UI_FONT_STACK;
    setUiFontFamily(next);
    applyUiFontFamily(next);

    const savedTheme = await window.electronAPI.getSetting(UI_SETTING_KEYS.themeMode);
    const nextTheme: ThemeMode =
      savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
        ? savedTheme
        : 'system';
    setUiThemeMode(nextTheme);
    applyUiThemeMode(nextTheme);
  }

  useEffect(() => {
    applyUiFontFamily(uiFontFamily);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiFontFamily]);

  useEffect(() => {
    applyUiThemeMode(uiThemeMode);
  }, [uiThemeMode]);

  const handleSaveSettings = async () => {
    let baseToSave = '';
    baseToSave = getVendorBaseUrl(providerVendor);
    await window.electronAPI.saveSetting(AI_SETTING_KEYS.apiKey, apiKey);
    await window.electronAPI.saveSetting(AI_SETTING_KEYS.providerVendor, providerVendor);
    await window.electronAPI.saveSetting(AI_SETTING_KEYS.openaiBaseUrl, baseToSave);
    await window.electronAPI.saveSetting(AI_SETTING_KEYS.openaiModel, providerModel.trim());
    await window.electronAPI.saveSetting(AI_SETTING_KEYS.openaiApiVersion, providerApiVersion.trim());
    await window.electronAPI.saveSetting(UI_SETTING_KEYS.fontFamily, uiFontFamily);
    await window.electronAPI.saveSetting(UI_SETTING_KEYS.themeMode, uiThemeMode);
    applyUiFontFamily(uiFontFamily);
    setShowSettings(false);
  }

  return {
    showSettings,
    setShowSettings,
    settingsTab,
    setSettingsTab,
    apiKey,
    setApiKey,
    showApiKeyPlain,
    setShowApiKeyPlain,
    providerVendor,
    setProviderVendor,
    providerModel,
    setProviderModel,
    providerApiVersion,
    setProviderApiVersion,
    uiFontFamily,
    setUiFontFamily,
    uiThemeMode,
    setUiThemeMode,
    loadAiSettings,
    loadUiSettings,
    handleSaveSettings
  };
};
