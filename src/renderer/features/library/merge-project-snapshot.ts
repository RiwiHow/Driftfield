import type { WorkspaceDocument } from '@/app/types';
import type { ProjectSnapshot } from '../../../shared/contracts/project';

export const mergeProjectSnapshot = (
  current: WorkspaceDocument[],
  project: ProjectSnapshot,
  preserveDirtyDocuments: boolean,
  sourceRevision: number,
): WorkspaceDocument[] => {
  const currentById = new Map(current.map((document) => [document.id, document]));
  const next = project.documents.map((document): WorkspaceDocument => {
    const existing = currentById.get(document.id);

    if (preserveDirtyDocuments && existing?.isDirty) {
      return {
        ...existing,
        backingFileStatus: 'available',
        relativePath: document.relativePath,
        title: document.name,
      };
    }

    if (preserveDirtyDocuments && existing?.markdown === document.markdown) {
      return {
        ...existing,
        backingFileStatus: 'available',
        previousMarkdown: document.markdown,
        relativePath: document.relativePath,
        revision: document.revision,
        title: document.name,
      };
    }

    return {
      backingFileStatus: 'available',
      id: document.id,
      isDirty: false,
      markdown: document.markdown,
      previousMarkdown: document.markdown,
      relativePath: document.relativePath,
      revision: document.revision,
      sourceRevision,
      title: document.name,
    };
  });

  if (preserveDirtyDocuments) {
    const diskIds = new Set(project.documents.map((document) => document.id));
    for (const document of current) {
      if (document.isDirty && !diskIds.has(document.id)) {
        next.push({
          ...document,
          backingFileStatus: 'missing',
        });
      }
    }
  }

  return next;
};
