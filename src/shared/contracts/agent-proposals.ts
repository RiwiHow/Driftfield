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

export type AgentDocumentProposal =
  | AgentEditProposal
  | AgentCreateDocumentProposal
  | AgentDeleteDocumentProposal;

export interface ApplyAgentProposalRequest {
  proposalId: string;
}

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
      status: 'created' | 'deleted';
    }
  | { proposalId: string; status: 'conflict' | 'missing' | 'stale' | 'not-found' };

export interface RejectAgentProposalRequest {
  proposalId: string;
}

export interface RejectAgentProposalResult {
  rejected: boolean;
}
