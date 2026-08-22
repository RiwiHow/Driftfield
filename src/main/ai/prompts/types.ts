import type { AgentRole } from '../../../shared/contracts/agent';
import type { AgentToolName } from '../../../shared/contracts/agent-tools';
import type { AgentPromptProposalOutcome } from '../../../shared/contracts/agent-proposals';
import type { AppLanguage } from '../../../shared/i18n/languages';

export type { AgentToolName } from '../../../shared/contracts/agent-tools';

export interface AgentPromptContext {
  availableTools: readonly AgentToolName[];
  customInstructions?: string;
  proposalOutcomes?: readonly AgentPromptProposalOutcome[];
  responseLanguage: AppLanguage;
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
