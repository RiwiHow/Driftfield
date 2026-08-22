import { parseDocument } from 'yaml';

import {
  CHAPTER_NUMBERING_MODES,
  MANUSCRIPT_DOCUMENT_KINDS,
  isProjectIconId,
  type ChapterNumberingPolicy,
  type LoreCategoryIndex,
  type LoreEntry,
  type LoreIndex,
  type LoreRootChild,
  type ManuscriptDocumentEntry,
  type ManuscriptIndex,
  type ManuscriptRootChild,
  type ProjectIconId,
  type VolumeIndex,
} from '../../../shared/contracts/project-layout';

export const MAX_PROJECT_METADATA_BYTES = 256 * 1024;

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

export const parseProjectId = (value: unknown): string => {
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

export const parseProjectTitle = (value: unknown): string => {
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

export const parseProjectIcon = (value: unknown): ProjectIconId => {
  if (!isProjectIconId(value)) {
    throw new Error('Project metadata contains an invalid icon');
  }
  return value;
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

export const parseChapterNumberingPolicy = (
  value: unknown,
): ChapterNumberingPolicy => {
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
    ...(value.format === undefined
      ? {}
      : { format: parseFormat(value.format) }),
    mode: value.mode as ChapterNumberingPolicy['mode'],
  };
};

const parseManuscriptDocument = (value: unknown): ManuscriptDocumentEntry => {
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
    id: parseProjectId(value.id),
    kind: value.kind as ManuscriptDocumentEntry['kind'],
    ...(value.label === undefined
      ? {}
      : { label: parseProjectTitle(value.label) }),
    title: parseProjectTitle(value.title),
  };
};

const parseManuscriptRootChild = (value: unknown): ManuscriptRootChild => {
  if (!isRecord(value)) throw new Error('Invalid manuscript child');
  if (value.kind !== 'volume') return parseManuscriptDocument(value);
  assertExactKeys(value, ['directory', 'kind']);
  return { directory: parseSegment(value.directory), kind: 'volume' };
};

const parseLoreEntry = (value: unknown): LoreEntry => {
  if (!isRecord(value)) throw new Error('Invalid lore entry');
  assertExactKeys(value, ['file', 'id', 'kind', 'title']);
  if (value.kind !== 'entry') throw new Error('Unknown lore entry kind');
  return {
    file: parseSegment(value.file),
    id: parseProjectId(value.id),
    kind: 'entry',
    title: parseProjectTitle(value.title),
  };
};

const parseLoreRootChild = (value: unknown): LoreRootChild => {
  if (!isRecord(value)) throw new Error('Invalid lore child');
  if (value.kind !== 'category') return parseLoreEntry(value);
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

export const parseManuscriptIndex = (value: unknown): ManuscriptIndex => {
  if (!isRecord(value)) throw new Error('Invalid manuscript index');
  assertExactKeys(
    value,
    ['children', 'id', 'kind', 'title'],
    ['chapterNumbering', 'icon'],
  );
  if (value.kind !== 'manuscript') throw new Error('Invalid manuscript root');
  return {
    ...(value.chapterNumbering === undefined
      ? {}
      : { chapterNumbering: parseChapterNumberingPolicy(value.chapterNumbering) }),
    children: parseChildren(value.children, parseManuscriptRootChild),
    id: parseProjectId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseProjectIcon(value.icon) }),
    kind: 'manuscript',
    title: parseProjectTitle(value.title),
  };
};

export const parseVolumeIndex = (value: unknown): VolumeIndex => {
  if (!isRecord(value)) throw new Error('Invalid volume index');
  assertExactKeys(
    value,
    ['children', 'id', 'kind', 'title'],
    ['chapterNumbering', 'icon'],
  );
  if (value.kind !== 'volume') throw new Error('Invalid volume directory');
  return {
    ...(value.chapterNumbering === undefined
      ? {}
      : { chapterNumbering: parseChapterNumberingPolicy(value.chapterNumbering) }),
    children: parseChildren(value.children, parseManuscriptDocument),
    id: parseProjectId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseProjectIcon(value.icon) }),
    kind: 'volume',
    title: parseProjectTitle(value.title),
  };
};

export const parseLoreIndex = (value: unknown): LoreIndex => {
  if (!isRecord(value)) throw new Error('Invalid lore index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], ['icon']);
  if (value.kind !== 'lore') throw new Error('Invalid lore root');
  return {
    children: parseChildren(value.children, parseLoreRootChild),
    id: parseProjectId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseProjectIcon(value.icon) }),
    kind: 'lore',
    title: parseProjectTitle(value.title),
  };
};

export const parseLoreCategoryIndex = (value: unknown): LoreCategoryIndex => {
  if (!isRecord(value)) throw new Error('Invalid lore category index');
  assertExactKeys(value, ['children', 'id', 'kind', 'title'], ['icon']);
  if (value.kind !== 'category') throw new Error('Invalid lore category');
  return {
    children: parseChildren(value.children, parseLoreEntry),
    id: parseProjectId(value.id),
    ...(value.icon === undefined ? {} : { icon: parseProjectIcon(value.icon) }),
    kind: 'category',
    title: parseProjectTitle(value.title),
  };
};

const assertBoundedValue = (value: unknown, depth = 0): void => {
  if (depth > MAX_METADATA_DEPTH) {
    throw new Error('Project metadata is nested too deeply');
  }
  if (typeof value === 'string' && value.length > MAX_PROJECT_METADATA_BYTES) {
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

export const parseProjectYamlSource = (source: string): unknown => {
  const document = parseDocument(source, {
    prettyErrors: false,
    schema: 'core',
    uniqueKeys: true,
  });
  if (document.errors.length > 0) throw new Error('Invalid project YAML');
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  assertBoundedValue(value);
  return value;
};
