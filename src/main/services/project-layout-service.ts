import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { parseDocument, stringify } from 'yaml';

import {
  CHAPTER_NUMBERING_MODES,
  DRIFTFIELD_PROJECT_FORMAT_VERSION,
  MANUSCRIPT_DOCUMENT_KINDS,
  PROJECT_INDEX_NAME,
  PROJECT_ICON_IDS,
  PROJECT_MANIFEST_NAME,
  PROJECT_ROOT_DIRECTORIES,
  type ChapterNumberingPolicy,
  type LorebookCategoryIndex,
  type LorebookEntry,
  type LorebookIndex,
  type LorebookRootChild,
  type ManuscriptDocumentEntry,
  type ManuscriptIndex,
  type ManuscriptRootChild,
  type ProjectManifest,
  type ProjectIconId,
  type ProjectRootIndex,
  type VolumeIndex,
} from '../../shared/contracts/project-layout';
import { ProjectDatabase } from '../database/project-database';
import { ConversationDatabase } from '../database/conversation-database';
import { SettingsDatabase } from '../database/settings-database';

const MAX_METADATA_BYTES = 256 * 1024;
const MAX_METADATA_DEPTH = 12;
const MAX_COLLECTION_ITEMS = 10_000;
const MAX_CHILDREN = 5_000;
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 500;
const MAX_FORMAT_LENGTH = 256;
const MAX_FORMAT_PLACEHOLDERS = 8;
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const ALLOWED_FORMAT_FIELDS = new Set([
  'kind',
  'number',
  'title',
  'volumeNumber',
  'volumeTitle',
]);

type RecordValue = Record<string, unknown>;

interface LoadedLorebookLayout {
  categories: Array<{ directory: string; index: LorebookCategoryIndex }>;
  entries: Array<{
    id: string;
    relativePath: string;
    title: string;
  }>;
  index: LorebookIndex;
}

export interface LoadedProjectLayout {
  lorebook: LoadedLorebookLayout | null;
  manifest: ProjectManifest & { icon?: ProjectIconId };
  manuscript: {
    index: ManuscriptIndex;
    volumes: Array<{ directory: string; index: VolumeIndex }>;
  };
  metadataSources: string[];
}

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const assertExactKeys = (
  value: RecordValue,
  required: readonly string[],
  optional: readonly string[] = [],
): void => {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value))) {
    throw new Error('Project metadata is missing required fields');
  }
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error('Project metadata contains unsupported fields');
  }
};

const parseId = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ID_LENGTH ||
    !SAFE_ID.test(value)
  ) {
    throw new Error('Project metadata contains an invalid ID');
  }
  return value;
};

const parseTitle = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > MAX_TITLE_LENGTH ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error('Project metadata contains an invalid title');
  }
  return value;
};

const parseIcon = (value: unknown): ProjectIconId => {
  if (
    typeof value !== 'string' ||
    !PROJECT_ICON_IDS.includes(value as ProjectIconId)
  ) {
    throw new Error('Project metadata contains an invalid icon');
  }
  return value as ProjectIconId;
};

const parseSegment = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error('Project metadata contains an invalid path segment');
  }
  return value;
};

const parseFormat = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_FORMAT_LENGTH
  ) {
    throw new Error('Project metadata contains an invalid label format');
  }
  let placeholderCount = 0;
  const withoutFields = value.replace(
    /\{([^{}]+)\}/gu,
    (_match, field: string) => {
      placeholderCount += 1;
      if (!ALLOWED_FORMAT_FIELDS.has(field)) {
        throw new Error(`Unknown project label placeholder: ${field}`);
      }
      return '';
    },
  );
  if (placeholderCount > MAX_FORMAT_PLACEHOLDERS) {
    throw new Error('Project label format contains too many placeholders');
  }
  if (/[{}]/u.test(withoutFields)) {
    throw new Error('Project metadata contains malformed label placeholders');
  }
  return value;
};

const parseNumbering = (value: unknown): ChapterNumberingPolicy => {
  if (!isRecord(value)) throw new Error('Invalid chapter numbering policy');
  assertExactKeys(value, ['mode'], ['format']);
  if (
    typeof value.mode !== 'string' ||
    !CHAPTER_NUMBERING_MODES.includes(
      value.mode as (typeof CHAPTER_NUMBERING_MODES)[number],
    )
  ) {
    throw new Error('Unknown chapter numbering mode');
  }
  return {
    ...(value.format === undefined ? {} : { format: parseFormat(value.format) }),
    mode: value.mode as ChapterNumberingPolicy['mode'],
  };
};

const parseManuscriptDocument = (
  value: unknown,
): ManuscriptDocumentEntry => {
  if (!isRecord(value)) throw new Error('Invalid manuscript child');
  assertExactKeys(value, ['file', 'id', 'kind', 'title'], ['label']);
  if (
    typeof value.kind !== 'string' ||
    !MANUSCRIPT_DOCUMENT_KINDS.includes(
      value.kind as (typeof MANUSCRIPT_DOCUMENT_KINDS)[number],
    )
  ) {
    throw new Error('Unknown manuscript document kind');
  }
  return {
    file: parseSegment(value.file),
    id: parseId(value.id),
    kind: value.kind as ManuscriptDocumentEntry['kind'],
    ...(value.label === undefined ? {} : { label: parseTitle(value.label) }),
    title: parseTitle(value.title),
  };
};

const parseManuscriptRootChild = (value: unknown): ManuscriptRootChild => {
  if (!isRecord(value)) throw new Error('Invalid manuscript child');
  if (value.kind !== 'volume') return parseManuscriptDocument(value);
  assertExactKeys(value, ['directory', 'kind']);
  return { directory: parseSegment(value.directory), kind: 'volume' };
};

const parseLorebookEntry = (value: unknown): LorebookEntry => {
  if (!isRecord(value)) throw new Error('Invalid lorebook entry');
  assertExactKeys(value, ['file', 'id', 'kind', 'title']);
  if (value.kind !== 'entry') throw new Error('Unknown lorebook entry kind');
  return {
    file: parseSegment(value.file),
    id: parseId(value.id),
    kind: 'entry',
    title: parseTitle(value.title),
  };
};

const parseLorebookRootChild = (value: unknown): LorebookRootChild => {
  if (!isRecord(value)) throw new Error('Invalid lorebook child');
  if (value.kind !== 'category') return parseLorebookEntry(value);
  assertExactKeys(value, ['directory', 'kind']);
  return { directory: parseSegment(value.directory), kind: 'category' };
};

const parseChildren = <T>(
  value: unknown,
  parseChild: (child: unknown) => T,
): T[] => {
  if (!Array.isArray(value) || value.length > MAX_CHILDREN) {
    throw new Error('Project metadata contains an invalid children list');
  }
  return value.map(parseChild);
};

const parseManifest = (value: unknown): ProjectManifest => {
  if (!isRecord(value)) throw new Error('Invalid Driftfield project manifest');
  assertExactKeys(value, ['formatVersion', 'id', 'kind', 'title']);
  if (
    value.formatVersion !== DRIFTFIELD_PROJECT_FORMAT_VERSION ||
    value.kind !== 'novel'
  ) {
    throw new Error('Unsupported Driftfield project format');
  }
  return {
    formatVersion: DRIFTFIELD_PROJECT_FORMAT_VERSION,
    id: parseId(value.id),
    kind: 'novel',
    title: parseTitle(value.title),
  };
};

const parseProjectRootIndex = (value: unknown): ProjectRootIndex => {
  if (!isRecord(value)) throw new Error('Invalid Driftfield project index');
  assertExactKeys(value, ['kind', 'title'], ['icon']);
  if (value.kind !== 'novel') throw new Error('Invalid Driftfield project root');
  return {
    ...(value.icon === undefined ? {} : { icon: parseIcon(value.icon) }),
    kind: 'novel',
    title: parseTitle(value.title),
  };
};

const parseManuscriptIndex = (value: unknown): ManuscriptIndex => {
  if (!isRecord(value)) throw new Error('Invalid manuscript index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], [
    'chapterNumbering', 'icon',
  ]);
  if (value.kind !== 'manuscript') throw new Error('Invalid manuscript root');
  return {
    ...(value.chapterNumbering === undefined
      ? {}
      : { chapterNumbering: parseNumbering(value.chapterNumbering) }),
    children: parseChildren(value.children, parseManuscriptRootChild),
    id: parseId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseIcon(value.icon) }),
    kind: 'manuscript',
    title: parseTitle(value.title),
  };
};

const parseVolumeIndex = (value: unknown): VolumeIndex => {
  if (!isRecord(value)) throw new Error('Invalid volume index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], [
    'chapterNumbering', 'icon',
  ]);
  if (value.kind !== 'volume') throw new Error('Invalid volume directory');
  return {
    ...(value.chapterNumbering === undefined
      ? {}
      : { chapterNumbering: parseNumbering(value.chapterNumbering) }),
    children: parseChildren(value.children, parseManuscriptDocument),
    id: parseId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseIcon(value.icon) }),
    kind: 'volume',
    title: parseTitle(value.title),
  };
};

const parseLorebookIndex = (value: unknown): LorebookIndex => {
  if (!isRecord(value)) throw new Error('Invalid lorebook index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], ['icon']);
  if (value.kind !== 'lorebook') throw new Error('Invalid lorebook root');
  return {
    children: parseChildren(value.children, parseLorebookRootChild),
    id: parseId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseIcon(value.icon) }),
    kind: 'lorebook',
    title: parseTitle(value.title),
  };
};

const parseLorebookCategoryIndex = (
  value: unknown,
): LorebookCategoryIndex => {
  if (!isRecord(value)) throw new Error('Invalid lorebook category index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], ['icon']);
  if (value.kind !== 'category') throw new Error('Invalid lorebook category');
  return {
    children: parseChildren(value.children, parseLorebookEntry),
    id: parseId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseIcon(value.icon) }),
    kind: 'category',
    title: parseTitle(value.title),
  };
};

const assertBoundedValue = (value: unknown, depth = 0): void => {
  if (depth > MAX_METADATA_DEPTH) {
    throw new Error('Project metadata is nested too deeply');
  }
  if (typeof value === 'string' && value.length > MAX_METADATA_BYTES) {
    throw new Error('Project metadata contains an oversized string');
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_COLLECTION_ITEMS) {
      throw new Error('Project metadata contains too many items');
    }
    for (const item of value) assertBoundedValue(item, depth + 1);
  } else if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_COLLECTION_ITEMS) {
      throw new Error('Project metadata contains too many fields');
    }
    for (const [, item] of entries) assertBoundedValue(item, depth + 1);
  }
};

const readYaml = async (filePath: string): Promise<{ source: string; value: unknown }> => {
  const fileStats = await lstat(filePath);
  if (!fileStats.isFile() || fileStats.isSymbolicLink()) {
    throw new Error('Project metadata is not a regular file');
  }
  if (fileStats.size > MAX_METADATA_BYTES) {
    throw new Error('Project metadata file is too large');
  }
  const source = await readFile(filePath, 'utf8');
  const document = parseDocument(source, {
    prettyErrors: false,
    schema: 'core',
    uniqueKeys: true,
  });
  if (document.errors.length > 0) throw new Error('Invalid project YAML');
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  assertBoundedValue(value);
  return { source, value };
};

const assertExactRootEntries = async (
  projectPath: string,
  metadataName: string,
): Promise<boolean> => {
  const names = await readdir(projectPath);
  for (const expected of [
    metadataName,
    PROJECT_ROOT_DIRECTORIES.manuscript,
  ]) {
    const caseInsensitiveMatches = names.filter(
      (name) => name.toLowerCase() === expected.toLowerCase(),
    );
    if (!names.includes(expected) || caseInsensitiveMatches.length !== 1) {
      if (caseInsensitiveMatches.length > 0) {
        throw new Error(`Project entry must use exact lowercase name: ${expected}`);
      }
      throw new Error(`Driftfield project is missing ${expected}`);
    }
  }
  const lorebookName = PROJECT_ROOT_DIRECTORIES.lorebook;
  const lorebookMatches = names.filter(
    (name) => name.toLowerCase() === lorebookName.toLowerCase(),
  );
  if (
    lorebookMatches.length > 0 &&
    (!names.includes(lorebookName) || lorebookMatches.length !== 1)
  ) {
    throw new Error(`Project entry must use exact lowercase name: ${lorebookName}`);
  }
  return names.includes(lorebookName);
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
    throw new Error(`Project entry uses an invalid name or casing: ${expected}`);
  }
};

const assertDirectory = async (directoryPath: string): Promise<void> => {
  const directoryStats = await lstat(directoryPath);
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('Project metadata directory is invalid');
  }
};

const assertMarkdownFile = async (directoryPath: string, file: string): Promise<void> => {
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
): Promise<LoadedProjectLayout | null> => {
  const projectPath = await realpath(directoryPath);
  const rootNames = await readdir(projectPath);
  const hasRootIndex = rootNames.includes(PROJECT_INDEX_NAME);
  const hasLegacyManifest = rootNames.includes(PROJECT_MANIFEST_NAME);
  if (!hasRootIndex && !hasLegacyManifest) {
    for (const expected of [PROJECT_INDEX_NAME, PROJECT_MANIFEST_NAME]) {
      if (rootNames.some((name) => name.toLowerCase() === expected.toLowerCase())) {
        throw new Error(`Project metadata must use exact name: ${expected}`);
      }
    }
    return null;
  }
  const metadataName = hasRootIndex ? PROJECT_INDEX_NAME : PROJECT_MANIFEST_NAME;
  const hasLorebook = await assertExactRootEntries(projectPath, metadataName);

  const manuscriptPath = path.join(
    projectPath,
    PROJECT_ROOT_DIRECTORIES.manuscript,
  );
  const lorebookPath = path.join(projectPath, PROJECT_ROOT_DIRECTORIES.lorebook);
  await assertDirectory(manuscriptPath);
  await assertExactEntryName(manuscriptPath, PROJECT_INDEX_NAME);
  if (hasLorebook) {
    await assertDirectory(lorebookPath);
    await assertExactEntryName(lorebookPath, PROJECT_INDEX_NAME);
  }

  const [projectYaml, manuscriptYaml] = await Promise.all([
    readYaml(path.join(projectPath, metadataName)),
    readYaml(path.join(manuscriptPath, PROJECT_INDEX_NAME)),
  ]);
  let manifest: ProjectManifest & { icon?: ProjectIconId };
  if (hasRootIndex) {
    const rootIndex = parseProjectRootIndex(projectYaml.value);
    const databasePath = path.join(projectPath, '.driftfield', 'project.sqlite');
    const databaseStats = await lstat(databasePath).catch(() => null);
    if (
      databaseStats === null ||
      !databaseStats.isFile() ||
      databaseStats.isSymbolicLink()
    ) {
      throw new Error('Driftfield project database is missing or invalid');
    }
    const database = new ProjectDatabase(projectPath);
    try {
      const metadata = database.getProjectMetadata();
      if (
        metadata === null ||
        metadata.formatVersion !== DRIFTFIELD_PROJECT_FORMAT_VERSION
      ) {
        throw new Error('Unsupported Driftfield project database format');
      }
      manifest = {
        formatVersion: DRIFTFIELD_PROJECT_FORMAT_VERSION,
        id: metadata.projectId,
        ...rootIndex,
      };
    } finally {
      database.close();
    }
  } else {
    manifest = parseManifest(projectYaml.value);
  }
  const manuscriptIndex = parseManuscriptIndex(manuscriptYaml.value);
  const metadataSources = [projectYaml.source, manuscriptYaml.source];

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
    const volumeYaml = await readYaml(path.join(volumePath, PROJECT_INDEX_NAME));
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

  let lorebook: LoadedLorebookLayout | null = null;
  if (hasLorebook) {
    const lorebookYaml = await readYaml(
      path.join(lorebookPath, PROJECT_INDEX_NAME),
    );
    const lorebookIndex = parseLorebookIndex(lorebookYaml.value);
    metadataSources.push(lorebookYaml.source);
    assertUnique(
      lorebookIndex.children.map((child) =>
        child.kind === 'category' ? child.directory : child.file,
      ),
      'Lorebook index contains duplicate child paths',
    );
    const categories: LoadedLorebookLayout['categories'] = [];
    const lorebookEntries: LoadedLorebookLayout['entries'] = [];
    for (const child of lorebookIndex.children) {
      if (child.kind !== 'category') {
        await assertMarkdownFile(lorebookPath, child.file);
        lorebookEntries.push({
          id: child.id,
          relativePath: path.join(
            PROJECT_ROOT_DIRECTORIES.lorebook,
            child.file,
          ),
          title: child.title,
        });
        continue;
      }
      const categoryPath = path.join(lorebookPath, child.directory);
      await assertExactEntryName(lorebookPath, child.directory);
      await assertDirectory(categoryPath);
      await assertExactEntryName(categoryPath, PROJECT_INDEX_NAME);
      const categoryYaml = await readYaml(
        path.join(categoryPath, PROJECT_INDEX_NAME),
      );
      const index = parseLorebookCategoryIndex(categoryYaml.value);
      assertUnique(
        index.children.map(({ file }) => file),
        'Lorebook category contains duplicate child paths',
      );
      for (const entry of index.children) {
        await assertMarkdownFile(categoryPath, entry.file);
        lorebookEntries.push({
          id: entry.id,
          relativePath: path.join(
            PROJECT_ROOT_DIRECTORIES.lorebook,
            child.directory,
            entry.file,
          ),
          title: entry.title,
        });
      }
      metadataSources.push(categoryYaml.source);
      categories.push({ directory: child.directory, index });
    }
    lorebook = { categories, entries: lorebookEntries, index: lorebookIndex };
  }

  const ids = [
    manifest.id,
    manuscriptIndex.id,
    ...(lorebook === null ? [] : [lorebook.index.id]),
    ...manuscriptIndex.children.flatMap((child) =>
      child.kind === 'volume' ? [] : [child.id],
    ),
    ...volumes.flatMap(({ index }) => [
      index.id,
      ...index.children.map(({ id }) => id),
    ]),
    ...(lorebook === null
      ? []
      : [
          ...lorebook.index.children.flatMap((child) =>
            child.kind === 'category' ? [] : [child.id],
          ),
          ...lorebook.categories.flatMap(({ index }) => [
            index.id,
            ...index.children.map(({ id }) => id),
          ]),
        ]),
  ];
  assertUnique(ids, 'Project metadata contains duplicate stable IDs');

  return {
    lorebook,
    manifest,
    manuscript: { index: manuscriptIndex, volumes },
    metadataSources,
  };
};

export const initializeProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout> => {
  const projectPath = await realpath(directoryPath);
  const existingNames = await readdir(projectPath);
  if (existingNames.some((name) => !name.startsWith('.'))) {
    throw new Error('Only an empty folder can become a new Driftfield project');
  }

  const stagingPath = path.join(projectPath, `.driftfield-init-${randomUUID()}`);
  const manuscriptPath = path.join(
    stagingPath,
    PROJECT_ROOT_DIRECTORIES.manuscript,
  );
  const lorebookPath = path.join(
    stagingPath,
    PROJECT_ROOT_DIRECTORIES.lorebook,
  );
  const projectId = randomUUID();
  const rootIndex: ProjectRootIndex = {
    kind: 'novel',
    title: path.basename(projectPath) || 'Untitled Novel',
  };
  const manuscript: ManuscriptIndex = {
    chapterNumbering: { format: '{number}. {title}', mode: 'continuous' },
    children: [],
    id: randomUUID(),
    kind: 'manuscript',
    title: 'Manuscript',
  };
  const lorebook: LorebookIndex = {
    children: [],
    id: randomUUID(),
    kind: 'lorebook',
    title: 'Lorebook',
  };

  await Promise.all([
    mkdir(manuscriptPath, { recursive: true }),
    mkdir(lorebookPath, { recursive: true }),
  ]);
  try {
    await Promise.all([
      writeFile(
        path.join(stagingPath, PROJECT_INDEX_NAME),
        stringify(rootIndex),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(
        path.join(manuscriptPath, PROJECT_INDEX_NAME),
        stringify(manuscript),
        { encoding: 'utf8', mode: 0o600 },
      ),
      writeFile(
        path.join(lorebookPath, PROJECT_INDEX_NAME),
        stringify(lorebook),
        { encoding: 'utf8', mode: 0o600 },
      ),
    ]);
    const database = new ProjectDatabase(stagingPath);
    try {
      database.initializeProjectMetadata(
        projectId,
        DRIFTFIELD_PROJECT_FORMAT_VERSION,
      );
    } finally {
      database.close();
    }
    new ConversationDatabase(stagingPath).close();
    new SettingsDatabase(stagingPath).close();
    await rename(
      path.join(stagingPath, PROJECT_ROOT_DIRECTORIES.manuscript),
      path.join(projectPath, PROJECT_ROOT_DIRECTORIES.manuscript),
    );
    await rename(
      path.join(stagingPath, PROJECT_ROOT_DIRECTORIES.lorebook),
      path.join(projectPath, PROJECT_ROOT_DIRECTORIES.lorebook),
    );
    await rename(
      path.join(stagingPath, PROJECT_INDEX_NAME),
      path.join(projectPath, PROJECT_INDEX_NAME),
    );
    await rename(
      path.join(stagingPath, '.driftfield'),
      path.join(projectPath, '.driftfield'),
    );
  } finally {
    await rm(stagingPath, { force: true, recursive: true });
  }

  const loaded = await loadProjectLayout(projectPath);
  if (loaded === null) throw new Error('Project initialization failed');
  return loaded;
};

export const openProjectLayout = async (
  directoryPath: string,
): Promise<LoadedProjectLayout | null> => {
  const loaded = await loadProjectLayout(directoryPath);
  if (loaded !== null) return loaded;
  const names = await readdir(directoryPath);
  return names.every((name) => name.startsWith('.'))
    ? initializeProjectLayout(directoryPath)
    : null;
};
