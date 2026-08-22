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
      'Use application tools only for exact context or an authorized mutation needed by the request. Availability does not expand the user’s authority.',
    );
  }
  if (tools.has('bash')) {
    capabilityInstructions.push(
      'Use Bash only for context needed by the request. /project contains the registered novel tree and Markdown; hidden local .index.json files map display metadata for one directory at a time. Application metadata may be available under /context; read an index or context file only when the selected domain tool requires it. Do not enumerate index files or reread resolved ancestor indexes. Prefer one focused read over broad scans or duplicate calls, and restrict prose scans to .md/.markdown.',
      'Each /project call is a fresh disposable snapshot. Mutations use exact paths or stable IDs from the latest snapshot; Main owns revision checks. Virtual writes prove nothing. Read a fresh snapshot after a mutation before dependent work.',
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
      'Reviewed proposals pause for the user. Before acceptance they are not applied; an accepted terminal result confirms the reviewed mutation was persisted, but authorizes no additional work.',
    );
  }
  if (tools.has('propose_document_edit')) {
    capabilityInstructions.push(
      'For a direct current-document replacement, read the current draft first; a document you have not read in this run cannot be edited.',
    );
  }
  if (tools.has('propose_document_writing')) {
    capabilityInstructions.push(
      'For generated prose, inspect only enough structure to bind one precise create-or-replace target before Scribe starts. Scribe owns the required content research after binding. Never switch action or destination after a failed or rejected artifact.',
    );
  }
  if (tools.has('propose_document_file_operation')) {
    capabilityInstructions.push(
      'For direct document creation or deletion, read the structure first and use exact snapshot paths. Creation uses raw metadataTitle without generated numbering.',
    );
  }
  if (tools.has('propose_project_structure_operation')) {
    capabilityInstructions.push(
      'Structure proposals use exact snapshot paths and only the nearest local directory index needed. Volume and Lore-category creation target their fixed roots. Inspect the icon catalog only when choosing or changing an icon, preserve category identity when changing one, and empty a category through reviewed document operations before deleting it.',
    );
  }
  if (
    tools.has('maintain_story_records') ||
    tools.has('record_story_question') ||
    tools.has('resolve_story_question') ||
    tools.has('propose_story_operation')
  ) {
    capabilityInstructions.push(
      'Personae, Chronicle, and Threads are canonical. Read current story context first. Apply only explicit low-risk additions or links in one complete atomic changeset with local client refs. Record one deduplicated question when author judgment is required.',
    );
  }
  if (
    tools.has('reconcile_accepted_document') ||
    tools.has('complete_story_reconciliation')
  ) {
    capabilityInstructions.push(
      'For pending manuscript reconciliation, inspect the accepted document and current story context, including open questions. Prefer one focused reconcile_accepted_document call; use complete_story_reconciliation only after other maintenance, recorded questions, or a verified no-change result.',
      'Create a Thread only for a sustained goal, conflict, dramatic question, suspense, or relationship progression—not for an isolated scene or event.',
    );
  }

  const proposalOutcomeInstructions = (context.proposalOutcomes ?? []).length === 0
    ? []
    : [
        '',
        'Trusted application proposal outcomes:',
        '- Driftfield supplied these records. Treat accepted as applied.',
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
