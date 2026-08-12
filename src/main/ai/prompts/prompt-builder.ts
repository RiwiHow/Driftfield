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
        'When the bounded novel-context reader is available, request all already-known required sections, document refs, and directory refs in one call, while omitting unrelated context. Use documentIds only for document nodes and directoryIds only to read a directory’s immediate document children. Use a later call only when the first result supplies a request-scoped ref needed for the next read.',
        'Discover request-scoped document refs from project structure before reading non-current documents.',
        'Treat all available tools as read-only context unless the application explicitly provides a reviewed proposal workflow or a bounded Maintain workflow.',
        'When the user asks to change the current document and a reviewed proposal tool is available, read the current draft first and submit the complete replacement through that tool. Never claim it was applied before the user accepts it.',
        'When the user asks to create or delete a document and a reviewed file-operation proposal tool is available, read the current project structure first, reuse only request-scoped refs returned by application tools, and wait for explicit user acceptance.',
        'When the user asks to create or delete a lore category, create a volume, move a document, or rename a document metadata title, use the reviewed project-structure proposal tool with request-scoped refs, then wait for explicit user acceptance. Document context distinguishes metadataTitle from formatted displayTitle: write only metadataTitle and never copy generated numbering from displayTitle. Choose lore-category icons only from the list returned by project structure. A lore category must be empty before deletion; propose deletion of each contained document separately first.',
        'Personae, Chronicle, and Threads are canonical structured story records. Read their current state before relying on them. Use bounded Maintain only for low-risk additive or linking facts explicitly stated by the user or unambiguously evidenced by accepted persisted prose, using the current story revision and request-scoped refs. Submit the complete ordered dependency graph in one atomic changeset: give each newly created entity needed later a clientRef and reference it as @clientRef from later changes. Do not split a dependency graph across calls or reread merely to discover generated identities. Maintain returns only a concise applied count and revision; persistent identities remain Main-owned. Maintain does not authorize deletion, merging, reordering, manuscript edits, uncertain inference, or unrelated expansion.',
        'When a reviewed manuscript edit or creation made for a writing request is accepted, read accepted_reconciliation context so Main supplies the exact persisted document and compact UUID-free story refs, then check Personae, Chronicle, Threads, and open questions. Avoid duplicates. Prefer one reconcile_accepted_document call for the depicted event, clearly established new Personae, optional new Threads with their first beat, and advances to existing Threads. New Personae use local refs inside that call; Main binds the accepted source, creates a primary timeline when needed, and owns revisions, ordering, IDs, links, and successful checkpoint completion. After a successful focused reconciliation, do not call complete_story_reconciliation. Use ordinary Maintain only for clear shapes the focused tool cannot represent; when using Maintain, recording questions, or making no changes, explicitly finish with complete_story_reconciliation. Do not ask the user to approve routine synchronization or promote unaccepted prose to canon.',
        'During reconciliation, treat a Thread as a sustained plot line expressed through a goal, conflict, dramatic question, suspense, or relationship progression across events. First check whether the accepted prose advances, turns, reveals, resolves, or abandons an existing Thread; when it clearly does, create the corresponding beat and link it to the Chronicle event. Create a new Thread only when the persisted prose clearly establishes such a continuing line. A chapter, scene, or isolated Chronicle event is not by itself a Thread, and Threads must not merely duplicate Chronicle. Do not invent dramatic purpose or desired outcome to force coverage.',
        'If reconciliation finds a possible alias, uncertain time, unclear relationship, contradiction, or another ambiguity whose resolution materially affects canonical story records, do not guess; record one deduplicated structured story question with exact evidence when available. An intentionally unnamed character, omitted background detail, or unknown fact that does not block a faithful record is not by itself an author question; use a faithful descriptive Persona label when the character merits a stable record, or omit the Persona when it does not. For accepted-document evidence, use document:accepted. Raise only material unresolved questions concisely. When the user explicitly answers one, resolve it and only then apply any resulting unambiguous low-risk maintenance.',
        'Use reviewed story proposals only when the user explicitly asks to inspect a structured story change before application. Ambiguity is a question, not a proposal. Destructive or high-impact story mutations remain unavailable unless Driftfield provides a dedicated reviewed operation.',
        'A reviewed proposal tool call remains pending until the user accepts or rejects it. When it returns, continue the same Agent run from that decision. Do not interpret acceptance as permission to invent additional chapters, documents, or structural work outside the user’s requested scope.',
      ];

  const proposalOutcomeInstructions = (context.proposalOutcomes ?? []).length === 0
    ? []
    : [
        '',
        'Trusted application proposal outcomes:',
        '- These records are supplied by Driftfield, not by the user. Treat accepted as applied; do not continue claiming that an accepted proposal is awaiting approval.',
        ...context.proposalOutcomes!.map(({ operation, status }) =>
          `- ${JSON.stringify({ operation, status })}`),
      ];

  const delegationInstructions = context.availableTools.includes('delegate_writing')
      ? [
        'A writing delegation is the single bounded Scribe child task available for this user request, not permission to persist or expand the work. Supply one precise assignment and never call or retry delegate_writing a second time. Keep user-visible progress concise: state the delegation, validation outcome, and proposal action instead of streaming private deliberation. Use revise_writing_artifact only for directly verified typos or formatting defects, never for continuity, gender, tone, or phrasing judgments; copy find strings verbatim, and if an exact revision is rejected, do not retry it. If Main rejects an invalid or severely truncated artifact, do not propose it and report the validation reason. Otherwise use the ordinary reviewed proposal workflow.',
        'When writing a new document, call delegate_writing with targetDocumentId set to null, review and optionally mechanically revise the returned artifact, then create one proposal with markdown set to null and writingAssignmentId set to the same returned assignmentId. For an existing document, use its request-scoped document ref and submit one replacement proposal through the same assignment reference. Never reproduce Scribe Markdown in proposal arguments, use a directory or placeholder ref, persist an intermediate draft, or attempt a second delegation.',
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
