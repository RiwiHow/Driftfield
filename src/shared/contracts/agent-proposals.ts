export interface AgentEditProposal {
  baseContentRevision: string;
  baseMarkdown: string;
  baseRevision: string;
  documentId: string;
  markdown: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentCreateDocumentProposal {
  documentId: string;
  documentKind: import('./project-layout').ManuscriptDocumentKind | 'entry';
  markdown: string;
  operation: 'create';
  parentId: string;
  parentTitle: string;
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentDeleteDocumentProposal {
  baseMarkdown: string;
  baseRevision: string;
  documentId: string;
  operation: 'delete';
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentCreateDirectoryProposal {
  directoryId: string;
  directoryKind: 'volume' | 'category';
  icon?: import('./project-layout').ProjectIconId;
  operation: 'create_volume' | 'create_lore_category';
  parentId: string;
  parentTitle: string;
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentDeleteLoreCategoryProposal {
  directoryId: string;
  operation: 'delete_lore_category';
  parentId: string;
  parentTitle: string;
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentSetLoreCategoryIconProposal {
  directoryId: string;
  icon: import('./project-layout').ProjectIconId;
  operation: 'set_lore_category_icon';
  previousIcon?: import('./project-layout').ProjectIconId;
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentMoveDocumentProposal {
  baseRevision: string;
  documentId: string;
  operation: 'move_document';
  projectRevision: string;
  proposalId: string;
  requestId: string;
  sourceParentId: string;
  sourceParentTitle: string;
  targetParentId: string;
  targetParentTitle: string;
  title: string;
}

export interface AgentRenameDocumentProposal {
  documentId: string;
  operation: 'rename_document';
  previousTitle: string;
  projectRevision: string;
  proposalId: string;
  requestId: string;
  title: string;
}

export interface AgentStoryProposal {
  change: import('./project-story').ProjectStoryOperation;
  operation: 'story';
  proposalId: string;
  requestId: string;
  storyRevision: number;
  title: string;
}

export type AgentDocumentProposal =
  | AgentEditProposal
  | AgentCreateDocumentProposal
  | AgentDeleteDocumentProposal
  | AgentDeleteLoreCategoryProposal
  | AgentSetLoreCategoryIconProposal
  | AgentCreateDirectoryProposal
  | AgentMoveDocumentProposal
  | AgentRenameDocumentProposal;

export type AgentProposal = AgentDocumentProposal | AgentStoryProposal;

export type AgentProposalOutcomeStatus =
  | 'accepted'
  | 'rejected'
  | 'conflict'
  | 'missing'
  | 'stale'
  | 'failed';

export interface AgentProposalOutcome {
  operation:
    | 'edit'
    | 'create'
    | 'delete'
    | 'create_volume'
    | 'create_lore_category'
    | 'delete_lore_category'
    | 'set_lore_category_icon'
    | 'move_document'
    | 'rename_document'
    | 'story';
  proposalId: string;
  status: AgentProposalOutcomeStatus;
  /** Human-readable semantic target copied from the reviewed proposal. */
  targetTitle: string;
}

export type ApplyAgentProposalRequest =
  | { proposalId: string }
  | { proposalIds: string[] };

export type ApplyAgentProposalResult =
  | {
      documentId: string;
      markdown: string;
      proposalId: string;
      revision: string;
      status: 'saved';
    }
  | {
      documentId: string;
      project: import('./project').ProjectSnapshot;
      proposalId: string;
      status: 'created' | 'deleted' | 'moved' | 'renamed';
    }
  | {
      directoryId: string;
      project: import('./project').ProjectSnapshot;
      proposalId: string;
      status: 'created-directory' | 'deleted-directory' | 'updated-directory';
    }
  | {
      proposalId: string;
      proposalIds?: string[];
      status: 'story-updated';
      story: import('./project-story').ProjectStorySnapshot;
    }
  | { proposalId: string; status: 'conflict' | 'missing' | 'stale' | 'not-found' };

export type SuccessfulApplyAgentProposalResult = Exclude<
  ApplyAgentProposalResult,
  { status: 'conflict' | 'missing' | 'stale' | 'not-found' }
>;

export interface RejectAgentProposalRequest {
  proposalId: string;
  reason?: 'stale';
}

export interface RejectAgentProposalResult {
  rejected: boolean;
}
