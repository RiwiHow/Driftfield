export interface ProjectDirectory {
  name: string;
  path: string;
}

export interface ProjectDocument {
  id: string;
  markdown: string;
  name: string;
  relativePath: string;
  revision: string;
}

export interface ProjectFileNode {
  documentId: string;
  name: string;
  relativePath: string;
  type: 'file';
}

export interface ProjectFolderNode {
  children: ProjectTreeNode[];
  name: string;
  relativePath: string;
  type: 'folder';
}

export type ProjectTreeNode = ProjectFileNode | ProjectFolderNode;

export interface ProjectSnapshot {
  directory: ProjectDirectory;
  documents: ProjectDocument[];
  revision: string;
  rootTitles?: {
    lorebook?: string;
    manuscript: string;
  };
  tree: ProjectTreeNode[];
}

export type ProjectWatcherStatus =
  | { status: 'healthy' }
  | {
      code: 'refresh-failed' | 'start-failed' | 'stopped';
      status: 'error';
    };

export interface SaveProjectDocumentRequest {
  documentId: string;
  expectedRevision: string;
  markdown: string;
  overwrite?: boolean;
}

export type SaveProjectDocumentResult =
  | { revision: string; status: 'saved' }
  | { diskDocument: ProjectDocument; status: 'conflict' }
  | { status: 'missing' };

export type CloseUnsavedDocumentDecision = 'cancel' | 'discard' | 'save';

export type SelectProjectDirectoryResult = ProjectSnapshot | null;
