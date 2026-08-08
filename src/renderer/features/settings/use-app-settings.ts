import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type AppSettings,
  type UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';
import { changeRendererLanguage } from '../../i18n';
import { applyDocumentTheme } from '../../app/apply-document-theme';

type SettingsErrorCode = 'load' | 'save';

export const useAppSettings = (
  initialSettings: AppSettings,
  settingsLoadFailed: boolean,
) => {
  const { t } = useTranslation('errors');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsErrorCode, setSettingsErrorCode] =
    useState<SettingsErrorCode | null>(settingsLoadFailed ? 'load' : null);

  useEffect(() => {
    applyDocumentTheme(settings.theme);
  }, [settings.theme]);

  const updateSettings = useCallback(
    async (update: UpdateAppSettingsRequest): Promise<void> => {
      if (isSavingSettings) return;
      setIsSavingSettings(true);
      setSettingsErrorCode(null);
      try {
        const storedSettings = await window.driftfield.updateAppSettings(update);
        if (storedSettings.language !== settings.language) {
          await changeRendererLanguage(storedSettings.language);
        }
        setSettings(storedSettings);
      } catch {
        setSettingsErrorCode('save');
      } finally {
        setIsSavingSettings(false);
      }
    },
    [isSavingSettings, settings.language],
  );

  return {
    isSavingSettings,
    settings,
    settingsError:
      settingsErrorCode === null
        ? null
        : t(`settings.${settingsErrorCode}`),
    updateSettings,
  };
};
