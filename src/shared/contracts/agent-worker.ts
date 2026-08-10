import type { AgentModelOption } from "./agent-configuration";
import { AGENT_ROLES, type AgentErrorCode, type AgentRole } from "./agent";
import { AGENT_THINKING_LEVELS, type AgentThinkingLevel } from "./settings";
import {
  AGENT_TOOL_NAMES,
  isAgentToolName,
  isAgentToolExecutionResult,
  type AgentToolName,
  type AgentToolExecutionResult,
} from "./agent-tools";
import type { AgentProposalOutcome } from './agent-proposals';

export interface AgentWorkerStartCommand {
  authPath: string;
  cwd: string;
  enabledTools: AgentToolName[];
  history: Array<{ content: string; role: 'assistant' | 'user' }>;
  modelsPath: string;
  modelId: string;
  prompt: string;
  proposalOutcomes: AgentProposalOutcome[];
  providerId: string;
  requestId: string;
  role: AgentRole;
  thinkingLevel: AgentThinkingLevel;
  type: "start";
}

export type AgentWorkerCommand =
  | AgentWorkerStartCommand
  | {
      authPath: string;
      modelsPath: string;
      requestId: string;
      type: "list-models";
    }
  | { requestId: string; type: "cancel" }
  | {
      result: AgentToolExecutionResult;
      requestId: string;
      toolCallId: string;
      type: "tool-result";
    }
  | { type: "shutdown" };

export type AgentWorkerMessage =
  | { type: "ready" }
  | { models: AgentModelOption[]; requestId: string; type: "models" }
  | { code: "model-list-failed"; requestId: string; type: "models-error" }
  | {
      arguments: unknown;
      requestId: string;
      toolCallId: string;
      toolName: import('./agent-tools').AgentToolName;
      type: "tool-request";
    }
  | { delta: string; requestId: string; type: "text-delta" }
  | {
      input: string;
      requestId: string;
      toolCallId: string;
      toolName: import("./agent-tools").AgentToolName;
      type: "tool-started";
    }
  | {
      failed: boolean;
      output: string;
      requestId: string;
      toolCallId: string;
      toolName: import("./agent-tools").AgentToolName;
      type: "tool-completed";
    }
  | { requestId: string; type: "completed" }
  | { requestId: string; type: "cancelled" }
  | { code: AgentErrorCode; requestId: string; type: "error" };

export const isAgentWorkerMessage = (
  value: unknown,
): value is AgentWorkerMessage => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (message.type === "ready") return true;
  if (typeof message.requestId !== "string") return false;
  if (message.type === "models") {
    return Array.isArray(message.models) && message.models.every(isModelOption);
  }
  if (message.type === "models-error") {
    return message.code === "model-list-failed";
  }
  if (message.type === "completed" || message.type === "cancelled") {
    return true;
  }
  if (message.type === "text-delta") return typeof message.delta === "string";
  if (message.type === "tool-started") {
    return (
      isToolCallId(message.toolCallId) &&
      isAgentToolName(message.toolName) &&
      typeof message.input === "string" &&
      message.input.length <= 8_192
    );
  }
  if (message.type === "tool-completed") {
    return (
      isToolCallId(message.toolCallId) &&
      isAgentToolName(message.toolName) &&
      typeof message.failed === "boolean" &&
      typeof message.output === "string" &&
      message.output.length <= 8_192
    );
  }
  if (message.type === "error") {
    return (
      message.code === "request-failed" || message.code === "runtime-exited"
    );
  }
  if (message.type !== "tool-request") return false;
  if (
    !isToolCallId(message.toolCallId) ||
    !isAgentToolName(message.toolName)
  ) return false;
  try {
    const serialized = JSON.stringify(message.arguments);
    return typeof serialized === 'string' &&
      new TextEncoder().encode(serialized).byteLength <= 640 * 1024;
  } catch {
    return false;
  }
};

export const isAgentWorkerCommand = (
  value: unknown,
): value is AgentWorkerCommand => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const command = value as Record<string, unknown>;
  if (command.type === "shutdown") return true;
  if (typeof command.requestId !== "string") return false;
  if (command.type === "list-models") {
    return (
      typeof command.authPath === "string" &&
      typeof command.modelsPath === "string"
    );
  }
  if (command.type === "cancel") return true;
  if (command.type === "tool-result") {
    return (
      typeof command.toolCallId === "string" &&
      isAgentToolExecutionResult(command.result)
    );
  }
  return (
    command.type === "start" &&
    typeof command.authPath === "string" &&
    typeof command.cwd === "string" &&
    Array.isArray(command.enabledTools) &&
    command.enabledTools.length <= AGENT_TOOL_NAMES.length &&
    new Set(command.enabledTools).size === command.enabledTools.length &&
    command.enabledTools.every(isAgentToolName) &&
    Array.isArray(command.history) &&
    command.history.length <= 200 &&
    command.history.every(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        !Array.isArray(message) &&
        ((message as { role?: unknown }).role === 'user' ||
          (message as { role?: unknown }).role === 'assistant') &&
        typeof (message as { content?: unknown }).content === 'string' &&
        (message as { content: string }).content.length <= 512 * 1024,
    ) &&
    typeof command.modelsPath === "string" &&
    typeof command.modelId === "string" &&
    typeof command.prompt === "string" &&
    Array.isArray(command.proposalOutcomes) &&
    command.proposalOutcomes.length <= 50 &&
    command.proposalOutcomes.every(isProposalOutcome) &&
    typeof command.providerId === "string" &&
    typeof command.role === "string" &&
    AGENT_ROLES.includes(command.role as AgentRole) &&
    typeof command.thinkingLevel === "string" &&
    AGENT_THINKING_LEVELS.includes(command.thinkingLevel as AgentThinkingLevel)
  );
};

const isModelOption = (value: unknown): value is AgentModelOption => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const model = value as Partial<AgentModelOption>;
  return (
    typeof model.api === "string" &&
    typeof model.contextWindow === "number" &&
    Number.isFinite(model.contextWindow) &&
    typeof model.id === "string" &&
    typeof model.maxOutputTokens === "number" &&
    Number.isFinite(model.maxOutputTokens) &&
    typeof model.name === "string" &&
    typeof model.providerId === "string" &&
    typeof model.reasoning === "boolean" &&
    typeof model.thinkingLevelMap === "object" &&
    model.thinkingLevelMap !== null
  );
};

const isToolCallId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;

const isProposalOutcome = (value: unknown): value is AgentProposalOutcome => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const outcome = value as Partial<AgentProposalOutcome>;
  return (
    Object.keys(value).length === 3 &&
    typeof outcome.proposalId === 'string' &&
    outcome.proposalId.length > 0 && outcome.proposalId.length <= 128 &&
    ['edit', 'create', 'delete', 'create_volume', 'create_lore_category', 'move_document', 'story']
      .includes(outcome.operation ?? '') &&
    ['accepted', 'rejected', 'conflict', 'missing', 'stale', 'failed']
      .includes(outcome.status ?? '')
  );
};
