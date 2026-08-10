import type { AgentRole } from '../../../shared/contracts/agent';
import { continuityPrompt } from './continuity';
import { curatorPrompt } from './curator';
import { editingPrompt } from './editing';
import { researchPrompt } from './research';
import type { AgentPromptDescriptor } from './types';
import { scribePrompt } from './scribe';

const PROMPT_REGISTRY: Record<AgentRole, AgentPromptDescriptor> = {
  continuity: continuityPrompt,
  curator: curatorPrompt,
  editing: editingPrompt,
  research: researchPrompt,
  scribe: scribePrompt,
};

export const getAgentPromptDescriptor = (
  role: AgentRole,
): AgentPromptDescriptor => PROMPT_REGISTRY[role];
