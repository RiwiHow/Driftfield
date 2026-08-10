export interface WorkspaceDocument {
  backingFileStatus: 'available' | 'missing';
  id: string;
  isDirty: boolean;
  relativePath: string;
  title: string;
  markdown: string;
  previousMarkdown: string;
  revision: string;
  sourceRevision: number;
}
