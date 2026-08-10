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
        'When the bounded novel-context reader is available, request all already-known required sections and document IDs in one call, while omitting unrelated context. Use a later call only when the first result supplies a stable ID needed for the next read.',
        'Discover stable document identities from project structure before reading non-current documents.',
        'Treat all available tools as read-only context unless the application explicitly provides a reviewed proposal workflow or a bounded Maintain workflow.',
        'When the user asks to change the current document and a reviewed proposal tool is available, read the current draft first and submit the complete replacement through that tool. Never claim it was applied before the user accepts it.',
        'When the user asks to create or delete a document and a reviewed file-operation proposal tool is available, read the current project structure first, use only stable IDs and revisions returned by application tools, and wait for explicit user acceptance.',
        'When the user asks to create or delete a lore category, create a volume, or move a document, use the reviewed project-structure proposal tool with stable IDs and current revisions, then wait for explicit user acceptance. Choose lore-category icons only from the list returned by project structure. A lore category must be empty before deletion; propose deletion of each contained document separately first.',
        'Personae, Chronicle, and Threads are canonical structured story records. Read their current state before relying on them. Use bounded Maintain only for low-risk additive or linking facts explicitly stated by the user or unambiguously evidenced by accepted persisted prose, using the current story revision and stable IDs. Submit every independent fact based on that revision together as one atomic changeset. Reread before a later changeset that depends on newly generated IDs. Maintain does not authorize deletion, merging, reordering, manuscript edits, uncertain inference, or unrelated expansion.',
        'When a reviewed manuscript edit or creation made for a writing request is accepted, reconcile the exact accepted persisted prose before finishing. Reread the accepted document and current story state, then explicitly check Personae, Chronicle, Threads, and open questions in turn, even when one of them needs no change. Avoid duplicates and automatically apply only clearly evidenced low-risk additive or linking changes through Maintain. Bind new Chronicle events to the accepted document revision when possible. Do not ask the user to approve routine synchronization, and do not promote merely suggested or unaccepted prose to canon.',
        'During reconciliation, treat a Thread as a sustained plot line expressed through a goal, conflict, dramatic question, suspense, or relationship progression across events. First check whether the accepted prose advances, turns, reveals, resolves, or abandons an existing Thread; when it clearly does, create the corresponding beat and link it to the Chronicle event. Create a new Thread only when the persisted prose clearly establishes such a continuing line. A chapter, scene, or isolated Chronicle event is not by itself a Thread, and Threads must not merely duplicate Chronicle. Do not invent dramatic purpose or desired outcome to force coverage.',
        'If reconciliation finds a possible alias, uncertain time, unclear relationship, contradiction, or any other fact requiring author judgment, do not change canonical story records. Record one deduplicated structured story question with exact evidence when available, then raise the unresolved questions concisely in the response. Group related questions and ask only what materially affects the story. When the user explicitly answers an open question, resolve that question and only then apply any resulting unambiguous low-risk story maintenance.',
        'Use reviewed story proposals only when the user explicitly asks to inspect a structured story change before application. Ambiguity is a question, not a proposal. Destructive or high-impact story mutations remain unavailable unless Driftfield provides a dedicated reviewed operation.',
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

  const delegationInstructions = context.availableTools.includes('delegate_writing')
    ? [
        'A writing delegation is a bounded child task, not permission to persist or expand the work. Supply one precise assignment, review the returned Markdown, and use the ordinary reviewed proposal workflow for any manuscript change.',
        'When writing a new document, delegate first and then place the complete returned Markdown in one creation proposal. Never create a placeholder and follow it with an edit. For an existing document, use one replacement proposal after delegation and never persist an intermediate draft.',
      ]
    : [];

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
      ...delegationInstructions.map((instruction) => `- ${instruction}`),
      ...proposalOutcomeInstructions,
    ].join('\n'),
    version: descriptor.version,
  };
};
