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
import { stringify } from 'yaml';

import type {
  LoreEntry,
  ManuscriptDocumentEntry,
  ManuscriptDocumentKind,
  ProjectDirectoryIndex,
} from '../../../shared/contracts/project-layout';
import { PROJECT_INDEX_NAME } from '../../../shared/contracts/project-layout';
import { contentRevision, isPathInside } from './document-utils';
import { loadProjectLayout, type LoadedProjectLayout } from './layout-service';
import { MAX_PROJECT_METADATA_BYTES } from './metadata-parser';

interface LocatedDirectory {
  directoryPath: string;
  index: ProjectDirectoryIndex;
  indexPath: string;
}

interface LocatedDocument extends LocatedDirectory {
  entry: LoreEntry | ManuscriptDocumentEntry;
  filePath: string;
}

interface CreateDocumentRequest {
  documentId: string;
  kind: ManuscriptDocumentKind | 'entry';
  markdown: string;
  parentId: string;
  title: string;
}

interface DeleteDocumentRequest {
  baseRevision: string;
  documentId: string;
}

export interface StructuredDirectoryDescriptor {
  kind: ProjectDirectoryIndex['kind'];
  title: string;
}

export interface StructuredDocumentDescriptor {
  markdown: string;
  revision: string;
  title: string;
}

const mutationQueues = new Map<string, Promise<void>>();

const enqueueMutation = async <T>(
  projectPath: string,
  operation: () => Promise<T>,
): Promise<T> => {
  const previous = mutationQueues.get(projectPath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tail = current.then(() => undefined, () => undefined);
  mutationQueues.set(projectPath, tail);
  try {
    return await current;
  } finally {
    if (mutationQueues.get(projectPath) === tail) mutationQueues.delete(projectPath);
  }
};

const locateDirectory = (
  projectPath: string,
  layout: LoadedProjectLayout,
  directoryId: string,
): LocatedDirectory | null => {
  if (layout.manuscript.index.id === directoryId) {
    const directoryPath = path.join(projectPath, 'manuscript');
    return {
      directoryPath,
      index: layout.manuscript.index,
      indexPath: path.join(directoryPath, PROJECT_INDEX_NAME),
    };
  }
  for (const volume of layout.manuscript.volumes) {
    if (volume.index.id === directoryId) {
      const directoryPath = path.join(projectPath, 'manuscript', volume.directory);
      return {
        directoryPath,
        index: volume.index,
        indexPath: path.join(directoryPath, PROJECT_INDEX_NAME),
      };
    }
  }
  if (layout.lore?.index.id === directoryId) {
    const directoryPath = path.join(projectPath, 'lore');
    return {
      directoryPath,
      index: layout.lore.index,
      indexPath: path.join(directoryPath, PROJECT_INDEX_NAME),
    };
  }
  for (const category of layout.lore?.categories ?? []) {
    if (category.index.id === directoryId) {
      const directoryPath = path.join(projectPath, 'lore', category.directory);
      return {
        directoryPath,
        index: category.index,
        indexPath: path.join(directoryPath, PROJECT_INDEX_NAME),
      };
    }
  }
  return null;
};

const locateDocument = (
  projectPath: string,
  layout: LoadedProjectLayout,
  documentId: string,
): LocatedDocument | null => {
  const directories = [
    locateDirectory(projectPath, layout, layout.manuscript.index.id),
    ...layout.manuscript.volumes.map(({ index }) =>
      locateDirectory(projectPath, layout, index.id),
    ),
    ...(layout.lore === null
      ? []
      : [
          locateDirectory(projectPath, layout, layout.lore.index.id),
          ...layout.lore.categories.map(({ index }) =>
            locateDirectory(projectPath, layout, index.id),
          ),
        ]),
  ];
  for (const directory of directories) {
    if (directory === null) continue;
    const entry = directory.index.children.find(
      (child): child is LoreEntry | ManuscriptDocumentEntry =>
        'id' in child && child.id === documentId,
    );
    if (entry !== undefined) {
      return {
        ...directory,
        entry,
        filePath: path.join(directory.directoryPath, entry.file),
      };
    }
  }
  return null;
};

const assertRegularContainedFile = async (
  projectPath: string,
  filePath: string,
): Promise<void> => {
  if (!isPathInside(projectPath, filePath)) throw new Error('Document path escapes project');
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Project document is not a regular file');
  }
  const canonicalFile = await realpath(filePath);
  if (!isPathInside(projectPath, canonicalFile)) {
    throw new Error('Document path escapes project');
  }
};

const serializeIndex = (index: ProjectDirectoryIndex): string => {
  const source = stringify(index);
  if (Buffer.byteLength(source, 'utf8') > MAX_PROJECT_METADATA_BYTES) {
    throw new Error('Project metadata file is too large');
  }
  return source;
};

const replaceIndex = async (indexPath: string, source: string): Promise<void> => {
  const stats = await lstat(indexPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error('Project metadata is not a regular file');
  }
  const temporaryPath = path.join(
    path.dirname(indexPath),
    `.${PROJECT_INDEX_NAME}.driftfield-${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, source, { encoding: 'utf8', mode: stats.mode });
    await rename(temporaryPath, indexPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
};

export const getStructuredDirectoryDescriptor = async (
  directoryPath: string,
  directoryId: string,
): Promise<StructuredDirectoryDescriptor | null> => {
  const projectPath = await realpath(directoryPath);
  const layout = await loadProjectLayout(projectPath);
  const located = locateDirectory(projectPath, layout, directoryId);
  return located === null
    ? null
    : { kind: located.index.kind, title: located.index.title };
};

export const getStructuredDocumentDescriptor = async (
  directoryPath: string,
  documentId: string,
): Promise<StructuredDocumentDescriptor | null> => {
  const projectPath = await realpath(directoryPath);
  const layout = await loadProjectLayout(projectPath);
  const located = locateDocument(projectPath, layout, documentId);
  if (located === null) return null;
  await assertRegularContainedFile(projectPath, located.filePath);
  const markdown = await readFile(located.filePath);
  return {
    markdown: markdown.toString('utf8'),
    revision: contentRevision(markdown),
    title: located.entry.title,
  };
};

export const createStructuredProjectDocument = async (
  directoryPath: string,
  request: CreateDocumentRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const parent = locateDirectory(projectPath, layout, request.parentId);
    if (parent === null) throw new Error('Project directory was not found');
    const isLore = parent.index.kind === 'lore' || parent.index.kind === 'category';
    if ((isLore && request.kind !== 'entry') || (!isLore && request.kind === 'entry')) {
      throw new Error('Document kind is invalid for its parent');
    }
    const filename = `${request.documentId}.md`;
    const documentPath = path.join(parent.directoryPath, filename);
    if (!isPathInside(projectPath, documentPath)) throw new Error('Document path escapes project');
    const entry: LoreEntry | ManuscriptDocumentEntry = isLore
      ? { file: filename, id: request.documentId, kind: 'entry', title: request.title }
      : {
          file: filename,
          id: request.documentId,
          kind: request.kind as ManuscriptDocumentKind,
          title: request.title,
        };
    const nextIndex = {
      ...parent.index,
      children: [...parent.index.children, entry],
    } as ProjectDirectoryIndex;
    await writeFile(documentPath, request.markdown, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    try {
      await replaceIndex(parent.indexPath, serializeIndex(nextIndex));
    } catch (error) {
      await unlink(documentPath).catch(() => undefined);
      throw error;
    }
  });
};

export const deleteStructuredProjectDocument = async (
  directoryPath: string,
  request: DeleteDocumentRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const located = locateDocument(projectPath, layout, request.documentId);
    if (located === null) throw new Error('Project document was not found');
    await assertRegularContainedFile(projectPath, located.filePath);
    const markdown = await readFile(located.filePath);
    if (contentRevision(markdown) !== request.baseRevision) {
      throw new Error('Project document revision changed');
    }
    const previousIndexSource = await readFile(located.indexPath, 'utf8');
    const nextIndex = {
      ...located.index,
      children: located.index.children.filter(
        (child) => !('id' in child) || child.id !== request.documentId,
      ),
    } as ProjectDirectoryIndex;
    await replaceIndex(located.indexPath, serializeIndex(nextIndex));
    try {
      await unlink(located.filePath);
    } catch (error) {
      await replaceIndex(located.indexPath, previousIndexSource).catch(() => undefined);
      throw error;
    }
  });
};
