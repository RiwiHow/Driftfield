import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

export const I18N_RESOURCES = {
  en,
  'zh-CN': zhCN,
} as const;

export type { AppNamespaces, LocaleShape } from './types';
