import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentDocumentToolResult,
  AgentDraftSnapshot,
  AgentNovelStructureToolResult,
  AgentStoryMaintenanceToolResult,
  AgentStructureNode,
  AgentToolErrorCode,
} from '../../shared/contracts/agent-tools';
import type {
  LoreEntry,
  ManuscriptDocumentEntry,
} from '../../shared/contracts/project-layout';
import { loadProjectLayout } from '../services/project/layout-service';
import {
  contentRevision,
  isPathInside,
  supportedDocumentExtensions,
} from '../services/project/document-utils';
import type { ProjectSessionService } from '../services/project/session-service';
import type { ProjectStoryService } from '../services/project/story-service';
import type {
  ProjectStoryOperation,
  ProjectStorySnapshot,
} from '../../shared/contracts/project-story';
import { ProjectStoryRevisionConflictError } from '../database/project-story-repository';

export const MAX_AGENT_DOCUMENT_BYTES = 512 * 1024;

export class ProjectContextError extends Error {
  constructor(readonly code: AgentToolErrorCode) {
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

  async getStoryState(scope: ProjectContextScope): Promise<ProjectStorySnapshot> {
    const session = this.requireSession(scope);
    if (this.stories === undefined) throw new ProjectContextError('internal-error');
    return this.stories.getSnapshot(session);
  }

  maintainStoryRecords(
    scope: ProjectContextScope,
    requestId: string,
    storyRevision: number,
    change: ProjectStoryOperation,
  ): AgentStoryMaintenanceToolResult {
    const session = this.requireSession(scope);
    if (this.stories === undefined) throw new ProjectContextError('internal-error');
    try {
      const result = this.stories.maintainOperation(
        session,
        storyRevision,
        change,
        requestId,
      );
      return {
        operationId: result.operationId,
        revision: result.snapshot.revision,
        status: 'applied',
      };
    } catch (error) {
      if (error instanceof ProjectStoryRevisionConflictError) {
        throw new ProjectContextError('proposal-base-changed');
      }
      throw error;
    }
  }

  async getCurrentDocument(
    scope: ProjectContextScope,
  ): Promise<AgentDocumentToolResult> {
    const draft = scope.draftSnapshot;
    if (draft === undefined) throw new ProjectContextError('document-not-found');
    const session = this.requireSession(scope);
    const document = session.project.documents.find(({ id }) => id === draft.documentId);
    if (!session.documentPaths.has(draft.documentId)) {
      throw new ProjectContextError('document-not-found');
    }
    this.assertDocumentSize(draft.markdown);
    return {
      baseRevision: draft.baseRevision,
      contentRevision: contentRevision(draft.markdown),
      documentId: draft.documentId,
      markdown: draft.markdown,
      source: 'draft',
      title: document?.name ?? draft.documentId,
    };
  }

  async getDocument(
    scope: ProjectContextScope,
    documentId: string,
  ): Promise<AgentDocumentToolResult> {
    const session = this.requireSession(scope);
    const relativePath = session.documentPaths.get(documentId);
    const knownDocument = session.project.documents.find(({ id }) => id === documentId);
    if (relativePath === undefined || knownDocument === undefined) {
      const layout = await loadProjectLayout(session.directoryPath);
      const loreEntry = layout?.lore?.entries.find(({ id }) => id === documentId);
      if (loreEntry === undefined) throw new ProjectContextError('document-not-found');
      return this.readDiskDocument(
        session.directoryPath,
        loreEntry.relativePath,
        documentId,
        loreEntry.title,
      );
    }
    return this.readDiskDocument(
      session.directoryPath,
      relativePath,
      documentId,
      knownDocument.name,
    );
  }

  async getNovelStructure(
    scope: ProjectContextScope,
  ): Promise<AgentNovelStructureToolResult> {
    const session = this.requireSession(scope);
    const layout = await loadProjectLayout(session.directoryPath);
    const documents = new Map(session.project.documents.map((document) => [document.id, document]));
    const volumes = new Map(layout.manuscript.volumes.map((volume) => [volume.directory, volume]));
    const manuscriptChildren: AgentStructureNode[] = layout.manuscript.index.children.map((child) => {
      if (child.kind !== 'volume') return this.mapManuscriptDocument(child, documents);
      const volume = volumes.get(child.directory);
      if (volume === undefined) throw new ProjectContextError('internal-error');
      return {
        children: volume.index.children.map((entry) =>
          this.mapManuscriptDocument(entry, documents),
        ),
        id: volume.index.id,
        kind: 'volume',
        title: volume.index.title,
        type: 'directory',
      };
    });
    const result: AgentNovelStructureToolResult = {
      format: 'driftfield',
      manuscript: {
        children: manuscriptChildren,
        id: layout.manuscript.index.id,
        kind: 'manuscript',
        title: layout.manuscript.index.title,
        type: 'directory',
      },
      project: {
        id: layout.manifest.id,
        revision: session.project.revision,
        title: layout.manifest.title,
      },
    };
    if (layout.lore !== null) {
      const categories = new Map(layout.lore.categories.map((category) => [category.directory, category]));
      result.lore = {
        children: layout.lore.index.children.map((child) => {
          if (child.kind !== 'category') return this.mapLoreEntry(child);
          const category = categories.get(child.directory);
          if (category === undefined) throw new ProjectContextError('internal-error');
          return {
            children: category.index.children.map((entry) => this.mapLoreEntry(entry)),
            id: category.index.id,
            kind: 'category',
            title: category.index.title,
            type: 'directory',
          };
        }),
        id: layout.lore.index.id,
        kind: 'lore',
        title: layout.lore.index.title,
        type: 'directory',
      };
    }
    return result;
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
    title: string,
  ): Promise<AgentDocumentToolResult> {
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
        documentId,
        markdown: content.toString('utf8'),
        source: 'disk',
        title,
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

  private mapManuscriptDocument(
    entry: ManuscriptDocumentEntry,
    documents: Map<string, { name: string; revision: string }>,
  ): AgentStructureNode {
    const document = documents.get(entry.id);
    return {
      id: entry.id,
      kind: entry.kind,
      ...(document === undefined ? {} : { revision: document.revision }),
      title: document?.name ?? entry.title,
      type: 'document',
    };
  }

  private mapLoreEntry(entry: LoreEntry): AgentStructureNode {
    return { id: entry.id, kind: 'entry', title: entry.title, type: 'document' };
  }
}
