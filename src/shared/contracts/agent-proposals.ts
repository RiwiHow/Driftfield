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
  | { proposalId: string; status: 'conflict' | 'missing' | 'stale' | 'not-found' };

export interface RejectAgentProposalRequest {
  proposalId: string;
}

export interface RejectAgentProposalResult {
  rejected: boolean;
}
