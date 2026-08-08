import type { MessageBoxOptions, OpenDialogOptions } from 'electron';

import type { AppLanguage } from '../../shared/i18n/languages';
import { translateMain } from './main-i18n';

export const createCloseUnsavedDialogOptions = (
  language: AppLanguage,
  documentTitle: string,
): MessageBoxOptions => ({
  buttons: [
    translateMain(language, 'closeUnsaved.buttons.cancel'),
    translateMain(language, 'closeUnsaved.buttons.discard'),
    translateMain(language, 'closeUnsaved.buttons.save'),
  ],
  cancelId: 0,
  defaultId: 2,
  detail: translateMain(language, 'closeUnsaved.detail'),
  message: translateMain(language, 'closeUnsaved.message', {
    title: documentTitle,
  }),
  noLink: true,
  title: translateMain(language, 'closeUnsaved.title'),
  type: 'warning',
});

export const createOpenProjectDialogOptions = (
  language: AppLanguage,
  defaultPath: string,
): OpenDialogOptions => ({
  buttonLabel: translateMain(language, 'openProject.button'),
  defaultPath,
  message: translateMain(language, 'openProject.message'),
  properties: ['openDirectory'],
  title: translateMain(language, 'openProject.title'),
});
