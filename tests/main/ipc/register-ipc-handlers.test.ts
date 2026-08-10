import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  getPath: vi.fn(() => "/documents"),
  handle: vi.fn(),
  showMessageBox: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { getPath: electronMock.getPath },
  dialog: {
    showMessageBox: electronMock.showMessageBox,
    showOpenDialog: electronMock.showOpenDialog,
  },
  ipcMain: { handle: electronMock.handle },
}));

import { registerIpcHandlers } from "../../../src/main/ipc/register-ipc-handlers";
import type { IpcHandlerContext } from "../../../src/main/ipc/ipc-handler-context";
import { IPC_CHANNELS } from "../../../src/shared/contracts/ipc-channels";

type Handler = (event: unknown, value?: unknown) => unknown;

const invocationChannels = [
  IPC_CHANNELS.applyAgentProposal,
  IPC_CHANNELS.cancelAgent,
  IPC_CHANNELS.createAgentConversation,
  IPC_CHANNELS.deleteAgentConversation,
  IPC_CHANNELS.getAgentConversationState,
  IPC_CHANNELS.renameAgentConversation,
  IPC_CHANNELS.selectAgentConversation,
  IPC_CHANNELS.updateAgentConversationMessage,
  IPC_CHANNELS.startAgentPrompt,
  IPC_CHANNELS.getAgentConfiguration,
  IPC_CHANNELS.removeAgentCredential,
  IPC_CHANNELS.resetAgentSettings,
  IPC_CHANNELS.rejectAgentProposal,
  IPC_CHANNELS.setAgentApiKey,
  IPC_CHANNELS.updateAgentModelOverride,
  IPC_CHANNELS.createProjectDirectory,
  IPC_CHANNELS.restoreLastProject,
  IPC_CHANNELS.selectProjectDirectory,
  IPC_CHANNELS.refreshProject,
  IPC_CHANNELS.getProjectStory,
  IPC_CHANNELS.copyEditorSelection,
  IPC_CHANNELS.cutEditorSelection,
  IPC_CHANNELS.pasteIntoEditor,
  IPC_CHANNELS.selectAllEditorText,
  IPC_CHANNELS.saveProjectDocument,
  IPC_CHANNELS.confirmCloseUnsavedDocument,
  IPC_CHANNELS.getAppSettings,
  IPC_CHANNELS.getProjectAgentSettings,
  IPC_CHANNELS.updateAppSettings,
  IPC_CHANNELS.updateProjectAgentSettings,
  IPC_CHANNELS.setWindowDirty,
  IPC_CHANNELS.completeWindowClose,
].sort();

describe("IPC handler composition", () => {
  const handlers = new Map<string, Handler>();

  beforeEach(() => {
    handlers.clear();
    electronMock.handle.mockReset();
    electronMock.handle.mockImplementation(
      (channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      },
    );
  });

  it("registers every renderer invocation exactly once", () => {
    registerIpcHandlers(createContext());

    expect([...handlers.keys()].sort()).toEqual(invocationChannels);
    expect(electronMock.handle).toHaveBeenCalledTimes(
      invocationChannels.length,
    );
  });

  it("keeps project revision validation in the Agent handler", async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const start = handlers.get(IPC_CHANNELS.startAgentPrompt);
    if (start === undefined)
      throw new Error("Agent start handler was not registered");
    const request = {
      conversationId: 'conversation-1',
      currentDocumentId: "chapter-1",
      draftSnapshot: {
        baseRevision: "b".repeat(64),
        documentId: "chapter-1",
        markdown: "# Draft",
      },
      prompt: "Review this",
      requestId: "request-1",
      userMessageId: 'user-1',
    };

    await expect(start({}, request)).rejects.toThrow(
      "Stale Agent document snapshot",
    );

    request.draftSnapshot.baseRevision = "a".repeat(64);
    await expect(start({}, request)).resolves.toEqual({
      requestId: "request-1",
      status: "started",
    });
  });

  it("validates and applies a bounded Agent model override", async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const update = handlers.get(IPC_CHANNELS.updateAgentModelOverride);
    if (update === undefined)
      throw new Error("Agent model override handler was not registered");
    const override = {
      compatibility: {
        maxTokensField: null,
        supportsDeveloperRole: null,
        supportsReasoningEffort: false,
        supportsUsageInStreaming: null,
        thinkingFormat: null,
      },
      headers: [{ name: "X-Client-Title", value: "Driftfield" }],
      modelId: "model-1",
      openRouterRouting: null,
      providerId: "anthropic",
      thinkingLevelMap: { xhigh: null },
    };
    vi.mocked(context.agentModelConfigService.getOverrides).mockResolvedValue([
      override,
    ]);

    await expect(update({}, { override })).resolves.toEqual({ override });
    expect(context.aiAgentService.reloadConfiguration).toHaveBeenCalledOnce();
    expect(context.agentModelConfigService.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' }),
      override,
    );
  });

  it('uses global Agent settings when the project inherits them', async () => {
    const context = createContext();
    vi.mocked(context.projectSettingsService.get).mockReturnValue({
      defaultModel: null,
      thinkingLevel: 'off',
      useGlobal: true,
    });
    registerIpcHandlers(context);
    const start = handlers.get(IPC_CHANNELS.startAgentPrompt);
    if (start === undefined) throw new Error('Agent start handler was not registered');

    await expect(start({}, {
      conversationId: 'conversation-1',
      prompt: 'Continue',
      requestId: 'request-global',
      userMessageId: 'user-global',
    })).resolves.toMatchObject({ status: 'started' });
    expect(context.aiAgentService.start).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'model-1', providerId: 'anthropic' },
        thinkingLevel: 'medium',
      }),
    );
  });

  it('routes one reviewed story set through the bounded batch apply path', async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const apply = handlers.get(IPC_CHANNELS.applyAgentProposal);
    if (apply === undefined) throw new Error('Proposal apply handler was not registered');
    vi.mocked(context.agentProposalService.applyStoryBatch).mockResolvedValue({
      proposalId: 'story-1',
      proposalIds: ['story-1', 'story-2'],
      status: 'story-updated',
      story: { revision: 2 } as never,
    });

    await apply({}, { proposalIds: ['story-1', 'story-2'] });

    expect(context.agentProposalService.applyStoryBatch).toHaveBeenCalledWith(
      7,
      ['story-1', 'story-2'],
    );
  });

  it('resets credentials and the current project model state', async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const reset = handlers.get(IPC_CHANNELS.resetAgentSettings);
    if (reset === undefined) throw new Error('Agent reset handler was not registered');

    await expect(reset({})).resolves.toMatchObject({
      projectSettings: { defaultModel: null, thinkingLevel: 'medium', useGlobal: true },
    });
    expect(context.aiAgentService.reloadConfiguration).toHaveBeenCalledOnce();
    expect(context.agentCredentialService.reset).toHaveBeenCalledOnce();
    expect(context.agentModelConfigService.reset).toHaveBeenCalledOnce();
    expect(context.projectSettingsService.reset).toHaveBeenCalledOnce();
  });

  it('returns story records only for the trusted active project session', async () => {
    const context = createContext();
    registerIpcHandlers(context);
    const getStory = handlers.get(IPC_CHANNELS.getProjectStory);
    if (getStory === undefined) throw new Error('Story handler was not registered');
    vi.mocked(context.projectStoryService.getSnapshot).mockReturnValue({
      beats: [],
      eventLinks: [],
      eventParticipants: [],
      eventSources: [],
      events: [],
      moments: [],
      personae: [],
      questions: [],
      revision: 0,
      threads: [],
      timelines: [],
    });
    await expect(getStory({})).resolves.toMatchObject({ revision: 0 });
    expect(context.getTrustedSenderWindow).toHaveBeenCalled();
    expect(context.projectStoryService.getSnapshot).toHaveBeenCalledOnce();
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
    agentConversationService: {
      abandonRequest: vi.fn(),
      beginPrompt: vi.fn(() => ({ history: [], proposalOutcomes: [] })),
      create: vi.fn(),
      delete: vi.fn(),
      getState: vi.fn(),
      recordEvent: vi.fn(),
      rename: vi.fn(),
      select: vi.fn(),
      updateAssistantMessage: vi.fn(),
    },
    agentCredentialService: {
      getProviderStatuses: vi.fn(async () => [
        { configured: true, providerId: "anthropic" },
      ]),
      reset: vi.fn(async () => undefined),
    },
    agentModelConfigService: {
      getOverrides: vi.fn(async () => []),
      prepareRuntime: vi.fn(async () => '/runtime/models.json'),
      reset: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
    },
    aiAgentService: {
      listModels: vi.fn(async () => [
        {
          api: "anthropic-messages",
          contextWindow: 128_000,
          id: "model-1",
          maxOutputTokens: 16_384,
          name: "Model 1",
          providerId: "anthropic",
          reasoning: true,
          thinkingLevelMap: {},
        },
      ]),
      reloadConfiguration: vi.fn(),
      start: vi.fn(async () => "request-1"),
    },
    agentProposalService: {
      apply: vi.fn(),
      applyStoryBatch: vi.fn(),
      reject: vi.fn(),
    },
    completeWindowClose: vi.fn(),
    getTrustedSenderWindow: vi.fn(() => window),
    projectSessions: {
      get: vi.fn(() => ({
        id: "session-1",
        project: {
          projectId: 'project-1',
          documents: [{ id: "chapter-1", revision: "a".repeat(64) }],
        },
      })),
    },
    projectSettingsService: {
      get: vi.fn(() => ({
        defaultModel: { modelId: 'model-1', providerId: 'anthropic' },
        thinkingLevel: 'medium',
        useGlobal: false,
      })),
      reset: vi.fn(() => ({ defaultModel: null, thinkingLevel: 'medium', useGlobal: true })),
      update: vi.fn((_session, settings) => settings),
    },
    projectStoryService: {
      getSnapshot: vi.fn(),
    },
    setWindowDirty: vi.fn(),
    settingsService: {
      get: vi.fn(() => ({
        agent: {
          defaultModel: { modelId: "model-1", providerId: "anthropic" },
          thinkingLevel: "medium",
        },
      })),
      update: vi.fn(async () => ({
        agent: { defaultModel: null, thinkingLevel: 'medium' },
      })),
    },
  } as unknown as IpcHandlerContext;
};
