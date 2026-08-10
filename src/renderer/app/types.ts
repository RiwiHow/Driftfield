export interface WorkspaceDocument {
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
