import { randomUUID } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectDocument,
  SaveProjectDocumentRequest,
  SaveProjectDocumentResult,
} from '../../../shared/contracts/project';
import {
  contentRevision,
  isPathInside,
  supportedDocumentExtensions,
} from './document-utils';

const readProjectDocument = async (
  projectPath: string,
  relativePath: string,
  id: string,
): Promise<ProjectDocument> => {
  const absolutePath = path.resolve(projectPath, relativePath);
  const fileBuffer = await readFile(absolutePath);
  return {
    id,
    markdown: fileBuffer.toString('utf8'),
    name: path.basename(relativePath, path.extname(relativePath)),
    relativePath,
    revision: contentRevision(fileBuffer),
  };
};

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

    const temporaryPath = path.join(
      path.dirname(documentPath),
      `.${path.basename(documentPath)}.driftfield-${process.pid}-${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, request.markdown, {
        encoding: 'utf8',
        mode: documentStats.mode,
      });
      await rename(temporaryPath, documentPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
    return { revision: contentRevision(request.markdown), status: 'saved' };
  });
};
