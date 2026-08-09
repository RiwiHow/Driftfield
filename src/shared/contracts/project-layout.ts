export const DRIFTFIELD_PROJECT_FORMAT_VERSION = 1 as const;
export const DRIFTFIELD_PROJECT_MARKER = 'driftfield-project' as const;
export const PROJECT_INDEX_NAME = '_index.yaml' as const;
export const PROJECT_ICON_IDS = [
  'book-open',
  'book-marked',
  'castle',
  'crown',
  'earth',
  'landmark',
  'map',
  'orbit',
  'scroll-text',
  'shield',
  'sparkles',
  'swords',
  'users',
] as const;
export type ProjectIconId = (typeof PROJECT_ICON_IDS)[number];
export const PROJECT_ROOT_DIRECTORIES = {
  lorebook: 'lorebook',
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

export interface LorebookEntry {
  file: string;
  id: string;
  kind: 'entry';
  title: string;
}

export interface LorebookCategoryDirectoryEntry {
  directory: string;
  kind: 'category';
}

export type LorebookRootChild = LorebookCategoryDirectoryEntry | LorebookEntry;

export interface LorebookIndex {
  children: LorebookRootChild[];
  id: string;
  icon?: ProjectIconId;
  kind: 'lorebook';
  title: string;
}

export interface LorebookCategoryIndex {
  children: LorebookEntry[];
  id: string;
  icon?: ProjectIconId;
  kind: 'category';
  title: string;
}

export type ProjectDirectoryIndex =
  LorebookCategoryIndex | LorebookIndex | ManuscriptIndex | VolumeIndex;
