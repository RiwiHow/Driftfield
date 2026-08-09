import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '@/app/types';
import type {
  AgentEditProposal,
  ApplyAgentProposalResult,
} from '../../../shared/contracts/agent-proposals';
import type { AgentToolName } from '../../../shared/contracts/agent-tools';
import {
  type AgentConversationErrorCode,
  INITIAL_AGENT_RUN_STATE,
  isAgentConversationActive,
  reduceAgentConversationRun,
} from './agent-conversation-state';

const errorTranslationKeys = {
  'cancel-ended': 'agent.cancelEnded',
  'cancel-failed': 'agent.cancelFailed',
  'credential-missing': 'agent.credentialMissing',
  'model-not-configured': 'agent.modelNotConfigured',
  'request-failed': 'agent.requestFailed',
  'runtime-exited': 'agent.runtimeExited',
  'start-failed': 'agent.startFailed',
} as const satisfies Record<AgentConversationErrorCode, string>;

interface ConversationMessage {
  content: string;
  id: string;
  parts?: AgentConversationPart[];
  role: 'assistant' | 'user';
  proposal?: AgentEditProposal;
  proposalStatus?:
    | 'pending'
    | 'applying'
    | 'saved'
    | 'rejected'
    | 'conflict'
    | 'missing'
    | 'stale'
    | 'failed';
  terminal?: 'cancelled' | 'empty' | 'failed';
}

export interface AgentToolActivity {
  failed?: boolean;
  input: string;
  output?: string;
  status: 'running' | 'completed' | 'cancelled';
  toolCallId: string;
  toolName: AgentToolName;
}

export type AgentConversationPart =
  | { content: string; type: 'text' }
  | { activity: AgentToolActivity; type: 'tool' };

export function useAgentConversation(
  activeChapter: Chapter | null,
  onProposalApplied: (
    result: Extract<ApplyAgentProposalResult, { status: 'saved' }>,
  ) => void,
) {
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
              ? {
                  ...message,
                  content: message.content + event.delta,
                  parts: appendConversationText(message.parts ?? [], event.delta),
                }
              : message,
          ),
        );
      }
      if (event.type === 'edit-proposal') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? { ...message, proposal: event.proposal, proposalStatus: 'pending' }
              : message,
          ),
        );
      }
      if (event.type === 'tool-started') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? {
                  ...message,
                  parts: startToolActivity(message.parts ?? [], {
                    input: event.input,
                    status: 'running',
                    toolCallId: event.toolCallId,
                    toolName: event.toolName,
                  }),
                }
              : message,
          ),
        );
      }
      if (event.type === 'tool-completed') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? {
                  ...message,
                  parts: completeToolActivity(
                    message.parts ?? [],
                    event.toolCallId,
                    event.failed,
                    event.output,
                  ),
                }
              : message,
          ),
        );
      }
      if (event.type === 'completed') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId &&
              message.content.length === 0 &&
              message.proposal === undefined &&
              (message.parts?.length ?? 0) === 0
              ? { ...message, terminal: 'empty' }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'completed' });
        requestIdRef.current = null;
      }
      if (event.type === 'cancelled') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? {
                  ...message,
                  parts: cancelRunningTools(message.parts ?? []),
                  ...(message.content.length === 0 &&
                  message.proposal === undefined &&
                  (message.parts?.length ?? 0) === 0
                    ? { terminal: 'cancelled' as const }
                    : {}),
                }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'cancelled' });
        requestIdRef.current = null;
      }
      if (event.type === 'error') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId &&
              message.content.length === 0 &&
              message.proposal === undefined &&
              (message.parts?.length ?? 0) === 0
              ? { ...message, terminal: 'failed' }
              : message,
          ),
        );
        dispatchRun({
          errorCode:
            event.code === 'runtime-exited'
              ? 'runtime-exited'
              : 'request-failed',
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
          ...(activeChapter === null
            ? {}
            : {
                draftSnapshot: {
                  baseRevision: activeChapter.revision,
                  documentId: activeChapter.id,
                  markdown: activeChapter.markdown,
                },
              }),
          prompt: trimmedPrompt,
          requestId: nextRequestId,
        });
        if (started.status === 'error') {
          const errorCode: AgentConversationErrorCode =
            started.code === 'model-not-configured'
              ? 'model-not-configured'
              : started.code === 'credential-missing'
                ? 'credential-missing'
                : 'start-failed';
          dispatchRun({ errorCode, requestId: nextRequestId, type: 'failed' });
          requestIdRef.current = null;
          setMessages((current) =>
            current.filter((message) => message.id !== nextRequestId),
          );
          return false;
        }
        if (started.requestId !== nextRequestId) {
          throw new Error('Agent request identity mismatch');
        }
        return true;
      } catch {
        dispatchRun({
          errorCode: 'start-failed',
          requestId: nextRequestId,
          type: 'failed',
        });
        requestIdRef.current = null;
        setMessages((current) =>
          current.filter((message) => message.id !== nextRequestId),
        );
        return false;
      }
    },
    [activeChapter],
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
          errorCode: 'cancel-ended',
          requestId,
          type: 'failed',
        });
      }
    } catch {
      if (requestIdRef.current === requestId) {
        requestIdRef.current = null;
        dispatchRun({
          errorCode: 'cancel-failed',
          requestId,
          type: 'failed',
        });
      }
    }
  }, []);

  const setProposalStatus = useCallback(
    (
      proposalId: string,
      status: NonNullable<ConversationMessage['proposalStatus']>,
    ) => {
      setMessages((current) =>
        setProposalStatusInMessages(current, proposalId, status),
      );
    },
    [],
  );

  const applyProposal = useCallback(async (proposal: AgentEditProposal) => {
    if (!canApplyAgentProposal(activeChapter, proposal)) {
      setProposalStatus(proposal.proposalId, 'stale');
      return;
    }
    setProposalStatus(proposal.proposalId, 'applying');
    try {
      const result = await window.driftfield.applyAgentProposal({
        proposalId: proposal.proposalId,
      });
      if (result.status === 'saved') {
        onProposalApplied(result);
        setProposalStatus(proposal.proposalId, 'saved');
      } else {
        setProposalStatus(
          proposal.proposalId,
          result.status === 'not-found' ? 'stale' : result.status,
        );
      }
    } catch {
      setProposalStatus(proposal.proposalId, 'failed');
    }
  }, [activeChapter, onProposalApplied]);

  const rejectProposal = useCallback(async (proposalId: string) => {
    try {
      await window.driftfield.rejectAgentProposal({ proposalId });
      setProposalStatus(proposalId, 'rejected');
    } catch {
      setProposalStatus(proposalId, 'failed');
    }
  }, []);

  const clear = useCallback(() => {
    if (!isAgentConversationActive(run.phase)) {
      for (const message of messages) {
        if (message.proposalStatus === 'pending' && message.proposal !== undefined) {
          void window.driftfield.rejectAgentProposal({
            proposalId: message.proposal.proposalId,
          });
        }
      }
      setMessages([]);
      dispatchRun({ type: 'reset' });
    }
  }, [messages, run.phase]);

  return {
    cancel,
    applyProposal,
    clear,
    error:
      run.errorCode === null
        ? null
        : tErrors(errorTranslationKeys[run.errorCode]),
    isActive: isAgentConversationActive(run.phase),
    messages,
    phase: run.phase,
    rejectProposal,
    send,
  };
}

export function canApplyAgentProposal(
  chapter: Chapter | null,
  proposal: AgentEditProposal,
): boolean {
  return (
    chapter !== null &&
    chapter.id === proposal.documentId &&
    chapter.revision === proposal.baseRevision &&
    chapter.markdown === proposal.baseMarkdown
  );
}

function setProposalStatusInMessages(
  messages: ConversationMessage[],
  proposalId: string,
  status: NonNullable<ConversationMessage['proposalStatus']>,
): ConversationMessage[] {
  return messages.map((message) =>
    message.proposal?.proposalId === proposalId
      ? { ...message, proposalStatus: status }
      : message,
  );
}

export function appendConversationText(
  parts: AgentConversationPart[],
  delta: string,
): AgentConversationPart[] {
  const last = parts.at(-1);
  return last?.type === 'text'
    ? [...parts.slice(0, -1), { ...last, content: last.content + delta }]
    : [...parts, { content: delta, type: 'text' }];
}

export function startToolActivity(
  parts: AgentConversationPart[],
  activity: AgentToolActivity,
): AgentConversationPart[] {
  const existingIndex = parts.findIndex(
    (part) =>
      part.type === 'tool' &&
      part.activity.toolCallId === activity.toolCallId,
  );
  if (existingIndex === -1) return [...parts, { activity, type: 'tool' }];
  return parts.map((part, index) =>
    index === existingIndex ? { activity, type: 'tool' } : part,
  );
}

export function completeToolActivity(
  parts: AgentConversationPart[],
  toolCallId: string,
  failed: boolean,
  output: string,
): AgentConversationPart[] {
  return parts.map((part) =>
    part.type === 'tool' && part.activity.toolCallId === toolCallId
      ? {
          ...part,
          activity: {
            ...part.activity,
            failed,
            output,
            status: 'completed',
          },
        }
      : part,
  );
}

const cancelRunningTools = (
  parts: AgentConversationPart[],
): AgentConversationPart[] =>
  parts.map((part) =>
    part.type === 'tool' && part.activity.status === 'running'
      ? {
          ...part,
          activity: { ...part.activity, status: 'cancelled' },
        }
      : part,
  );
