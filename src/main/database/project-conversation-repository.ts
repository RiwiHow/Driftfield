import type { AgentConversationMessage, AgentProposalStatus } from '../../shared/contracts/agent-conversations';
import type { ProjectDatabase } from './project-database';

export interface ConversationRecord {
  created_at: string;
  id: string;
  title: string;
  updated_at: string;
}

export interface ConversationMessageRecord {
  content: string;
  created_at: string;
  id: string;
  parts_json: string | null;
  role: 'assistant' | 'user';
  terminal: AgentConversationMessage['terminal'] | null;
}

export class ProjectConversationRepository {
  constructor(private readonly database: ProjectDatabase) {}

  interruptRunning(): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages
      SET terminal = 'interrupted', run_status = 'interrupted', updated_at = ?
      WHERE role = 'assistant' AND run_status = 'running'
    `).run(new Date().toISOString());
  }

  findActiveId(): string | null {
    const row = this.database.connection.prepare(`
      SELECT c.id FROM conversation_state s
      JOIN conversations c ON c.id = s.active_conversation_id
      WHERE s.singleton = 1 AND c.deleted_at IS NULL
    `).get() as { id: string } | undefined;
    return row?.id ?? null;
  }

  findLatestId(): string | null {
    const row = this.database.connection.prepare(`
      SELECT id FROM conversations WHERE deleted_at IS NULL
      ORDER BY updated_at DESC LIMIT 1
    `).get() as { id: string } | undefined;
    return row?.id ?? null;
  }

  countConversations(): number {
    const row = this.database.connection.prepare(`
      SELECT COUNT(*) AS count FROM conversations WHERE deleted_at IS NULL
    `).get() as { count: number };
    return row.count;
  }

  create(id: string, title: string, now: string): void {
    this.database.connection.prepare(`
      INSERT INTO conversations(id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, now, now);
  }

  setActive(id: string): void {
    this.database.connection.prepare(`
      UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
    `).run(id);
  }

  exists(id: string): boolean {
    return this.database.connection.prepare(`
      SELECT 1 AS found FROM conversations WHERE id = ? AND deleted_at IS NULL
    `).get(id) !== undefined;
  }

  rename(id: string, title: string): boolean {
    return this.database.connection.prepare(`
      UPDATE conversations SET title = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(title, new Date().toISOString(), id).changes === 1;
  }

  softDelete(id: string, now: string): boolean {
    return this.database.connection.prepare(`
      UPDATE conversations SET deleted_at = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(now, now, id).changes === 1;
  }

  list(limit: number): ConversationRecord[] {
    return this.database.connection.prepare(`
      SELECT id, title, created_at, updated_at FROM conversations
      WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?
    `).all(limit) as unknown as ConversationRecord[];
  }

  listMessages(conversationId: string, limit: number): ConversationMessageRecord[] {
    return this.database.connection.prepare(`
      SELECT id, role, content, parts_json, terminal, created_at
      FROM conversation_messages
      WHERE conversation_id = ? AND active = 1 ORDER BY sequence LIMIT ?
    `).all(conversationId, limit) as unknown as ConversationMessageRecord[];
  }

  history(conversationId: string, beforeRequestId?: string): Array<{ content: string; role: 'assistant' | 'user' }> {
    const before = beforeRequestId === undefined ? '' : `
      AND sequence < (SELECT sequence - 1 FROM conversation_messages WHERE id = ?)`;
    const statement = this.database.connection.prepare(`
      SELECT role, content FROM conversation_messages
      WHERE conversation_id = ? AND active = 1 ${before}
        AND (role = 'user' OR run_status = 'completed')
      ORDER BY sequence DESC
    `);
    return (beforeRequestId === undefined
      ? statement.all(conversationId)
      : statement.all(conversationId, beforeRequestId)) as unknown as Array<{
        content: string;
        role: 'assistant' | 'user';
      }>;
  }

  proposalOutcomeRows(conversationId: string, beforeRequestId?: string): Array<{ parts_json: string }> {
    const before = beforeRequestId === undefined ? '' : `
      AND sequence < (SELECT sequence - 1 FROM conversation_messages WHERE id = ?)`;
    const statement = this.database.connection.prepare(`
      SELECT parts_json FROM conversation_messages
      WHERE conversation_id = ? AND active = 1 AND parts_json IS NOT NULL ${before}
      ORDER BY sequence DESC LIMIT 50
    `);
    return (beforeRequestId === undefined
      ? statement.all(conversationId)
      : statement.all(conversationId, beforeRequestId)) as unknown as Array<{ parts_json: string }>;
  }

  activeMessageCount(conversationId: string): number {
    return (this.database.connection.prepare(`
      SELECT COUNT(*) AS count FROM conversation_messages
      WHERE conversation_id = ? AND active = 1
    `).get(conversationId) as { count: number }).count;
  }

  assistantParts(messageId: string, conversationId: string): string | null | undefined {
    const row = this.database.connection.prepare(`
      SELECT parts_json FROM conversation_messages
      WHERE id = ? AND conversation_id = ? AND role = 'assistant' AND active = 1
    `).get(messageId, conversationId) as { parts_json: string | null } | undefined;
    return row?.parts_json;
  }

  updateAssistant(messageId: string, content: string, partsJson: string): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages
      SET content = ?, parts_json = ?, terminal = NULL, updated_at = ?
      WHERE id = ?
    `).run(content, partsJson, new Date().toISOString(), messageId);
  }

  userSequence(messageId: string, conversationId: string): number | null {
    const row = this.database.connection.prepare(`
      SELECT sequence FROM conversation_messages
      WHERE id = ? AND conversation_id = ? AND role = 'user' AND active = 1
    `).get(messageId, conversationId) as { sequence: number } | undefined;
    return row?.sequence ?? null;
  }

  deactivateAfter(conversationId: string, sequence: number, now: string): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages SET active = 0, updated_at = ?
      WHERE conversation_id = ? AND sequence > ? AND active = 1
    `).run(now, conversationId, sequence);
  }

  updateUser(messageId: string, prompt: string, now: string): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages SET content = ?, updated_at = ? WHERE id = ?
    `).run(prompt, now, messageId);
  }

  nextSequence(conversationId: string): number {
    return (this.database.connection.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM conversation_messages WHERE conversation_id = ?
    `).get(conversationId) as { sequence: number }).sequence;
  }

  insertUser(id: string, conversationId: string, sequence: number, prompt: string, now: string): void {
    this.database.connection.prepare(`
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, created_at, updated_at
      ) VALUES (?, ?, ?, 'user', ?, ?, ?)
    `).run(id, conversationId, sequence, prompt, now, now);
  }

  insertAssistant(id: string, conversationId: string, sequence: number, now: string): void {
    this.database.connection.prepare(`
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, run_status, created_at, updated_at
      ) VALUES (?, ?, ?, 'assistant', '', 'running', ?, ?)
    `).run(id, conversationId, sequence, now, now);
  }

  userCount(conversationId: string): number {
    return (this.database.connection.prepare(`
      SELECT COUNT(*) AS count FROM conversation_messages
      WHERE conversation_id = ? AND role = 'user' AND active = 1
    `).get(conversationId) as { count: number }).count;
  }

  updateTitleAfterPrompt(conversationId: string, count: number, defaultTitle: string, title: string, now: string): void {
    this.database.connection.prepare(`
      UPDATE conversations SET
        title = CASE WHEN ? = 1 AND title = ? THEN ? ELSE title END,
        updated_at = ? WHERE id = ?
    `).run(count, defaultTitle, title, now, conversationId);
  }

  pendingProposalJson(proposalId: string): string | null {
    const row = this.database.connection.prepare(`
      SELECT m.proposal_json FROM conversation_messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.proposal_id = ? AND m.active = 1
        AND m.proposal_status = 'pending' AND c.deleted_at IS NULL
    `).get(proposalId) as { proposal_json: string } | undefined;
    return row?.proposal_json ?? null;
  }

  proposalMessage(proposalId: string): { id: string; partsJson: string | null } | null {
    const row = this.database.connection.prepare(`
      SELECT id, parts_json FROM conversation_messages WHERE proposal_id = ?
    `).get(proposalId) as { id: string; parts_json: string | null } | undefined;
    return row === undefined ? null : { id: row.id, partsJson: row.parts_json };
  }

  updateProposalMessage(id: string, partsJson: string, status: AgentProposalStatus): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages
      SET parts_json = ?, proposal_status = ?, updated_at = ? WHERE id = ?
    `).run(partsJson, status, new Date().toISOString(), id);
  }

  persistAssistant(input: {
    content: string;
    id: string;
    outcome: string;
    partsJson: string | null;
    proposalId: string | null;
    proposalJson: string | null;
    proposalStatus: AgentProposalStatus | null;
    terminal: NonNullable<AgentConversationMessage['terminal']> | null;
  }): void {
    this.database.connection.prepare(`
      UPDATE conversation_messages SET content = ?, parts_json = ?, terminal = ?,
        proposal_id = ?, proposal_json = ?, proposal_status = ?, run_status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.content, input.partsJson, input.terminal, input.proposalId,
      input.proposalJson, input.proposalStatus, input.outcome,
      new Date().toISOString(), input.id,
    );
  }
}
