import type { AgentRole } from '../../../shared/contracts/agent';

export type AgentToolName = 'get_current_document';

export interface AgentPromptContext {
  availableTools: readonly AgentToolName[];
  role: AgentRole;
}

export interface AgentPromptDescriptor {
  id: AgentRole;
  instructions: readonly string[];
  version: number;
}

export interface BuiltAgentPrompt {
  profileId: AgentRole;
  prompt: string;
  version: number;
}
