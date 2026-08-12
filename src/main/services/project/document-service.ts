import { randomUUID } from 'node:crypto';
import {
  lstat,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  SaveProjectDocumentRequest,
  SaveProjectDocumentResult,
} from '../../../shared/contracts/project';
import { DRIFTFIELD_PROJECT_FORMAT_VERSION } from '../../../shared/contracts/project-layout';
import { ProjectCatalogRepository } from '../../database/project-catalog-repository';
import { ProjectDatabase } from '../../database/project-database';
import {
  contentRevision,
  isPathInside,
  readProjectDocument,
  supportedDocumentExtensions,
} from './document-utils';
import { assertValidManuscriptMarkdown } from './manuscript-markdown-validator';
import { ProjectMutationCoordinator } from './project-mutation-coordinator';

const saveQueues = new Map<string, Promise<void>>();

const enqueueSave = async <T>(
  documentPath: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = saveQueues.get(documentPath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const queueTail = current.then(
    () => undefined,
    () => undefined,
  );
  saveQueues.set(documentPath, queueTail);
  try {
    return await current;
  } finally {
    if (saveQueues.get(documentPath) === queueTail) {
      saveQueues.delete(documentPath);
    }
  }
};

export const saveProjectDocument = async (
  projectPath: string,
  request: SaveProjectDocumentRequest,
  relativeDocumentPath: string,
): Promise<SaveProjectDocumentResult> => {
  assertValidManuscriptMarkdown(request.markdown);
  const canonicalProjectPath = await realpath(projectPath);
  const documentPath = path.resolve(canonicalProjectPath, relativeDocumentPath);
  const extension = path.extname(documentPath).toLowerCase();
  if (
    !isPathInside(canonicalProjectPath, documentPath) ||
    !supportedDocumentExtensions.has(extension)
  ) {
    throw new Error('Project document path escapes the project');
  }

  return enqueueSave(documentPath, async () => {
    let documentStats;
    try {
      documentStats = await lstat(documentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { status: 'missing' };
      }
      throw error;
    }
    if (!documentStats.isFile() || documentStats.isSymbolicLink()) {
      throw new Error('Project document is not a regular file');
    }
    const canonicalPath = await realpath(documentPath);
    if (!isPathInside(canonicalProjectPath, canonicalPath)) {
      throw new Error('Project document path escapes the project');
    }

    const diskDocument = await readProjectDocument(
      canonicalProjectPath,
      relativeDocumentPath,
      request.documentId,
    );
    if (
      !request.overwrite &&
      diskDocument.revision !== request.expectedRevision
    ) {
      return { diskDocument, status: 'conflict' };
    }

    const newRevision = contentRevision(request.markdown);
    const normalizedRelativeDocumentPath = relativeDocumentPath
      .split(path.sep)
      .join('/');
    const replaceDocument = async (markdown: string): Promise<void> => {
      const temporaryPath = path.join(
        path.dirname(documentPath),
        `.${path.basename(documentPath)}.driftfield-${process.pid}-${randomUUID()}.tmp`,
      );
      try {
        await writeFile(temporaryPath, markdown, {
          encoding: 'utf8',
          mode: documentStats.mode,
        });
        await rename(temporaryPath, documentPath);
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
    };

    const databasePath = path.join(canonicalProjectPath, '.driftfield', 'project.sqlite');
    let databaseStats;
    try {
      databaseStats = await lstat(databasePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (databaseStats?.isFile() && !databaseStats.isSymbolicLink()) {
      const database = new ProjectDatabase(canonicalProjectPath);
      let baseProjectRevision: number | null = null;
      try {
        const metadata = database.getProjectMetadata();
        const catalog = new ProjectCatalogRepository(database);
        const node = catalog.get(request.documentId);
        if (
          metadata?.formatVersion === DRIFTFIELD_PROJECT_FORMAT_VERSION &&
          node?.type === 'document' &&
          path.resolve(canonicalProjectPath, node.relativePath) === documentPath
        ) {
          baseProjectRevision = catalog.getRevision();
        }
      } finally {
        database.close();
      }
      if (baseProjectRevision !== null) {
        await new ProjectMutationCoordinator(canonicalProjectPath).execute({
          applyDatabase: () => {
            const catalogDatabase = new ProjectDatabase(canonicalProjectPath);
            try {
              new ProjectCatalogRepository(catalogDatabase).updateDocumentRevision(
                request.documentId,
                newRevision,
              );
            } finally {
              catalogDatabase.close();
            }
          },
          applyFilesystem: () => replaceDocument(request.markdown),
          baseProjectRevision,
          files: [{
            newRelativePath: normalizedRelativeDocumentPath,
            newRevision,
            oldRelativePath: normalizedRelativeDocumentPath,
            oldRevision: diskDocument.revision,
          }],
          operationKind: 'save-document',
          payload: { documentId: request.documentId },
          rollbackFilesystem: () => replaceDocument(diskDocument.markdown),
        });
        return { revision: newRevision, status: 'saved' };
      }
    }

    await replaceDocument(request.markdown);
    return { revision: newRevision, status: 'saved' };
  });
};
