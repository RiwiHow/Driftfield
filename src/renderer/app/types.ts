export type ThemeName = 'github-light' | 'one-dark' | 'tokyo-night';

export interface Chapter {
  id: string;
  order: number;
  title: string;
  markdown: string;
  previousMarkdown: string;
}
