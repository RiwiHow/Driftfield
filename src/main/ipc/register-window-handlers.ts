import { dialog, ipcMain } from 'electron';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import type { CompleteWindowCloseRequest } from '../../shared/contracts/window-lifecycle';
import { createCloseUnsavedDialogOptions } from '../i18n/native-dialog-options';
import type { IpcHandlerContext } from './ipc-handler-context';

export const registerWindowIpcHandlers = ({
  completeWindowClose,
  getTrustedSenderWindow,
  setWindowDirty,
  settingsService,
}: IpcHandlerContext): void => {
  ipcMain.handle(IPC_CHANNELS.setWindowDirty, (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (typeof value !== 'boolean') throw new Error('Invalid dirty state');
    setWindowDirty(window, value);
  });

  ipcMain.handle(IPC_CHANNELS.completeWindowClose, (event, value: unknown) => {
    const window = getTrustedSenderWindow(event);
    if (!isCompleteWindowCloseRequest(value)) {
      throw new Error('Invalid close completion');
    }
    completeWindowClose(window, value);
  });

  ipcMain.handle(
    IPC_CHANNELS.confirmCloseUnsavedDocument,
    async (event, documentTitle: unknown) => {
      const window = getTrustedSenderWindow(event);
      if (
        typeof documentTitle !== 'string' ||
        documentTitle.length === 0 ||
        documentTitle.length > 255
      ) {
        throw new Error('Invalid document title');
      }
      const { language } = settingsService.get();
      const result = await dialog.showMessageBox(
        window,
        createCloseUnsavedDialogOptions(language, documentTitle),
      );
      return ['cancel', 'discard', 'save'][result.response] ?? 'cancel';
    },
  );

  ipcMain.handle(IPC_CHANNELS.copyEditorSelection, (event) => {
    getTrustedSenderWindow(event).webContents.copy();
  });

  ipcMain.handle(IPC_CHANNELS.cutEditorSelection, (event) => {
    getTrustedSenderWindow(event).webContents.cut();
  });

  ipcMain.handle(IPC_CHANNELS.pasteIntoEditor, (event) => {
    getTrustedSenderWindow(event).webContents.paste();
  });

  ipcMain.handle(IPC_CHANNELS.selectAllEditorText, (event) => {
    getTrustedSenderWindow(event).webContents.selectAll();
  });
};

const isCompleteWindowCloseRequest = (
  value: unknown,
): value is CompleteWindowCloseRequest =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Partial<CompleteWindowCloseRequest>).requestId === 'string' &&
  typeof (value as Partial<CompleteWindowCloseRequest>).proceed === 'boolean';
