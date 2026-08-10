import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'yaml';

import type {
  LoreEntry,
  LoreCategoryIndex,
  LoreIndex,
  ManuscriptDocumentEntry,
  ManuscriptDocumentKind,
  ManuscriptIndex,
  ProjectIconId,
  ProjectDirectoryIndex,
  VolumeIndex,
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

interface CreateDirectoryRequest {
  directoryId: string;
  icon?: ProjectIconId;
  kind: 'volume' | 'category';
  title: string;
}

interface DeleteLoreCategoryRequest {
  directoryId: string;
}

interface MoveDocumentRequest {
  baseRevision: string;
  documentId: string;
  targetParentId: string;
}

export interface StructuredDirectoryDescriptor {
  childCount: number;
  id: string;
  icon?: ProjectIconId;
  kind: ProjectDirectoryIndex['kind'];
  title: string;
}

export interface StructuredDocumentDescriptor {
  kind: ManuscriptDocumentKind | 'entry';
  markdown: string;
  parentId: string;
  parentKind: ProjectDirectoryIndex['kind'];
  parentTitle: string;
  revision: string;
  title: string;
}

const mutationQueues = new Map<string, Promise<void>>();

const MAX_PHYSICAL_NAME_BYTES = 255;
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

const truncateUtf8 = (value: string, maxBytes: number): string => {
  let result = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
};

const readablePhysicalBase = (title: string): string => {
  const sanitized = title
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]+/gu, '-')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '')
    .replace(/-+/gu, '-')
    .trim();
  const base = sanitized.length === 0 ? 'untitled' : sanitized;
  return WINDOWS_RESERVED_NAME.test(base) ? `${base}-document` : base;
};

const chooseReadablePhysicalName = async (
  directoryPath: string,
  title: string,
  extension = '',
): Promise<string> => {
  const existingNames = new Set(
    (await readdir(directoryPath)).map((name) => name.toLowerCase()),
  );
  const readableBase = readablePhysicalBase(title);
  for (let ordinal = 1; ; ordinal += 1) {
    const suffix = ordinal === 1 ? '' : ` (${ordinal})`;
    const maxBaseBytes =
      MAX_PHYSICAL_NAME_BYTES - Buffer.byteLength(suffix + extension, 'utf8');
    const truncatedBase = truncateUtf8(readableBase, maxBaseBytes).replace(
      /[. ]+$/gu,
      '',
    );
    const candidate = `${truncatedBase || 'untitled'}${suffix}${extension}`;
    if (!existingNames.has(candidate.toLowerCase())) return candidate;
  }
};

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
    : {
        childCount: located.index.children.length,
        id: located.index.id,
        ...(located.index.icon === undefined ? {} : { icon: located.index.icon }),
        kind: located.index.kind,
        title: located.index.title,
      };
};

export const getStructuredRootDirectoryDescriptor = async (
  directoryPath: string,
  kind: 'manuscript' | 'lore',
): Promise<StructuredDirectoryDescriptor | null> => {
  const projectPath = await realpath(directoryPath);
  const layout = await loadProjectLayout(projectPath);
  const index = kind === 'manuscript' ? layout.manuscript.index : layout.lore?.index;
  return index === undefined
    ? null
    : {
        childCount: index.children.length,
        id: index.id,
        ...(index.icon === undefined ? {} : { icon: index.icon }),
        kind: index.kind,
        title: index.title,
      };
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
    kind: located.entry.kind,
    markdown: markdown.toString('utf8'),
    parentId: located.index.id,
    parentKind: located.index.kind,
    parentTitle: located.index.title,
    revision: contentRevision(markdown),
    title: located.entry.title,
  };
};

export const createStructuredProjectDirectory = async (
  directoryPath: string,
  request: CreateDirectoryRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const root = request.kind === 'volume'
      ? locateDirectory(projectPath, layout, layout.manuscript.index.id)
      : layout.lore === null
        ? null
        : locateDirectory(projectPath, layout, layout.lore.index.id);
    if (root === null) throw new Error('Project directory root was not found');
    const physicalName = await chooseReadablePhysicalName(
      root.directoryPath,
      request.title,
    );
    const createdPath = path.join(root.directoryPath, physicalName);
    if (!isPathInside(projectPath, createdPath)) {
      throw new Error('Project directory path escapes project');
    }
    const childIndex: VolumeIndex | LoreCategoryIndex = request.kind === 'volume'
      ? { children: [], id: request.directoryId, kind: 'volume', title: request.title }
      : {
          children: [],
          ...(request.icon === undefined ? {} : { icon: request.icon }),
          id: request.directoryId,
          kind: 'category',
          title: request.title,
        };
    const nextRoot = {
      ...root.index,
      children: [
        ...root.index.children,
        request.kind === 'volume'
          ? { directory: physicalName, kind: 'volume' as const }
          : { directory: physicalName, kind: 'category' as const },
      ],
    } as ManuscriptIndex | LoreIndex;
    await mkdir(createdPath, { mode: 0o700 });
    try {
      await writeFile(
        path.join(createdPath, PROJECT_INDEX_NAME),
        serializeIndex(childIndex),
        { encoding: 'utf8', flag: 'wx', mode: 0o600 },
      );
      await replaceIndex(root.indexPath, serializeIndex(nextRoot));
    } catch (error) {
      await rm(createdPath, { force: true, recursive: true }).catch(() => undefined);
      throw error;
    }
  });
};

export const deleteStructuredLoreCategory = async (
  directoryPath: string,
  request: DeleteLoreCategoryRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    if (layout.lore === null) throw new Error('Lore root was not found');
    const category = layout.lore.categories.find(
      ({ index }) => index.id === request.directoryId,
    );
    if (category === undefined) throw new Error('Lore category was not found');
    if (category.index.children.length > 0) {
      throw new Error('Lore category must be empty before deletion');
    }
    const categoryPath = path.join(projectPath, 'lore', category.directory);
    const entries = await readdir(categoryPath);
    if (entries.length !== 1 || entries[0] !== PROJECT_INDEX_NAME) {
      throw new Error('Lore category contains untracked files');
    }
    await assertRegularContainedFile(
      projectPath,
      path.join(categoryPath, PROJECT_INDEX_NAME),
    );
    const root = locateDirectory(projectPath, layout, layout.lore.index.id);
    if (root === null) throw new Error('Lore root was not found');
    const nextRoot: LoreIndex = {
      ...layout.lore.index,
      children: layout.lore.index.children.filter(
        (child) =>
          child.kind !== 'category' || child.directory !== category.directory,
      ),
    };
    const tombstonePath = path.join(
      path.dirname(categoryPath),
      `.driftfield-delete-${randomUUID()}`,
    );
    await rename(categoryPath, tombstonePath);
    try {
      await replaceIndex(root.indexPath, serializeIndex(nextRoot));
    } catch (error) {
      await rename(tombstonePath, categoryPath).catch(() => undefined);
      throw error;
    }
    await rm(tombstonePath, { recursive: true }).catch(() => undefined);
  });
};

export const moveStructuredProjectDocument = async (
  directoryPath: string,
  request: MoveDocumentRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const source = locateDocument(projectPath, layout, request.documentId);
    const target = locateDirectory(projectPath, layout, request.targetParentId);
    if (source === null || target === null) throw new Error('Project item was not found');
    if (source.index.id === target.index.id) throw new Error('Document is already in target');
    const sourceIsLore = source.index.kind === 'lore' || source.index.kind === 'category';
    const targetIsLore = target.index.kind === 'lore' || target.index.kind === 'category';
    if (sourceIsLore !== targetIsLore) throw new Error('Document cannot move across project roots');
    await assertRegularContainedFile(projectPath, source.filePath);
    const markdown = await readFile(source.filePath);
    if (contentRevision(markdown) !== request.baseRevision) {
      throw new Error('Project document revision changed');
    }
    const sourceExtension = path.extname(source.entry.file);
    const extension = sourceExtension.toLowerCase();
    if (extension !== '.md' && extension !== '.markdown') {
      throw new Error('Unsupported project document extension');
    }
    const sourceBase = path.basename(source.entry.file, sourceExtension);
    const targetFilename = await chooseReadablePhysicalName(
      target.directoryPath,
      sourceBase === request.documentId ? source.entry.title : sourceBase,
      extension,
    );
    const targetFilePath = path.join(target.directoryPath, targetFilename);
    if (!isPathInside(projectPath, targetFilePath)) throw new Error('Document path escapes project');
    const movedEntry = { ...source.entry, file: targetFilename };
    const nextSource = {
      ...source.index,
      children: source.index.children.filter(
        (child) => !('id' in child) || child.id !== request.documentId,
      ),
    } as ProjectDirectoryIndex;
    const nextTarget = {
      ...target.index,
      children: [...target.index.children, movedEntry],
    } as ProjectDirectoryIndex;
    const previousSource = await readFile(source.indexPath, 'utf8');
    await writeFile(targetFilePath, markdown, { flag: 'wx', mode: 0o600 });
    try {
      await replaceIndex(source.indexPath, serializeIndex(nextSource));
      try {
        await replaceIndex(target.indexPath, serializeIndex(nextTarget));
      } catch (error) {
        await replaceIndex(source.indexPath, previousSource).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await unlink(targetFilePath).catch(() => undefined);
      throw error;
    }
    await unlink(source.filePath).catch(() => undefined);
  });
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
    const filename = await chooseReadablePhysicalName(
      parent.directoryPath,
      request.title,
      '.md',
    );
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
