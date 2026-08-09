import type { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';

import { IPC_CHANNELS } from '../../shared/contracts/ipc-channels';
import type {
  ProjectSnapshot,
  ProjectWatcherStatus,
} from '../../shared/contracts/project';
import { createProjectSnapshot } from './project-service';

interface ProjectSession {
  directoryPath: string;
  documentPaths: Map<string, string>;
  id: string;
  lastRevision: string;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  restartTimer: ReturnType<typeof setTimeout> | null;
  watcher: FSWatcher | null;
}

export class ProjectSessionService {
  private readonly sessions = new Map<number, ProjectSession>();

  close(webContentsId: number): void {
    const session = this.sessions.get(webContentsId);
    if (session === undefined) return;
    if (session.refreshTimer !== null) clearTimeout(session.refreshTimer);
    if (session.restartTimer !== null) clearTimeout(session.restartTimer);
    session.watcher?.close();
    this.sessions.delete(webContentsId);
  }

  get(webContentsId: number): ProjectSession | undefined {
    return this.sessions.get(webContentsId);
  }

  async refresh(webContentsId: number): Promise<ProjectSnapshot | null> {
    const session = this.sessions.get(webContentsId);
    if (session === undefined) return null;
    const project = await createProjectSnapshot(session.directoryPath);
    session.lastRevision = project.revision;
    this.rememberDocuments(session, project);
    return project;
  }

  watch(
    window: BrowserWindow,
    directoryPath: string,
    project: ProjectSnapshot,
  ): void {
    const webContentsId = window.webContents.id;
    this.close(webContentsId);
    const session: ProjectSession = {
      directoryPath,
      documentPaths: new Map(
        project.documents.map((document) => [document.id, document.relativePath]),
      ),
      id: randomUUID(),
      lastRevision: project.revision,
      refreshTimer: null,
      restartTimer: null,
      watcher: null,
    };
    this.sessions.set(webContentsId, session);
    this.startWatcher(window, session);
  }

  private rememberDocuments(
    session: ProjectSession,
    project: ProjectSnapshot,
  ): void {
    for (const document of project.documents) {
      session.documentPaths.set(document.id, document.relativePath);
    }
  }

  private sendStatus(
    window: BrowserWindow,
    status: ProjectWatcherStatus,
  ): void {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(
        IPC_CHANNELS.projectWatcherStatusChanged,
        status,
      );
    }
  }

  private startWatcher(window: BrowserWindow, session: ProjectSession): void {
    const webContentsId = window.webContents.id;
    const scheduleRestart = (): void => {
      if (session.restartTimer !== null) return;
      session.restartTimer = setTimeout(() => {
        session.restartTimer = null;
        if (this.sessions.get(webContentsId) === session) {
          this.startWatcher(window, session);
        }
      }, 2_000);
    };

    try {
      session.watcher = watch(session.directoryPath, { recursive: true });
      this.sendStatus(window, { status: 'healthy' });
    } catch (error) {
      console.error('Unable to start project directory watcher', error);
      this.sendStatus(window, {
        code: 'start-failed',
        status: 'error',
      });
      scheduleRestart();
      return;
    }

    session.watcher.on('change', () => {
      if (session.refreshTimer !== null) clearTimeout(session.refreshTimer);
      session.refreshTimer = setTimeout(() => {
        session.refreshTimer = null;
        void createProjectSnapshot(session.directoryPath).then(
          (project) => {
            if (
              this.sessions.get(webContentsId) !== session ||
              window.isDestroyed() ||
              window.webContents.isDestroyed() ||
              project.revision === session.lastRevision
            ) {
              return;
            }
            session.lastRevision = project.revision;
            this.rememberDocuments(session, project);
            window.webContents.send(IPC_CHANNELS.projectChanged, project);
          },
          (error: unknown) => {
            console.error('Failed to refresh watched project directory', error);
            this.sendStatus(window, {
              code: 'refresh-failed',
              status: 'error',
            });
          },
        );
      }, 250);
    });

    session.watcher.on('error', (error) => {
      console.error('Project directory watcher failed', error);
      session.watcher?.close();
      session.watcher = null;
      this.sendStatus(window, {
        code: 'stopped',
        status: 'error',
      });
      scheduleRestart();
    });
  }
}
