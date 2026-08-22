import type { AgentStopReason } from '../../../shared/contracts/agent';
import type { AgentToolName } from '../../../shared/contracts/agent-tools';

export type ResponseProtocolIssue =
  | 'length'
  | 'pseudo-tool-call'
  | 'reconciliation'
  | 'stalled-action';

export const responseProtocolIssue = (
  assistantText: string,
  stopReason: AgentStopReason,
  reconciliationPending: boolean,
  enabledToolNames: AgentToolName[],
): ResponseProtocolIssue | null => {
  if (stopReason === 'length') return 'length';
  if (containsPseudoToolCall(assistantText, enabledToolNames)) {
    return 'pseudo-tool-call';
  }
  if (reconciliationPending) return 'reconciliation';
  if (containsStalledActionNarration(assistantText)) {
    return 'stalled-action';
  }
  return null;
};

export const containsStalledActionNarration = (text: string): boolean => {
  const tail = text.trim().slice(-800);
  if (tail.length === 0) return false;
  const sentences = tail
    .split(/(?<=[.!?。！？])\s*|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .slice(-4);
  return sentences.some((sentence) =>
    /^(?:let me|i(?:'ll| will) now|next,? i(?:'ll| will)|让我|我(?:先|来|现在|接下来|再)(?:去|来|会|将)?)[^.!?。！？]{0,160}(?:inspect|read|find|check|call|submit|propose|create|write|查看|读取|查找|确认|调用|提交|创建|生成|写)/iu
      .test(sentence)
  );
};

export const closesStoryReconciliation = (
  toolName: AgentToolName,
  result: { data?: unknown; ok: boolean; [key: string]: unknown },
): boolean => {
  if (
    !result.ok ||
    typeof result.data !== 'object' ||
    result.data === null
  ) return false;
  if (toolName === 'complete_story_reconciliation') {
    return 'status' in result.data && result.data.status === 'complete';
  }
  return toolName === 'reconcile_accepted_document' &&
    'reconciliationStatus' in result.data &&
    result.data.reconciliationStatus === 'complete';
};

export const containsPseudoToolCall = (
  text: string,
  enabledToolNames: AgentToolName[],
): boolean => enabledToolNames.some((toolName) => {
  const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(
    `(?:<invoke\\s+name=["']?${escaped}["']?|<tool_call[^>]*>[^<]*${escaped}|"toolName"\\s*:\\s*"${escaped}")`,
    'iu',
  ).test(text);
});

export const protocolCorrection = (issue: ResponseProtocolIssue): string => {
  if (issue === 'length') {
    return 'Your previous response hit the output-token limit. Continue the unfinished task concisely. Do not repeat prior narration or tool results.';
  }
  if (issue === 'pseudo-tool-call') {
    return 'Protocol correction: you printed tool-call markup as ordinary text. Never print or describe tool-call syntax. If the operation is still needed, invoke the available native application tool now, then finish concisely.';
  }
  if (issue === 'stalled-action') {
    return 'Workflow correction: your previous response stopped while narrating an action that you did not execute. Do not repeat the plan or inspect already resolved context. Invoke the needed native application tool now; if no tool is needed or available, state the concrete result or limitation concisely.';
  }
  return 'Workflow correction: an accepted Scribe-backed manuscript proposal still requires reconciliation. Read the exact accepted persisted document and current story state, apply or record all evidenced changes, call complete_story_reconciliation, then finish concisely.';
};

export const normalizeStopReason = (
  value: string | undefined,
): AgentStopReason =>
  value === 'stop' || value === 'length' || value === 'toolUse' ||
    value === 'error' || value === 'aborted'
    ? value
    : 'unknown';
