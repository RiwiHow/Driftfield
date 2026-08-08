import type { AgentRole } from '../../../shared/contracts/agent';
import { continuityPrompt } from './continuity';
import { coordinatorPrompt } from './coordinator';
import { editingPrompt } from './editing';
import { researchPrompt } from './research';
import type { AgentPromptDescriptor } from './types';
import { writingPrompt } from './writing';

const PROMPT_REGISTRY: Record<AgentRole, AgentPromptDescriptor> = {
  continuity: continuityPrompt,
  coordinator: coordinatorPrompt,
  editing: editingPrompt,
  research: researchPrompt,
  writing: writingPrompt,
};

export const getAgentPromptDescriptor = (
  role: AgentRole,
): AgentPromptDescriptor => PROMPT_REGISTRY[role];
