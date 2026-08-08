import type { AppTheme } from '../../shared/contracts/settings';

export type ThemeName = AppTheme;

export interface Chapter {
  id: string;
  isDirty: boolean;
  order: number;
  relativePath: string;
  title: string;
  markdown: string;
  previousMarkdown: string;
  sourceRevision: number;
}
