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
import type {
  ChapterNumberingPolicy,
  ManuscriptDocumentEntry,
} from '../../shared/contracts/project-layout';
import {
  loadProjectLayout,
  type LoadedProjectLayout,
} from './project-layout-service';

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
  id = relativePath,
  name = path.basename(relativePath, path.extname(relativePath)),
): Promise<ProjectDocument> => {
  const absolutePath = path.resolve(projectPath, relativePath);
  const fileBuffer = await readFile(absolutePath);

  return {
    id,
    markdown: fileBuffer.toString('utf8'),
    name,
    relativePath,
    revision: contentRevision(fileBuffer),
  };
};

interface ManuscriptLabelContext {
  number?: number;
  volumeNumber?: number;
  volumeTitle?: string;
}

const formatManuscriptLabel = (
  entry: ManuscriptDocumentEntry,
  policy: ChapterNumberingPolicy | undefined,
  context: ManuscriptLabelContext,
): string => {
  if (entry.kind !== 'chapter' || policy?.mode === 'none' || policy === undefined) {
    return entry.label ?? entry.title;
  }
  if (policy.mode === 'manual') return entry.label ?? entry.title;
  const number = context.number;
  if (number === undefined) return entry.title;
  const fields: Record<string, string> = {
    kind: entry.kind,
    number: String(number),
    title: entry.title,
    volumeNumber:
      context.volumeNumber === undefined ? '' : String(context.volumeNumber),
    volumeTitle: context.volumeTitle ?? '',
  };
  return (policy.format ?? '{number}. {title}').replace(
    /\{(kind|number|title|volumeNumber|volumeTitle)\}/gu,
    (_match, field: string) => fields[field] ?? '',
  );
};

const readStructuredDocument = async (
  projectPath: string,
  relativeDirectory: string,
  entry: ManuscriptDocumentEntry,
  displayName: string,
  state: ProjectScanState,
): Promise<{ document: ProjectDocument; node: ProjectTreeNode }> => {
  if (state.documents.length >= MAX_PROJECT_DOCUMENTS) {
    throw new Error('Project contains too many Markdown documents');
  }
  const relativePath = path.join(relativeDirectory, entry.file);
  const absolutePath = path.join(projectPath, relativePath);
  const fileStats = await stat(absolutePath);
  if (state.bytes + fileStats.size > MAX_PROJECT_BYTES) {
    throw new Error('Project Markdown documents are too large');
  }
  const document = await readProjectDocument(
    projectPath,
    relativePath,
    entry.id,
    displayName,
  );
  state.bytes += fileStats.size;
  state.documents.push(document);
  return {
    document,
    node: {
      documentId: document.id,
      name: displayName,
      relativePath,
      type: 'file',
    },
  };
};

const scanStructuredManuscript = async (
  projectPath: string,
  layout: LoadedProjectLayout,
  state: ProjectScanState,
): Promise<ProjectTreeNode[]> => {
  const manuscriptDirectory = 'manuscript';
  const nodes: ProjectTreeNode[] = [];
  const volumes = new Map(
    layout.manuscript.volumes.map((volume) => [volume.directory, volume]),
  );
  let continuousNumber = 0;
  let directNumber = 0;
  let volumeNumber = 0;

  for (const child of layout.manuscript.index.children) {
    if (child.kind !== 'volume') {
      const policy = layout.manuscript.index.chapterNumbering;
      let number: number | undefined;
      if (child.kind === 'chapter' && policy?.mode === 'continuous') {
        number = ++continuousNumber;
      } else if (child.kind === 'chapter' && policy?.mode === 'per-volume') {
        number = ++directNumber;
      }
      const { node } = await readStructuredDocument(
        projectPath,
        manuscriptDirectory,
        child,
        formatManuscriptLabel(child, policy, { number }),
        state,
      );
      nodes.push(node);
      continue;
    }

    volumeNumber += 1;
    const volume = volumes.get(child.directory);
    if (volume === undefined) throw new Error('Volume index was not loaded');
    const policy =
      volume.index.chapterNumbering ?? layout.manuscript.index.chapterNumbering;
    let localNumber = 0;
    const children: ProjectTreeNode[] = [];
    for (const documentEntry of volume.index.children) {
      let number: number | undefined;
      if (documentEntry.kind === 'chapter' && policy?.mode === 'continuous') {
        number = ++continuousNumber;
      } else if (
        documentEntry.kind === 'chapter' &&
        policy?.mode === 'per-volume'
      ) {
        number = ++localNumber;
      }
      const relativeDirectory = path.join(manuscriptDirectory, child.directory);
      const { node } = await readStructuredDocument(
        projectPath,
        relativeDirectory,
        documentEntry,
        formatManuscriptLabel(documentEntry, policy, {
          number,
          volumeNumber,
          volumeTitle: volume.index.title,
        }),
        state,
      );
      children.push(node);
    }
    nodes.push({
      children,
      name: volume.index.title,
      relativePath: path.join(manuscriptDirectory, child.directory),
      type: 'folder',
    });
  }
  return nodes;
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
  loadedLayout?: LoadedProjectLayout | null,
): Promise<ProjectSnapshot> => {
  const state: ProjectScanState = { bytes: 0, documents: [], entries: 0 };
  const layout = loadedLayout ?? (await loadProjectLayout(directoryPath));
  const tree =
    layout === null
      ? await scanProjectDirectory(directoryPath, '', state)
      : await scanStructuredManuscript(directoryPath, layout, state);
  let lorebookRevisions: string[] = [];
  const lorebookEntries = layout?.lorebook?.entries ?? [];
  if (layout !== null && lorebookEntries.length > 0) {
    if (
      state.documents.length + lorebookEntries.length >
      MAX_PROJECT_DOCUMENTS
    ) {
      throw new Error('Project contains too many Markdown documents');
    }
    const lorebookContents = await Promise.all(
      lorebookEntries.map(async (entry) => ({
        content: await readFile(path.join(directoryPath, entry.relativePath)),
        entry,
      })),
    );
    const lorebookBytes = lorebookContents.reduce(
      (total, { content }) => total + content.byteLength,
      0,
    );
    if (state.bytes + lorebookBytes > MAX_PROJECT_BYTES) {
      throw new Error('Project Markdown documents are too large');
    }
    state.bytes += lorebookBytes;
    lorebookRevisions = lorebookContents.map(
      ({ content, entry }) =>
        `${entry.id}:${entry.relativePath}:${contentRevision(content)}`,
    );
  }
  return {
    directory: {
      name:
        layout?.manifest.title ??
        (path.basename(directoryPath) || directoryPath),
      path: directoryPath,
    },
    documents: state.documents,
    projectId:
      layout?.manifest.id ??
      `legacy-${createHash('sha256').update(await realpath(directoryPath)).digest('hex')}`,
    revision: contentRevision(
      [
        ...(layout?.metadataSources ?? []),
        ...lorebookRevisions,
        ...state.documents.map(
          (document) => `${document.id}:${document.relativePath}:${document.revision}`,
        ),
      ].join('\n'),
    ),
    ...(layout === null
      ? {}
      : {
          rootTitles: {
            ...(layout.lorebook === null
              ? {}
              : { lorebook: layout.lorebook.index.title }),
            manuscript: layout.manuscript.index.title,
          },
        }),
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
  relativeDocumentPath = request.documentId,
): Promise<SaveProjectDocumentResult> => {
  const canonicalProjectPath = await realpath(projectPath);
  const documentPath = path.resolve(canonicalProjectPath, relativeDocumentPath);
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

    const diskDocument = await readProjectDocument(
      canonicalProjectPath,
      relativeDocumentPath,
      request.documentId,
    );
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
