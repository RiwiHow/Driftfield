import { randomUUID } from 'node:crypto';

import type {
  AgentConversationMessage,
  AgentConversationPart,
  AgentConversationState,
  AgentConversationSummary,
  AgentProposalStatus,
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
import { isAgentToolAuditName } from '../../../shared/contracts/agent-tools';
import { PROJECT_ICON_IDS } from '../../../shared/contracts/project-layout';
import { ProjectDatabase } from '../../database/project-database';
import type { ProjectSession } from '../project/session-service';
import { expireRequestScopedReferences } from './model-history';

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
  database: ProjectDatabase;
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
  private readonly databases = new Map<string, ProjectDatabase>();
  private readonly activeRequests = new Map<string, ActiveRequest>();

  getState(session: ProjectSession): AgentConversationState {
    const database = this.getDatabase(session);
    const conversationId = this.ensureActiveConversation(database);
    return this.readState(database, conversationId);
  }

  create(session: ProjectSession, requestedTitle?: string): AgentConversationState {
    const database = this.getDatabase(session);
    const count = database.connection.prepare(`
      SELECT COUNT(*) AS count FROM conversations WHERE deleted_at IS NULL
    `).get() as { count: number };
    if (count.count >= MAX_CONVERSATIONS) {
      throw new Error('Project contains too many Agent conversations');
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const title = normalizeTitle(requestedTitle) ?? DEFAULT_TITLE;
    database.transaction(() => {
      database.connection.prepare(`
        INSERT INTO conversations(id, title, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, title, now, now);
      database.connection.prepare(`
        UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
      `).run(id);
    });
    return this.readState(database, id);
  }

  select(session: ProjectSession, conversationId: string): AgentConversationState {
    const database = this.getDatabase(session);
    this.assertConversation(database, conversationId);
    database.connection.prepare(`
      UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
    `).run(conversationId);
    return this.readState(database, conversationId);
  }

  rename(
    session: ProjectSession,
    conversationId: string,
    requestedTitle: string,
  ): AgentConversationState {
    const database = this.getDatabase(session);
    const title = normalizeTitle(requestedTitle);
    if (title === null) throw new Error('Invalid conversation title');
    const result = database.connection.prepare(`
      UPDATE conversations SET title = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(title, new Date().toISOString(), conversationId);
    if (result.changes !== 1) throw new Error('Unknown conversation');
    return this.readState(database, this.ensureActiveConversation(database));
  }

  delete(session: ProjectSession, conversationId: string): AgentConversationState {
    const database = this.getDatabase(session);
    const now = new Date().toISOString();
    const result = database.connection.prepare(`
      UPDATE conversations SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, conversationId);
    if (result.changes !== 1) throw new Error('Unknown conversation');
    const activeId = this.ensureActiveConversation(database);
    database.connection.prepare(`
      UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
    `).run(activeId);
    return this.readState(database, activeId);
  }

  updateAssistantMessage(
    session: ProjectSession,
    conversationId: string,
    messageId: string,
    content: string,
  ): AgentConversationState {
    const database = this.getDatabase(session);
    const trimmed = content.trim();
    if (
      trimmed.length === 0 ||
      Buffer.byteLength(trimmed, 'utf8') > 512 * 1024
    ) {
      throw new Error('Invalid assistant message');
    }
    const row = database.connection.prepare(`
      SELECT parts_json FROM conversation_messages
      WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND active = 1
    `).get(messageId, conversationId) as { parts_json: string | null } | undefined;
    if (row === undefined) throw new Error('Unknown assistant message');
    const retainedParts = row.parts_json === null
      ? []
      : (JSON.parse(row.parts_json) as AgentConversationPart[]).filter(
          (part) => part.type !== 'text',
        );
    database.connection.prepare(`
      UPDATE conversation_messages
      SET content = ?, parts_json = ?, terminal = NULL, updated_at = ?
      WHERE id = ?
    `).run(
      trimmed,
      JSON.stringify([...retainedParts, { content: trimmed, type: 'text' }]),
      new Date().toISOString(),
      messageId,
    );
    return this.readState(database, conversationId);
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
    const database = this.getDatabase(session);
    this.assertConversation(database, input.conversationId);
    const activeMessageCount = database.connection.prepare(`
      SELECT COUNT(*) AS count FROM conversation_messages
      WHERE conversation_id = ? AND active = 1
    `).get(input.conversationId) as { count: number };
    if (
      input.editMessageId === undefined &&
      activeMessageCount.count > MAX_MESSAGES_PER_CONVERSATION - 2
    ) {
      throw new Error('Agent conversation contains too many messages');
    }
    const now = new Date().toISOString();
    database.transaction(() => {
      let userSequence: number;
      if (input.editMessageId !== undefined) {
        const edited = database.connection.prepare(`
          SELECT sequence FROM conversation_messages
          WHERE id = ? AND conversation_id = ? AND role = 'user' AND active = 1
        `).get(input.editMessageId, input.conversationId) as
          | { sequence: number }
          | undefined;
        if (edited === undefined) throw new Error('Unknown conversation message');
        userSequence = edited.sequence;
        database.connection.prepare(`
          UPDATE conversation_messages SET active = 0, updated_at = ?
          WHERE conversation_id = ? AND sequence > ? AND active = 1
        `).run(now, input.conversationId, userSequence);
        database.connection.prepare(`
          UPDATE conversation_messages SET content = ?, updated_at = ? WHERE id = ?
        `).run(input.prompt, now, input.editMessageId);
      } else {
        const row = database.connection.prepare(`
          SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
          FROM conversation_messages WHERE conversation_id = ?
        `).get(input.conversationId) as { sequence: number };
        userSequence = row.sequence;
        database.connection.prepare(`
          INSERT INTO conversation_messages(
            id, conversation_id, sequence, role, content, created_at, updated_at
          ) VALUES (?, ?, ?, 'user', ?, ?, ?)
        `).run(input.userMessageId, input.conversationId, userSequence, input.prompt, now, now);
      }
      database.connection.prepare(`
        INSERT INTO conversation_messages(
          id, conversation_id, sequence, role, content, run_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'assistant', '', 'running', ?, ?)
      `).run(input.requestId, input.conversationId, userSequence + 1, now, now);
      const count = database.connection.prepare(`
        SELECT COUNT(*) AS count FROM conversation_messages
        WHERE conversation_id = ? AND role = 'user' AND active = 1
      `).get(input.conversationId) as { count: number };
      database.connection.prepare(`
        UPDATE conversations SET
          title = CASE WHEN ? = 1 AND title = ? THEN ? ELSE title END,
          updated_at = ? WHERE id = ?
      `).run(count.count, DEFAULT_TITLE, deriveTitle(input.prompt), now, input.conversationId);
    });

    const message: AgentConversationMessage = {
      content: '',
      createdAt: now,
      id: input.requestId,
      parts: [],
      role: 'assistant',
    };
    this.activeRequests.set(input.requestId, {
      database,
      message,
      outcome: 'running',
      timer: null,
    });
    return {
      history: this.buildHistory(database, input.conversationId, input.requestId),
      proposalOutcomes: this.buildProposalOutcomes(
        database,
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
      message.parts = appendText(message.parts ?? [], event.delta);
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
    const row = this.getDatabase(session).connection.prepare(`
      SELECT m.proposal_json FROM conversation_messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.proposal_id = ? AND m.active = 1
        AND m.proposal_status = 'pending' AND c.deleted_at IS NULL
    `).get(proposalId) as { proposal_json: string } | undefined;
    return row === undefined ? null : parseStoredProposal(row.proposal_json);
  }

  setProposalStatus(
    session: ProjectSession,
    proposalId: string,
    status: AgentProposalStatus,
  ): void {
    for (const active of this.activeRequests.values()) {
      if (active.database !== this.getDatabase(session)) continue;
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
    const database = this.getDatabase(session);
    const row = database.connection.prepare(`
      SELECT id, parts_json FROM conversation_messages WHERE proposal_id = ?
    `).get(proposalId) as { id: string; parts_json: string | null } | undefined;
    if (row === undefined) return;
    const parts = row.parts_json === null ? [] : parseStoredParts(row.parts_json);
    const nextParts = parts.map((part) =>
      part.type === 'proposal' && part.proposal.proposalId === proposalId
        ? { ...part, status }
        : part,
    );
    database.connection.prepare(`
      UPDATE conversation_messages
      SET parts_json = ?, proposal_status = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(nextParts), status, new Date().toISOString(), row.id);
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
    for (const database of this.databases.values()) database.close();
    this.databases.clear();
  }

  private getDatabase(session: ProjectSession): ProjectDatabase {
    let database = this.databases.get(session.directoryPath);
    if (database === undefined) {
      database = new ProjectDatabase(session.directoryPath);
      database.connection.prepare(`
        UPDATE conversation_messages
        SET terminal = 'interrupted', run_status = 'interrupted', updated_at = ?
        WHERE role = 'assistant' AND run_status = 'running'
      `).run(new Date().toISOString());
      this.databases.set(session.directoryPath, database);
    }
    return database;
  }

  private ensureActiveConversation(database: ProjectDatabase): string {
    const active = database.connection.prepare(`
      SELECT c.id FROM conversation_state s
      JOIN conversations c ON c.id = s.active_conversation_id
      WHERE s.singleton = 1 AND c.deleted_at IS NULL
    `).get() as { id: string } | undefined;
    if (active !== undefined) return active.id;
    const latest = database.connection.prepare(`
      SELECT id FROM conversations WHERE deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 1
    `).get() as { id: string } | undefined;
    if (latest !== undefined) return latest.id;
    const now = new Date().toISOString();
    const id = randomUUID();
    database.connection.prepare(`
      INSERT INTO conversations(id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, DEFAULT_TITLE, now, now);
    database.connection.prepare(`
      UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
    `).run(id);
    return id;
  }

  private assertConversation(database: ProjectDatabase, id: string): void {
    const row = database.connection.prepare(`
      SELECT 1 AS found FROM conversations WHERE id = ? AND deleted_at IS NULL
    `).get(id);
    if (row === undefined) throw new Error('Unknown conversation');
  }

  private readState(database: ProjectDatabase, id: string): AgentConversationState {
    this.assertConversation(database, id);
    const conversations = database.connection.prepare(`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?
    `).all(MAX_CONVERSATIONS + 1) as unknown as ConversationRow[];
    if (conversations.length > MAX_CONVERSATIONS) {
      throw new Error('Project contains too many Agent conversations');
    }
    const active = conversations.find((conversation) => conversation.id === id)!;
    const rows = database.connection.prepare(`
      SELECT id, role, content, parts_json, terminal, created_at
      FROM conversation_messages
      WHERE conversation_id = ? AND active = 1 ORDER BY sequence LIMIT ?
    `).all(id, MAX_MESSAGES_PER_CONVERSATION + 1) as unknown as MessageRow[];
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
    database: ProjectDatabase,
    conversationId: string,
    requestId: string,
  ): AgentHistoryMessage[] {
    const rows = database.connection.prepare(`
      SELECT role, content FROM conversation_messages
      WHERE conversation_id = ? AND active = 1
        AND sequence < (
          SELECT sequence - 1 FROM conversation_messages WHERE id = ?
        )
        AND (role = 'user' OR run_status = 'completed')
      ORDER BY sequence DESC
    `).all(conversationId, requestId) as unknown as AgentHistoryMessage[];
    const selected: AgentHistoryMessage[] = [];
    let characters = 0;
    for (const row of rows) {
      if (row.content.length === 0) continue;
      const historyRow = {
        ...row,
        content: expireRequestScopedReferences(row.content),
      };
      if (
        selected.length > 0 &&
        characters + historyRow.content.length > MAX_CONTEXT_CHARACTERS
      ) break;
      selected.push(historyRow);
      characters += historyRow.content.length;
      if (selected.length >= MAX_CONTEXT_MESSAGES) break;
    }
    return selected.reverse();
  }

  private buildProposalOutcomes(
    database: ProjectDatabase,
    conversationId: string,
    requestId: string,
  ): AgentProposalOutcome[] {
    const rows = database.connection.prepare(`
      SELECT parts_json FROM conversation_messages
      WHERE conversation_id = ? AND active = 1 AND parts_json IS NOT NULL
        AND sequence < (
          SELECT sequence - 1 FROM conversation_messages WHERE id = ?
        )
      ORDER BY sequence DESC LIMIT 50
    `).all(conversationId, requestId) as Array<{
      parts_json: string;
    }>;
    return rows
      .reverse()
      .flatMap<AgentProposalOutcome>((row) =>
        parseStoredParts(row.parts_json)
          .filter(
            (part): part is Extract<
              AgentConversationPart,
              { type: 'proposal' }
            > =>
              part.type === 'proposal' &&
              part.status !== 'pending' &&
              part.status !== 'applying',
          )
          .map((part) => ({
            operation:
              'operation' in part.proposal ? part.proposal.operation : 'edit',
            proposalId: part.proposal.proposalId,
            status: toProposalOutcomeStatus(part.status),
          })),
      )
      .slice(-50);
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
    active.database.connection.prepare(`
      UPDATE conversation_messages SET content = ?, parts_json = ?, terminal = ?,
        proposal_id = ?, proposal_json = ?, proposal_status = ?, run_status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      message.content,
      message.parts === undefined ? null : JSON.stringify(message.parts),
      message.terminal ?? null,
      proposalPart?.proposal.proposalId ?? null,
      proposalPart === undefined ? null : JSON.stringify(proposalPart.proposal),
      proposalPart?.status ?? null,
      active.outcome,
      new Date().toISOString(),
      message.id,
    );
  }
}

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

const appendText = (
  parts: AgentConversationPart[],
  delta: string,
): AgentConversationPart[] => {
  const last = parts.at(-1);
  return last?.type === 'text'
    ? [...parts.slice(0, -1), { ...last, content: last.content + delta }]
    : [...parts, { content: delta, type: 'text' }];
};

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
      !isAgentToolAuditName(tool.toolName)
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
            (typeof proposal.icon === 'string' &&
              PROJECT_ICON_IDS.includes(proposal.icon as (typeof PROJECT_ICON_IDS)[number]))) &&
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
