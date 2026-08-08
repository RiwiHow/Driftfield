import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectDocument,
  ProjectSnapshot,
  ProjectTreeNode,
  SaveProjectDocumentRequest,
  SaveProjectDocumentResult,
} from '../../shared/contracts/project';

export const supportedDocumentExtensions = new Set(['.md', '.markdown']);
const ignoredDirectoryNames = new Set(['.git', 'node_modules']);
export const MAX_PROJECT_DOCUMENTS = 500;
export const MAX_PROJECT_BYTES = 10 * 1024 * 1024;
const MAX_SCANNED_ENTRIES = 10_000;

interface ProjectScanState {
  bytes: number;
  documents: ProjectDocument[];
  entries: number;
}

export const contentRevision = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

export const isPathInside = (parentPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(parentPath, candidatePath);
  return (
    relativePath !== '' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== '..' &&
    !path.isAbsolute(relativePath)
  );
};

const readProjectDocument = async (
  projectPath: string,
  relativePath: string,
): Promise<ProjectDocument> => {
  const absolutePath = path.resolve(projectPath, relativePath);
  const fileBuffer = await readFile(absolutePath);
  const extension = path.extname(relativePath).toLowerCase();

  return {
    id: relativePath,
    markdown: fileBuffer.toString('utf8'),
    name: path.basename(relativePath, extension),
    relativePath,
    revision: contentRevision(fileBuffer),
  };
};

const scanProjectDirectory = async (
  projectPath: string,
  relativeDirectory: string,
  state: ProjectScanState,
): Promise<ProjectTreeNode[]> => {
  const absoluteDirectory = path.join(projectPath, relativeDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const nodes: ProjectTreeNode[] = [];

  entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );

  for (const entry of entries) {
    state.entries += 1;
    if (state.entries > MAX_SCANNED_ENTRIES) {
      throw new Error('Project directory contains too many entries');
    }
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;

    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectoryNames.has(entry.name)) continue;
      const children = await scanProjectDirectory(projectPath, relativePath, state);
      if (children.length > 0) {
        nodes.push({ children, name: entry.name, relativePath, type: 'folder' });
      }
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!supportedDocumentExtensions.has(extension)) continue;
    if (state.documents.length >= MAX_PROJECT_DOCUMENTS) {
      throw new Error('Project contains too many Markdown documents');
    }

    const absolutePath = path.join(projectPath, relativePath);
    const fileStats = await stat(absolutePath);
    if (state.bytes + fileStats.size > MAX_PROJECT_BYTES) {
      throw new Error('Project Markdown documents are too large');
    }

    const document = await readProjectDocument(projectPath, relativePath);
    state.bytes += fileStats.size;
    state.documents.push(document);
    nodes.push({
      documentId: document.id,
      name: document.name,
      relativePath,
      type: 'file',
    });
  }

  return nodes;
};

export const createProjectSnapshot = async (
  directoryPath: string,
): Promise<ProjectSnapshot> => {
  const state: ProjectScanState = { bytes: 0, documents: [], entries: 0 };
  const tree = await scanProjectDirectory(directoryPath, '', state);
  return {
    directory: {
      name: path.basename(directoryPath) || directoryPath,
      path: directoryPath,
    },
    documents: state.documents,
    revision: contentRevision(
      state.documents.map((document) => `${document.id}:${document.revision}`).join('\n'),
    ),
    tree,
  };
};

const saveQueues = new Map<string, Promise<void>>();

const enqueueSave = async <T>(documentPath: string, operation: () => Promise<T>): Promise<T> => {
  const previous = saveQueues.get(documentPath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const queueTail = current.then(() => undefined, () => undefined);
  saveQueues.set(documentPath, queueTail);
  try {
    return await current;
  } finally {
    if (saveQueues.get(documentPath) === queueTail) saveQueues.delete(documentPath);
  }
};

export const saveProjectDocument = async (
  projectPath: string,
  request: SaveProjectDocumentRequest,
): Promise<SaveProjectDocumentResult> => {
  const canonicalProjectPath = await realpath(projectPath);
  const documentPath = path.resolve(canonicalProjectPath, request.documentId);
  const extension = path.extname(documentPath).toLowerCase();
  if (!isPathInside(canonicalProjectPath, documentPath) || !supportedDocumentExtensions.has(extension)) {
    throw new Error('Project document path escapes the project');
  }

  return enqueueSave(documentPath, async () => {
    let documentStats;
    try {
      documentStats = await lstat(documentPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
      throw error;
    }
    if (!documentStats.isFile() || documentStats.isSymbolicLink()) {
      throw new Error('Project document is not a regular file');
    }
    const canonicalPath = await realpath(documentPath);
    if (!isPathInside(canonicalProjectPath, canonicalPath)) {
      throw new Error('Project document path escapes the project');
    }

    const diskDocument = await readProjectDocument(canonicalProjectPath, request.documentId);
    if (!request.overwrite && diskDocument.revision !== request.expectedRevision) {
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
