import { stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectDocument,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../../../shared/contracts/project';
import type {
  ChapterNumberingPolicy,
  LoreEntry,
  ManuscriptDocumentEntry,
} from '../../../shared/contracts/project-layout';
import {
  loadProjectLayout,
  type LoadedProjectLayout,
} from './layout-service';
import { contentRevision, readProjectDocument } from './document-utils';

export const MAX_PROJECT_DOCUMENTS = 500;
export const MAX_PROJECT_BYTES = 10 * 1024 * 1024;

interface ProjectScanState {
  bytes: number;
  documents: ProjectDocument[];
}

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
  if (
    entry.kind !== 'chapter' ||
    policy?.mode === 'none' ||
    policy === undefined
  ) {
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
  entry: LoreEntry | ManuscriptDocumentEntry,
  displayName: string,
  state: ProjectScanState,
): Promise<ProjectTreeNode> => {
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
    documentId: document.id,
    name: displayName,
    relativePath,
    type: 'file',
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
      nodes.push(
        await readStructuredDocument(
          projectPath,
          manuscriptDirectory,
          child,
          formatManuscriptLabel(child, policy, { number }),
          state,
        ),
      );
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
      children.push(
        await readStructuredDocument(
          projectPath,
          relativeDirectory,
          documentEntry,
          formatManuscriptLabel(documentEntry, policy, {
            number,
            volumeNumber,
            volumeTitle: volume.index.title,
          }),
          state,
        ),
      );
    }
    nodes.push({
      children,
      ...(volume.index.icon === undefined ? {} : { icon: volume.index.icon }),
      name: volume.index.title,
      relativePath: path.join(manuscriptDirectory, child.directory),
      type: 'folder',
    });
  }
  return nodes;
};

const scanStructuredLore = async (
  projectPath: string,
  layout: LoadedProjectLayout,
  state: ProjectScanState,
): Promise<ProjectTreeNode[] | null> => {
  if (layout.lore === null) return null;

  const loreDirectory = 'lore';
  const categories = new Map(
    layout.lore.categories.map((category) => [category.directory, category]),
  );
  const nodes: ProjectTreeNode[] = [];

  for (const child of layout.lore.index.children) {
    if (child.kind !== 'category') {
      nodes.push(
        await readStructuredDocument(
          projectPath,
          loreDirectory,
          child,
          child.title,
          state,
        ),
      );
      continue;
    }

    const category = categories.get(child.directory);
    if (category === undefined) throw new Error('Lore category was not loaded');
    const relativeDirectory = path.join(loreDirectory, child.directory);
    const children: ProjectTreeNode[] = [];
    for (const entry of category.index.children) {
      children.push(
        await readStructuredDocument(
          projectPath,
          relativeDirectory,
          entry,
          entry.title,
          state,
        ),
      );
    }
    nodes.push({
      children,
      ...(category.index.icon === undefined
        ? {}
        : { icon: category.index.icon }),
      name: category.index.title,
      relativePath: relativeDirectory,
      type: 'folder',
    });
  }

  return nodes;
};

export const createProjectSnapshot = async (
  directoryPath: string,
  loadedLayout?: LoadedProjectLayout,
): Promise<ProjectSnapshot> => {
  const state: ProjectScanState = { bytes: 0, documents: [] };
  const layout = loadedLayout ?? (await loadProjectLayout(directoryPath));
  const tree = await scanStructuredManuscript(directoryPath, layout, state);
  const loreTree = await scanStructuredLore(directoryPath, layout, state);
  return {
    directory: {
      name: layout.manifest.title,
      path: directoryPath,
    },
    documents: state.documents,
    loreTree,
    projectId: layout.manifest.id,
    ...(layout.manifest.icon === undefined
      ? {}
      : { projectIcon: layout.manifest.icon }),
    revision: contentRevision(
      [
        ...layout.metadataSources,
        ...state.documents.map(
          (document) =>
            `${document.id}:${document.relativePath}:${document.revision}`,
        ),
      ].join('\n'),
    ),
    rootTitles: {
      ...(layout.lore === null ? {} : { lore: layout.lore.index.title }),
      manuscript: layout.manuscript.index.title,
    },
    tree,
  };
};
