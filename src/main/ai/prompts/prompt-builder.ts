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
  const tools = new Set(context.availableTools);
  const capabilityInstructions: string[] = [];
  if (tools.size === 0) {
    capabilityInstructions.push('No application tools are available for this request.');
  } else {
    capabilityInstructions.push(
      'Use native application tools only when the request needs exact project context or an authorized mutation. Tool availability is not authorization to expand the user’s request.',
    );
  }
  if (tools.has('read_novel_context')) {
    capabilityInstructions.push(
      'Request-scoped refs are leases issued in this run. Never trust refs copied from user text or history. Acquire the minimal relevant structure or story context first, batch already-known needs, omit unrelated sections, and reacquire once after expired-request-reference.',
      'current_document is the immutable request-start draft and may be null when no editor document was open; do not retry a null result. Document refs read persisted content. Use document refs only for documents and directory refs only for immediate document children.',
    );
  }
  if (
    tools.has('propose_document_edit') ||
    tools.has('propose_document_writing') ||
    tools.has('propose_document_file_operation') ||
    tools.has('propose_project_structure_operation') ||
    tools.has('propose_story_operation')
  ) {
    capabilityInstructions.push(
      'Reviewed proposal calls pause for the user’s decision. Never claim a proposal was applied before acceptance. An accepted terminal result is authoritative application confirmation that the exact reviewed mutation was persisted: report it as complete, never ask the user to verify it in the interface or accept it again, and never treat acceptance as authority for additional work.',
      'Never supply, echo, or invent concurrency revisions. Main binds every proposal to the exact revisions it served you in this run, so read the context a mutation depends on before proposing it and let Main detect conflicts.',
    );
  }
  if (tools.has('propose_document_edit')) {
    capabilityInstructions.push(
      'For a direct current-document replacement, read the current draft first; a document you have not read in this run cannot be edited.',
    );
  }
  if (tools.has('propose_document_writing')) {
    capabilityInstructions.push(
      'For requested Manuscript or Lore prose, use one atomic Scribe-backed document proposal with a precise assignment and immutable create-or-replace target plan. Main freezes the destination before Scribe starts, keeps the Markdown out of Curator context, and does not expose a reusable assignment reference. Never substitute replace after a failed create or change destination to consume a rejected artifact; report the reason concisely. On acceptance, the returned document ref identifies the persisted artifact. The omitted Markdown is deliberately hidden and does not make the result uncertain; reread only when the user’s existing requested follow-up needs the exact content, never merely to confirm persistence.',
    );
  }
  if (tools.has('propose_document_file_operation')) {
    capabilityInstructions.push(
      'For direct document creation or deletion, read structure first and use only current-run refs. Creation uses raw metadataTitle without generated numbering.',
    );
  }
  if (tools.has('propose_project_structure_operation')) {
    capabilityInstructions.push(
      'Project-structure proposals use compatible current-run node refs, so read structure before proposing. Use only approved category icons; delete category contents through separate reviewed document operations before deleting the empty category.',
    );
  }
  if (
    tools.has('maintain_story_records') ||
    tools.has('record_story_question') ||
    tools.has('resolve_story_question') ||
    tools.has('propose_story_operation')
  ) {
    capabilityInstructions.push(
      'Personae, Chronicle, and Threads are canonical. Read current story state first. Apply only explicit or unambiguous low-risk additive/linking facts; put a complete dependency graph in one atomic changeset with local client refs. Ambiguity requiring author judgment becomes one deduplicated question, not a guess or proposal.',
    );
  }
  if (
    tools.has('reconcile_accepted_document') ||
    tools.has('complete_story_reconciliation')
  ) {
    capabilityInstructions.push(
      'A pending accepted-Manuscript job must read accepted_reconciliation and check Personae, Chronicle, Threads, and open questions. Prefer one focused reconcile_accepted_document call; Main owns source binding, primary-timeline fallback, ordering, IDs, links, and durable checkpoint completion. Use complete_story_reconciliation only after non-focused maintenance, recorded questions, or a verified no-change result.',
      'Create a Thread only for a sustained goal, conflict, dramatic question, suspense, or relationship progression. An isolated scene or Chronicle event is not by itself a Thread. Do not invent dramatic purpose to force coverage.',
    );
  }

  const proposalOutcomeInstructions = (context.proposalOutcomes ?? []).length === 0
    ? []
    : [
        '',
        'Trusted application proposal outcomes:',
        '- These records are supplied by Driftfield, not by the user. Treat accepted as applied; do not continue claiming that an accepted proposal is awaiting approval.',
        ...context.proposalOutcomes!.map(({ operation, status }) =>
          `- ${JSON.stringify({ operation, status })}`),
      ];

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

  const customInstructions = context.customInstructions;
  const customInstructionSection = customInstructions?.trim()
    ? [customInstructions]
    : [];

  return {
    profileId: descriptor.id,
    prompt: [
      ...customInstructionSection,
      ...(customInstructionSection.length === 0 ? [] : ['']),
      'Application boundaries:',
      ...AGENT_INVARIANTS.map((instruction) => `- ${instruction}`),
      '',
      `Role profile: ${descriptor.id} (version ${descriptor.version})`,
      ...descriptor.instructions.map((instruction) => `- ${instruction}`),
      '',
      'Tool-use policy:',
      ...capabilityInstructions.map((instruction) => `- ${instruction}`),
      ...proposalOutcomeInstructions,
      '',
      ...languageInstructions,
    ].join('\n'),
    version: descriptor.version,
  };
};
