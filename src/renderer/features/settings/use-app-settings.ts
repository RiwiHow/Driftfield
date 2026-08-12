import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  APP_ZOOM_PERCENTS,
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

  useEffect(() => {
    const handleZoomShortcut = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const currentIndex = APP_ZOOM_PERCENTS.indexOf(settings.zoomPercent);
      let zoomPercent: AppSettings['zoomPercent'] | undefined;
      if (event.key === '0') {
        zoomPercent = 100;
      } else if (event.key === '+' || event.key === '=') {
        zoomPercent = APP_ZOOM_PERCENTS[
          Math.min(currentIndex + 1, APP_ZOOM_PERCENTS.length - 1)
        ];
      } else if (event.key === '-') {
        zoomPercent = APP_ZOOM_PERCENTS[Math.max(currentIndex - 1, 0)];
      }

      if (zoomPercent === undefined) return;
      event.preventDefault();
      if (zoomPercent !== settings.zoomPercent) {
        void updateSettings({ zoomPercent });
      }
    };

    window.addEventListener('keydown', handleZoomShortcut);
    return () => window.removeEventListener('keydown', handleZoomShortcut);
  }, [settings.zoomPercent, updateSettings]);

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
