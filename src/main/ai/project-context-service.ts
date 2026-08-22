import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { Bash } from 'just-bash';

import type {
  AgentStoryMaintenanceChange,
  AgentDraftSnapshot,
  AgentProjectBashResult,
  AgentStoryMaintenanceToolResult,
  AgentCanonicalStoryQuestionArguments,
  AgentStoryQuestionToolResult,
  AgentToolErrorCode,
} from '../../shared/contracts/agent-tools';
import {
  ACCEPTED_DOCUMENT_METADATA_PATH,
  ACCEPTED_DOCUMENT_PATH,
  AGENT_DIRECTORY_INDEX_NAME,
  AGENT_ICON_CONTEXT_PATH,
  AGENT_STORY_CONTEXT_PATH,
} from '../../shared/contracts/agent-tool-schema';
import type { ProjectTreeNode } from '../../shared/contracts/project';
import {
  PROJECT_ICON_IDS,
  type ManuscriptDocumentEntry,
} from '../../shared/contracts/project-layout';
import {
  loadProjectLayout,
  type LoadedProjectLayout,
} from '../services/project/layout-service';
import {
  contentRevision,
  isPathInside,
  supportedDocumentExtensions,
} from '../services/project/document-utils';
import type { ProjectSessionService } from '../services/project/session-service';
import type { ProjectStoryService } from '../services/project/story-service';
import { StoryMaintenanceReferenceError } from '../services/project/story-service';
import type {
  ProjectStorySnapshot,
} from '../../shared/contracts/project-story';
import { ProjectStoryRevisionConflictError } from '../database/project-story-repository';

export const MAX_AGENT_DOCUMENT_BYTES = 512 * 1024;
const MAX_AGENT_PROJECT_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_AGENT_BASH_OUTPUT_BYTES = 192 * 1024;

export interface AgentBashDocumentAnchor {
  baseRevision: string;
  contentRevision: string;
  documentId: string;
  kind: import('../../shared/contracts/project-layout').ManuscriptDocumentKind | 'entry';
}

export interface AgentBashAcceptedDocument {
  baseRevision: string;
  contentRevision: string;
  displayTitle: string;
  documentId: string;
  markdown: string;
  metadataTitle: string;
}

export interface AgentBashDirectoryAnchor {
  directoryId: string;
  kind: 'category' | 'lore' | 'manuscript' | 'volume';
}

export interface AgentProjectBashExecution {
  acceptedDocument?: AgentBashAcceptedDocument;
  directories: Map<string, AgentBashDirectoryAnchor>;
  documents: Map<string, AgentBashDocumentAnchor>;
  projectRevision: string;
  result: AgentProjectBashResult;
  story: ProjectStorySnapshot | null;
}

export class ProjectContextError extends Error {
  constructor(
    readonly code: AgentToolErrorCode,
    readonly detail?: string,
  ) {
    super(code);
  }
}

export interface ProjectContextScope {
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
}

export class ProjectContextService {
  constructor(
    private readonly sessions: ProjectSessionService,
    private readonly stories?: ProjectStoryService,
  ) {}

  async executeProjectBash(
    scope: ProjectContextScope,
    command: string,
    acceptedDocumentId?: string,
  ): Promise<AgentProjectBashExecution> {
    const session = this.requireSession(scope);
    const layout = await loadProjectLayout(session.directoryPath);
    const files: Record<string, string> = {};
    let totalBytes = 0;
    const draft = scope.draftSnapshot;
    const documents = new Map<string, AgentBashDocumentAnchor>();
    const documentKinds = new Map<string, AgentBashDocumentAnchor['kind']>();
    for (const child of layout.manuscript.index.children) {
      if (child.kind !== 'volume') documentKinds.set(child.id, child.kind);
    }
    for (const volume of layout.manuscript.volumes) {
      for (const child of volume.index.children) {
        documentKinds.set(child.id, child.kind);
      }
    }
    for (const entry of layout.lore?.entries ?? []) {
      documentKinds.set(entry.id, 'entry');
    }

    for (const document of session.project.documents) {
      const relativePath = document.relativePath.split('\\').join('/');
      if (
        relativePath.startsWith('/') ||
        relativePath.split('/').includes('..') ||
        (!relativePath.startsWith('manuscript/') &&
          !relativePath.startsWith('lore/'))
      ) {
        throw new ProjectContextError('internal-error');
      }
      const markdown = draft?.documentId === document.id
        ? draft.markdown
        : document.markdown;
      const bytes = Buffer.byteLength(markdown, 'utf8');
      if (bytes > MAX_AGENT_DOCUMENT_BYTES) {
        throw new ProjectContextError('document-too-large');
      }
      totalBytes += bytes;
      if (totalBytes > MAX_AGENT_PROJECT_SNAPSHOT_BYTES) {
        throw new ProjectContextError('selection-too-large');
      }
      files[`/project/${relativePath}`] = markdown;
      documents.set(relativePath, {
        baseRevision: document.revision,
        contentRevision: contentRevision(markdown),
        documentId: document.id,
        kind: requireDocumentKind(documentKinds, document.id),
      });
    }

    const directories = new Map<string, AgentBashDirectoryAnchor>();
    directories.set('manuscript', {
      directoryId: layout.manuscript.index.id,
      kind: 'manuscript',
    });
    for (const volume of layout.manuscript.volumes) {
      directories.set(`manuscript/${volume.directory}`, {
        directoryId: volume.index.id,
        kind: 'volume',
      });
    }
    if (layout.lore !== null) {
      directories.set('lore', {
        directoryId: layout.lore.index.id,
        kind: 'lore',
      });
      for (const category of layout.lore.categories) {
        directories.set(`lore/${category.directory}`, {
          directoryId: category.index.id,
          kind: 'category',
        });
      }
    }

    const story = this.stories?.getSnapshot(session) ?? null;
    if (story !== null) {
      const storyJson = JSON.stringify(
        toAgentBashStory(story, documents),
        null,
        2,
      );
      files[AGENT_STORY_CONTEXT_PATH] = storyJson;
      totalBytes += Buffer.byteLength(storyJson, 'utf8');
    }
    const iconCatalog = `${PROJECT_ICON_IDS.join('\n')}\n`;
    files[AGENT_ICON_CONTEXT_PATH] = iconCatalog;
    totalBytes += Buffer.byteLength(iconCatalog, 'utf8');
    const acceptedDocument = acceptedDocumentId === undefined
      ? undefined
      : await this.getDocument(scope, acceptedDocumentId);
    if (acceptedDocument !== undefined) {
      files[ACCEPTED_DOCUMENT_PATH] = acceptedDocument.markdown;
      const acceptedMetadata = JSON.stringify({
        displayTitle: acceptedDocument.displayTitle,
        metadataTitle: acceptedDocument.metadataTitle,
        path: [...documents.entries()].find(([, anchor]) =>
          anchor.documentId === acceptedDocumentId)?.[0] ?? null,
      }, null, 2);
      files[ACCEPTED_DOCUMENT_METADATA_PATH] = acceptedMetadata;
      totalBytes += Buffer.byteLength(acceptedDocument.markdown, 'utf8');
      totalBytes += Buffer.byteLength(acceptedMetadata, 'utf8');
    }

    const directoryIndexes = buildAgentDirectoryIndexes(
      layout.manifest.title,
      session.project.rootTitles,
      session.project.tree,
      session.project.loreTree,
    );
    for (const [indexPath, indexJson] of Object.entries(directoryIndexes)) {
      files[indexPath] = indexJson;
      totalBytes += Buffer.byteLength(indexJson, 'utf8');
    }
    if (totalBytes > MAX_AGENT_PROJECT_SNAPSHOT_BYTES) {
      throw new ProjectContextError('selection-too-large');
    }

    const bash = new Bash({
      cwd: '/project',
      env: {
        HOME: '/project',
        LANG: 'C.UTF-8',
        PWD: '/project',
      },
      executionLimitProfile: 'hardened',
      executionLimits: {
        maxCommandCount: 256,
        maxExecutionTimeMs: 5_000,
        maxFileSystemBytes: MAX_AGENT_PROJECT_SNAPSHOT_BYTES,
        maxLoopIterations: 10_000,
        maxOutputSize: MAX_AGENT_BASH_OUTPUT_BYTES,
        maxSourceBytes: 8 * 1024,
        maxTraversalEntries: 20_000,
        maxTraversalWork: 100_000,
      },
      files,
      javascript: false,
      python: false,
    });
    for (const relativePath of directories.keys()) {
      await bash.fs.mkdir(`/project/${relativePath}`, { recursive: true });
    }
    const result = await bash.exec(command, {
      cwd: '/project',
      env: {},
      replaceEnv: false,
    });
    return {
      ...(acceptedDocument === undefined ? {} : { acceptedDocument }),
      directories,
      documents,
      projectRevision: session.project.revision,
      result: {
        exitCode: result.exitCode,
        stderr: result.stderr,
        stdout: result.stdout,
      },
      story,
    };
  }

  maintainStoryRecords(
    scope: ProjectContextScope,
    requestId: string,
    storyRevision: number,
    changes: AgentStoryMaintenanceChange[],
  ): AgentStoryMaintenanceToolResult {
    const session = this.requireSession(scope);
    if (this.stories === undefined) throw new ProjectContextError('internal-error');
    try {
      const result = this.stories.maintainOperations(
        session,
        storyRevision,
        changes,
        requestId,
      );
      return {
        appliedCount: result.changes.length,
        revision: result.snapshot.revision,
        status: 'applied',
      };
    } catch (error) {
      if (error instanceof ProjectStoryRevisionConflictError) {
        throw new ProjectContextError('proposal-base-changed');
      }
      if (error instanceof StoryMaintenanceReferenceError) {
        throw new ProjectContextError('invalid-arguments', error.message);
      }
      throw error;
    }
  }

  recordStoryQuestion(
    scope: ProjectContextScope,
    requestId: string,
    input: AgentCanonicalStoryQuestionArguments,
  ): AgentStoryQuestionToolResult {
    const session = this.requireSession(scope);
    if (this.stories === undefined) throw new ProjectContextError('internal-error');
    const question = this.stories.recordQuestion(session, requestId, input);
    return {
      questionId: question.id,
      revision: this.stories.getSnapshot(session).revision,
      status: 'recorded',
    };
  }

  resolveStoryQuestion(
    scope: ProjectContextScope,
    questionId: string,
    answer: string,
  ): AgentStoryQuestionToolResult {
    const session = this.requireSession(scope);
    if (this.stories === undefined) throw new ProjectContextError('internal-error');
    const question = this.stories.resolveQuestion(session, questionId, answer);
    return {
      questionId: question.id,
      revision: this.stories.getSnapshot(session).revision,
      status: 'resolved',
    };
  }

  private async getDocument(
    scope: ProjectContextScope,
    documentId: string,
  ): Promise<AgentBashAcceptedDocument> {
    const session = this.requireSession(scope);
    const relativePath = session.documentPaths.get(documentId);
    const knownDocument = session.project.documents.find(({ id }) => id === documentId);
    if (relativePath === undefined || knownDocument === undefined) {
      throw new ProjectContextError('document-not-found');
    }
    const layout = await loadProjectLayout(session.directoryPath);
    const metadataTitle = findMetadataTitle(layout, documentId);
    if (metadataTitle === undefined) {
      throw new ProjectContextError('document-not-found');
    }
    return this.readDiskDocument(
      session.directoryPath,
      relativePath,
      documentId,
      knownDocument.name,
      metadataTitle,
    );
  }

  private requireSession(scope: ProjectContextScope) {
    const session = this.sessions.get(scope.ownerId);
    if (
      session === undefined ||
      scope.projectSessionId === undefined ||
      session.id !== scope.projectSessionId
    ) {
      throw new ProjectContextError('project-session-changed');
    }
    return session;
  }

  private async readDiskDocument(
    projectDirectory: string,
    relativePath: string,
    documentId: string,
    displayTitle: string,
    metadataTitle: string,
  ): Promise<AgentBashAcceptedDocument> {
    try {
      const canonicalProject = await realpath(projectDirectory);
      const candidate = path.resolve(canonicalProject, relativePath);
      if (
        !isPathInside(canonicalProject, candidate) ||
        !supportedDocumentExtensions.has(path.extname(candidate).toLowerCase())
      ) throw new ProjectContextError('document-not-found');
      const stats = await lstat(candidate);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new ProjectContextError('document-not-found');
      if (stats.size > MAX_AGENT_DOCUMENT_BYTES) throw new ProjectContextError('document-too-large');
      const canonicalDocument = await realpath(candidate);
      if (!isPathInside(canonicalProject, canonicalDocument)) throw new ProjectContextError('document-not-found');
      const content = await readFile(canonicalDocument);
      this.assertDocumentSize(content);
      const revision = contentRevision(content);
      return {
        baseRevision: revision,
        contentRevision: revision,
        displayTitle,
        documentId,
        markdown: content.toString('utf8'),
        metadataTitle,
      };
    } catch (error) {
      if (error instanceof ProjectContextError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new ProjectContextError('document-not-found');
      }
      throw error;
    }
  }

  private assertDocumentSize(content: string | Buffer): void {
    if (Buffer.byteLength(content) > MAX_AGENT_DOCUMENT_BYTES) {
      throw new ProjectContextError('document-too-large');
    }
  }

}

const toAgentBashIndexNode = (node: ProjectTreeNode): object =>
  node.type === 'file'
    ? {
        name: node.name,
        path: node.relativePath,
        type: node.type,
      }
    : {
        ...(node.icon === undefined ? {} : { icon: node.icon }),
        name: node.name,
        path: node.relativePath,
        type: node.type,
      };

const buildAgentDirectoryIndexes = (
  projectTitle: string,
  rootTitles: { lore?: string; manuscript: string },
  manuscript: ProjectTreeNode[],
  lore: ProjectTreeNode[] | null,
): Record<string, string> => {
  const indexes: Record<string, string> = {};
  const writeIndex = (
    directoryPath: string,
    value: object,
  ): void => {
    const prefix = directoryPath.length === 0
      ? '/project'
      : `/project/${directoryPath}`;
    indexes[`${prefix}/${AGENT_DIRECTORY_INDEX_NAME}`] = JSON.stringify(
      value,
      null,
      2,
    );
  };
  const writeFolderIndexes = (nodes: ProjectTreeNode[]): void => {
    for (const node of nodes) {
      if (node.type !== 'folder') continue;
      writeIndex(node.relativePath, {
        children: node.children.map(toAgentBashIndexNode),
        ...(node.icon === undefined ? {} : { icon: node.icon }),
        name: node.name,
        path: node.relativePath,
        type: node.type,
      });
      writeFolderIndexes(node.children);
    }
  };

  const rootChildren = [
    { name: rootTitles.manuscript, path: 'manuscript', type: 'folder' },
    ...(lore === null
      ? []
      : [{ name: rootTitles.lore!, path: 'lore', type: 'folder' as const }]),
  ];
  writeIndex('', {
    children: rootChildren,
    format: 'driftfield-agent-directory-index',
    name: projectTitle,
    path: '.',
    type: 'project',
  });
  writeIndex('manuscript', {
    children: manuscript.map(toAgentBashIndexNode),
    name: rootTitles.manuscript,
    path: 'manuscript',
    type: 'folder',
  });
  writeFolderIndexes(manuscript);
  if (lore !== null) {
    writeIndex('lore', {
      children: lore.map(toAgentBashIndexNode),
      name: rootTitles.lore!,
      path: 'lore',
      type: 'folder',
    });
    writeFolderIndexes(lore);
  }
  return indexes;
};

const toAgentBashStory = (
  story: ProjectStorySnapshot,
  documents: Map<string, AgentBashDocumentAnchor>,
): object => {
  const pathsByDocumentId = new Map(
    [...documents.entries()].map(([relativePath, anchor]) => [
      anchor.documentId,
      relativePath,
    ]),
  );
  const { eventSources, questions, revision: _revision, ...rest } = story;
  return {
    ...rest,
    eventSources: eventSources.flatMap(
      ({ documentId, documentRevision: _documentRevision, ...source }) => {
        const documentPath = pathsByDocumentId.get(documentId);
        return documentPath === undefined ? [] : [{ ...source, documentPath }];
      },
    ),
    questions: questions.map(({ originRequestId: _originRequestId, ...question }) => ({
      ...question,
      evidence: toAgentBashEvidence(question.evidence, pathsByDocumentId),
    })),
  };
};

const toAgentBashEvidence = (
  evidence: ProjectStorySnapshot['questions'][number]['evidence'],
  pathsByDocumentId: Map<string, string>,
): { anchor: string; documentPath: string; sourceKind: 'manuscript' } | null => {
  if (evidence === null) return null;
  const documentPath = pathsByDocumentId.get(evidence.documentId);
  return documentPath === undefined
    ? null
    : {
        anchor: evidence.anchor,
        documentPath,
        sourceKind: evidence.sourceKind,
      };
};

const requireDocumentKind = (
  kinds: Map<string, AgentBashDocumentAnchor['kind']>,
  documentId: string,
): AgentBashDocumentAnchor['kind'] => {
  const kind = kinds.get(documentId);
  if (kind === undefined) throw new ProjectContextError('internal-error');
  return kind;
};

const findMetadataTitle = (
  layout: LoadedProjectLayout,
  documentId: string,
): string | undefined => {
  const directManuscript = layout.manuscript.index.children.find(
    (child): child is ManuscriptDocumentEntry =>
      child.kind !== 'volume' && child.id === documentId,
  );
  if (directManuscript !== undefined) return directManuscript.title;
  for (const volume of layout.manuscript.volumes) {
    const entry = volume.index.children.find(({ id }) => id === documentId);
    if (entry !== undefined) return entry.title;
  }
  return layout.lore?.entries.find(({ id }) => id === documentId)?.title;
};
