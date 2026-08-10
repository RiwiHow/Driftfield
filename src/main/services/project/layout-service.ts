import {
  lstat,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  DRIFTFIELD_PROJECT_MARKER,
  PROJECT_INDEX_NAME,
  PROJECT_ROOT_DIRECTORIES,
  type LoreCategoryIndex,
  type LoreIndex,
  type ManuscriptIndex,
  type ProjectManifest,
  type ProjectIconId,
  type VolumeIndex,
} from '../../../shared/contracts/project-layout';
import {
  ProjectDatabase,
  validateExistingProjectDatabase,
} from '../../database/project-database';
import { initializeProjectLayoutFiles } from './layout-initializer';
import {
  MAX_PROJECT_METADATA_BYTES,
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
  'project-database-corrupt' | 'project-database-missing';

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
  await assertExactEntryName(manuscriptPath, PROJECT_INDEX_NAME);
  if (hasLore) {
    await assertDirectory(lorePath);
    await assertExactEntryName(lorePath, PROJECT_INDEX_NAME);
  }

  const manuscriptYaml = await readYaml(
    path.join(manuscriptPath, PROJECT_INDEX_NAME),
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
    await assertExactEntryName(volumePath, PROJECT_INDEX_NAME);
    const volumeYaml = await readYaml(
      path.join(volumePath, PROJECT_INDEX_NAME),
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
      path.join(lorePath, PROJECT_INDEX_NAME),
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
      await assertExactEntryName(categoryPath, PROJECT_INDEX_NAME);
      const categoryYaml = await readYaml(
        path.join(categoryPath, PROJECT_INDEX_NAME),
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

export const initializeProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout> => {
  const projectPath = await initializeProjectLayoutFiles(directoryPath);
  const loaded = await loadProjectLayout(projectPath);
  return loaded;
};

export const openProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout> => {
  const names = await readdir(directoryPath);
  if (names.length === 0) {
    return initializeProjectLayout(directoryPath);
  }
  return loadProjectLayout(directoryPath);
};
