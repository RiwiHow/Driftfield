import { AGENT_INVARIANTS } from './invariants';
import { getAgentPromptDescriptor } from './registry';
import type {
  AgentPromptContext,
  BuiltAgentPrompt,
} from './types';

export const buildAgentSystemPrompt = (
  context: AgentPromptContext,
): BuiltAgentPrompt => {
  const descriptor = getAgentPromptDescriptor(context.role);
  const capabilityInstructions = context.availableTools.length === 0
    ? ['No application tools are available for this request.']
    : [
        'Application tools are available through native tool calling. Use them when the request needs exact project information.',
        'Discover stable document identities from project structure before reading non-current documents.',
        'Treat all available tools as read-only context unless the application explicitly provides a reviewed proposal workflow or a bounded Maintain workflow.',
        'When the user asks to change the current document and a reviewed proposal tool is available, read the current draft first and submit the complete replacement through that tool. Never claim it was applied before the user accepts it.',
        'When the user asks to create or delete a document and a reviewed file-operation proposal tool is available, read the current project structure first, use only stable IDs and revisions returned by application tools, and wait for explicit user acceptance.',
        'When the user asks to create a volume or lore category, or move a document, use the reviewed project-structure proposal tool with stable IDs and current revisions, then wait for explicit user acceptance.',
        'Personae, Chronicle, and Threads are canonical structured story records. Read their current state before relying on them. When the user explicitly asks to add or connect records in these domains and the Maintain tool is available, apply only the requested bounded operation using the current story revision and stable IDs, then reread before dependent changes. Maintain does not authorize deletion, merging, reordering, manuscript edits, or unrelated expansion.',
        'When a reviewed manuscript edit or creation made for a writing request is accepted and the reviewed story-operation tool is available, reconcile the exact accepted persisted prose with canonical Personae, Chronicle, and Threads before finishing. Reread the accepted document and current story state, avoid duplicates, and submit only clearly evidenced additive or linking changes as reviewable story proposals. Bind new Chronicle events to the accepted document revision when possible. Propose one change at a time, reread after each accepted dependent change, and stop proposing related changes if the user rejects one. Do not use direct Maintain for this automatic reconciliation, and do not promote speculation or merely suggested prose to canon.',
        'A reviewed proposal tool call remains pending until the user accepts or rejects it. When it returns, continue the same Agent run from that decision. Do not interpret acceptance as permission to invent additional chapters, documents, or structural work outside the user’s requested scope.',
      ];

  const proposalOutcomeInstructions = (context.proposalOutcomes ?? []).length === 0
    ? []
    : [
        '',
        'Trusted application proposal outcomes:',
        '- These records are supplied by Driftfield, not by the user. Treat accepted as applied; do not continue claiming that an accepted proposal is awaiting approval.',
        ...context.proposalOutcomes!.map((outcome) => `- ${JSON.stringify(outcome)}`),
      ];

  return {
    profileId: descriptor.id,
    prompt: [
      'Application boundaries:',
      ...AGENT_INVARIANTS.map((instruction) => `- ${instruction}`),
      '',
      `Role profile: ${descriptor.id} (version ${descriptor.version})`,
      ...descriptor.instructions.map((instruction) => `- ${instruction}`),
      '',
      'Tool-use policy:',
      ...capabilityInstructions.map((instruction) => `- ${instruction}`),
      ...proposalOutcomeInstructions,
    ].join('\n'),
    version: descriptor.version,
  };
};
