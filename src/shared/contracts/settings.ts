export const APP_THEMES = [
  'github-light',
  'tokyo-night',
  'one-dark',
] as const;

export type AppTheme = (typeof APP_THEMES)[number];
export type CloseWindowBehavior = 'minimize' | 'quit';

export interface AppSettings {
  closeWindowBehavior: CloseWindowBehavior;
  editorFontSize: number;
  theme: AppTheme;
}

export type UpdateAppSettingsRequest = Partial<AppSettings>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  theme: 'github-light',
};
