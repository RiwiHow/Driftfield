import type { AgentProposal } from './agent-proposals';
import type { AgentRole } from './agent';
import type { AgentToolName } from './agent-tools';

export type AgentProposalStatus =
  | 'pending'
  | 'applying'
  | 'saved'
  | 'rejected'
  | 'conflict'
  | 'missing'
  | 'stale'
  | 'failed';

export interface AgentToolActivity {
  agentRole?: AgentRole;
  failed?: boolean;
  input: string;
  output?: string;
  status: 'running' | 'completed' | 'cancelled';
  toolCallId: string;
  toolName: AgentToolName;
}

export type AgentConversationPart =
  | { content: string; type: 'text' }
  | { activity: AgentToolActivity; type: 'tool' }
  | {
      proposal: AgentProposal;
      status: AgentProposalStatus;
      type: 'proposal';
    };

export interface AgentConversationMessage {
  content: string;
  createdAt?: string;
  id: string;
  parts?: AgentConversationPart[];
  role: 'assistant' | 'user';
  terminal?: 'cancelled' | 'empty' | 'failed' | 'interrupted';
}

export interface AgentConversationSummary {
  createdAt: string;
  id: string;
  title: string;
  updatedAt: string;
}

export interface AgentConversation extends AgentConversationSummary {
  messages: AgentConversationMessage[];
}

export interface AgentConversationState {
  activeConversation: AgentConversation;
  conversations: AgentConversationSummary[];
}

export interface CreateAgentConversationRequest { title?: string }
export interface SelectAgentConversationRequest { conversationId: string }
export interface RenameAgentConversationRequest {
  conversationId: string;
  title: string;
}
export interface DeleteAgentConversationRequest { conversationId: string }
export interface UpdateAgentConversationMessageRequest {
  content: string;
  conversationId: string;
  messageId: string;
}

export const appendConversationText = (
  parts: AgentConversationPart[],
  delta: string,
): AgentConversationPart[] => {
  const last = parts.at(-1);
  return last?.type === 'text'
    ? [...parts.slice(0, -1), { ...last, content: last.content + delta }]
    : [...parts, { content: delta, type: 'text' }];
};
