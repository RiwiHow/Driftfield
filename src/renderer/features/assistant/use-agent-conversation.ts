import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

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
              ? { ...message, content: '（模型未返回文本）' }
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
              ? { ...message, content: '（已取消）' }
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
              ? { ...message, content: '（请求失败）' }
              : message,
          ),
        );
        dispatchRun({
          error: event.message,
          requestId: event.requestId,
          type: 'failed',
        });
        requestIdRef.current = null;
      }
    });
  }, []);

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
        if (started.requestId !== nextRequestId) {
          throw new Error('Agent request identity mismatch');
        }
        return true;
      } catch (startError) {
        const message =
          startError instanceof Error
            ? startError.message
            : '无法启动 Agent 请求。';
        dispatchRun({ error: message, requestId: nextRequestId, type: 'failed' });
        requestIdRef.current = null;
        setMessages((current) =>
          current.filter((message) => message.id !== nextRequestId),
        );
        return false;
      }
    },
    [activeChapter?.id],
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
          error: 'Agent 请求已经结束，无法取消。',
          requestId,
          type: 'failed',
        });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        requestIdRef.current = null;
        dispatchRun({
          error: '取消 Agent 请求失败。',
          requestId,
          type: 'failed',
        });
      }
    }
  }, []);

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
