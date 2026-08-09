import { app, dialog, ipcMain } from 'electron';
import { realpath, stat } from 'node:fs/promises';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import type {
  SaveProjectDocumentRequest,
  SelectProjectDirectoryResult,
} from '../../shared/contracts/project';
import {
  createNewProjectDialogOptions,
  createOpenProjectDialogOptions,
} from '../i18n/native-dialog-options';
import {
  initializeProjectLayout,
  openProjectLayout,
} from '../services/project-layout-service';
import {
  MAX_PROJECT_BYTES,
  createProjectSnapshot,
  saveProjectDocument,
} from '../services/project-service';
import type { IpcHandlerContext } from './ipc-handler-context';

export const registerProjectIpcHandlers = ({
  aiAgentService,
  getTrustedSenderWindow,
  projectSessions,
  settingsService,
}: IpcHandlerContext): void => {
  ipcMain.handle(
    IPC_CHANNELS.createProjectDirectory,
    async (event): Promise<SelectProjectDirectoryResult> => {
      const window = getTrustedSenderWindow(event);
      const { language } = settingsService.get();
      const result = await dialog.showOpenDialog(
        window,
        createNewProjectDialogOptions(language, app.getPath('documents')),
      );
      const selectedPath = result.filePaths[0];
      if (result.canceled || selectedPath === undefined) return null;
      const directoryPath = await resolveSelectedDirectory(selectedPath);
      const layout = await initializeProjectLayout(directoryPath);
      const project = await createProjectSnapshot(directoryPath, layout);
      await settingsService.setLastProjectDirectoryPath(directoryPath);
      aiAgentService.disposeOwner(window.webContents.id);
      projectSessions.watch(window, directoryPath, project);
      return project;
    },
  );

  ipcMain.handle(IPC_CHANNELS.refreshProject, async (event) => {
    const window = getTrustedSenderWindow(event);
    return projectSessions.refresh(window.webContents.id);
  });

  ipcMain.handle(IPC_CHANNELS.restoreLastProject, async (event) => {
    const window = getTrustedSenderWindow(event);
    const { lastProjectDirectoryPath } = settingsService.get();
    if (lastProjectDirectoryPath === null) return null;

    try {
      const directoryPath = await resolveSelectedDirectory(
        lastProjectDirectoryPath,
      );
      const layout = await openProjectLayout(directoryPath);
      const project = await createProjectSnapshot(directoryPath, layout);
      aiAgentService.disposeOwner(window.webContents.id);
      projectSessions.watch(window, directoryPath, project);
      return project;
    } catch (error) {
      console.error('Unable to restore the last project directory', error);
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.saveProjectDocument,
    async (event, value: unknown) => {
      const window = getTrustedSenderWindow(event);
      const session = projectSessions.get(window.webContents.id);
      if (session === undefined || !isRecord(value)) {
        throw new Error('Invalid project document save request');
      }
      const request = value as Partial<SaveProjectDocumentRequest>;
      const relativeDocumentPath =
        typeof request.documentId === 'string'
          ? session.documentPaths.get(request.documentId)
          : undefined;
      if (
        typeof request.documentId !== 'string' ||
        typeof request.expectedRevision !== 'string' ||
        typeof request.markdown !== 'string' ||
        (request.overwrite !== undefined &&
          typeof request.overwrite !== 'boolean') ||
        relativeDocumentPath === undefined ||
        Buffer.byteLength(request.markdown, 'utf8') > MAX_PROJECT_BYTES
      ) {
        throw new Error('Unknown project document');
      }
      return saveProjectDocument(
        session.directoryPath,
        request as SaveProjectDocumentRequest,
        relativeDocumentPath,
      );
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.selectProjectDirectory,
    async (event): Promise<SelectProjectDirectoryResult> => {
      const window = getTrustedSenderWindow(event);
      const { language } = settingsService.get();
      const result = await dialog.showOpenDialog(
        window,
        createOpenProjectDialogOptions(language, app.getPath('documents')),
      );
      const selectedPath = result.filePaths[0];
      if (result.canceled || selectedPath === undefined) return null;
      const directoryPath = await resolveSelectedDirectory(selectedPath);
      const layout = await openProjectLayout(directoryPath);
      const project = await createProjectSnapshot(directoryPath, layout);
      await settingsService.setLastProjectDirectoryPath(directoryPath);
      aiAgentService.disposeOwner(window.webContents.id);
      projectSessions.watch(window, directoryPath, project);
      return project;
    },
  );
};

const resolveSelectedDirectory = async (selectedPath: string): Promise<string> => {
  const directoryPath = await realpath(selectedPath);
  if (!(await stat(directoryPath)).isDirectory()) {
    throw new Error('Selected project path is not a directory');
  }
  return directoryPath;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
