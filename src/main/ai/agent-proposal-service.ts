import { randomUUID } from 'node:crypto';

import type {
  AgentEditProposal,
  ApplyAgentProposalResult,
} from '../../shared/contracts/agent-proposals';
import type { AgentDraftSnapshot } from '../../shared/contracts/agent-tools';
import {
  contentRevision,
  saveProjectDocument,
} from '../services/project-service';
import type { ProjectSessionService } from '../services/project-session-service';
import type { AgentConversationService } from '../services/agent-conversation-service';
import { MAX_AGENT_DOCUMENT_BYTES, ProjectContextError } from './project-context-service';

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
  proposal: AgentEditProposal;
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
