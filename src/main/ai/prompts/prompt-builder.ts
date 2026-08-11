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
        'When the bounded novel-context reader is available, request all already-known required sections, document IDs, and directory IDs in one call, while omitting unrelated context. Use documentIds only for document nodes and directoryIds only to read a directory’s immediate document children. Use a later call only when the first result supplies a stable ID needed for the next read.',
        'Discover stable document identities from project structure before reading non-current documents.',
        'Treat all available tools as read-only context unless the application explicitly provides a reviewed proposal workflow or a bounded Maintain workflow.',
        'When the user asks to change the current document and a reviewed proposal tool is available, read the current draft first and submit the complete replacement through that tool. Never claim it was applied before the user accepts it.',
        'When the user asks to create or delete a document and a reviewed file-operation proposal tool is available, read the current project structure first, use only stable IDs and revisions returned by application tools, and wait for explicit user acceptance.',
        'When the user asks to create or delete a lore category, create a volume, move a document, or rename a document metadata title, use the reviewed project-structure proposal tool with stable IDs and current revisions, then wait for explicit user acceptance. Document context distinguishes metadataTitle from formatted displayTitle: write only metadataTitle and never copy generated numbering from displayTitle. Choose lore-category icons only from the list returned by project structure. A lore category must be empty before deletion; propose deletion of each contained document separately first.',
        'Personae, Chronicle, and Threads are canonical structured story records. Read their current state before relying on them. Use bounded Maintain only for low-risk additive or linking facts explicitly stated by the user or unambiguously evidenced by accepted persisted prose, using the current story revision and stable IDs. Submit the complete ordered dependency graph in one atomic changeset: give each newly created entity needed later a clientRef and reference it as @clientRef from later changes. Do not split a dependency graph across calls or reread merely to discover generated IDs. Maintain returns only a concise applied count and revision; audit and entity IDs remain Main-owned. Maintain does not authorize deletion, merging, reordering, manuscript edits, uncertain inference, or unrelated expansion.',
        'When a reviewed manuscript edit or creation made for a writing request is accepted, reconcile the exact accepted persisted prose before finishing. Reread the accepted document and current story state, then explicitly check Personae, Chronicle, Threads, and open questions in turn, even when one of them needs no change. Avoid duplicates and automatically apply only clearly evidenced low-risk additive or linking changes through Maintain. Bind new Chronicle events to the accepted document revision when possible. Do not ask the user to approve routine synchronization, and do not promote merely suggested or unaccepted prose to canon.',
        'During reconciliation, treat a Thread as a sustained plot line expressed through a goal, conflict, dramatic question, suspense, or relationship progression across events. First check whether the accepted prose advances, turns, reveals, resolves, or abandons an existing Thread; when it clearly does, create the corresponding beat and link it to the Chronicle event. Create a new Thread only when the persisted prose clearly establishes such a continuing line. A chapter, scene, or isolated Chronicle event is not by itself a Thread, and Threads must not merely duplicate Chronicle. Do not invent dramatic purpose or desired outcome to force coverage.',
        'If reconciliation finds a possible alias, uncertain time, unclear relationship, contradiction, or any other fact requiring author judgment, do not change canonical story records. Record one deduplicated structured story question with exact evidence when available, then raise the unresolved questions concisely in the response. Group related questions and ask only what materially affects the story. When the user explicitly answers an open question, resolve that question and only then apply any resulting unambiguous low-risk story maintenance.',
        'Use reviewed story proposals only when the user explicitly asks to inspect a structured story change before application. Ambiguity is a question, not a proposal. Destructive or high-impact story mutations remain unavailable unless Driftfield provides a dedicated reviewed operation.',
        'Do not narrate tool planning, schema selection, intermediate IDs, or retry analysis to the user. Execute authorized routine synchronization through tools, then report only a concise final summary of canonical changes and any unresolved questions.',
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
        'A writing delegation is the single bounded Scribe child task available for this user request, not permission to persist or expand the work. Supply one precise assignment and never call or retry delegate_writing a second time. Review the returned Markdown, use revise_writing_artifact only for obvious mechanical defects through exact counted replacements, and use the ordinary reviewed proposal workflow for any manuscript change.',
        'When writing a new document, call delegate_writing with targetDocumentId set to null, review and optionally mechanically revise the returned artifact, then create one proposal with markdown set to null and writingAssignmentId set to the same returned assignmentId. For an existing document, use its stable document ID and submit one replacement proposal through the same assignment reference. Never reproduce Scribe Markdown in proposal arguments, use a directory or placeholder ID, persist an intermediate draft, or attempt a second delegation.',
      ]
    : [];

  const languageInstructions = context.role === 'scribe'
    ? [
        'Final language policy: The interface language does not determine manuscript language. Write the artifact in the language explicitly requested by the assignment; otherwise preserve the language of the relevant existing manuscript context, or use the language implied by the assignment when no manuscript context exists.',
      ]
    : context.responseLanguage === 'zh-CN'
      ? [
          '最终语言规则（必须遵守）：当前界面语言为简体中文。除非用户明确要求使用其他回复语言，否则所有对用户可见的非原文文本都必须使用简体中文，包括工具调用前后的说明、进度提示、问题、总结和错误解释。不得用英文叙述计划。不要因此翻译小说正文、标题、文件名、引用证据或工具数据。',
        ]
      : [
          'Final language policy (mandatory): The interface language is English. Unless the user explicitly requests another response language, all user-visible non-manuscript text must be in English, including text before or after tool calls, progress notes, questions, summaries, and error explanations. Do not translate manuscript text, titles, filenames, quoted evidence, or tool data because of the interface language.',
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
      ...delegationInstructions.map((instruction) => `- ${instruction}`),
      ...proposalOutcomeInstructions,
      '',
      ...languageInstructions,
    ].join('\n'),
    version: descriptor.version,
  };
};
