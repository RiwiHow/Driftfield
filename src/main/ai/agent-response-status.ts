interface AssistantResponseMessage {
  role: string;
  stopReason?: string;
}

export const didAssistantResponseFail = (
  message: AssistantResponseMessage,
): boolean =>
  message.role === 'assistant' &&
  (message.stopReason === 'error' || message.stopReason === 'aborted');
