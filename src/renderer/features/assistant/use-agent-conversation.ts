import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { WorkspaceDocument } from '@/app/types';
import type {
  AgentProposal,
  SuccessfulApplyAgentProposalResult,
} from '../../../shared/contracts/agent-proposals';
import type {
  AgentConversationMessage,
  AgentConversationPart,
  AgentProposalStatus,
  AgentConversationSummary,
  AgentToolActivity,
} from '../../../shared/contracts/agent-conversations';
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

type ConversationUpdate = (
  messages: AgentConversationMessage[],
  requestId: string,
) => AgentConversationMessage[];

export function useAgentConversation(
  activeDocument: WorkspaceDocument | null,
  documents: WorkspaceDocument[],
  onProposalApplied: (
    result: SuccessfulApplyAgentProposalResult,
  ) => void,
  onStoryChanged: (revision: number) => void,
  projectId: string | null,
) {
  const { t: tErrors } = useTranslation('errors');
  const [messages, setMessages] = useState<AgentConversationMessage[]>([]);
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [run, dispatchRun] = useReducer(
    reduceAgentConversationRun,
    INITIAL_AGENT_RUN_STATE,
  );
  const requestIdRef = useRef<string | null>(null);
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const applyConversationState = useCallback((state: import('../../../shared/contracts/agent-conversations').AgentConversationState) => {
    setActiveConversationId(state.activeConversation.id);
    setConversations(state.conversations);
    setMessages(state.activeConversation.messages);
  }, []);

  useEffect(() => {
    requestIdRef.current = null;
    dispatchRun({ type: 'reset' });
    if (projectId === null) {
      setActiveConversationId(null);
      setConversations([]);
      setMessages([]);
      return;
    }
    let current = true;
    setHistoryLoading(true);
    void window.driftfield.getAgentConversationState().then(
      (state) => {
        if (current && projectIdRef.current === projectId) applyConversationState(state);
      },
      () => {
        if (current) {
          setActiveConversationId(null);
          setConversations([]);
          setMessages([]);
        }
      },
    ).finally(() => {
      if (current) setHistoryLoading(false);
    });
    return () => { current = false; };
  }, [applyConversationState, projectId]);

  useEffect(() => {
    const refreshPersistedConversation = (): void => {
      const expectedProjectId = projectIdRef.current;
      if (expectedProjectId === null) return;
      void window.driftfield.getAgentConversationState().then((state) => {
        if (projectIdRef.current === expectedProjectId) {
          applyConversationState(state);
        }
      }).catch(() => undefined);
    };
    return window.driftfield.onAgentEvent((event) => {
      if (event.requestId !== requestIdRef.current) return;
      if (event.type === 'story-changed') {
        onStoryChanged(event.revision);
        return;
      }
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
      if (event.type === 'proposal') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? {
                  ...message,
                  parts: [
                    ...(message.parts ?? []),
                    {
                      proposal: event.proposal,
                      status: 'pending' as const,
                      type: 'proposal' as const,
                    },
                  ],
                }
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
                    ...(event.agentRole === undefined
                      ? {}
                      : { agentRole: event.agentRole }),
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
              (message.parts?.length ?? 0) === 0
              ? { ...message, terminal: 'empty' }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'completed' });
        requestIdRef.current = null;
        refreshPersistedConversation();
      }
      if (event.type === 'cancelled') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
              ? {
                  ...message,
                  terminal: 'cancelled' as const,
                  parts: cancelRunningTools(message.parts ?? []),
                }
              : message,
          ),
        );
        dispatchRun({ requestId: event.requestId, type: 'cancelled' });
        requestIdRef.current = null;
        refreshPersistedConversation();
      }
      if (event.type === 'error') {
        setMessages((current) =>
          current.map((message) =>
            message.id === event.requestId
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
        refreshPersistedConversation();
      }
    });
  }, [applyConversationState, onStoryChanged]);

  const startRequest = useCallback(
    async (
      prompt: string,
      userMessageId: string,
      updateConversation: ConversationUpdate,
      editMessageId?: string,
    ) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || requestIdRef.current !== null || activeConversationId === null) return false;
      const nextRequestId = crypto.randomUUID();
      requestIdRef.current = nextRequestId;
      dispatchRun({ requestId: nextRequestId, type: 'start' });
      setMessages((current) => updateConversation(current, nextRequestId));
      try {
        const started = await window.driftfield.startAgentPrompt({
          conversationId: activeConversationId,
          ...(editMessageId === undefined ? {} : { editMessageId }),
          currentDocumentId: activeDocument?.id,
          ...(activeDocument === null
            ? {}
            : {
                draftSnapshot: {
                  baseRevision: activeDocument.revision,
                  documentId: activeDocument.id,
                  markdown: activeDocument.markdown,
                },
              }),
          prompt: trimmedPrompt,
          requestId: nextRequestId,
          userMessageId,
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
          void window.driftfield.getAgentConversationState()
            .then(applyConversationState)
            .catch(() => undefined);
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
        void window.driftfield.getAgentConversationState()
          .then(applyConversationState)
          .catch(() => undefined);
        return false;
      }
    },
    [activeDocument, activeConversationId, applyConversationState],
  );

  const send = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) return false;
      const userMessageId = crypto.randomUUID();
      return startRequest(
        trimmedPrompt,
        userMessageId,
        (current, nextRequestId) => [
          ...current,
          { content: trimmedPrompt, id: userMessageId, role: 'user' },
          { content: '', id: nextRequestId, role: 'assistant' },
        ],
      );
    },
    [startRequest],
  );

  const resend = useCallback(
    async (messageId: string, prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt || requestIdRef.current !== null) return false;
      const messageIndex = messages.findIndex(
        (message) => message.id === messageId && message.role === 'user',
      );
      if (messageIndex === -1) return false;
      rejectPendingProposals(messages.slice(messageIndex + 1));
      return startRequest(
        trimmedPrompt,
        messageId,
        (current, nextRequestId) =>
          branchConversationFromUserEdit(
            current,
            messageId,
            trimmedPrompt,
            nextRequestId,
          ),
        messageId,
      );
    },
    [messages, startRequest],
  );

  const editAssistantMessage = useCallback(
    async (messageId: string, content: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent || requestIdRef.current !== null || activeConversationId === null) return false;
      try {
        applyConversationState(await window.driftfield.updateAgentConversationMessage({
          content: trimmedContent,
          conversationId: activeConversationId,
          messageId,
        }));
        return true;
      } catch { return false; }
    },
    [activeConversationId, applyConversationState],
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
      status: AgentProposalStatus,
    ) => {
      setMessages((current) =>
        setProposalStatusInMessages(current, proposalId, status),
      );
    },
    [],
  );

  const setProposalStatuses = useCallback(
    (proposalIds: string[], status: AgentProposalStatus) => {
      setMessages((current) =>
        proposalIds.reduce(
          (messages, proposalId) =>
            setProposalStatusInMessages(messages, proposalId, status),
          current,
        ),
      );
    },
    [],
  );

  const applyProposal = useCallback(async (proposal: AgentProposal) => {
    if (!canApplyAgentProposal(activeDocument, proposal, documents)) {
      try {
        await window.driftfield.rejectAgentProposal({
          proposalId: proposal.proposalId,
          reason: 'stale',
        });
        setProposalStatus(proposal.proposalId, 'stale');
      } catch {
        setProposalStatus(proposal.proposalId, 'failed');
      }
      return;
    }
    setProposalStatus(proposal.proposalId, 'applying');
    try {
      const result = await window.driftfield.applyAgentProposal({
        proposalId: proposal.proposalId,
      });
      if (
        result.status === 'saved' ||
        result.status === 'created' ||
        result.status === 'deleted' ||
        result.status === 'moved' ||
        result.status === 'renamed' ||
        result.status === 'created-directory' ||
        result.status === 'deleted-directory' ||
        result.status === 'story-updated'
      ) {
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
  }, [activeDocument, documents, onProposalApplied]);

  const rejectProposal = useCallback(async (proposalId: string) => {
    try {
      await window.driftfield.rejectAgentProposal({ proposalId });
      setProposalStatus(proposalId, 'rejected');
    } catch {
      setProposalStatus(proposalId, 'failed');
    }
  }, []);

  const applyStoryProposals = useCallback(async (proposals: AgentProposal[]) => {
    const proposalIds = proposals
      .filter((proposal) => 'operation' in proposal && proposal.operation === 'story')
      .map(({ proposalId }) => proposalId);
    if (proposalIds.length === 0) return;
    setProposalStatuses(proposalIds, 'applying');
    try {
      const result = await window.driftfield.applyAgentProposal({ proposalIds });
      if (result.status === 'story-updated') {
        onProposalApplied(result);
        setProposalStatuses(proposalIds, 'saved');
      } else {
        const status: AgentProposalStatus =
          result.status === 'conflict' ||
          result.status === 'missing' ||
          result.status === 'stale'
            ? result.status
            : result.status === 'not-found'
              ? 'stale'
              : 'failed';
        setProposalStatuses(
          proposalIds,
          status,
        );
      }
    } catch {
      setProposalStatuses(proposalIds, 'failed');
    }
  }, [onProposalApplied, setProposalStatuses]);

  const rejectStoryProposals = useCallback(async (proposals: AgentProposal[]) => {
    const proposalIds = proposals
      .filter((proposal) => 'operation' in proposal && proposal.operation === 'story')
      .map(({ proposalId }) => proposalId);
    try {
      await Promise.all(proposalIds.map((proposalId) =>
        window.driftfield.rejectAgentProposal({ proposalId }),
      ));
      setProposalStatuses(proposalIds, 'rejected');
    } catch {
      setProposalStatuses(proposalIds, 'failed');
    }
  }, [setProposalStatuses]);

  const clear = useCallback(() => {
    if (!isAgentConversationActive(run.phase)) {
      void window.driftfield.createAgentConversation({}).then(applyConversationState);
      dispatchRun({ type: 'reset' });
    }
  }, [applyConversationState, run.phase]);

  const selectConversation = useCallback(async (conversationId: string) => {
    if (isAgentConversationActive(run.phase)) return false;
    try {
      applyConversationState(await window.driftfield.selectAgentConversation({ conversationId }));
      dispatchRun({ type: 'reset' });
      return true;
    } catch { return false; }
  }, [applyConversationState, run.phase]);

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    try {
      applyConversationState(await window.driftfield.renameAgentConversation({ conversationId, title }));
      return true;
    } catch { return false; }
  }, [applyConversationState]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    if (isAgentConversationActive(run.phase)) return false;
    try {
      applyConversationState(await window.driftfield.deleteAgentConversation({ conversationId }));
      dispatchRun({ type: 'reset' });
      return true;
    } catch { return false; }
  }, [applyConversationState, run.phase]);

  return {
    cancel,
    activeConversationId,
    applyProposal,
    applyStoryProposals,
    clear,
    conversations,
    deleteConversation,
    editAssistantMessage,
    error:
      run.errorCode === null
        ? null
        : tErrors(errorTranslationKeys[run.errorCode]),
    isActive: isAgentConversationActive(run.phase),
    historyLoading,
    messages,
    phase: run.phase,
    rejectProposal,
    rejectStoryProposals,
    renameConversation,
    resend,
    send,
    selectConversation,
  };
}

export function branchConversationFromUserEdit(
  messages: AgentConversationMessage[],
  messageId: string,
  content: string,
  requestId: string,
): AgentConversationMessage[] {
  const messageIndex = messages.findIndex(
    (message) => message.id === messageId && message.role === 'user',
  );
  if (messageIndex === -1) return messages;
  return [
    ...messages.slice(0, messageIndex),
    { ...messages[messageIndex], content },
    { content: '', id: requestId, role: 'assistant' },
  ];
}

export function replaceAssistantMessage(
  messages: AgentConversationMessage[],
  messageId: string,
  content: string,
): AgentConversationMessage[] {
  return messages.map((message) =>
    message.id === messageId && message.role === 'assistant'
      ? {
          ...message,
          content,
          parts: [
            ...(message.parts?.filter((part) => part.type !== 'text') ?? []),
            { content, type: 'text' },
          ],
          terminal: undefined,
        }
      : message,
  );
}

function rejectPendingProposals(messages: AgentConversationMessage[]): void {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== 'proposal' || part.status !== 'pending') continue;
      void window.driftfield.rejectAgentProposal({
        proposalId: part.proposal.proposalId,
      });
    }
  }
}

export function canApplyAgentProposal(
  document: WorkspaceDocument | null,
  proposal: AgentProposal,
  documents: WorkspaceDocument[] = document === null ? [] : [document],
): boolean {
  if ('operation' in proposal && proposal.operation === 'story') return true;
  if ('operation' in proposal) {
    if (
      proposal.operation === 'create' ||
      proposal.operation === 'create_volume' ||
      proposal.operation === 'create_lore_category' ||
      proposal.operation === 'delete_lore_category' ||
      proposal.operation === 'rename_document'
    ) return true;
    if (!('documentId' in proposal) || !('baseRevision' in proposal)) return false;
    const target = documents.find(({ id }) => id === proposal.documentId);
    if (target === undefined) return true;
    if (target.isDirty || target.revision !== proposal.baseRevision) return false;
    return proposal.operation === 'delete'
      ? target.markdown === proposal.baseMarkdown
      : true;
  }
  return (
    document !== null &&
    document.id === proposal.documentId &&
    document.revision === proposal.baseRevision &&
    document.markdown === proposal.baseMarkdown
  );
}

function setProposalStatusInMessages(
  messages: AgentConversationMessage[],
  proposalId: string,
  status: AgentProposalStatus,
): AgentConversationMessage[] {
  return messages.map((message) =>
    message.parts?.some(
      (part) => part.type === 'proposal' && part.proposal.proposalId === proposalId,
    )
      ? {
          ...message,
          parts: message.parts?.map((part) =>
            part.type === 'proposal' && part.proposal.proposalId === proposalId
              ? { ...part, status }
              : part,
          ),
        }
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
