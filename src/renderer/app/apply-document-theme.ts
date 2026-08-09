import type { AppTheme } from '../../shared/contracts/settings';
import { isDarkAppTheme } from '../../shared/theme-contract';

export const applyDocumentTheme = (theme: AppTheme): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', isDarkAppTheme(theme));
};
