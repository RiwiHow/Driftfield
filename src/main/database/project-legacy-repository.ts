import type { ProjectDatabase } from './project-database';

export interface LegacyProjectSettingsImport {
  modelId: string | null;
  overrides: Array<{
    modelId: string;
    overrideJson: string;
    providerId: string;
    updatedAt: string;
  }>;
  providerId: string | null;
  thinkingLevel: string;
  useGlobal: number;
}

export interface LegacyConversationImport {
  activeConversationId: string | null;
  conversations: Array<{
    created_at: string; deleted_at: string | null; id: string; title: string; updated_at: string;
  }>;
  messages: Array<{
    active: number; content: string; conversation_id: string; created_at: string;
    id: string; parts_json: string | null; proposal_id: string | null;
    proposal_json: string | null; proposal_status: string | null; role: string;
    run_status: string | null; sequence: number; terminal: string | null; updated_at: string;
  }>;
}

export class ProjectLegacyRepository {
  constructor(private readonly database: ProjectDatabase) {}

  importSettings(settings: LegacyProjectSettingsImport): void {
    this.database.connection.prepare(`
      UPDATE agent_settings
      SET provider_id = ?, model_id = ?, thinking_level = ?, use_global = ?
      WHERE singleton = 1
    `).run(settings.providerId, settings.modelId, settings.thinkingLevel, settings.useGlobal);
    const insert = this.database.connection.prepare(`
      INSERT OR REPLACE INTO legacy_agent_model_overrides(
        provider_id, model_id, override_json, updated_at
      ) VALUES (?, ?, ?, ?)
    `);
    for (const override of settings.overrides) {
      insert.run(override.providerId, override.modelId, override.overrideJson, override.updatedAt);
    }
  }

  importConversations(data: LegacyConversationImport): void {
    const insertConversation = this.database.connection.prepare(`
      INSERT INTO conversations(id, title, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of data.conversations) {
      insertConversation.run(row.id, row.title, row.created_at, row.updated_at, row.deleted_at);
    }
    const insertMessage = this.database.connection.prepare(`
      INSERT INTO conversation_messages(
        id, conversation_id, sequence, role, content, parts_json, terminal,
        proposal_id, proposal_json, proposal_status, run_status, active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of data.messages) {
      insertMessage.run(
        row.id, row.conversation_id, row.sequence, row.role, row.content,
        row.parts_json, row.terminal, row.proposal_id, row.proposal_json,
        row.proposal_status, row.run_status, row.active, row.created_at, row.updated_at,
      );
    }
    this.database.connection.prepare(`
      UPDATE conversation_state SET active_conversation_id = ? WHERE singleton = 1
    `).run(data.activeConversationId);
  }

  readModelOverrideJson(): string[] {
    return (this.database.connection.prepare(`
      SELECT override_json FROM legacy_agent_model_overrides
      ORDER BY provider_id, model_id
    `).all() as unknown as Array<{ override_json: string }>)
      .map(({ override_json: overrideJson }) => overrideJson);
  }

  clearModelOverrides(): void {
    this.database.connection.exec('DELETE FROM legacy_agent_model_overrides');
  }
}
