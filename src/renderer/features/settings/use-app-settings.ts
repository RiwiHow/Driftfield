import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type AppSettings,
  type UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';
import { changeRendererLanguage } from '../../i18n';
import { applyDocumentTheme } from '../../app/apply-document-theme';
import { resolveAppTheme } from '../../../shared/theme-contract';

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
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme = useMemo(
    () => resolveAppTheme(settings.theme, prefersDark),
    [prefersDark, settings.theme],
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event: MediaQueryListEvent): void => {
      setPrefersDark(event.matches);
    };
    mediaQuery.addEventListener('change', updateSystemTheme);
    setPrefersDark(mediaQuery.matches);
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    applyDocumentTheme(resolvedTheme);
  }, [resolvedTheme]);

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
    resolvedTheme,
    settings,
    replaceSettings: setSettings,
    settingsError:
      settingsErrorCode === null
        ? null
        : t(`settings.${settingsErrorCode}`),
    updateSettings,
  };
};
