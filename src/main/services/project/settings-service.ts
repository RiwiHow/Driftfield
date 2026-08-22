import {
  AGENT_THINKING_LEVELS,
  DEFAULT_PROJECT_AGENT_SETTINGS,
  type ProjectAgentSettings,
  type UpdateProjectAgentSettingsRequest,
} from '../../../shared/contracts/settings';
import { ProjectStoreRegistry } from '../../database/project-store';
import type { ProjectSession } from './session-service';

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
      (key) => key !== 'defaultModel' && key !== 'thinkingLevel' && key !== 'useGlobal',
    ) ||
    !('defaultModel' in value) ||
    !('thinkingLevel' in value) ||
    typeof value.useGlobal !== 'boolean' ||
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
    useGlobal: value.useGlobal,
  };
};

export class ProjectSettingsService {
  constructor(private readonly stores: ProjectStoreRegistry) {}

  get(session: ProjectSession): ProjectAgentSettings {
    return this.stores.get(session.directoryPath).read(({ settings }) => settings.get());
  }

  update(
    session: ProjectSession,
    settings: UpdateProjectAgentSettingsRequest,
  ): ProjectAgentSettings {
    return this.stores.get(session.directoryPath).write(
      ({ settings: repository }) => repository.update(settings),
    );
  }

  reset(session: ProjectSession): ProjectAgentSettings {
    return this.update(session, DEFAULT_PROJECT_AGENT_SETTINGS);
  }

}
