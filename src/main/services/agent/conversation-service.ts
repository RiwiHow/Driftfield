import { randomUUID } from 'node:crypto';

import {
  appendConversationText,
  type AgentConversationMessage,
  type AgentConversationPart,
  type AgentConversationState,
  type AgentConversationSummary,
  type AgentProposalStatus,
} from '../../../shared/contracts/agent-conversations';
import type {
  AgentProposal,
  AgentProposalOutcome,
} from '../../../shared/contracts/agent-proposals';
import { isProjectStoryOperation } from '../../../shared/contracts/project-story';
import {
  AGENT_ROLES,
  type AgentEvent,
  type AgentRole,
} from '../../../shared/contracts/agent';
import { isAgentToolName } from '../../../shared/contracts/agent-tools';
import { isProjectIconId } from '../../../shared/contracts/project-layout';
import type { ProjectConversationRepository } from '../../database/project-conversation-repository';
import { ProjectStoreRegistry } from '../../database/project-store';
import type { ProjectSession } from '../project/session-service';

const DEFAULT_TITLE = '';
const MAX_CONTEXT_CHARACTERS = 120_000;
const MAX_CONTEXT_MESSAGES = 200;
const MAX_CONVERSATIONS = 500;
const MAX_MESSAGES_PER_CONVERSATION = 2_000;
const FLUSH_DELAY_MS = 400;

interface MessageRow {
  content: string;
  created_at: string;
  id: string;
  parts_json: string | null;
  role: 'assistant' | 'user';
  terminal: AgentConversationMessage['terminal'] | null;
}

interface ConversationRow {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
}

interface ActiveRequest {
  repository: ProjectConversationRepository;
  message: AgentConversationMessage;
  outcome: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  timer: ReturnType<typeof setTimeout> | null;
}

export interface AgentHistoryMessage {
  content: string;
  role: 'assistant' | 'user';
}

export interface AgentPromptHistory {
  history: AgentHistoryMessage[];
  proposalOutcomes: AgentProposalOutcome[];
}

export class AgentConversationService {
  private readonly activeRequests = new Map<string, ActiveRequest>();
  private readonly initializedProjects = new Set<string>();

  constructor(private readonly stores: ProjectStoreRegistry) {}

  getState(session: ProjectSession): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
      const conversationId = this.ensureActiveConversation(repository);
      return this.readState(repository, conversationId);
    });
  }

  getPromptHistory(session: ProjectSession): AgentPromptHistory {
    return this.withRepository(session, 'write', (repository) => {
      const conversationId = this.ensureActiveConversation(repository);
      return {
        history: selectBoundedHistory(repository.history(conversationId)),
        proposalOutcomes: parseProposalOutcomeRows(
          repository.proposalOutcomeRows(conversationId),
        ),
      };
    });
  }

  create(session: ProjectSession, requestedTitle?: string): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
    if (repository.countConversations() >= MAX_CONVERSATIONS) {
      throw new Error('Project contains too many Agent conversations');
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = normalizeTitle(requestedTitle) ?? DEFAULT_TITLE;
    repository.create(id, title, now);
    repository.setActive(id);
    return this.readState(repository, id);
    });
  }

  select(session: ProjectSession, conversationId: string): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
      this.assertConversation(repository, conversationId);
      repository.setActive(conversationId);
      return this.readState(repository, conversationId);
    });
  }

  rename(
    session: ProjectSession,
    conversationId: string,
    requestedTitle: string,
  ): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
    const title = normalizeTitle(requestedTitle);
    if (title === null) throw new Error('Invalid conversation title');
    if (!repository.rename(conversationId, title)) throw new Error('Unknown conversation');
    return this.readState(repository, this.ensureActiveConversation(repository));
    });
  }

  delete(session: ProjectSession, conversationId: string): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
      const now = new Date().toISOString();
      if (!repository.softDelete(conversationId, now)) throw new Error('Unknown conversation');
      const activeId = this.ensureActiveConversation(repository);
      repository.setActive(activeId);
      return this.readState(repository, activeId);
    });
  }

  updateAssistantMessage(
    session: ProjectSession,
    conversationId: string,
    messageId: string,
    content: string,
  ): AgentConversationState {
    return this.withRepository(session, 'write', (repository) => {
    const trimmed = content.trim();
    if (
      trimmed.length === 0 ||
      Buffer.byteLength(trimmed, 'utf8') > 512 * 1024
    ) {
      throw new Error('Invalid assistant message');
    }
    const partsJson = repository.assistantParts(messageId, conversationId);
    if (partsJson === undefined) throw new Error('Unknown assistant message');
    const retainedParts = partsJson === null
      ? []
      : (JSON.parse(partsJson) as AgentConversationPart[]).filter(
          (part) => part.type !== 'text',
        );
    repository.updateAssistant(
      messageId,
      trimmed,
      JSON.stringify([...retainedParts, { content: trimmed, type: 'text' }]),
    );
    return this.readState(repository, conversationId);
    });
  }

  beginPrompt(
    session: ProjectSession,
    input: {
      conversationId: string;
      editMessageId?: string;
      prompt: string;
      requestId: string;
      userMessageId: string;
    },
  ): AgentPromptHistory {
    const repository = this.getRepository(session);
    this.assertConversation(repository, input.conversationId);
    const activeMessageCount = repository.activeMessageCount(input.conversationId);
    if (
      input.editMessageId === undefined &&
      activeMessageCount > MAX_MESSAGES_PER_CONVERSATION - 2
    ) {
      throw new Error('Agent conversation contains too many messages');
    }
    const now = new Date().toISOString();
    this.stores.get(session.directoryPath).write(() => {
      let userSequence: number;
      if (input.editMessageId !== undefined) {
        const editedSequence = repository.userSequence(
          input.editMessageId,
          input.conversationId,
        );
        if (editedSequence === null) throw new Error('Unknown conversation message');
        userSequence = editedSequence;
        repository.deactivateAfter(input.conversationId, userSequence, now);
        repository.updateUser(input.editMessageId, input.prompt, now);
      } else {
        userSequence = repository.nextSequence(input.conversationId);
        repository.insertUser(
          input.userMessageId,
          input.conversationId,
          userSequence,
          input.prompt,
          now,
        );
      }
      repository.insertAssistant(
        input.requestId,
        input.conversationId,
        userSequence + 1,
        now,
      );
      repository.updateTitleAfterPrompt(
        input.conversationId,
        repository.userCount(input.conversationId),
        DEFAULT_TITLE,
        deriveTitle(input.prompt),
        now,
      );
    });

    const message: AgentConversationMessage = {
      content: '',
      createdAt: now,
      id: input.requestId,
      parts: [],
      role: 'assistant',
    };
    this.activeRequests.set(input.requestId, {
      repository,
      message,
      outcome: 'running',
      timer: null,
    });
    return {
      history: this.buildHistory(repository, input.conversationId, input.requestId),
      proposalOutcomes: this.buildProposalOutcomes(
        repository,
        input.conversationId,
        input.requestId,
      ),
    };
  }

  abandonRequest(requestId: string): void {
    const active = this.activeRequests.get(requestId);
    if (active === undefined) return;
    active.message.terminal = 'failed';
    active.outcome = 'failed';
    this.flushRequest(requestId);
  }

  recordEvent(event: AgentEvent): void {
    const active = this.activeRequests.get(event.requestId);
    if (active === undefined || event.type === 'started') return;
    if (event.type === 'story-changed') return;
    const message = active.message;
    if (event.type === 'text-delta') {
      message.content += event.delta;
      message.parts = appendConversationText(message.parts ?? [], event.delta);
      this.scheduleFlush(active);
      return;
    }
    if (event.type === 'tool-started') {
      message.parts = [
        ...(message.parts ?? []),
        {
          activity: {
            ...(event.agentRole === undefined ? {} : { agentRole: event.agentRole }),
            input: event.input,
            status: 'running',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
          type: 'tool',
        },
      ];
      this.scheduleFlush(active);
      return;
    }
    if (event.type === 'tool-completed') {
      message.parts = (message.parts ?? []).map((part) =>
        part.type === 'tool' && part.activity.toolCallId === event.toolCallId
          ? {
              ...part,
              activity: {
                ...part.activity,
                failed: event.failed,
                output: event.output,
                status: 'completed' as const,
              },
            }
          : part,
      );
      this.scheduleFlush(active);
      return;
    }
    if (event.type === 'proposal') {
      message.parts = [
        ...(message.parts ?? []),
        { proposal: event.proposal, status: 'pending', type: 'proposal' },
      ];
      this.persistMessage(active);
      return;
    }
    if (event.type === 'cancelled') {
      message.terminal = 'cancelled';
      active.outcome = 'cancelled';
      message.parts = cancelTools(message.parts ?? []);
    } else if (event.type === 'error') {
      message.terminal = 'failed';
      active.outcome = 'failed';
    } else if (
      message.content.length === 0 &&
      (message.parts?.length ?? 0) === 0
    ) {
      message.terminal = 'empty';
      active.outcome = 'completed';
    } else {
      active.outcome = 'completed';
    }
    this.flushRequest(event.requestId);
  }

  getProposal(
    session: ProjectSession,
    proposalId: string,
  ): AgentProposal | null {
    const proposalJson = this.getRepository(session).pendingProposalJson(proposalId);
    return proposalJson === null ? null : parseStoredProposal(proposalJson);
  }

  setProposalStatus(
    session: ProjectSession,
    proposalId: string,
    status: AgentProposalStatus,
  ): void {
    for (const active of this.activeRequests.values()) {
      if (active.repository !== this.getRepository(session)) continue;
      const containsProposal = active.message.parts?.some(
        (part) => part.type === 'proposal' && part.proposal.proposalId === proposalId,
      );
      if (!containsProposal) continue;
      active.message.parts = active.message.parts?.map((part) =>
        part.type === 'proposal' && part.proposal.proposalId === proposalId
          ? { ...part, status }
          : part,
      );
      this.persistMessage(active);
      return;
    }
    const repository = this.getRepository(session);
    const row = repository.proposalMessage(proposalId);
    if (row === null) return;
    const parts = row.partsJson === null ? [] : parseStoredParts(row.partsJson);
    const nextParts = parts.map((part) =>
      part.type === 'proposal' && part.proposal.proposalId === proposalId
        ? { ...part, status }
        : part,
    );
    repository.updateProposalMessage(row.id, JSON.stringify(nextParts), status);
  }

  dispose(): void {
    for (const requestId of [...this.activeRequests.keys()]) {
      const active = this.activeRequests.get(requestId);
      if (active !== undefined) {
        active.message.terminal = 'interrupted';
        active.outcome = 'interrupted';
      }
      this.flushRequest(requestId);
    }
  }

  private getRepository(session: ProjectSession): ProjectConversationRepository {
    const store = this.stores.get(session.directoryPath);
    if (!this.initializedProjects.has(session.directoryPath)) {
      store.write(({ conversations }) => conversations.interruptRunning());
      this.initializedProjects.add(session.directoryPath);
    }
    return store.read(({ conversations }) => conversations);
  }

  private withRepository<T>(
    session: ProjectSession,
    mode: 'read' | 'write',
    operation: (repository: ProjectConversationRepository) => T,
  ): T {
    this.getRepository(session);
    const store = this.stores.get(session.directoryPath);
    return mode === 'read'
      ? store.read(({ conversations }) => operation(conversations))
      : store.write(({ conversations }) => operation(conversations));
  }

  private ensureActiveConversation(repository: ProjectConversationRepository): string {
    const activeId = repository.findActiveId();
    if (activeId !== null) return activeId;
    const latestId = repository.findLatestId();
    if (latestId !== null) return latestId;
    const now = new Date().toISOString();
    const id = randomUUID();
    repository.create(id, DEFAULT_TITLE, now);
    repository.setActive(id);
    return id;
  }

  private assertConversation(repository: ProjectConversationRepository, id: string): void {
    if (!repository.exists(id)) throw new Error('Unknown conversation');
  }

  private readState(repository: ProjectConversationRepository, id: string): AgentConversationState {
    this.assertConversation(repository, id);
    const conversations = repository.list(MAX_CONVERSATIONS + 1);
    if (conversations.length > MAX_CONVERSATIONS) {
      throw new Error('Project contains too many Agent conversations');
    }
    const active = conversations.find((conversation) => conversation.id === id)!;
    const rows = repository.listMessages(id, MAX_MESSAGES_PER_CONVERSATION + 1);
    if (rows.length > MAX_MESSAGES_PER_CONVERSATION) {
      throw new Error('Agent conversation contains too many messages');
    }
    return {
      activeConversation: {
        ...toSummary(active),
        messages: rows.map(toMessage),
      },
      conversations: conversations.map(toSummary),
    };
  }

  private buildHistory(
    repository: ProjectConversationRepository,
    conversationId: string,
    requestId: string,
  ): AgentHistoryMessage[] {
    return selectBoundedHistory(repository.history(conversationId, requestId));
  }

  private buildProposalOutcomes(
    repository: ProjectConversationRepository,
    conversationId: string,
    requestId: string,
  ): AgentProposalOutcome[] {
    return parseProposalOutcomeRows(
      repository.proposalOutcomeRows(conversationId, requestId),
    );
  }

  private scheduleFlush(active: ActiveRequest): void {
    if (active.timer !== null) return;
    active.timer = setTimeout(() => {
      active.timer = null;
      this.persistMessage(active);
    }, FLUSH_DELAY_MS);
  }

  private flushRequest(requestId: string): void {
    const active = this.activeRequests.get(requestId);
    if (active === undefined) return;
    if (active.timer !== null) clearTimeout(active.timer);
    this.persistMessage(active);
    this.activeRequests.delete(requestId);
  }

  private persistMessage(active: ActiveRequest): void {
    const { message } = active;
    const proposalPart = findLatestProposalPart(message.parts ?? []);
    active.repository.persistAssistant({
      content: message.content,
      id: message.id,
      outcome: active.outcome,
      partsJson: message.parts === undefined ? null : JSON.stringify(message.parts),
      proposalId: proposalPart?.proposal.proposalId ?? null,
      proposalJson: proposalPart === undefined
        ? null
        : JSON.stringify(proposalPart.proposal),
      proposalStatus: proposalPart?.status ?? null,
      terminal: message.terminal ?? null,
    });
  }
}

const selectBoundedHistory = (
  rows: AgentHistoryMessage[],
): AgentHistoryMessage[] => {
  const selected: AgentHistoryMessage[] = [];
  let characters = 0;
  for (const row of rows) {
    if (row.content.length === 0) continue;
    const historyRow = row;
    if (
      selected.length > 0 &&
      characters + historyRow.content.length > MAX_CONTEXT_CHARACTERS
    ) break;
    selected.push(historyRow);
    characters += historyRow.content.length;
    if (selected.length >= MAX_CONTEXT_MESSAGES) break;
  }
  return selected.reverse();
};

const parseProposalOutcomeRows = (
  rows: Array<{ parts_json: string }>,
): AgentProposalOutcome[] => rows
  .reverse()
  .flatMap<AgentProposalOutcome>((row) =>
    parseStoredParts(row.parts_json)
      .filter(
        (part): part is Extract<AgentConversationPart, { type: 'proposal' }> =>
          part.type === 'proposal' &&
          part.status !== 'pending' &&
          part.status !== 'applying',
      )
      .map((part) => ({
        operation: 'operation' in part.proposal
          ? part.proposal.operation
          : 'edit',
        proposalId: part.proposal.proposalId,
        status: toProposalOutcomeStatus(part.status),
        targetTitle: part.proposal.title,
      })),
  )
  .slice(-50);

const normalizeTitle = (value?: string): string | null => {
  const title = value?.trim();
  return title !== undefined && title.length > 0 && title.length <= 200
    ? title
    : null;
};

const deriveTitle = (prompt: string): string =>
  [...prompt.replace(/\s+/gu, ' ').trim()].slice(0, 40).join('');

const toProposalOutcomeStatus = (
  status: AgentProposalStatus,
): AgentProposalOutcome['status'] => {
  if (status === 'pending' || status === 'applying') {
    throw new Error('Non-terminal Agent proposal outcome');
  }
  return status === 'saved' ? 'accepted' : status;
};

const toSummary = (row: ConversationRow): AgentConversationSummary => ({
  createdAt: row.created_at,
  id: row.id,
  title: row.title,
  updatedAt: row.updated_at,
});

const toMessage = (row: MessageRow): AgentConversationMessage => ({
  content: row.content,
  createdAt: row.created_at,
  id: row.id,
  ...(row.parts_json === null
    ? {}
    : { parts: parseStoredParts(row.parts_json) }),
  role: row.role,
  ...(row.terminal === null ? {} : { terminal: row.terminal }),
});

const cancelTools = (parts: AgentConversationPart[]): AgentConversationPart[] =>
  parts.map((part) =>
    part.type === 'tool' && part.activity.status === 'running'
      ? { ...part, activity: { ...part.activity, status: 'cancelled' } }
      : part,
  );

const findLatestProposalPart = (
  parts: AgentConversationPart[],
): Extract<AgentConversationPart, { type: 'proposal' }> | undefined => {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type === 'proposal') return part;
  }
  return undefined;
};

const parseStoredParts = (value: string): AgentConversationPart[] => {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 256) {
    throw new Error('Invalid stored Agent message parts');
  }
  for (const part of parsed) {
    if (typeof part !== 'object' || part === null || Array.isArray(part)) {
      throw new Error('Invalid stored Agent message part');
    }
    const record = part as Record<string, unknown>;
    if (record.type === 'text') {
      if (typeof record.content !== 'string') {
        throw new Error('Invalid stored Agent text part');
      }
      continue;
    }
    if (record.type === 'proposal') {
      if (
        typeof record.status !== 'string' ||
        !['pending', 'applying', 'saved', 'rejected', 'conflict', 'missing', 'stale', 'failed']
          .includes(record.status)
      ) {
        throw new Error('Invalid stored Agent proposal part');
      }
      parseStoredProposal(JSON.stringify(record.proposal));
      continue;
    }
    const activity = record.activity;
    if (
      record.type !== 'tool' ||
      typeof activity !== 'object' ||
      activity === null ||
      Array.isArray(activity)
    ) {
      throw new Error('Invalid stored Agent tool part');
    }
    const tool = activity as Record<string, unknown>;
    if (
      typeof tool.input !== 'string' ||
      tool.input.length > 8_192 ||
      (tool.output !== undefined &&
        (typeof tool.output !== 'string' || tool.output.length > 8_192)) ||
      (tool.failed !== undefined && typeof tool.failed !== 'boolean') ||
      (tool.agentRole !== undefined &&
        (typeof tool.agentRole !== 'string' ||
          !AGENT_ROLES.includes(tool.agentRole as AgentRole))) ||
      (tool.status !== 'running' &&
        tool.status !== 'completed' &&
        tool.status !== 'cancelled') ||
      typeof tool.toolCallId !== 'string' ||
      tool.toolCallId.length === 0 ||
      tool.toolCallId.length > 128 ||
      !isAgentToolName(tool.toolName)
    ) {
      throw new Error('Invalid stored Agent tool activity');
    }
  }
  return parsed as AgentConversationPart[];
};

const parseStoredProposal = (value: string): AgentProposal => {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid stored Agent proposal');
  }
  const proposal = parsed as Record<string, unknown>;
  const isRevision = (revision: unknown): revision is string =>
    typeof revision === 'string' && /^[a-f0-9]{64}$/u.test(revision);
  const hasCommonFields =
    typeof proposal.proposalId === 'string' &&
    proposal.proposalId.length > 0 &&
    proposal.proposalId.length <= 128 &&
    typeof proposal.requestId === 'string' &&
    proposal.requestId.length > 0 &&
    proposal.requestId.length <= 128 &&
    typeof proposal.title === 'string' &&
    proposal.title.length <= 500;
  const isId = (id: unknown): id is string =>
    typeof id === 'string' && id.length > 0 && id.length <= 128;
  const valid = proposal.operation === 'story'
    ? hasCommonFields &&
      Number.isSafeInteger(proposal.storyRevision) &&
      (proposal.storyRevision as number) >= 0 &&
      isProjectStoryOperation(proposal.change)
    : proposal.operation === 'create'
    ? hasCommonFields &&
      typeof proposal.documentId === 'string' &&
      proposal.documentId.length > 0 &&
      proposal.documentId.length <= 128 &&
      typeof proposal.parentId === 'string' &&
      proposal.parentId.length > 0 &&
      proposal.parentId.length <= 128 &&
      typeof proposal.parentTitle === 'string' &&
      proposal.parentTitle.length <= 500 &&
      isRevision(proposal.projectRevision) &&
      typeof proposal.markdown === 'string' &&
      Buffer.byteLength(proposal.markdown, 'utf8') <= 512 * 1024 &&
      typeof proposal.documentKind === 'string' &&
      ['chapter', 'prologue', 'interlude', 'epilogue', 'appendix', 'entry']
        .includes(proposal.documentKind)
    : proposal.operation === 'delete'
      ? hasCommonFields &&
        typeof proposal.documentId === 'string' &&
        proposal.documentId.length > 0 &&
        proposal.documentId.length <= 128 &&
        isRevision(proposal.projectRevision) &&
        isRevision(proposal.baseRevision) &&
        typeof proposal.baseMarkdown === 'string' &&
        Buffer.byteLength(proposal.baseMarkdown, 'utf8') <= 512 * 1024
      : proposal.operation === 'create_volume' ||
          proposal.operation === 'create_lore_category'
        ? hasCommonFields &&
          isId(proposal.directoryId) &&
          (proposal.directoryKind === 'volume' || proposal.directoryKind === 'category') &&
          ((proposal.operation === 'create_volume' && proposal.directoryKind === 'volume') ||
            (proposal.operation === 'create_lore_category' && proposal.directoryKind === 'category')) &&
          (proposal.icon === undefined ||
            isProjectIconId(proposal.icon)) &&
          isId(proposal.parentId) &&
          typeof proposal.parentTitle === 'string' &&
          proposal.parentTitle.length <= 500 &&
          isRevision(proposal.projectRevision)
        : proposal.operation === 'delete_lore_category'
          ? hasCommonFields &&
            isId(proposal.directoryId) &&
            isId(proposal.parentId) &&
            typeof proposal.parentTitle === 'string' &&
            proposal.parentTitle.length <= 500 &&
            isRevision(proposal.projectRevision)
        : proposal.operation === 'set_lore_category_icon'
          ? hasCommonFields &&
            isId(proposal.directoryId) &&
            isProjectIconId(proposal.icon) &&
            (proposal.previousIcon === undefined ||
              isProjectIconId(proposal.previousIcon)) &&
            isRevision(proposal.projectRevision)
        : proposal.operation === 'move_document'
          ? hasCommonFields &&
            isId(proposal.documentId) &&
            isRevision(proposal.baseRevision) &&
            isRevision(proposal.projectRevision) &&
            isId(proposal.sourceParentId) &&
            typeof proposal.sourceParentTitle === 'string' &&
            proposal.sourceParentTitle.length <= 500 &&
            isId(proposal.targetParentId) &&
            typeof proposal.targetParentTitle === 'string' &&
            proposal.targetParentTitle.length <= 500
          : proposal.operation === 'rename_document'
            ? hasCommonFields &&
              isId(proposal.documentId) &&
              isRevision(proposal.projectRevision) &&
              typeof proposal.previousTitle === 'string' &&
              proposal.previousTitle.length <= 500
          : hasCommonFields &&
        isRevision(proposal.baseContentRevision) &&
        isRevision(proposal.baseRevision) &&
        typeof proposal.baseMarkdown === 'string' &&
        Buffer.byteLength(proposal.baseMarkdown, 'utf8') <= 512 * 1024 &&
        typeof proposal.documentId === 'string' &&
        proposal.documentId.length > 0 &&
        proposal.documentId.length <= 128 &&
        typeof proposal.markdown === 'string' &&
        Buffer.byteLength(proposal.markdown, 'utf8') <= 512 * 1024;
  if (!valid) {
    throw new Error('Invalid stored Agent proposal');
  }
  return parsed as AgentProposal;
};
