import type {
  AppTheme,
  AppThemePreference,
} from '../../shared/contracts/settings';
import {
  isDarkAppTheme,
  resolveAppTheme,
} from '../../shared/theme-contract';

export const applyDocumentTheme = (
  preference: AppThemePreference,
  prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches,
): AppTheme => {
  const theme = resolveAppTheme(preference, prefersDark);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', isDarkAppTheme(theme));
  return theme;
};
