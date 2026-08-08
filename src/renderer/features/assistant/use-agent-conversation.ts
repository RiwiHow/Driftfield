import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '@/app/types';
import {
  INITIAL_AGENT_RUN_STATE,
  isAgentConversationActive,
  reduceAgentConversationRun,
} from './agent-conversation-state';

export interface ConversationMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

export function useAgentConversation(activeChapter: Chapter | null) {
  const { t } = useTranslation('assistant');
  const { t: tErrors } = useTranslation('errors');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [run, dispatchRun] = useReducer(
    reduceAgentConversationRun,
    INITIAL_AGENT_RUN_STATE,
  );
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return window.driftfield.onAgentEvent((event) => {
      if (event.requestId !== requestIdRef.current) return;
      if (event.type === 'started') {
        dispatchRun({ requestId: event.requestId, type: 'started' });
      }
      if (event.type === 'text-delta') {
        dispatchRun({ requestId: event.requestId, type: 'started' });
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? { ...message, content: message.content + event.delta }
              : message,
          ),
        );
      }
      if (event.type === 'completed') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId && message.content.length === 0
              ? { ...message, content: t('terminal.empty') }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'completed' });
        requestIdRef.current = null;
      }
      if (event.type === 'cancelled') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId && message.content.length === 0
              ? { ...message, content: t('terminal.cancelled') }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'cancelled' });
        requestIdRef.current = null;
      }
      if (event.type === 'error') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId && message.content.length === 0
              ? { ...message, content: t('terminal.failed') }
              : message,
          ),
        );
        dispatchRun({
          error: tErrors(
            event.code === 'runtime-exited'
              ? 'agent.runtimeExited'
              : 'agent.requestFailed',
          ),
          requestId: event.requestId,
          type: 'failed',
        });
        requestIdRef.current = null;
      }
    });
  }, [t, tErrors]);

  const send = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || requestIdRef.current !== null) return false;
      const userMessage: ConversationMessage = {
        content: trimmedPrompt,
        id: crypto.randomUUID(),
        role: 'user',
      };
      const nextRequestId = crypto.randomUUID();
      requestIdRef.current = nextRequestId;
      dispatchRun({ requestId: nextRequestId, type: 'start' });
      setMessages((current) => [
        ...current,
        userMessage,
        { content: '', id: nextRequestId, role: 'assistant' },
      ]);
      try {
        const started = await window.driftfield.startAgentPrompt({
          currentDocumentId: activeChapter?.id,
          prompt: trimmedPrompt,
          requestId: nextRequestId,
        });
        if (started.status === 'error') {
          const errorKey =
            started.code === 'model-not-configured'
              ? 'agent.modelNotConfigured'
              : started.code === 'credential-missing'
                ? 'agent.credentialMissing'
                : 'agent.startFailed';
          throw new Error(tErrors(errorKey));
        }
        if (started.requestId !== nextRequestId) {
          throw new Error('Agent request identity mismatch');
        }
        return true;
      } catch (startError) {
        const message =
          startError instanceof Error
            ? startError.message
            : tErrors('agent.startFailed');
        dispatchRun({ error: message, requestId: nextRequestId, type: 'failed' });
        requestIdRef.current = null;
        setMessages((current) =>
          current.filter((message) => message.id !== nextRequestId),
        );
        return false;
      }
    },
    [activeChapter?.id, tErrors],
  );

  const cancel = useCallback(async () => {
    const requestId = requestIdRef.current;
    if (requestId === null) return;
    dispatchRun({ requestId, type: 'cancel-requested' });
    try {
      const result = await window.driftfield.cancelAgent({ requestId });
      if (!result.cancelled && requestIdRef.current === requestId) {
        requestIdRef.current = null;
        dispatchRun({
          error: tErrors('agent.cancelEnded'),
          requestId,
          type: 'failed',
        });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        requestIdRef.current = null;
        dispatchRun({
          error: tErrors('agent.cancelFailed'),
          requestId,
          type: 'failed',
        });
      }
    }
  }, [tErrors]);

  const clear = useCallback(() => {
    if (!isAgentConversationActive(run.phase)) {
      setMessages([]);
      dispatchRun({ type: 'reset' });
    }
  }, [run.phase]);

  return {
    cancel,
    clear,
    error: run.error,
    isActive: isAgentConversationActive(run.phase),
    messages,
    phase: run.phase,
    send,
  };
}
