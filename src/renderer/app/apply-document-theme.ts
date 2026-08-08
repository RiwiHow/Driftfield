import type { AppTheme } from '../../shared/contracts/settings';

export const applyDocumentTheme = (theme: AppTheme): void => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme !== 'github-light');
};
