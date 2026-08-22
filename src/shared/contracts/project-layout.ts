import {
  PROJECT_ICON_IDS,
  type ProjectIconId,
} from './lucide-icon-catalog.generated';

export {
  PROJECT_ICON_IDS,
  type ProjectIconId,
} from './lucide-icon-catalog.generated';

const PROJECT_ICON_ID_SET: ReadonlySet<string> = new Set(PROJECT_ICON_IDS);

export const isProjectIconId = (value: unknown): value is ProjectIconId =>
  typeof value === 'string' && PROJECT_ICON_ID_SET.has(value);

export const DRIFTFIELD_PROJECT_FORMAT_VERSION = 3 as const;
export const DRIFTFIELD_PROJECT_MARKER = 'driftfield-project' as const;
export const LEGACY_PROJECT_INDEX_NAME = '_index.yaml' as const;
export const PROJECT_ROOT_DIRECTORIES = {
  lore: 'lore',
  manuscript: 'manuscript',
} as const;

export const CHAPTER_NUMBERING_MODES = [
  'continuous',
  'per-volume',
  'manual',
  'none',
] as const;

export type ChapterNumberingMode = (typeof CHAPTER_NUMBERING_MODES)[number];

export interface ChapterNumberingPolicy {
  format?: string;
  mode: ChapterNumberingMode;
}

export const MANUSCRIPT_DOCUMENT_KINDS = [
  'chapter',
  'prologue',
  'interlude',
  'epilogue',
  'appendix',
] as const;

export type ManuscriptDocumentKind = (typeof MANUSCRIPT_DOCUMENT_KINDS)[number];

export interface ProjectManifest {
  formatVersion: number;
  id: string;
  kind: 'novel';
  title: string;
}

export interface ManuscriptDocumentEntry {
  file: string;
  id: string;
  kind: ManuscriptDocumentKind;
  label?: string;
  title: string;
}

export interface VolumeDirectoryEntry {
  directory: string;
  kind: 'volume';
}

export type ManuscriptRootChild =
  ManuscriptDocumentEntry | VolumeDirectoryEntry;

export interface ManuscriptIndex {
  chapterNumbering?: ChapterNumberingPolicy;
  children: ManuscriptRootChild[];
  id: string;
  icon?: ProjectIconId;
  kind: 'manuscript';
  title: string;
}

export interface VolumeIndex {
  chapterNumbering?: ChapterNumberingPolicy;
  children: ManuscriptDocumentEntry[];
  id: string;
  icon?: ProjectIconId;
  kind: 'volume';
  title: string;
}

export interface LoreEntry {
  file: string;
  id: string;
  kind: 'entry';
  title: string;
}

export interface LoreCategoryDirectoryEntry {
  directory: string;
  kind: 'category';
}

export type LoreRootChild = LoreCategoryDirectoryEntry | LoreEntry;

export interface LoreIndex {
  children: LoreRootChild[];
  id: string;
  icon?: ProjectIconId;
  kind: 'lore';
  title: string;
}

export interface LoreCategoryIndex {
  children: LoreEntry[];
  id: string;
  icon?: ProjectIconId;
  kind: 'category';
  title: string;
}

export type ProjectDirectoryIndex =
  LoreCategoryIndex | LoreIndex | ManuscriptIndex | VolumeIndex;
