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
  if (tools.has('bash')) {
    capabilityInstructions.push(
      'Use Bash to inspect all current project context. PROJECT.json describes structure, STORY.json contains canonical story records and stable IDs, ICONS.txt contains exact Lucide names, ACCEPTED.md/ACCEPTED.json appear while an accepted manuscript awaits reconciliation, and the request-start editor draft is overlaid on its Markdown path. Narrow with find/rg/cat/sed/jq.',
      '/project is a fresh disposable snapshot on every call. Mutation tools accept exact project-relative paths or stable IDs shown there; Main binds revisions from the latest Bash snapshot. Virtual writes are discarded and never prove persistence. Run Bash again after every accepted or applied mutation before dependent work.',
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
      'For requested Manuscript or Lore prose, use one atomic Scribe-backed document proposal with a precise assignment and immutable create-or-replace target path. Main freezes the destination before Scribe starts and keeps the Markdown out of Curator context. Never substitute replace after a failed create or change destination to consume a rejected artifact.',
    );
  }
  if (tools.has('propose_document_file_operation')) {
    capabilityInstructions.push(
      'For direct document creation or deletion, run Bash first and use exact current snapshot paths. Creation uses raw metadataTitle without generated numbering.',
    );
  }
  if (tools.has('propose_project_structure_operation')) {
    capabilityInstructions.push(
      'Project-structure proposals use exact paths from the latest Bash snapshot. Creating a volume or Lore category implicitly targets its matching root. Choose category icons only from ICONS.txt. Preserve category identity when changing its icon, and delete category contents through reviewed document operations before deleting the empty category.',
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
      'A pending accepted-Manuscript job must inspect ACCEPTED.md and STORY.json with Bash and check Personae, Chronicle, Threads, and open questions. Prefer one focused reconcile_accepted_document call; Main owns source binding, primary-timeline fallback, ordering, IDs, links, and durable checkpoint completion. Use complete_story_reconciliation only after non-focused maintenance, recorded questions, or a verified no-change result.',
      'Create a Thread only for a sustained goal, conflict, dramatic question, suspense, or relationship progression. An isolated scene or Chronicle event is not by itself a Thread. Do not invent dramatic purpose to force coverage.',
    );
  }

  const proposalOutcomeInstructions = (context.proposalOutcomes ?? []).length === 0
    ? []
    : [
        '',
        'Trusted application proposal outcomes:',
        '- These records are supplied by Driftfield, not by the user. Treat accepted as applied; do not continue claiming that an accepted proposal is awaiting approval.',
        ...context.proposalOutcomes!.map(({ operation, status, targetTitle }) =>
          `- ${JSON.stringify({ operation, status, targetTitle })}`),
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
