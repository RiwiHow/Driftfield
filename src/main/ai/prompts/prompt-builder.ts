import { AGENT_INVARIANTS } from './invariants';
import { getAgentPromptDescriptor } from './registry';
import type {
  AgentPromptContext,
  AgentToolName,
  BuiltAgentPrompt,
} from './types';

const TOOL_INSTRUCTIONS: Record<AgentToolName, string> = {
  get_novel_structure:
    'get_novel_structure: Read the ordered novel structure and stable document IDs without loading document text.',
  get_current_document:
    'get_current_document: Read the request-start snapshot of the selected manuscript, including unsaved edits.',
  get_document:
    'get_document: Read one persisted manuscript or lorebook document by a stable ID returned by get_novel_structure.',
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
