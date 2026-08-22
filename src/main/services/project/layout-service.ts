import {
  lstat,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  DRIFTFIELD_PROJECT_FORMAT_VERSION,
  DRIFTFIELD_PROJECT_MARKER,
  LEGACY_PROJECT_INDEX_NAME,
  PROJECT_ROOT_DIRECTORIES,
  type LoreCategoryIndex,
  type LoreIndex,
  type ManuscriptIndex,
  type ProjectManifest,
  type ProjectIconId,
  type VolumeIndex,
} from '../../../shared/contracts/project-layout';
import type { AppLanguage } from '../../../shared/i18n/languages';
import {
  ProjectCatalogRepository,
  type ProjectCatalogNode,
} from '../../database/project-catalog-repository';
import {
  ProjectDatabase,
  readExistingProjectFormatVersion,
  validateExistingProjectDatabase,
} from '../../database/project-database';
import { initializeProjectLayoutFiles } from './layout-initializer';
import { isPathInside } from './document-utils';
import {
  migrateLegacyProjectToV3,
  prepareLegacyProjectBackup,
} from './project-format-migration';
import {
  ProjectMutationCoordinator,
  ProjectRecoveryRequiredError,
} from './project-mutation-coordinator';
import {
  MAX_PROJECT_METADATA_BYTES,
  parseChapterNumberingPolicy,
  parseLoreCategoryIndex,
  parseLoreIndex,
  parseManuscriptIndex,
  parseProjectIcon,
  parseProjectId,
  parseProjectTitle,
  parseProjectYamlSource,
  parseVolumeIndex,
} from './metadata-parser';

interface LoadedLoreLayout {
  categories: Array<{ directory: string; index: LoreCategoryIndex }>;
  entries: Array<{
    id: string;
    relativePath: string;
    title: string;
  }>;
  index: LoreIndex;
}

export interface LoadedProjectLayout {
  lore: LoadedLoreLayout | null;
  manifest: ProjectManifest & { icon?: ProjectIconId };
  manuscript: {
    index: ManuscriptIndex;
    volumes: Array<{ directory: string; index: VolumeIndex }>;
  };
  metadataSources: string[];
}

export type ProjectLayoutErrorCode =
  | 'project-database-corrupt'
  | 'project-database-missing'
  | 'project-recovery-required';

export class ProjectLayoutError extends Error {
  constructor(
    readonly code: ProjectLayoutErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectLayoutError';
  }
}

const readYaml = async (
  filePath: string,
): Promise<{ source: string; value: unknown }> => {
  const fileStats = await lstat(filePath);
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error('Project metadata is not a regular file');
  }
  if (fileStats.size > MAX_PROJECT_METADATA_BYTES) {
    throw new Error('Project metadata file is too large');
  }
  const source = await readFile(filePath, 'utf8');
  return { source, value: parseProjectYamlSource(source) };
};

const assertExactRootEntries = async (
  projectPath: string,
): Promise<boolean> => {
  const names = await readdir(projectPath);
  for (const expected of [PROJECT_ROOT_DIRECTORIES.manuscript]) {
    const caseInsensitiveMatches = names.filter(
      (name) => name.toLowerCase() === expected.toLowerCase(),
    );
    if (!names.includes(expected) || caseInsensitiveMatches.length !== 1) {
      if (caseInsensitiveMatches.length > 0) {
        throw new Error(
          `Project entry must use exact lowercase name: ${expected}`,
        );
      }
      throw new Error(`Driftfield project is missing ${expected}`);
    }
  }
  const loreName = PROJECT_ROOT_DIRECTORIES.lore;
  const loreMatches = names.filter(
    (name) => name.toLowerCase() === loreName.toLowerCase(),
  );
  if (
    loreMatches.length > 0 &&
    (!names.includes(loreName) || loreMatches.length !== 1)
  ) {
    throw new Error(
      `Project entry must use exact lowercase name: ${loreName}`,
    );
  }
  return names.includes(loreName);
};

const assertProjectDatabaseFile = async (
  projectPath: string,
): Promise<string> => {
  const rootNames = await readdir(projectPath);
  const dataDirectoryName = '.driftfield';
  const matches = rootNames.filter(
    (name) => name.toLowerCase() === dataDirectoryName,
  );
  if (!rootNames.includes(dataDirectoryName) || matches.length !== 1) {
    throw new ProjectLayoutError(
      'project-database-missing',
      'Driftfield project database is missing',
    );
  }

  const dataDirectoryPath = path.join(projectPath, dataDirectoryName);
  const databasePath = path.join(dataDirectoryPath, 'project.sqlite');
  let dataDirectoryStats;
  let databaseStats;
  try {
    [dataDirectoryStats, databaseStats] = await Promise.all([
      lstat(dataDirectoryPath),
      lstat(databasePath),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProjectLayoutError(
        'project-database-missing',
        'Driftfield project database is missing',
      );
    }
    throw error;
  }
  if (
    !dataDirectoryStats.isDirectory() ||
    dataDirectoryStats.isSymbolicLink() ||
    !databaseStats.isFile() ||
    databaseStats.isSymbolicLink()
  ) {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  }
  return databasePath;
};

const assertExactEntryName = async (
  directoryPath: string,
  expected: string,
): Promise<void> => {
  const names = await readdir(directoryPath);
  const matches = names.filter(
    (name) => name.toLowerCase() === expected.toLowerCase(),
  );
  if (!names.includes(expected) || matches.length !== 1) {
    throw new Error(
      `Project entry uses an invalid name or casing: ${expected}`,
    );
  }
};

const assertDirectory = async (directoryPath: string): Promise<void> => {
  const directoryStats = await lstat(directoryPath);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Project metadata directory is invalid');
  }
};

const assertMarkdownFile = async (
  directoryPath: string,
  file: string,
): Promise<void> => {
  const extension = path.extname(file).toLowerCase();
  if (extension !== '.md' && extension !== '.markdown') {
    throw new Error('Project metadata references an unsupported document');
  }
  await assertExactEntryName(directoryPath, file);
  const fileStats = await lstat(path.join(directoryPath, file));
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error('Project metadata references an invalid document');
  }
};

const assertUnique = (values: string[], message: string): void => {
  if (new Set(values).size !== values.length) throw new Error(message);
};

const catalogDirectoryEntryName = (node: ProjectCatalogNode): string =>
  path.basename(node.relativePath);

const catalogDocumentEntry = (
  node: ProjectCatalogNode,
): import('../../../shared/contracts/project-layout').LoreEntry |
  import('../../../shared/contracts/project-layout').ManuscriptDocumentEntry => ({
    file: path.basename(node.relativePath),
    id: node.id,
    kind: node.kind as
      import('../../../shared/contracts/project-layout').ManuscriptDocumentKind | 'entry',
    title: node.title,
  });

const loadCatalogProjectLayout = async (
  projectPath: string,
  database: ProjectDatabase,
): Promise<LoadedProjectLayout> => {
  const hasLore = await assertExactRootEntries(projectPath);
  if (!hasLore) throw new Error('Driftfield project is missing lore');
  const metadata = database.getProjectMetadata();
  if (
    metadata === null ||
    metadata.marker !== DRIFTFIELD_PROJECT_MARKER ||
    metadata.formatVersion !== DRIFTFIELD_PROJECT_FORMAT_VERSION
  ) {
    throw new Error('Driftfield v3 project identity is invalid');
  }
  const catalog = new ProjectCatalogRepository(database);
  const nodes = catalog.list();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = (parentId: string): ProjectCatalogNode[] =>
    nodes
      .filter((node) => node.parentId === parentId)
      .sort((left, right) => left.sortKey - right.sortKey);
  const manuscriptRoot = nodes.find(
    ({ kind, parentId, type }) =>
      kind === 'manuscript' && parentId === null && type === 'directory',
  );
  const loreRoot = nodes.find(
    ({ kind, parentId, type }) =>
      kind === 'lore' && parentId === null && type === 'directory',
  );
  if (manuscriptRoot === undefined || loreRoot === undefined) {
    throw new Error('Driftfield project catalog roots are missing');
  }

  for (const node of nodes) {
    parseProjectId(node.id);
    parseProjectTitle(node.title);
    if (node.icon !== null) parseProjectIcon(node.icon);
    if (node.parentId === null) {
      if (
        (node.kind === 'manuscript' && node.relativePath !== 'manuscript') ||
        (node.kind === 'lore' && node.relativePath !== 'lore')
      ) {
        throw new Error('Project catalog contains an invalid root path');
      }
    } else {
      const parent = byId.get(node.parentId);
      if (parent === undefined || parent.type !== 'directory') {
        throw new Error('Project catalog contains an unknown parent');
      }
      const validChild = node.type === 'directory'
        ? (parent.kind === 'manuscript' && node.kind === 'volume') ||
          (parent.kind === 'lore' && node.kind === 'category')
        : parent.kind === 'manuscript' || parent.kind === 'volume'
          ? node.kind !== 'entry'
          : (parent.kind === 'lore' || parent.kind === 'category') &&
            node.kind === 'entry';
      if (
        !validChild ||
        path.posix.dirname(node.relativePath) !== parent.relativePath
      ) {
        throw new Error('Project catalog contains an invalid hierarchy');
      }
    }
    const normalizedRelativePath = node.relativePath.split('/').join(path.sep);
    const absolutePath = path.resolve(projectPath, normalizedRelativePath);
    if (
      path.isAbsolute(node.relativePath) ||
      node.relativePath.includes('\\') ||
      normalizeCatalogRelativePath(normalizedRelativePath) !== node.relativePath ||
      !isPathInside(projectPath, absolutePath)
    ) {
      throw new Error('Project catalog contains an invalid relative path');
    }
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) throw new Error('Project catalog path is a symlink');
    if (node.type === 'directory') {
      if (!stats.isDirectory()) throw new Error('Project catalog directory is invalid');
    } else {
      if (!stats.isFile()) throw new Error('Project catalog document is invalid');
      const extension = path.extname(node.relativePath).toLowerCase();
      if (extension !== '.md' && extension !== '.markdown') {
        throw new Error('Project catalog references an unsupported document');
      }
    }
  }

  const manuscriptChildren = childrenOf(manuscriptRoot.id);
  const manuscriptNumbering = manuscriptRoot.numberingMode === null
    ? undefined
    : parseChapterNumberingPolicy({
        ...(manuscriptRoot.numberingFormat === null
          ? {}
          : { format: manuscriptRoot.numberingFormat }),
        mode: manuscriptRoot.numberingMode,
      });
  const manuscriptIndex: ManuscriptIndex = {
    ...(manuscriptNumbering === undefined
      ? {}
      : { chapterNumbering: manuscriptNumbering }),
    children: manuscriptChildren.map((child) =>
      child.type === 'directory'
        ? { directory: catalogDirectoryEntryName(child), kind: 'volume' as const }
        : catalogDocumentEntry(child) as
            import('../../../shared/contracts/project-layout').ManuscriptDocumentEntry,
    ),
    id: manuscriptRoot.id,
    ...(manuscriptRoot.icon === null ? {} : { icon: manuscriptRoot.icon }),
    kind: 'manuscript',
    title: manuscriptRoot.title,
  };
  const volumes = manuscriptChildren
    .filter((node) => node.type === 'directory')
    .map((volume) => {
      if (volume.kind !== 'volume') throw new Error('Invalid Manuscript directory kind');
      const volumeNumbering = volume.numberingMode === null
        ? undefined
        : parseChapterNumberingPolicy({
            ...(volume.numberingFormat === null
              ? {}
              : { format: volume.numberingFormat }),
            mode: volume.numberingMode,
          });
      const index: VolumeIndex = {
        ...(volumeNumbering === undefined
          ? {}
          : { chapterNumbering: volumeNumbering }),
        children: childrenOf(volume.id).map((child) => {
          if (child.type !== 'document' || child.kind === 'entry') {
            throw new Error('Invalid Volume child');
          }
          return catalogDocumentEntry(child) as
            import('../../../shared/contracts/project-layout').ManuscriptDocumentEntry;
        }),
        id: volume.id,
        ...(volume.icon === null ? {} : { icon: volume.icon }),
        kind: 'volume',
        title: volume.title,
      };
      return { directory: catalogDirectoryEntryName(volume), index };
    });

  const loreChildren = childrenOf(loreRoot.id);
  const loreIndex: LoreIndex = {
    children: loreChildren.map((child) =>
      child.type === 'directory'
        ? { directory: catalogDirectoryEntryName(child), kind: 'category' as const }
        : catalogDocumentEntry(child) as
            import('../../../shared/contracts/project-layout').LoreEntry,
    ),
    id: loreRoot.id,
    ...(loreRoot.icon === null ? {} : { icon: loreRoot.icon }),
    kind: 'lore',
    title: loreRoot.title,
  };
  const categories = loreChildren
    .filter((node) => node.type === 'directory')
    .map((category) => {
      if (category.kind !== 'category') throw new Error('Invalid Lore directory kind');
      const index: LoreCategoryIndex = {
        children: childrenOf(category.id).map((child) => {
          if (child.type !== 'document' || child.kind !== 'entry') {
            throw new Error('Invalid Lore category child');
          }
          return catalogDocumentEntry(child) as
            import('../../../shared/contracts/project-layout').LoreEntry;
        }),
        id: category.id,
        ...(category.icon === null ? {} : { icon: category.icon }),
        kind: 'category',
        title: category.title,
      };
      return { directory: catalogDirectoryEntryName(category), index };
    });
  const entries = nodes
    .filter((node) => node.type === 'document' && node.kind === 'entry')
    .map((node) => ({
      id: node.id,
      relativePath: node.relativePath,
      title: node.title,
    }));
  return {
    lore: { categories, entries, index: loreIndex },
    manifest: {
      formatVersion: metadata.formatVersion,
      id: parseProjectId(metadata.projectId),
      ...(metadata.icon === null ? {} : { icon: parseProjectIcon(metadata.icon) }),
      kind: 'novel',
      title: parseProjectTitle(metadata.title),
    },
    manuscript: { index: manuscriptIndex, volumes },
    metadataSources: [
      JSON.stringify({
        catalogRevision: catalog.getRevision(),
        formatVersion: metadata.formatVersion,
        nodes,
        projectId: metadata.projectId,
      }),
    ],
  };
};

const normalizeCatalogRelativePath = (relativePath: string): string =>
  path.normalize(relativePath).split(path.sep).join('/');

const loadLegacyProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout> => {
  const projectPath = await realpath(directoryPath);
  const databasePath = await assertProjectDatabaseFile(projectPath);
  try {
    validateExistingProjectDatabase(databasePath);
  } catch {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  }
  const hasLore = await assertExactRootEntries(projectPath);

  const manuscriptPath = path.join(
    projectPath,
    PROJECT_ROOT_DIRECTORIES.manuscript,
  );
  const lorePath = path.join(
    projectPath,
    PROJECT_ROOT_DIRECTORIES.lore,
  );
  await assertDirectory(manuscriptPath);
  await assertExactEntryName(manuscriptPath, LEGACY_PROJECT_INDEX_NAME);
  if (hasLore) {
    await assertDirectory(lorePath);
    await assertExactEntryName(lorePath, LEGACY_PROJECT_INDEX_NAME);
  }

  const manuscriptYaml = await readYaml(
    path.join(manuscriptPath, LEGACY_PROJECT_INDEX_NAME),
  );
  let database: ProjectDatabase;
  try {
    database = new ProjectDatabase(projectPath);
  } catch {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  }
  let manifest: ProjectManifest & { icon?: ProjectIconId };
  try {
    const metadata = database.getProjectMetadata();
    if (
      metadata === null ||
      metadata.marker !== DRIFTFIELD_PROJECT_MARKER ||
      !Number.isSafeInteger(metadata.formatVersion) ||
      metadata.formatVersion < 1
    ) {
      throw new ProjectLayoutError(
        'project-database-corrupt',
        'Driftfield project identity is missing or invalid',
      );
    }
    const title = parseProjectTitle(metadata.title);
    const icon =
      metadata.icon === null ? undefined : parseProjectIcon(metadata.icon);
    manifest = {
      formatVersion: metadata.formatVersion,
      id: parseProjectId(metadata.projectId),
      ...(icon === undefined ? {} : { icon }),
      kind: 'novel',
      title,
    };
  } catch (error) {
    if (error instanceof ProjectLayoutError) throw error;
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  } finally {
    database.close();
  }
  const manuscriptIndex = parseManuscriptIndex(manuscriptYaml.value);
  const metadataSources = [JSON.stringify(manifest), manuscriptYaml.source];

  assertUnique(
    manuscriptIndex.children.map((child) =>
      child.kind === 'volume' ? child.directory : child.file,
    ),
    'Manuscript index contains duplicate child paths',
  );

  const volumes: LoadedProjectLayout['manuscript']['volumes'] = [];
  for (const child of manuscriptIndex.children) {
    if (child.kind !== 'volume') {
      await assertMarkdownFile(manuscriptPath, child.file);
      continue;
    }
    const volumePath = path.join(manuscriptPath, child.directory);
    await assertExactEntryName(manuscriptPath, child.directory);
    await assertDirectory(volumePath);
    await assertExactEntryName(volumePath, LEGACY_PROJECT_INDEX_NAME);
    const volumeYaml = await readYaml(
      path.join(volumePath, LEGACY_PROJECT_INDEX_NAME),
    );
    const index = parseVolumeIndex(volumeYaml.value);
    assertUnique(
      index.children.map(({ file }) => file),
      'Volume index contains duplicate child paths',
    );
    for (const document of index.children) {
      await assertMarkdownFile(volumePath, document.file);
    }
    metadataSources.push(volumeYaml.source);
    volumes.push({ directory: child.directory, index });
  }

  let lore: LoadedLoreLayout | null = null;
  if (hasLore) {
    const loreYaml = await readYaml(
      path.join(lorePath, LEGACY_PROJECT_INDEX_NAME),
    );
    const loreIndex = parseLoreIndex(loreYaml.value);
    metadataSources.push(loreYaml.source);
    assertUnique(
      loreIndex.children.map((child) =>
        child.kind === 'category' ? child.directory : child.file,
      ),
      'Lore index contains duplicate child paths',
    );
    const categories: LoadedLoreLayout['categories'] = [];
    const loreEntries: LoadedLoreLayout['entries'] = [];
    for (const child of loreIndex.children) {
      if (child.kind !== 'category') {
        await assertMarkdownFile(lorePath, child.file);
        loreEntries.push({
          id: child.id,
          relativePath: path.join(
            PROJECT_ROOT_DIRECTORIES.lore,
            child.file,
          ),
          title: child.title,
        });
        continue;
      }
      const categoryPath = path.join(lorePath, child.directory);
      await assertExactEntryName(lorePath, child.directory);
      await assertDirectory(categoryPath);
      await assertExactEntryName(categoryPath, LEGACY_PROJECT_INDEX_NAME);
      const categoryYaml = await readYaml(
        path.join(categoryPath, LEGACY_PROJECT_INDEX_NAME),
      );
      const index = parseLoreCategoryIndex(categoryYaml.value);
      assertUnique(
        index.children.map(({ file }) => file),
        'Lore category contains duplicate child paths',
      );
      for (const entry of index.children) {
        await assertMarkdownFile(categoryPath, entry.file);
        loreEntries.push({
          id: entry.id,
          relativePath: path.join(
            PROJECT_ROOT_DIRECTORIES.lore,
            child.directory,
            entry.file,
          ),
          title: entry.title,
        });
      }
      metadataSources.push(categoryYaml.source);
      categories.push({ directory: child.directory, index });
    }
    lore = { categories, entries: loreEntries, index: loreIndex };
  }

  const ids = [
    manifest.id,
    manuscriptIndex.id,
    ...(lore === null ? [] : [lore.index.id]),
    ...manuscriptIndex.children.flatMap((child) =>
      child.kind === 'volume' ? [] : [child.id],
    ),
    ...volumes.flatMap(({ index }) => [
      index.id,
      ...index.children.map(({ id }) => id),
    ]),
    ...(lore === null
      ? []
      : [
          ...lore.index.children.flatMap((child) =>
            child.kind === 'category' ? [] : [child.id],
          ),
          ...lore.categories.flatMap(({ index }) => [
            index.id,
            ...index.children.map(({ id }) => id),
          ]),
        ]),
  ];
  assertUnique(ids, 'Project metadata contains duplicate stable IDs');

  return {
    lore,
    manifest,
    manuscript: { index: manuscriptIndex, volumes },
    metadataSources,
  };
};

export const loadProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout> => {
  const projectPath = await realpath(directoryPath);
  const databasePath = await assertProjectDatabaseFile(projectPath);
  try {
    validateExistingProjectDatabase(databasePath);
  } catch {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  }
  const formatVersion = readExistingProjectFormatVersion(databasePath);
  if (formatVersion > DRIFTFIELD_PROJECT_FORMAT_VERSION) {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project was created by a newer application version',
    );
  }
  if (formatVersion < 2) {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project format is no longer supported',
    );
  }
  if (formatVersion === 2) {
    const backup = await prepareLegacyProjectBackup(projectPath);
    const legacyLayout = await loadLegacyProjectLayout(projectPath);
    await migrateLegacyProjectToV3(projectPath, legacyLayout, backup);
  }
  try {
    ProjectMutationCoordinator.assertNoUnfinishedOperations(projectPath);
  } catch (error) {
    if (error instanceof ProjectRecoveryRequiredError) {
      throw new ProjectLayoutError(
        'project-recovery-required',
        'Driftfield project has an unfinished recoverable file operation',
      );
    }
    throw error;
  }
  let database: ProjectDatabase;
  try {
    database = new ProjectDatabase(projectPath);
  } catch {
    throw new ProjectLayoutError(
      'project-database-corrupt',
      'Driftfield project database is damaged or invalid',
    );
  }
  try {
    return await loadCatalogProjectLayout(projectPath, database);
  } finally {
    database.close();
  }
};

export const initializeProjectLayout = async (
  directoryPath: string,
  language: AppLanguage = 'en',
): Promise<LoadedProjectLayout> => {
  const projectPath = await initializeProjectLayoutFiles(directoryPath, language);
  const loaded = await loadProjectLayout(projectPath);
  return loaded;
};

export const openProjectLayout = async (
  directoryPath: string,
  language: AppLanguage = 'en',
): Promise<LoadedProjectLayout> => {
  const names = await readdir(directoryPath);
  if (names.length === 0) {
    return initializeProjectLayout(directoryPath, language);
  }
  return loadProjectLayout(directoryPath);
};
