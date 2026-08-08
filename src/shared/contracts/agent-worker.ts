export interface AgentWorkerStartCommand {
  authPath: string;
  cwd: string;
  modelsPath: string;
  prompt: string;
  requestId: string;
  type: 'start';
}

export type AgentWorkerCommand =
  | AgentWorkerStartCommand
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
    typeof command.prompt === 'string'
  );
};
