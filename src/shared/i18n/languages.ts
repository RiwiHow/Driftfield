export const APP_LANGUAGES = ['en', 'zh-CN'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

export const APP_LANGUAGE_OPTIONS: ReadonlyArray<{
  id: AppLanguage;
  label: string;
}> = [
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
];

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' &&
  APP_LANGUAGES.includes(value as AppLanguage);
