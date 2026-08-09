import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  ProjectDocument,
  ProjectSnapshot,
  ProjectTreeNode,
} from '../../../shared/contracts/project';
import type {
  ChapterNumberingPolicy,
  ManuscriptDocumentEntry,
} from '../../../shared/contracts/project-layout';
import {
  loadProjectLayout,
  type LoadedProjectLayout,
} from './layout-service';
import { contentRevision } from './document-utils';

export const MAX_PROJECT_DOCUMENTS = 500;
export const MAX_PROJECT_BYTES = 10 * 1024 * 1024;

interface ProjectScanState {
  bytes: number;
  documents: ProjectDocument[];
}

const readProjectDocument = async (
  projectPath: string,
  relativePath: string,
  id = relativePath,
  name = path.basename(relativePath, path.extname(relativePath)),
): Promise<ProjectDocument> => {
  const absolutePath = path.resolve(projectPath, relativePath);
  const fileBuffer = await readFile(absolutePath);
  return {
    id,
    markdown: fileBuffer.toString('utf8'),
    name,
    relativePath,
    revision: contentRevision(fileBuffer),
  };
};

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
  entry: ManuscriptDocumentEntry,
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

export const createProjectSnapshot = async (
  directoryPath: string,
  loadedLayout?: LoadedProjectLayout,
): Promise<ProjectSnapshot> => {
  const state: ProjectScanState = { bytes: 0, documents: [] };
  const layout = loadedLayout ?? (await loadProjectLayout(directoryPath));
  const tree = await scanStructuredManuscript(directoryPath, layout, state);
  let loreRevisions: string[] = [];
  const loreEntries = layout.lore?.entries ?? [];
  if (loreEntries.length > 0) {
    if (state.documents.length + loreEntries.length > MAX_PROJECT_DOCUMENTS) {
      throw new Error('Project contains too many Markdown documents');
    }
    const loreContents = await Promise.all(
      loreEntries.map(async (entry) => ({
        content: await readFile(path.join(directoryPath, entry.relativePath)),
        entry,
      })),
    );
    const loreBytes = loreContents.reduce(
      (total, { content }) => total + content.byteLength,
      0,
    );
    if (state.bytes + loreBytes > MAX_PROJECT_BYTES) {
      throw new Error('Project Markdown documents are too large');
    }
    state.bytes += loreBytes;
    loreRevisions = loreContents.map(
      ({ content, entry }) =>
        `${entry.id}:${entry.relativePath}:${contentRevision(content)}`,
    );
  }
  return {
    directory: {
      name: layout.manifest.title,
      path: directoryPath,
    },
    documents: state.documents,
    projectId: layout.manifest.id,
    ...(layout.manifest.icon === undefined
      ? {}
      : { projectIcon: layout.manifest.icon }),
    revision: contentRevision(
      [
        ...layout.metadataSources,
        ...loreRevisions,
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
