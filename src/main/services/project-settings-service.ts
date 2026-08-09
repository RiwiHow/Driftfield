import {
  AGENT_THINKING_LEVELS,
  DEFAULT_PROJECT_AGENT_SETTINGS,
  type ProjectAgentSettings,
  type UpdateProjectAgentSettingsRequest,
} from '../../shared/contracts/settings';
import { SettingsDatabase } from '../database/settings-database';
import type { ProjectSession } from './project-session-service';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 255;

export const parseProjectAgentSettingsUpdate = (
  value: unknown,
): UpdateProjectAgentSettingsRequest => {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => key !== 'defaultModel' && key !== 'thinkingLevel',
    ) ||
    !('defaultModel' in value) ||
    !('thinkingLevel' in value) ||
    typeof value.thinkingLevel !== 'string' ||
    !AGENT_THINKING_LEVELS.includes(
      value.thinkingLevel as ProjectAgentSettings['thinkingLevel'],
    )
  ) {
    throw new Error('Invalid project Agent settings');
  }
  const selection = value.defaultModel;
  if (
    selection !== null &&
    (!isRecord(selection) ||
      Object.keys(selection).some(
        (key) => key !== 'modelId' && key !== 'providerId',
      ) ||
      !isIdentifier(selection.modelId) ||
      !isIdentifier(selection.providerId))
  ) {
    throw new Error('Invalid project Agent model');
  }
  return {
    defaultModel:
      selection === null
        ? null
        : { modelId: selection.modelId as string, providerId: selection.providerId as string },
    thinkingLevel: value.thinkingLevel as ProjectAgentSettings['thinkingLevel'],
  };
};

export class ProjectSettingsService {
  private readonly databases = new Map<string, SettingsDatabase>();

  get(session: ProjectSession): ProjectAgentSettings {
    const row = this.getDatabase(session).connection.prepare(`
      SELECT provider_id, model_id, thinking_level
      FROM agent_settings WHERE singleton = 1
    `).get() as {
      model_id: string | null;
      provider_id: string | null;
      thinking_level: ProjectAgentSettings['thinkingLevel'];
    };
    return {
      defaultModel:
        row.provider_id === null || row.model_id === null
          ? null
          : { modelId: row.model_id, providerId: row.provider_id },
      thinkingLevel: row.thinking_level,
    };
  }

  update(
    session: ProjectSession,
    settings: UpdateProjectAgentSettingsRequest,
  ): ProjectAgentSettings {
    this.getDatabase(session).connection.prepare(`
      UPDATE agent_settings
      SET provider_id = ?, model_id = ?, thinking_level = ?
      WHERE singleton = 1
    `).run(
      settings.defaultModel?.providerId ?? null,
      settings.defaultModel?.modelId ?? null,
      settings.thinkingLevel,
    );
    return this.get(session);
  }

  reset(session: ProjectSession): ProjectAgentSettings {
    return this.update(session, DEFAULT_PROJECT_AGENT_SETTINGS);
  }

  dispose(): void {
    for (const database of this.databases.values()) database.close();
    this.databases.clear();
  }

  private getDatabase(session: ProjectSession): SettingsDatabase {
    let database = this.databases.get(session.directoryPath);
    if (database === undefined) {
      database = new SettingsDatabase(session.directoryPath);
      this.databases.set(session.directoryPath, database);
    }
    return database;
  }
}
