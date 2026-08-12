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
      'current_document is the immutable request-start draft; document refs read persisted content. Use document refs only for documents and directory refs only for immediate document children.',
    );
  }
  if (
    tools.has('propose_document_edit') ||
    tools.has('propose_document_file_operation') ||
    tools.has('propose_project_structure_operation') ||
    tools.has('propose_story_operation')
  ) {
    capabilityInstructions.push(
      'Reviewed proposal calls pause for the user’s decision. Never claim a proposal was applied before acceptance, and never treat acceptance as authority for additional work.',
    );
  }
  if (tools.has('propose_document_edit')) {
    capabilityInstructions.push(
      'For a current-document replacement, read the current draft and bind the proposal to its request-start revisions. A Scribe-backed replacement uses the assignment ref with markdown null.',
    );
  }
  if (tools.has('propose_document_file_operation')) {
    capabilityInstructions.push(
      'For document creation or deletion, read structure first and use only current-run refs. Creation uses raw metadataTitle without generated numbering. A Scribe-backed creation uses the assignment ref with markdown null.',
    );
  }
  if (tools.has('propose_project_structure_operation')) {
    capabilityInstructions.push(
      'Project-structure proposals use current project/document revisions and compatible node refs. Use only approved category icons; delete category contents through separate reviewed document operations before deleting the empty category.',
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

  const delegationInstructions = context.availableTools.includes('delegate_writing')
      ? [
        'One Scribe delegation is available for requested Manuscript or Lore prose. Set documentDomain correctly, provide a precise bounded assignment, and do not retry. Main returns only a compact validated artifact receipt; pass its assignmentId to one matching reviewed proposal and never reproduce the Markdown. If validation rejects the artifact, create no proposal and report the reason concisely.',
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
