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
import type {
  LoreEntry,
  ManuscriptDocumentEntry,
  ManuscriptDocumentKind,
  ProjectIconId,
  ProjectDirectoryIndex,
} from '../../../shared/contracts/project-layout';
import { ProjectCatalogRepository } from '../../database/project-catalog-repository';
import { ProjectDatabase } from '../../database/project-database';
import { contentRevision, isPathInside } from './document-utils';
import { loadProjectLayout, type LoadedProjectLayout } from './layout-service';
import { assertValidManuscriptMarkdown } from './manuscript-markdown-validator';
import { ProjectMutationCoordinator } from './project-mutation-coordinator';
import {
  parseProjectTitle,
} from './metadata-parser';

interface LocatedDirectory {
  directoryPath: string;
  index: ProjectDirectoryIndex;
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

interface RenameDocumentRequest {
  documentId: string;
  metadataTitle: string;
}

interface SetLoreCategoryIconRequest {
  directoryId: string;
  icon: ProjectIconId;
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

const projectRelativePath = (projectPath: string, targetPath: string): string =>
  path.relative(projectPath, targetPath).split(path.sep).join('/');

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

const withCatalog = <T>(
  projectPath: string,
  operation: (catalog: ProjectCatalogRepository) => T,
): T => {
  const database = new ProjectDatabase(projectPath);
  try {
    return operation(new ProjectCatalogRepository(database));
  } finally {
    database.close();
  }
};

const nextCatalogSortKey = (
  catalog: ProjectCatalogRepository,
  parentId: string,
): number => catalog.list()
  .filter((node) => node.parentId === parentId)
  .reduce((maximum, node) => Math.max(maximum, node.sortKey), -1) + 1;

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
    };
  }
  for (const volume of layout.manuscript.volumes) {
    if (volume.index.id === directoryId) {
      const directoryPath = path.join(projectPath, 'manuscript', volume.directory);
      return {
        directoryPath,
        index: volume.index,
      };
    }
  }
  if (layout.lore?.index.id === directoryId) {
    const directoryPath = path.join(projectPath, 'lore');
    return {
      directoryPath,
      index: layout.lore.index,
    };
  }
  for (const category of layout.lore?.categories ?? []) {
    if (category.index.id === directoryId) {
      const directoryPath = path.join(projectPath, 'lore', category.directory);
      return {
        directoryPath,
        index: category.index,
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
    const relativePath = projectRelativePath(projectPath, createdPath);
    await new ProjectMutationCoordinator(projectPath).execute({
        applyDatabase: () => withCatalog(projectPath, (catalog) => catalog.create({
          backingStatus: 'present',
          contentRevision: null,
          icon: request.icon ?? null,
          id: request.directoryId,
          kind: request.kind,
          numberingFormat: null,
          numberingMode: null,
          parentId: root.index.id,
          relativePath,
          sortKey: nextCatalogSortKey(catalog, root.index.id),
          title: request.title,
          type: 'directory',
        })),
        applyFilesystem: () => mkdir(createdPath, { mode: 0o700 }).then(() => undefined),
        baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
        files: [{ newRelativePath: relativePath }],
        operationKind: 'create-directory',
        payload: { directoryId: request.directoryId, kind: request.kind, relativePath },
        rollbackFilesystem: () => rm(createdPath, { force: true, recursive: true }),
    });
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
    if (entries.length !== 0) {
      throw new Error('Lore category contains untracked files');
    }
    const trashDirectory = path.join(projectPath, '.driftfield', 'trash');
    await mkdir(trashDirectory, { recursive: true, mode: 0o700 });
    const tombstonePath = path.join(trashDirectory, randomUUID());
    await new ProjectMutationCoordinator(projectPath).execute({
        applyDatabase: () => withCatalog(projectPath, (catalog) =>
          catalog.delete(request.directoryId)),
        applyFilesystem: () => rename(categoryPath, tombstonePath),
        baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
        files: [{
          oldRelativePath: projectRelativePath(projectPath, categoryPath),
          trashRelativePath: projectRelativePath(projectPath, tombstonePath),
        }],
        operationKind: 'delete-directory',
        payload: { directoryId: request.directoryId },
        rollbackFilesystem: () => rename(tombstonePath, categoryPath),
    });
  });
};

export const setStructuredLoreCategoryIcon = async (
  directoryPath: string,
  request: SetLoreCategoryIconRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const category = layout.lore?.categories.find(
      ({ index }) => index.id === request.directoryId,
    );
    if (category === undefined) throw new Error('Lore category was not found');
    if (category.index.icon === request.icon) {
      throw new Error('Lore category already has this icon');
    }
    await new ProjectMutationCoordinator(projectPath).execute({
      applyDatabase: () => withCatalog(projectPath, (catalog) =>
        catalog.updateIcon(request.directoryId, request.icon)),
      applyFilesystem: async () => {},
      baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
      files: [],
      operationKind: 'set-directory-icon',
      payload: { directoryId: request.directoryId, icon: request.icon },
      rollbackFilesystem: async () => {},
    });
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
    const sourceRelativePath = projectRelativePath(projectPath, source.filePath);
    const targetRelativePath = projectRelativePath(projectPath, targetFilePath);
    await new ProjectMutationCoordinator(projectPath).execute({
        applyDatabase: () => withCatalog(projectPath, (catalog) => catalog.updateDocumentLocation(
          request.documentId,
          target.index.id,
          targetRelativePath,
          nextCatalogSortKey(catalog, target.index.id),
        )),
        applyFilesystem: () => rename(source.filePath, targetFilePath),
        baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
        files: [{
          newRelativePath: targetRelativePath,
          newRevision: request.baseRevision,
          oldRelativePath: sourceRelativePath,
          oldRevision: request.baseRevision,
        }],
        operationKind: 'move-document',
        payload: { documentId: request.documentId, targetParentId: target.index.id },
        rollbackFilesystem: () => rename(targetFilePath, source.filePath),
    });
  });
};

export const renameStructuredProjectDocument = async (
  directoryPath: string,
  request: RenameDocumentRequest,
): Promise<void> => {
  const projectPath = await realpath(directoryPath);
  return enqueueMutation(projectPath, async () => {
    const layout = await loadProjectLayout(projectPath);
    const located = locateDocument(projectPath, layout, request.documentId);
    if (located === null) throw new Error('Project document was not found');
    const metadataTitle = parseProjectTitle(request.metadataTitle);
    if (located.entry.title === metadataTitle) {
      throw new Error('Project document already has this metadata title');
    }
    withCatalog(projectPath, (catalog) =>
      catalog.updateTitle(request.documentId, metadataTitle));
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
    assertValidManuscriptMarkdown(request.markdown);
    const filename = await chooseReadablePhysicalName(
      parent.directoryPath,
      request.title,
      '.md',
    );
    const documentPath = path.join(parent.directoryPath, filename);
    if (!isPathInside(projectPath, documentPath)) throw new Error('Document path escapes project');
    const relativePath = projectRelativePath(projectPath, documentPath);
    const revision = contentRevision(request.markdown);
    await new ProjectMutationCoordinator(projectPath).execute({
        applyDatabase: () => withCatalog(projectPath, (catalog) => catalog.create({
          backingStatus: 'present',
          contentRevision: revision,
          icon: null,
          id: request.documentId,
          kind: request.kind,
          numberingFormat: null,
          numberingMode: null,
          parentId: parent.index.id,
          relativePath,
          sortKey: nextCatalogSortKey(catalog, parent.index.id),
          title: request.title,
          type: 'document',
        })),
        applyFilesystem: () => writeFile(documentPath, request.markdown, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        }),
        baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
        files: [{ newRelativePath: relativePath, newRevision: revision }],
        operationKind: 'create-document',
        payload: { documentId: request.documentId, parentId: parent.index.id },
        rollbackFilesystem: () => unlink(documentPath),
    });
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
    const trashDirectory = path.join(projectPath, '.driftfield', 'trash');
    await mkdir(trashDirectory, { recursive: true, mode: 0o700 });
    const tombstonePath = path.join(trashDirectory, `${randomUUID()}.md`);
    await new ProjectMutationCoordinator(projectPath).execute({
        applyDatabase: () => withCatalog(projectPath, (catalog) =>
          catalog.delete(request.documentId)),
        applyFilesystem: () => rename(located.filePath, tombstonePath),
        baseProjectRevision: withCatalog(projectPath, (catalog) => catalog.getRevision()),
        files: [{
          oldRelativePath: projectRelativePath(projectPath, located.filePath),
          oldRevision: request.baseRevision,
          trashRelativePath: projectRelativePath(projectPath, tombstonePath),
        }],
        operationKind: 'delete-document',
        payload: { documentId: request.documentId },
        rollbackFilesystem: () => rename(tombstonePath, located.filePath),
    });
  });
};
