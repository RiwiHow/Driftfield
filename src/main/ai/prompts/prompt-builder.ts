import { AGENT_INVARIANTS } from './invariants';
import { getAgentPromptDescriptor } from './registry';
import type {
  AgentPromptContext,
  AgentToolName,
  BuiltAgentPrompt,
} from './types';

const TOOL_INSTRUCTIONS: Record<AgentToolName, string> = {
  get_current_document:
    'get_current_document: Read the exact current manuscript document selected by the user. Use it only when the request needs that text.',
};

export const buildAgentSystemPrompt = (
  context: AgentPromptContext,
): BuiltAgentPrompt => {
  const descriptor = getAgentPromptDescriptor(context.role);
  const capabilityInstructions = context.availableTools.length === 0
    ? ['No application tools are available for this request.']
    : context.availableTools.map((toolName) => TOOL_INSTRUCTIONS[toolName]);

  return {
    profileId: descriptor.id,
    prompt: [
      'Application boundaries:',
      ...AGENT_INVARIANTS.map((instruction) => `- ${instruction}`),
      '',
      `Role profile: ${descriptor.id} (version ${descriptor.version})`,
      ...descriptor.instructions.map((instruction) => `- ${instruction}`),
      '',
      'Available application tools:',
      ...capabilityInstructions.map((instruction) => `- ${instruction}`),
    ].join('\n'),
    version: descriptor.version,
  };
};
