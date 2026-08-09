import type { AppLanguage } from '../i18n/languages';
import { APP_THEMES, type AppTheme } from '../theme-contract';

export { APP_THEMES, type AppTheme } from '../theme-contract';
export type CloseWindowBehavior = 'minimize' | 'quit';

export const AGENT_THINKING_LEVELS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export type AgentThinkingLevel = (typeof AGENT_THINKING_LEVELS)[number];

export interface AgentModelSelection {
  modelId: string;
  providerId: string;
}

export interface AgentSettings {
  defaultModel: AgentModelSelection | null;
  thinkingLevel: AgentThinkingLevel;
}

export interface AppSettings {
  agent: AgentSettings;
  closeWindowBehavior: CloseWindowBehavior;
  editorFontSize: number;
  language: AppLanguage;
  theme: AppTheme;
  version: 3;
}

export type UpdateAppSettingsRequest = Partial<Omit<AppSettings, 'version'>>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  agent: {
    defaultModel: null,
    thinkingLevel: 'medium',
  },
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  language: 'en',
  theme: 'github-light',
  version: 3,
};
