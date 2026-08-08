export type ThemeName = 'github-light' | 'one-dark' | 'tokyo-night';

export interface Chapter {
  id: string;
  isDirty: boolean;
  order: number;
  relativePath: string;
  title: string;
  markdown: string;
  previousMarkdown: string;
}
