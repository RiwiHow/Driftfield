import { useCallback, useEffect, useRef, useState } from 'react';

import type { Chapter } from '@/app/types';

export interface ConversationMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

export function useAgentConversation(activeChapter: Chapter | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    return window.driftfield.onAgentEvent((event) => {
      if (event.requestId !== requestIdRef.current) return;
      if (event.type === 'text-delta') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? { ...message, content: message.content + event.delta }
              : message,
          ),
        );
      }
      if (event.type === 'error') setError(event.message);
      if (
        event.type === 'completed' ||
        event.type === 'cancelled' ||
        event.type === 'error'
      ) {
        setRequestId(null);
        requestIdRef.current = null;
      }
    });
  }, []);

  const send = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || requestId !== null) return false;
      setError(null);
      const userMessage: ConversationMessage = {
        content: trimmedPrompt,
        id: crypto.randomUUID(),
        role: 'user',
      };
      setMessages((current) => [...current, userMessage]);
      try {
        const started = await window.driftfield.startAgentPrompt({
          currentDocumentId: activeChapter?.id,
          prompt: trimmedPrompt,
        });
        requestIdRef.current = started.requestId;
        setRequestId(started.requestId);
        setMessages((current) => [
          ...current,
          { content: '', id: started.requestId, role: 'assistant' },
        ]);
        return true;
      } catch (startError) {
        const message =
          startError instanceof Error
            ? startError.message
            : '无法启动 Agent 请求。';
        setError(message);
        return false;
      }
    },
    [activeChapter?.id, requestId],
  );

  const cancel = useCallback(async () => {
    if (requestId === null) return;
    await window.driftfield.cancelAgent({ requestId });
  }, [requestId]);

  const clear = useCallback(() => {
    if (requestId === null) setMessages([]);
  }, [requestId]);

  return { cancel, clear, error, isRunning: requestId !== null, messages, send };
}
