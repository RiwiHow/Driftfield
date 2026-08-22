import type {
  ProjectAgentSettings,
  UpdateProjectAgentSettingsRequest,
} from '../../shared/contracts/settings';
import type { ProjectDatabase } from './project-database';

export class ProjectSettingsRepository {
  constructor(private readonly database: ProjectDatabase) {}

  get(): ProjectAgentSettings {
    const row = this.database.connection.prepare(`
      SELECT provider_id, model_id, thinking_level, use_global
      FROM agent_settings WHERE singleton = 1
    `).get() as {
      model_id: string | null;
      provider_id: string | null;
      thinking_level: ProjectAgentSettings['thinkingLevel'];
      use_global: number;
    };
    return {
      defaultModel: row.provider_id === null || row.model_id === null
        ? null
        : { modelId: row.model_id, providerId: row.provider_id },
      thinkingLevel: row.thinking_level,
      useGlobal: row.use_global === 1,
    };
  }

  update(settings: UpdateProjectAgentSettingsRequest): ProjectAgentSettings {
    const result = this.database.connection.prepare(`
      UPDATE agent_settings
      SET provider_id = ?, model_id = ?, thinking_level = ?, use_global = ?
      WHERE singleton = 1
    `).run(
      settings.defaultModel?.providerId ?? null,
      settings.defaultModel?.modelId ?? null,
      settings.thinkingLevel,
      settings.useGlobal ? 1 : 0,
    );
    if (result.changes !== 1) throw new Error('Project Agent settings are missing');
    return this.get();
  }
}
