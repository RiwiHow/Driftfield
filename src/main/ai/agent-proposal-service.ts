import { randomUUID } from 'node:crypto';

import type {
  AgentDocumentProposal,
  AgentCreateDocumentProposal,
  AgentDeleteDocumentProposal,
  AgentEditProposal,
  ApplyAgentProposalResult,
} from '../../shared/contracts/agent-proposals';
import type {
  AgentDocumentFileOperationArguments,
  AgentDraftSnapshot,
} from '../../shared/contracts/agent-tools';
import { saveProjectDocument } from '../services/project/document-service';
import { contentRevision } from '../services/project/document-utils';
import type { ProjectSessionService } from '../services/project/session-service';
import type { AgentConversationService } from '../services/agent/conversation-service';
import { MAX_AGENT_DOCUMENT_BYTES, ProjectContextError } from './project-context-service';
import { createProjectSnapshot } from '../services/project/snapshot-service';
import {
  createStructuredProjectDocument,
  deleteStructuredProjectDocument,
  getStructuredDirectoryDescriptor,
  getStructuredDocumentDescriptor,
} from '../services/project/structural-document-service';
import { parseProjectTitle } from '../services/project/metadata-parser';

interface CreateProposalRequest {
  baseContentRevision: string;
  baseRevision: string;
  documentId: string;
  markdown: string;
}

interface ProposalScope {
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
}

interface StoredProposal {
  ownerId: number;
  projectSessionId: string;
  proposal: AgentDocumentProposal;
}

export class AgentProposalService {
  private readonly proposals = new Map<string, StoredProposal>();

  constructor(
    private readonly sessions: ProjectSessionService,
    private readonly conversations?: AgentConversationService,
  ) {}

  create(scope: ProposalScope, request: CreateProposalRequest): AgentEditProposal {
    const draft = scope.draftSnapshot;
    const session = this.sessions.get(scope.ownerId);
    if (
      draft === undefined ||
      session === undefined ||
      scope.projectSessionId === undefined ||
      session.id !== scope.projectSessionId
    ) {
      throw new ProjectContextError('project-session-changed');
    }
    const document = session.project.documents.find(
      ({ id }) => id === request.documentId,
    );
    if (
      document === undefined ||
      !session.documentPaths.has(request.documentId) ||
      request.documentId !== draft.documentId
    ) {
      throw new ProjectContextError('document-not-found');
    }
    if (
      request.baseRevision !== draft.baseRevision ||
      request.baseContentRevision !== contentRevision(draft.markdown)
    ) {
      throw new ProjectContextError('proposal-base-changed');
    }
    if (Buffer.byteLength(request.markdown, 'utf8') > MAX_AGENT_DOCUMENT_BYTES) {
      throw new ProjectContextError('document-too-large');
    }

    const proposal: AgentEditProposal = {
      baseContentRevision: request.baseContentRevision,
      baseMarkdown: draft.markdown,
      baseRevision: request.baseRevision,
      documentId: request.documentId,
      markdown: request.markdown,
      proposalId: randomUUID(),
      requestId: scope.requestId,
      title: document.name,
    };
    this.proposals.set(proposal.proposalId, {
      ownerId: scope.ownerId,
      projectSessionId: session.id,
      proposal,
    });
    return proposal;
  }

  async createFileOperation(
    scope: ProposalScope,
    request: AgentDocumentFileOperationArguments,
  ): Promise<AgentCreateDocumentProposal | AgentDeleteDocumentProposal> {
    const session = this.sessions.get(scope.ownerId);
    if (
      session === undefined ||
      scope.projectSessionId === undefined ||
      session.id !== scope.projectSessionId
    ) {
      throw new ProjectContextError('project-session-changed');
    }
    if (request.projectRevision !== session.project.revision) {
      throw new ProjectContextError('proposal-base-changed');
    }

    let proposal: AgentCreateDocumentProposal | AgentDeleteDocumentProposal;
    if (request.operation === 'create') {
      const parent = await getStructuredDirectoryDescriptor(
        session.directoryPath,
        request.parentId,
      );
      if (parent === null) throw new ProjectContextError('document-not-found');
      const isLore = parent.kind === 'lore' || parent.kind === 'category';
      if ((isLore && request.kind !== 'entry') || (!isLore && request.kind === 'entry')) {
        throw new ProjectContextError('invalid-arguments');
      }
      if (Buffer.byteLength(request.markdown, 'utf8') > MAX_AGENT_DOCUMENT_BYTES) {
        throw new ProjectContextError('document-too-large');
      }
      let title: string;
      try {
        title = parseProjectTitle(request.title);
      } catch {
        throw new ProjectContextError('invalid-arguments');
      }
      proposal = {
        documentId: randomUUID(),
        documentKind: request.kind,
        markdown: request.markdown,
        operation: 'create',
        parentId: request.parentId,
        parentTitle: parent.title,
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title,
      };
    } else {
      const document = await getStructuredDocumentDescriptor(
        session.directoryPath,
        request.documentId,
      );
      if (document === null) throw new ProjectContextError('document-not-found');
      if (document.revision !== request.baseRevision) {
        throw new ProjectContextError('proposal-base-changed');
      }
      if (Buffer.byteLength(document.markdown, 'utf8') > MAX_AGENT_DOCUMENT_BYTES) {
        throw new ProjectContextError('document-too-large');
      }
      proposal = {
        baseMarkdown: document.markdown,
        baseRevision: request.baseRevision,
        documentId: request.documentId,
        operation: 'delete',
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title: document.title,
      };
    }
    this.proposals.set(proposal.proposalId, {
      ownerId: scope.ownerId,
      projectSessionId: session.id,
      proposal,
    });
    return proposal;
  }

  async apply(ownerId: number, proposalId: string): Promise<ApplyAgentProposalResult> {
    const stored = this.proposals.get(proposalId);
    const session = this.sessions.get(ownerId);
    if (session === undefined) return { proposalId, status: 'not-found' };
    if (stored !== undefined && stored.ownerId !== ownerId) {
      return { proposalId, status: 'not-found' };
    }
    const hasActiveStoredProposal =
      stored !== undefined &&
      stored.projectSessionId === session.id;
    if (stored !== undefined && !hasActiveStoredProposal) {
      this.proposals.delete(proposalId);
    }
    const isRecovered = !hasActiveStoredProposal;
    const proposal =
      hasActiveStoredProposal
        ? stored.proposal
        : this.conversations?.getProposal(session, proposalId);
    if (proposal === undefined || proposal === null) {
      return { proposalId, status: 'not-found' };
    }
    if ('operation' in proposal) {
      let currentProject: Awaited<ReturnType<typeof createProjectSnapshot>>;
      try {
        currentProject = await createProjectSnapshot(session.directoryPath);
      } catch {
        this.conversations?.setProposalStatus(session, proposalId, 'stale');
        return { proposalId, status: 'stale' };
      }
      if (currentProject.revision !== proposal.projectRevision) {
        this.conversations?.setProposalStatus(session, proposalId, 'stale');
        return { proposalId, status: 'stale' };
      }
      try {
        if (proposal.operation === 'create') {
          await createStructuredProjectDocument(session.directoryPath, {
            documentId: proposal.documentId,
            kind: proposal.documentKind,
            markdown: proposal.markdown,
            parentId: proposal.parentId,
            title: proposal.title,
          });
        } else {
          await deleteStructuredProjectDocument(session.directoryPath, {
            baseRevision: proposal.baseRevision,
            documentId: proposal.documentId,
          });
        }
      } catch {
        this.conversations?.setProposalStatus(session, proposalId, 'stale');
        return { proposalId, status: 'stale' };
      }
      const project = await this.sessions.refresh(ownerId);
      if (project === null) return { proposalId, status: 'not-found' };
      this.proposals.delete(proposalId);
      this.conversations?.setProposalStatus(session, proposalId, 'saved');
      return {
        documentId: proposal.documentId,
        project,
        proposalId,
        status: proposal.operation === 'create' ? 'created' : 'deleted',
      };
    }
    const relativePath = session.documentPaths.get(proposal.documentId);
    const currentDocument = session.project.documents.find(
      ({ id }) => id === proposal.documentId,
    );
    if (
      relativePath === undefined ||
      currentDocument === undefined ||
      currentDocument.revision !== proposal.baseRevision ||
      (isRecovered && currentDocument.markdown !== proposal.baseMarkdown)
    ) {
      this.conversations?.setProposalStatus(session, proposalId, 'stale');
      return { proposalId, status: 'stale' };
    }
    const result = await saveProjectDocument(
      session.directoryPath,
      {
        documentId: proposal.documentId,
        expectedRevision: proposal.baseRevision,
        markdown: proposal.markdown,
      },
      relativePath,
    );
    if (result.status !== 'saved') {
      const status = isRecovered && result.status === 'conflict'
        ? 'stale'
        : result.status;
      this.conversations?.setProposalStatus(session, proposalId, status);
      return { proposalId, status };
    }
    this.proposals.delete(proposalId);
    this.conversations?.setProposalStatus(session, proposalId, 'saved');
    return {
      documentId: proposal.documentId,
      markdown: proposal.markdown,
      proposalId,
      revision: result.revision,
      status: 'saved',
    };
  }

  reject(ownerId: number, proposalId: string): boolean {
    const stored = this.proposals.get(proposalId);
    const session = this.sessions.get(ownerId);
    if (session === undefined) return false;
    const persisted = this.conversations?.getProposal(session, proposalId);
    if ((stored === undefined || stored.ownerId !== ownerId) && persisted === null) return false;
    if (stored !== undefined) this.proposals.delete(proposalId);
    this.conversations?.setProposalStatus(session, proposalId, 'rejected');
    return true;
  }

  disposeOwner(ownerId: number): void {
    for (const [proposalId, stored] of this.proposals) {
      if (stored.ownerId === ownerId) this.proposals.delete(proposalId);
    }
  }
}
