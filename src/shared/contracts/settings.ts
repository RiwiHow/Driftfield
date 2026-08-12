import type { AppLanguage } from '../i18n/languages';
import type { AppThemePreference } from '../theme-contract';

export {
  APP_THEMES,
  APP_THEME_PREFERENCES,
  type AppTheme,
  type AppThemePreference,
} from '../theme-contract';
export type CloseWindowBehavior = 'minimize' | 'quit';

export const APP_ZOOM_PERCENTS = [
  80,
  90,
  100,
  110,
  125,
  150,
  175,
  200,
] as const;
export type AppZoomPercent = (typeof APP_ZOOM_PERCENTS)[number];

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

export interface ProjectAgentSettings extends AgentSettings {
  useGlobal: boolean;
}

export interface AppSettings {
  agent: AgentSettings;
  closeWindowBehavior: CloseWindowBehavior;
  editorFontSize: number;
  lastProjectDirectoryPath: string | null;
  language: AppLanguage;
  theme: AppThemePreference;
  zoomPercent: AppZoomPercent;
  version: 3;
}

export type UpdateAppSettingsRequest = Partial<
  Pick<
    AppSettings,
    | 'agent'
    | 'closeWindowBehavior'
    | 'editorFontSize'
    | 'language'
    | 'theme'
    | 'zoomPercent'
  >
>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  agent: {
    defaultModel: null,
    thinkingLevel: 'medium',
  },
  closeWindowBehavior: 'quit',
  editorFontSize: 17,
  lastProjectDirectoryPath: null,
  language: 'en',
  theme: 'github-light',
  zoomPercent: 100,
  version: 3,
};

export const DEFAULT_PROJECT_AGENT_SETTINGS: ProjectAgentSettings = {
  defaultModel: null,
  thinkingLevel: 'medium',
  useGlobal: true,
};

export type UpdateProjectAgentSettingsRequest = ProjectAgentSettings;

export const resolveProjectAgentSettings = (
  project: ProjectAgentSettings,
  global: AgentSettings,
): AgentSettings => project.useGlobal ? global : project;
