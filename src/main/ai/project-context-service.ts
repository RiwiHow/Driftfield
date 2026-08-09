import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import type {
  AgentDocumentToolResult,
  AgentDraftSnapshot,
  AgentNovelStructureToolResult,
  AgentStructureDirectory,
  AgentStructureNode,
  AgentToolErrorCode,
} from '../../shared/contracts/agent-tools';
import type { ProjectTreeNode } from '../../shared/contracts/project';
import type {
  LorebookEntry,
  ManuscriptDocumentEntry,
} from '../../shared/contracts/project-layout';
import { loadProjectLayout } from '../services/project-layout-service';
import {
  contentRevision,
  isPathInside,
  supportedDocumentExtensions,
} from '../services/project-service';
import type { ProjectSessionService } from '../services/project-session-service';

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
  constructor(private readonly sessions: ProjectSessionService) {}

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
      const loreEntry = layout?.lorebook?.entries.find(({ id }) => id === documentId);
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
    if (layout === null) {
      return {
        format: 'legacy',
        manuscript: {
          children: session.project.tree.map((node) =>
            this.mapLegacyNode(node, session.project.documents),
          ),
          kind: 'manuscript',
          title: session.project.rootTitles?.manuscript ?? 'Manuscript',
          type: 'directory',
        },
        project: {
          revision: session.project.revision,
          title: session.project.directory.name,
        },
      };
    }

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
    if (layout.lorebook !== null) {
      const categories = new Map(layout.lorebook.categories.map((category) => [category.directory, category]));
      result.lorebook = {
        children: layout.lorebook.index.children.map((child) => {
          if (child.kind !== 'category') return this.mapLorebookEntry(child);
          const category = categories.get(child.directory);
          if (category === undefined) throw new ProjectContextError('internal-error');
          return {
            children: category.index.children.map((entry) => this.mapLorebookEntry(entry)),
            id: category.index.id,
            kind: 'category',
            title: category.index.title,
            type: 'directory',
          };
        }),
        id: layout.lorebook.index.id,
        kind: 'lorebook',
        title: layout.lorebook.index.title,
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

  private mapLorebookEntry(entry: LorebookEntry): AgentStructureNode {
    return { id: entry.id, kind: 'entry', title: entry.title, type: 'document' };
  }

  private mapLegacyNode(
    node: ProjectTreeNode,
    documents: Array<{ id: string; revision: string }>,
  ): AgentStructureNode {
    if (node.type === 'file') {
      return {
        id: node.documentId,
        kind: 'document',
        revision: documents.find(({ id }) => id === node.documentId)?.revision,
        title: node.name,
        type: 'document',
      };
    }
    return {
      children: node.children.map((child) => this.mapLegacyNode(child, documents)),
      kind: 'directory',
      title: node.name,
      type: 'directory',
    } satisfies AgentStructureDirectory;
  }
}
