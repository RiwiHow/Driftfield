import type { AgentModelOption } from './agent-configuration';
import { AGENT_ROLES, type AgentRole } from './agent';
import {
  AGENT_THINKING_LEVELS,
  type AgentThinkingLevel,
} from './settings';

export interface AgentWorkerStartCommand {
  authPath: string;
  cwd: string;
  modelsPath: string;
  modelId: string;
  prompt: string;
  providerId: string;
  requestId: string;
  role: AgentRole;
  thinkingLevel: AgentThinkingLevel;
  type: 'start';
}

export type AgentWorkerCommand =
  | AgentWorkerStartCommand
  | {
      authPath: string;
      modelsPath: string;
      requestId: string;
      type: 'list-models';
    }
  | { requestId: string; type: 'cancel' }
  | {
      content: string;
      requestId: string;
      toolCallId: string;
      type: 'tool-result';
    }
  | { type: 'shutdown' };

export type AgentWorkerMessage =
  | { type: 'ready' }
  | { models: AgentModelOption[]; requestId: string; type: 'models' }
  | { message: string; requestId: string; type: 'models-error' }
  | { requestId: string; toolCallId: string; type: 'tool-request' }
  | { delta: string; requestId: string; type: 'text-delta' }
  | { requestId: string; type: 'completed' }
  | { requestId: string; type: 'cancelled' }
  | { message: string; requestId: string; type: 'error' };

export const isAgentWorkerMessage = (
  value: unknown,
): value is AgentWorkerMessage => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  if (message.type === 'ready') return true;
  if (typeof message.requestId !== 'string') return false;
  if (message.type === 'models') {
    return Array.isArray(message.models) && message.models.every(isModelOption);
  }
  if (message.type === 'models-error') {
    return typeof message.message === 'string';
  }
  if (
    message.type === 'completed' ||
    message.type === 'cancelled'
  ) {
    return true;
  }
  if (message.type === 'text-delta') return typeof message.delta === 'string';
  if (message.type === 'error') return typeof message.message === 'string';
  return (
    message.type === 'tool-request' && typeof message.toolCallId === 'string'
  );
};

export const isAgentWorkerCommand = (
  value: unknown,
): value is AgentWorkerCommand => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const command = value as Record<string, unknown>;
  if (command.type === 'shutdown') return true;
  if (typeof command.requestId !== 'string') return false;
  if (command.type === 'list-models') {
    return (
      typeof command.authPath === 'string' &&
      typeof command.modelsPath === 'string'
    );
  }
  if (command.type === 'cancel') return true;
  if (command.type === 'tool-result') {
    return (
      typeof command.toolCallId === 'string' &&
      typeof command.content === 'string'
    );
  }
  return (
    command.type === 'start' &&
    typeof command.authPath === 'string' &&
    typeof command.cwd === 'string' &&
    typeof command.modelsPath === 'string' &&
    typeof command.modelId === 'string' &&
    typeof command.prompt === 'string' &&
    typeof command.providerId === 'string' &&
    typeof command.role === 'string' &&
    AGENT_ROLES.includes(command.role as AgentRole) &&
    typeof command.thinkingLevel === 'string' &&
    AGENT_THINKING_LEVELS.includes(
      command.thinkingLevel as AgentThinkingLevel,
    )
  );
};

const isModelOption = (value: unknown): value is AgentModelOption => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const model = value as Partial<AgentModelOption>;
  return (
    typeof model.contextWindow === 'number' &&
    Number.isFinite(model.contextWindow) &&
    typeof model.id === 'string' &&
    typeof model.maxOutputTokens === 'number' &&
    Number.isFinite(model.maxOutputTokens) &&
    typeof model.name === 'string' &&
    typeof model.providerId === 'string' &&
    typeof model.reasoning === 'boolean'
  );
};
