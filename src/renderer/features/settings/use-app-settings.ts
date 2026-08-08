import { useCallback, useEffect, useState } from 'react';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';

export const useAppSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void window.driftfield.getAppSettings().then(
      (storedSettings) => isCurrent && setSettings(storedSettings),
      () =>
        isCurrent &&
        setSettingsError('无法读取应用设置，当前使用默认值。'),
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const updateSettings = useCallback(
    async (update: UpdateAppSettingsRequest): Promise<void> => {
      if (isSavingSettings) return;
      setIsSavingSettings(true);
      setSettingsError(null);
      try {
        setSettings(await window.driftfield.updateAppSettings(update));
      } catch {
        setSettingsError('设置保存失败，请重试。');
      } finally {
        setIsSavingSettings(false);
      }
    },
    [isSavingSettings],
  );

  return {
    isSavingSettings,
    settings,
    settingsError,
    updateSettings,
  };
};
