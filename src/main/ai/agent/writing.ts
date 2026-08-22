import type { AgentDocumentDomain } from '../../../shared/contracts/agent-tools';

/** Internal Curator-to-Scribe input; it is never registered as a model tool. */
export interface AgentWritingAssignment {
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  objective: string;
  requirements: string[];
  targetDocumentPath: string | null;
  targetLength: number | null;
}

/** Internal Scribe task receipt retained by Main until proposal construction. */
export interface AgentWritingTaskResult {
  assignmentId: string;
  characterCount: number;
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  status: 'completed';
}
