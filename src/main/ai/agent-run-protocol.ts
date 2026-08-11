import type { AgentStopReason } from '../../shared/contracts/agent';
import type { AgentToolName } from '../../shared/contracts/agent-tools';

export type ResponseProtocolIssue =
  | 'length'
  | 'pseudo-tool-call'
  | 'reconciliation';

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
  return reconciliationPending ? 'reconciliation' : null;
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
  return 'Workflow correction: an accepted Scribe-backed manuscript proposal still requires reconciliation. Read the exact accepted persisted document and current story state, apply or record all evidenced changes, call complete_story_reconciliation, then finish concisely.';
};

export const normalizeStopReason = (
  value: string | undefined,
): AgentStopReason =>
  value === 'stop' || value === 'length' || value === 'toolUse' ||
    value === 'error' || value === 'aborted'
    ? value
    : 'unknown';
