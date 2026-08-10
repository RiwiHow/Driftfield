import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  DEFAULT_PROJECT_AGENT_SETTINGS,
  resolveProjectAgentSettings,
  type AgentSettings,
  type ProjectAgentSettings,
  type UpdateProjectAgentSettingsRequest,
} from '../../../shared/contracts/settings';

export const useProjectAgentSettings = (
  projectId: string | null,
  globalSettings: AgentSettings,
) => {
  const { t } = useTranslation('errors');
  const [settings, setSettings] = useState<ProjectAgentSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorCode, setErrorCode] = useState<'load' | 'save' | null>(null);

  useEffect(() => {
    let active = true;
    setSettings(null);
    setErrorCode(null);
    if (projectId === null) {
      return () => {
        active = false;
      };
    }
    void window.driftfield.getProjectAgentSettings().then(
      (value) => {
        if (active) setSettings(value);
      },
      () => {
        if (active) setErrorCode('load');
      },
    );
    return () => {
      active = false;
    };
  }, [projectId]);

  const update = useCallback(
    async (value: UpdateProjectAgentSettingsRequest) => {
      if (projectId === null || isSaving) return false;
      setIsSaving(true);
      setErrorCode(null);
      try {
        setSettings(await window.driftfield.updateProjectAgentSettings(value));
        return true;
      } catch {
        setErrorCode('save');
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, projectId],
  );

  return {
    effectiveSettings: resolveProjectAgentSettings(
      settings ?? DEFAULT_PROJECT_AGENT_SETTINGS,
      globalSettings,
    ),
    error:
      errorCode === null ? null : t(`settings.${errorCode}`),
    isSaving,
    settings,
    replaceSettings: setSettings,
    update,
  };
};
