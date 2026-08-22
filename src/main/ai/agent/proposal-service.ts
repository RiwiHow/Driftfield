import { randomUUID } from 'node:crypto';

import type {
  AgentProposal,
  AgentCreateDocumentProposal,
  AgentDeleteDocumentProposal,
  AgentDeleteLoreCategoryProposal,
  AgentCreateDirectoryProposal,
  AgentEditProposal,
  AgentMoveDocumentProposal,
  AgentRenameDocumentProposal,
  AgentSetLoreCategoryIconProposal,
  AgentStoryProposal,
  AgentProposalOutcomeStatus,
  ApplyAgentProposalResult,
} from '../../../shared/contracts/agent-proposals';
import type {
  AgentDocumentFileOperationArguments,
  AgentProjectStructureOperationArguments,
  AgentDraftSnapshot,
} from '../../../shared/contracts/agent-tools';
import type { ProjectStoryOperation } from '../../../shared/contracts/project-story';
import type { ProjectStoryService } from '../../services/project/story-service';
import { ProjectStoryRevisionConflictError } from '../../database/project-story-repository';
import { saveProjectDocument } from '../../services/project/document-service';
import { contentRevision } from '../../services/project/document-utils';
import type { ProjectSessionService } from '../../services/project/session-service';
import type { AgentConversationService } from '../../services/agent/conversation-service';
import { MAX_AGENT_DOCUMENT_BYTES, ProjectContextError } from './context-service';
import { createProjectSnapshot } from '../../services/project/snapshot-service';
import {
  createStructuredProjectDocument,
  createStructuredProjectDirectory,
  deleteStructuredLoreCategory,
  deleteStructuredProjectDocument,
  getStructuredDirectoryDescriptor,
  getStructuredDocumentDescriptor,
  getStructuredRootDirectoryDescriptor,
  moveStructuredProjectDocument,
  renameStructuredProjectDocument,
  setStructuredLoreCategoryIcon,
} from '../../services/project/structural-document-service';
import { parseProjectTitle } from '../../services/project/metadata-parser';
import { assertValidManuscriptMarkdown } from '../../services/project/manuscript-markdown-validator';

interface CreateProposalRequest {
  baseContentRevision: string;
  baseRevision: string;
  documentId: string;
  markdown: string;
}

/**
 * A model request plus the revisions Main served for it in this Agent request.
 * The model never supplies a concurrency token; Main anchors it.
 */
export type ResolvedDocumentFileOperationArguments =
  | (Omit<Extract<AgentDocumentFileOperationArguments, { operation: 'create' }>, 'parentPath'> & {
      parentId: string;
      projectRevision: string;
    })
  | (Omit<Extract<AgentDocumentFileOperationArguments, { operation: 'delete' }>, 'documentPath'> & {
      baseRevision: string;
      documentId: string;
      projectRevision: string;
    });

export type ResolvedProjectStructureOperationArguments =
  | (Extract<AgentProjectStructureOperationArguments,
      { operation: 'create_volume' | 'create_lore_category' }
    > & { projectRevision: string })
  | (Omit<Extract<AgentProjectStructureOperationArguments,
      { operation: 'delete_lore_category' }
    >, 'directoryPath'> & { directoryId: string; projectRevision: string })
  | (Omit<Extract<AgentProjectStructureOperationArguments,
      { operation: 'set_lore_category_icon' }
    >, 'directoryPath'> & { directoryId: string; projectRevision: string })
  | (Omit<Extract<AgentProjectStructureOperationArguments,
      { operation: 'rename_document' }
    >, 'documentPath'> & { documentId: string; projectRevision: string })
  | (Omit<Extract<
      AgentProjectStructureOperationArguments,
      { operation: 'move_document' }
    >, 'documentPath' | 'targetParentPath'> & {
      baseRevision: string;
      documentId: string;
      projectRevision: string;
      targetParentId: string;
    });

interface ProposalScope {
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
}

interface StoredProposal {
  ownerId: number;
  projectSessionId: string;
  proposal: AgentProposal;
}

interface ProposalDecisionWaiter {
  ownerId: number;
  requestId: string;
  resolve: (result: AgentProposalDecision) => void;
}

export interface AgentProposalDecision {
  proposalId: string;
  status: AgentProposalOutcomeStatus;
}

export class AgentProposalService {
  private readonly proposals = new Map<string, StoredProposal>();
  private readonly decisionWaiters = new Map<string, ProposalDecisionWaiter>();

  constructor(
    private readonly sessions: ProjectSessionService,
    private readonly conversations?: AgentConversationService,
    private readonly stories?: ProjectStoryService,
  ) {}

  createStoryOperation(
    scope: ProposalScope,
    request: { change: ProjectStoryOperation; storyRevision: number },
  ): AgentStoryProposal {
    const session = this.sessions.get(scope.ownerId);
    if (
      session === undefined ||
      scope.projectSessionId === undefined ||
      session.id !== scope.projectSessionId ||
      this.stories === undefined
    ) {
      throw new ProjectContextError('project-session-changed');
    }
    const change = structuredClone(request.change);
    const proposal: AgentStoryProposal = {
      change,
      operation: 'story',
      proposalId: randomUUID(),
      requestId: scope.requestId,
      storyRevision: request.storyRevision,
      title: storyOperationTitle(change),
    };
    try {
      this.stories.createProposal(
        session,
        request.storyRevision,
        change,
        {
          operationId: proposal.proposalId,
          operationKind: change.operation,
          originRequestId: scope.requestId,
          payload: change,
        },
      );
    } catch (error) {
      if (error instanceof ProjectStoryRevisionConflictError) {
        throw new ProjectContextError('proposal-base-changed');
      }
      throw error;
    }
    this.proposals.set(proposal.proposalId, {
      ownerId: scope.ownerId,
      projectSessionId: session.id,
      proposal,
    });
    return proposal;
  }

  create(scope: ProposalScope, request: CreateProposalRequest): AgentEditProposal {
    try {
      assertValidManuscriptMarkdown(request.markdown, {
        maxBytes: MAX_AGENT_DOCUMENT_BYTES,
      });
    } catch {
      throw new ProjectContextError('invalid-arguments');
    }
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
    request: ResolvedDocumentFileOperationArguments,
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
      try {
        assertValidManuscriptMarkdown(request.markdown, {
          maxBytes: MAX_AGENT_DOCUMENT_BYTES,
        });
      } catch {
        throw new ProjectContextError('invalid-arguments');
      }
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
        title = parseProjectTitle(request.metadataTitle);
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

  async createStructureOperation(
    scope: ProposalScope,
    request: Extract<ResolvedProjectStructureOperationArguments, { operation: 'move_document' }>,
  ): Promise<AgentMoveDocumentProposal>;
  async createStructureOperation(
    scope: ProposalScope,
    request: Extract<ResolvedProjectStructureOperationArguments, { operation: 'delete_lore_category' }>,
  ): Promise<AgentDeleteLoreCategoryProposal>;
  async createStructureOperation(
    scope: ProposalScope,
    request: Extract<ResolvedProjectStructureOperationArguments, { operation: 'rename_document' }>,
  ): Promise<AgentRenameDocumentProposal>;
  async createStructureOperation(
    scope: ProposalScope,
    request: Extract<ResolvedProjectStructureOperationArguments, { operation: 'set_lore_category_icon' }>,
  ): Promise<AgentSetLoreCategoryIconProposal>;
  async createStructureOperation(
    scope: ProposalScope,
    request: Exclude<ResolvedProjectStructureOperationArguments, {
      operation: 'delete_lore_category' | 'move_document' | 'rename_document' | 'set_lore_category_icon';
    }>,
  ): Promise<AgentCreateDirectoryProposal>;
  async createStructureOperation(
    scope: ProposalScope,
    request: ResolvedProjectStructureOperationArguments,
  ): Promise<
    AgentCreateDirectoryProposal |
    AgentDeleteLoreCategoryProposal |
    AgentMoveDocumentProposal |
    AgentRenameDocumentProposal |
    AgentSetLoreCategoryIconProposal
  >;
  async createStructureOperation(
    scope: ProposalScope,
    request: ResolvedProjectStructureOperationArguments,
  ): Promise<
    AgentCreateDirectoryProposal |
    AgentDeleteLoreCategoryProposal |
    AgentMoveDocumentProposal |
    AgentRenameDocumentProposal |
    AgentSetLoreCategoryIconProposal
  > {
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
    let proposal:
      | AgentCreateDirectoryProposal
      | AgentDeleteLoreCategoryProposal
      | AgentMoveDocumentProposal
      | AgentRenameDocumentProposal
      | AgentSetLoreCategoryIconProposal;
    if (request.operation === 'move_document') {
      const [document, target] = await Promise.all([
        getStructuredDocumentDescriptor(session.directoryPath, request.documentId),
        getStructuredDirectoryDescriptor(session.directoryPath, request.targetParentId),
      ]);
      if (document === null || target === null) {
        throw new ProjectContextError('document-not-found');
      }
      if (document.revision !== request.baseRevision) {
        throw new ProjectContextError('proposal-base-changed');
      }
      const documentIsLore = document.parentKind === 'lore' || document.parentKind === 'category';
      const targetIsLore = target.kind === 'lore' || target.kind === 'category';
      if (documentIsLore !== targetIsLore || document.parentId === target.id) {
        throw new ProjectContextError('invalid-arguments');
      }
      proposal = {
        baseRevision: request.baseRevision,
        documentId: request.documentId,
        operation: 'move_document',
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        sourceParentId: document.parentId,
        sourceParentTitle: document.parentTitle,
        targetParentId: target.id,
        targetParentTitle: target.title,
        title: document.title,
      };
    } else if (request.operation === 'set_lore_category_icon') {
      const directory = await getStructuredDirectoryDescriptor(
        session.directoryPath,
        request.directoryId,
      );
      if (
        directory === null ||
        directory.kind !== 'category' ||
        directory.icon === request.icon
      ) {
        throw new ProjectContextError('invalid-arguments');
      }
      proposal = {
        directoryId: directory.id,
        icon: request.icon,
        operation: 'set_lore_category_icon',
        ...(directory.icon === undefined
          ? {}
          : { previousIcon: directory.icon }),
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title: directory.title,
      };
    } else if (request.operation === 'rename_document') {
      const document = await getStructuredDocumentDescriptor(
        session.directoryPath,
        request.documentId,
      );
      if (document === null) throw new ProjectContextError('document-not-found');
      let metadataTitle: string;
      try {
        metadataTitle = parseProjectTitle(request.metadataTitle);
      } catch {
        throw new ProjectContextError('invalid-arguments');
      }
      if (metadataTitle === document.title) {
        throw new ProjectContextError('invalid-arguments');
      }
      proposal = {
        documentId: request.documentId,
        operation: 'rename_document',
        previousTitle: document.title,
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title: metadataTitle,
      };
    } else if (request.operation === 'delete_lore_category') {
      const [directory, parent] = await Promise.all([
        getStructuredDirectoryDescriptor(
          session.directoryPath,
          request.directoryId,
        ),
        getStructuredRootDirectoryDescriptor(session.directoryPath, 'lore'),
      ]);
      if (
        directory === null ||
        directory.kind !== 'category' ||
        directory.childCount !== 0 ||
        parent === null
      ) {
        throw new ProjectContextError('invalid-arguments');
      }
      proposal = {
        directoryId: request.directoryId,
        operation: 'delete_lore_category',
        parentId: parent.id,
        parentTitle: parent.title,
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title: directory.title,
      };
    } else {
      let title: string;
      try {
        title = parseProjectTitle(request.title);
      } catch {
        throw new ProjectContextError('invalid-arguments');
      }
      const directoryKind = request.operation === 'create_volume' ? 'volume' : 'category';
      const parent = await getStructuredRootDirectoryDescriptor(
        session.directoryPath,
        directoryKind === 'volume' ? 'manuscript' : 'lore',
      );
      if (parent === null) throw new ProjectContextError('document-not-found');
      proposal = {
        directoryId: randomUUID(),
        directoryKind,
        ...(request.operation === 'create_lore_category'
          ? { icon: request.icon }
          : {}),
        operation: request.operation,
        parentId: parent.id,
        parentTitle: parent.title,
        projectRevision: request.projectRevision,
        proposalId: randomUUID(),
        requestId: scope.requestId,
        title,
      };
    }
    this.proposals.set(proposal.proposalId, {
      ownerId: scope.ownerId,
      projectSessionId: session.id,
      proposal,
    });
    return proposal;
  }

  waitForDecision(
    requestId: string,
    proposalId: string,
  ): Promise<AgentProposalDecision> {
    const stored = this.proposals.get(proposalId);
    if (stored === undefined || stored.proposal.requestId !== requestId) {
      throw new ProjectContextError('internal-error');
    }
    if (this.decisionWaiters.has(proposalId)) {
      throw new ProjectContextError('internal-error');
    }
    return new Promise((resolve) => {
      this.decisionWaiters.set(proposalId, {
        ownerId: stored.ownerId,
        requestId,
        resolve,
      });
    });
  }

  async apply(ownerId: number, proposalId: string): Promise<ApplyAgentProposalResult> {
    try {
      const result = await this.applyProposal(ownerId, proposalId);
      const decisionStatus = result.status === 'saved' ||
        result.status === 'created' ||
        result.status === 'deleted' ||
        result.status === 'moved' ||
        result.status === 'renamed' ||
        result.status === 'created-directory' ||
        result.status === 'deleted-directory' ||
        result.status === 'updated-directory' ||
        result.status === 'story-updated'
        ? 'accepted'
        : result.status === 'not-found'
          ? 'failed'
          : result.status;
      this.resolveDecision(ownerId, proposalId, decisionStatus);
      return result;
    } catch (error) {
      const stored = this.proposals.get(proposalId);
      const session = this.sessions.get(ownerId);
      if (
        stored?.ownerId === ownerId &&
        session !== undefined &&
        session.id === stored.projectSessionId
      ) {
        this.conversations?.setProposalStatus(session, proposalId, 'failed');
        if (
          this.stories !== undefined &&
          'operation' in stored.proposal &&
          stored.proposal.operation === 'story'
        ) {
          this.stories.settleProposal(session, proposalId, 'failed', 'apply-failed');
        }
      }
      this.resolveDecision(ownerId, proposalId, 'failed');
      throw error;
    }
  }

  async applyStoryBatch(
    ownerId: number,
    proposalIds: string[],
  ): Promise<ApplyAgentProposalResult> {
    const session = this.sessions.get(ownerId);
    if (session === undefined || this.stories === undefined) {
      return { proposalId: proposalIds[0], status: 'not-found' };
    }
    const stored = proposalIds.map((proposalId) => this.proposals.get(proposalId));
    if (stored.some((entry) =>
      entry === undefined ||
      entry.ownerId !== ownerId ||
      entry.projectSessionId !== session.id ||
      !('operation' in entry.proposal) ||
      entry.proposal.operation !== 'story'
    )) {
      return { proposalId: proposalIds[0], status: 'not-found' };
    }
    const proposals = stored.map((entry) => entry!.proposal as AgentStoryProposal);
    const requestId = proposals[0].requestId;
    const storyRevision = proposals[0].storyRevision;
    if (proposals.some((proposal) =>
      proposal.requestId !== requestId || proposal.storyRevision !== storyRevision
    )) {
      return { proposalId: proposalIds[0], status: 'not-found' };
    }
    try {
      const story = this.stories.applyProposalBatch(
        session,
        storyRevision,
        proposals.map((proposal) => ({
          audit: {
            operationId: proposal.proposalId,
            operationKind: proposal.change.operation,
            originRequestId: proposal.requestId,
            payload: proposal.change,
          },
          operation: proposal.change,
        })),
      );
      for (const proposalId of proposalIds) {
        this.conversations?.setProposalStatus(session, proposalId, 'saved');
        this.resolveDecision(ownerId, proposalId, 'accepted');
      }
      return {
        proposalId: proposalIds[0],
        proposalIds,
        status: 'story-updated',
        story,
      };
    } catch (error) {
      const conflict = error instanceof ProjectStoryRevisionConflictError;
      for (const proposalId of proposalIds) {
        this.conversations?.setProposalStatus(
          session,
          proposalId,
          conflict ? 'stale' : 'failed',
        );
        this.stories.settleProposal(
          session,
          proposalId,
          conflict ? 'conflict' : 'failed',
          conflict ? null : 'apply-failed',
        );
        this.resolveDecision(ownerId, proposalId, conflict ? 'stale' : 'failed');
      }
      if (conflict) {
        return { proposalId: proposalIds[0], status: 'stale' };
      }
      throw error;
    }
  }

  private async applyProposal(
    ownerId: number,
    proposalId: string,
  ): Promise<ApplyAgentProposalResult> {
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
    if ('operation' in proposal && proposal.operation === 'story') {
      if (this.stories === undefined) return { proposalId, status: 'not-found' };
      try {
        const story = this.stories.applyOperation(
          session,
          proposal.storyRevision,
          proposal.change,
          {
            operationId: proposal.proposalId,
            operationKind: proposal.change.operation,
            originRequestId: proposal.requestId,
            payload: proposal.change,
          },
        );
        this.proposals.delete(proposalId);
        this.conversations?.setProposalStatus(session, proposalId, 'saved');
        return { proposalId, status: 'story-updated', story };
      } catch (error) {
        if (error instanceof ProjectStoryRevisionConflictError) {
          this.conversations?.setProposalStatus(session, proposalId, 'stale');
          this.stories.settleProposal(session, proposalId, 'conflict');
          return { proposalId, status: 'stale' };
        }
        throw error;
      }
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
        } else if (proposal.operation === 'delete') {
          await deleteStructuredProjectDocument(session.directoryPath, {
            baseRevision: proposal.baseRevision,
            documentId: proposal.documentId,
          });
        } else if (proposal.operation === 'delete_lore_category') {
          await deleteStructuredLoreCategory(session.directoryPath, {
            directoryId: proposal.directoryId,
          });
        } else if (proposal.operation === 'move_document') {
          await moveStructuredProjectDocument(session.directoryPath, {
            baseRevision: proposal.baseRevision,
            documentId: proposal.documentId,
            targetParentId: proposal.targetParentId,
          });
        } else if (proposal.operation === 'rename_document') {
          await renameStructuredProjectDocument(session.directoryPath, {
            documentId: proposal.documentId,
            metadataTitle: proposal.title,
          });
        } else if (proposal.operation === 'set_lore_category_icon') {
          await setStructuredLoreCategoryIcon(session.directoryPath, {
            directoryId: proposal.directoryId,
            icon: proposal.icon,
          });
        } else {
          await createStructuredProjectDirectory(session.directoryPath, {
            directoryId: proposal.directoryId,
            ...(proposal.icon === undefined ? {} : { icon: proposal.icon }),
            kind: proposal.directoryKind,
            title: proposal.title,
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
      if (
        proposal.operation === 'create_volume' ||
        proposal.operation === 'create_lore_category' ||
        proposal.operation === 'delete_lore_category' ||
        proposal.operation === 'set_lore_category_icon'
      ) {
        return {
          directoryId: proposal.directoryId,
          project,
          proposalId,
          status: proposal.operation === 'delete_lore_category'
            ? 'deleted-directory'
            : proposal.operation === 'set_lore_category_icon'
              ? 'updated-directory'
              : 'created-directory',
        };
      }
      if (!('documentId' in proposal)) {
        return { proposalId, status: 'stale' };
      }
      return {
        documentId: proposal.documentId,
        project,
        proposalId,
        status: proposal.operation === 'create'
          ? 'created'
          : proposal.operation === 'delete'
            ? 'deleted'
            : proposal.operation === 'move_document'
              ? 'moved'
              : 'renamed',
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

  reject(
    ownerId: number,
    proposalId: string,
    status: 'rejected' | 'stale' = 'rejected',
  ): boolean {
    const stored = this.proposals.get(proposalId);
    const session = this.sessions.get(ownerId);
    if (session === undefined) return false;
    const persisted = this.conversations?.getProposal(session, proposalId);
    if ((stored === undefined || stored.ownerId !== ownerId) && persisted === null) return false;
    if (stored !== undefined) this.proposals.delete(proposalId);
    const proposal = stored?.proposal ?? persisted;
    if (
      this.stories !== undefined &&
      proposal !== null &&
      proposal !== undefined &&
      'operation' in proposal &&
      proposal.operation === 'story'
    ) {
      this.stories.settleProposal(
        session,
        proposalId,
        status === 'rejected' ? 'rejected' : 'conflict',
      );
    }
    this.conversations?.setProposalStatus(session, proposalId, status);
    this.resolveDecision(ownerId, proposalId, status);
    return true;
  }

  cancelRequest(requestId: string): void {
    for (const [proposalId, stored] of this.proposals) {
      if (stored.proposal.requestId !== requestId) continue;
      this.fail(proposalId, stored, 'request-cancelled');
    }
  }

  /**
   * Fails a proposal the dispatcher created but can no longer present, such as
   * one that finished building after its tool call already timed out. Scoped to
   * the owning request so a late arrival cannot disturb other proposals.
   */
  abandon(requestId: string, proposalId: string): void {
    const stored = this.proposals.get(proposalId);
    if (stored === undefined || stored.proposal.requestId !== requestId) return;
    this.fail(proposalId, stored, 'tool-timeout');
  }

  disposeOwner(ownerId: number): void {
    for (const [proposalId, stored] of this.proposals) {
      if (stored.ownerId !== ownerId) continue;
      this.fail(proposalId, stored, 'owner-disposed');
    }
  }

  private fail(proposalId: string, stored: StoredProposal, reason: string): void {
    const session = this.sessions.get(stored.ownerId);
    if (session !== undefined && session.id === stored.projectSessionId) {
      this.conversations?.setProposalStatus(session, proposalId, 'failed');
      if (
        this.stories !== undefined &&
        'operation' in stored.proposal &&
        stored.proposal.operation === 'story'
      ) {
        this.stories.settleProposal(session, proposalId, 'failed', reason);
      }
    }
    this.resolveDecision(stored.ownerId, proposalId, 'failed');
    this.proposals.delete(proposalId);
  }

  private resolveDecision(
    ownerId: number,
    proposalId: string,
    status: AgentProposalOutcomeStatus,
  ): void {
    const waiter = this.decisionWaiters.get(proposalId);
    if (waiter === undefined || waiter.ownerId !== ownerId) return;
    this.decisionWaiters.delete(proposalId);
    this.proposals.delete(proposalId);
    waiter.resolve({ proposalId, status });
  }
}

const storyOperationTitle = (operation: ProjectStoryOperation): string => {
  if ('title' in operation) return operation.title;
  if ('name' in operation) return operation.name;
  return `${operation.operation}: ${'beatId' in operation ? operation.beatId : ''}`;
};
