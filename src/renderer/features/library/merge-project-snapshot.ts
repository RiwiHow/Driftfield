import type { Chapter } from '@/app/types';
import type { ProjectSnapshot } from '../../../shared/contracts/project';

export const mergeProjectSnapshot = (
  current: Chapter[],
  project: ProjectSnapshot,
  preserveDirtyDocuments: boolean,
  sourceRevision: number,
): Chapter[] => {
  const currentById = new Map(current.map((chapter) => [chapter.id, chapter]));
  const next = project.documents.map((document, index): Chapter => {
    const existing = currentById.get(document.id);

    if (preserveDirtyDocuments && existing?.isDirty) {
      return {
        ...existing,
        backingFileStatus: 'available',
        order: index + 1,
        relativePath: document.relativePath,
        title: document.name,
      };
    }

    if (preserveDirtyDocuments && existing?.markdown === document.markdown) {
      return {
        ...existing,
        backingFileStatus: 'available',
        order: index + 1,
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
      order: index + 1,
      previousMarkdown: document.markdown,
      relativePath: document.relativePath,
      revision: document.revision,
      sourceRevision,
      title: document.name,
    };
  });

  if (preserveDirtyDocuments) {
    const diskIds = new Set(project.documents.map((document) => document.id));
    for (const chapter of current) {
      if (chapter.isDirty && !diskIds.has(chapter.id)) {
        next.push({
          ...chapter,
          backingFileStatus: 'missing',
          order: next.length + 1,
        });
      }
    }
  }

  return next;
};
