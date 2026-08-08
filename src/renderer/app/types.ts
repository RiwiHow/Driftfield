import type { AppTheme } from '../../shared/contracts/settings';

export type ThemeName = AppTheme;

export interface Chapter {
  backingFileStatus: 'available' | 'missing';
  id: string;
  isDirty: boolean;
  order: number;
  relativePath: string;
  title: string;
  markdown: string;
  previousMarkdown: string;
  revision: string;
  sourceRevision: number;
}
