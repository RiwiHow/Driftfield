import type { AgentRole } from '../../../shared/contracts/agent';
import type { AgentToolName } from '../../../shared/contracts/agent-tools';

export type { AgentToolName } from '../../../shared/contracts/agent-tools';

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
