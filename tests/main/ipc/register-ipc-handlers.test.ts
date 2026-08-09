import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  getPath: vi.fn(() => '/documents'),
  handle: vi.fn(),
  showMessageBox: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getPath: electronMock.getPath },
  dialog: {
    showMessageBox: electronMock.showMessageBox,
    showOpenDialog: electronMock.showOpenDialog,
  },
  ipcMain: { handle: electronMock.handle },
}));

import { registerIpcHandlers } from '../../../src/main/ipc/register-ipc-handlers';
import type { IpcHandlerContext } from '../../../src/main/ipc/ipc-handler-context';
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc-channels';

type Handler = (event: unknown, value?: unknown) => unknown;

const invocationChannels = [
  IPC_CHANNELS.cancelAgent,
  IPC_CHANNELS.startAgentPrompt,
  IPC_CHANNELS.getAgentConfiguration,
  IPC_CHANNELS.removeAgentCredential,
  IPC_CHANNELS.setAgentApiKey,
  IPC_CHANNELS.createProjectDirectory,
  IPC_CHANNELS.selectProjectDirectory,
  IPC_CHANNELS.refreshProject,
  IPC_CHANNELS.copyEditorSelection,
  IPC_CHANNELS.cutEditorSelection,
  IPC_CHANNELS.pasteIntoEditor,
  IPC_CHANNELS.selectAllEditorText,
  IPC_CHANNELS.saveProjectDocument,
  IPC_CHANNELS.confirmCloseUnsavedDocument,
  IPC_CHANNELS.getAppSettings,
  IPC_CHANNELS.updateAppSettings,
  IPC_CHANNELS.setWindowDirty,
  IPC_CHANNELS.completeWindowClose,
].sort();

describe('IPC handler composition', () => {
  const handlers = new Map<string, Handler>();

  beforeEach(() => {
    handlers.clear();
    electronMock.handle.mockReset();
    electronMock.handle.mockImplementation((channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    });
  });

  it('registers every renderer invocation exactly once', () => {
    registerIpcHandlers(createContext());

    expect([...handlers.keys()].sort()).toEqual(invocationChannels);
    expect(electronMock.handle).toHaveBeenCalledTimes(invocationChannels.length);
  });

  it('keeps project revision validation in the Agent handler', async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const start = handlers.get(IPC_CHANNELS.startAgentPrompt);
    if (start === undefined) throw new Error('Agent start handler was not registered');
    const request = {
      currentDocumentId: 'chapter-1',
      draftSnapshot: {
        baseRevision: 'b'.repeat(64),
        documentId: 'chapter-1',
        markdown: '# Draft',
      },
      prompt: 'Review this',
      requestId: 'request-1',
    };

    await expect(start({}, request)).rejects.toThrow('Stale Agent document snapshot');

    request.draftSnapshot.baseRevision = 'a'.repeat(64);
    await expect(start({}, request)).resolves.toEqual({
      requestId: 'request-1',
      status: 'started',
    });
  });
});

const createContext = (): IpcHandlerContext => {
  const webContents = {
    copy: vi.fn(),
    cut: vi.fn(),
    id: 7,
    isDestroyed: vi.fn(() => false),
    paste: vi.fn(),
    selectAll: vi.fn(),
    send: vi.fn(),
  };
  const window = {
    isDestroyed: vi.fn(() => false),
    webContents,
  };
  return {
    agentCredentialService: {
      getProviderStatuses: vi.fn(async () => [
        { configured: true, providerId: 'anthropic' },
      ]),
    },
    aiAgentService: {
      start: vi.fn(async () => 'request-1'),
    },
    completeWindowClose: vi.fn(),
    getTrustedSenderWindow: vi.fn(() => window),
    projectSessions: {
      get: vi.fn(() => ({
        id: 'session-1',
        project: {
          documents: [{ id: 'chapter-1', revision: 'a'.repeat(64) }],
        },
      })),
    },
    setWindowDirty: vi.fn(),
    settingsService: {
      get: vi.fn(() => ({
        agent: {
          defaultModel: { modelId: 'model-1', providerId: 'anthropic' },
          thinkingLevel: 'medium',
        },
      })),
    },
  } as unknown as IpcHandlerContext;
};
