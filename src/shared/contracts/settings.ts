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

export type ProjectAgentSettings = AgentSettings;

export interface AppSettings {
  closeWindowBehavior: CloseWindowBehavior;
  editorFontSize: number;
  lastProjectDirectoryPath: string | null;
  language: AppLanguage;
  theme: AppTheme;
  version: 1;
}

export type UpdateAppSettingsRequest = Partial<
  Pick<
    AppSettings,
    'closeWindowBehavior' | 'editorFontSize' | 'language' | 'theme'
  >
>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  lastProjectDirectoryPath: null,
  language: 'en',
  theme: 'github-light',
  version: 1,
};

export const DEFAULT_PROJECT_AGENT_SETTINGS: ProjectAgentSettings = {
  defaultModel: null,
  thinkingLevel: 'medium',
};

export interface UpdateProjectAgentSettingsRequest {
  defaultModel: AgentModelSelection | null;
  thinkingLevel: AgentThinkingLevel;
}
