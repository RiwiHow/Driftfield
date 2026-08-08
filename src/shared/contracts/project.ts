export interface ProjectDirectory {
  name: string;
  path: string;
}

export interface ProjectDocument {
  id: string;
  markdown: string;
  name: string;
  relativePath: string;
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
  tree: ProjectTreeNode[];
}

export type SelectProjectDirectoryResult = ProjectSnapshot | null;
