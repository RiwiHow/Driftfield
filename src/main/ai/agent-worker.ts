import type {
  AgentSession,
  ModelRuntime,
  ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime as PiModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import {
  isAgentWorkerCommand,
  type AgentWorkerCommand,
  type AgentWorkerMessage,
  type AgentWorkerStartCommand,
} from '../../shared/contracts/agent-worker';
import { buildAgentSystemPrompt } from './prompts/prompt-builder';

const TOOL_RESULT_TIMEOUT_MS = 30_000;

interface ActiveRequest {
  cancelled: boolean;
  session: AgentSession | null;
}

interface PendingToolResult {
  reject: (error: Error) => void;
  resolve: (content: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const activeRequests = new Map<string, ActiveRequest>();
const pendingToolResults = new Map<string, PendingToolResult>();
let modelRuntime: ModelRuntime | null = null;
let modelRuntimePaths: { authPath: string; modelsPath: string } | null = null;

const send = (message: AgentWorkerMessage): void => {
  process.parentPort.postMessage(message);
};

process.parentPort.on('message', (event) => {
  const command: unknown = event.data;
  if (!isAgentWorkerCommand(command)) return;
  void handleCommand(command);
});

send({ type: 'ready' });

async function handleCommand(command: AgentWorkerCommand): Promise<void> {
  if (command.type === 'list-models') {
    try {
      const runtime = await getModelRuntime(command.authPath, command.modelsPath);
      const models = await runtime.getAvailable();
      send({
        models: models.map((model) => ({
          contextWindow: model.contextWindow,
          id: model.id,
          maxOutputTokens: model.maxTokens,
          name: model.name,
          providerId: model.provider,
          reasoning: model.reasoning,
        })),
        requestId: command.requestId,
        type: 'models',
      });
    } catch {
      send({
        message: '无法读取可用模型，请检查服务商凭据。',
        requestId: command.requestId,
        type: 'models-error',
      });
    }
    return;
  }
  if (command.type === 'start') {
    await startRequest(command);
    return;
  }
  if (command.type === 'cancel') {
    const active = activeRequests.get(command.requestId);
    if (active !== undefined) {
      active.cancelled = true;
      await active.session?.abort();
    }
    return;
  }
  if (command.type === 'tool-result') {
    const key = toolResultKey(command.requestId, command.toolCallId);
    const pending = pendingToolResults.get(key);
    if (pending !== undefined) {
      clearTimeout(pending.timeout);
      pendingToolResults.delete(key);
      pending.resolve(command.content);
    }
    return;
  }
  for (const active of activeRequests.values()) {
    active.cancelled = true;
    await active.session?.abort();
    active.session?.dispose();
  }
  activeRequests.clear();
  process.exit(0);
}

async function startRequest(command: AgentWorkerStartCommand): Promise<void> {
  if (activeRequests.has(command.requestId)) return;
  const active: ActiveRequest = { cancelled: false, session: null };
  activeRequests.set(command.requestId, active);
  let session: AgentSession | null = null;
  try {
    const runtime = await getModelRuntime(command.authPath, command.modelsPath);
    const availableModels = await runtime.getAvailable(command.providerId);
    const model = availableModels.find(
      ({ id, provider }) =>
        id === command.modelId && provider === command.providerId,
    );
    if (model === undefined) {
      throw new Error('The configured model is not available');
    }
    const systemPrompt = buildAgentSystemPrompt({
      availableTools: ['get_current_document'],
      role: command.role,
    });
    ({ session } = await createAgentSession({
      cwd: command.cwd,
      customTools: [createCurrentDocumentTool(command.requestId)],
      model,
      modelRuntime: runtime,
      resourceLoader: createDriftfieldResourceLoader(systemPrompt.prompt),
      sessionManager: SessionManager.inMemory(command.cwd),
      settingsManager: SettingsManager.inMemory(),
      thinkingLevel: command.thinkingLevel,
      tools: ['get_current_document'],
    }));
    active.session = session;
    if (active.cancelled) {
      await session.abort();
      send({ requestId: command.requestId, type: 'cancelled' });
      return;
    }
    const unsubscribe = session.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        send({
          delta: event.assistantMessageEvent.delta,
          requestId: command.requestId,
          type: 'text-delta',
        });
      }
    });
    try {
      await session.prompt(command.prompt);
      send({
        requestId: command.requestId,
        type: active.cancelled ? 'cancelled' : 'completed',
      });
    } finally {
      unsubscribe();
    }
  } catch {
    send({
      ...(active.cancelled
        ? { requestId: command.requestId, type: 'cancelled' as const }
        : {
            message: 'Agent 请求未能完成，请检查模型配置后重试。',
            requestId: command.requestId,
            type: 'error' as const,
          }),
    });
  } finally {
    rejectPendingToolResults(command.requestId);
    activeRequests.delete(command.requestId);
    session?.dispose();
  }
}

function createCurrentDocumentTool(requestId: string) {
  return defineTool({
    description:
      'Read the current manuscript document selected by the user. Use it only when the request needs its exact text.',
    label: 'Read current document',
    name: 'get_current_document',
    parameters: Type.Object({}),
    execute: async (toolCallId) =>
      textToolResult(await requestCurrentDocument(requestId, toolCallId)),
  });
}

function requestCurrentDocument(
  requestId: string,
  toolCallId: string,
): Promise<string> {
  const key = toolResultKey(requestId, toolCallId);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingToolResults.delete(key);
      reject(new Error('Current document tool timed out'));
    }, TOOL_RESULT_TIMEOUT_MS);
    pendingToolResults.set(key, { reject, resolve, timeout });
    send({ requestId, toolCallId, type: 'tool-request' });
  });
}

function rejectPendingToolResults(requestId: string): void {
  for (const [key, pending] of pendingToolResults) {
    if (!key.startsWith(`${requestId}:`)) continue;
    clearTimeout(pending.timeout);
    pending.reject(new Error('Agent request ended'));
    pendingToolResults.delete(key);
  }
}

function toolResultKey(requestId: string, toolCallId: string): string {
  return `${requestId}:${toolCallId}`;
}

async function getModelRuntime(
  authPath: string,
  modelsPath: string,
): Promise<ModelRuntime> {
  if (
    modelRuntime !== null &&
    modelRuntimePaths?.authPath === authPath &&
    modelRuntimePaths.modelsPath === modelsPath
  ) {
    return modelRuntime;
  }
  modelRuntime = await PiModelRuntime.create({ authPath, modelsPath });
  modelRuntimePaths = { authPath, modelsPath };
  return modelRuntime;
}

const textToolResult = (text: string) => ({
  content: [{ text, type: 'text' as const }],
  details: {},
});

const createDriftfieldResourceLoader = (
  systemPrompt: string,
): ResourceLoader => ({
  extendResources: () => {},
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getAppendSystemPrompt: () => [],
  getAppendSystemPromptSources: () => [],
  getExtensions: () => ({
    errors: [],
    extensions: [],
    runtime: createExtensionRuntime(),
  }),
  getPrompts: () => ({ diagnostics: [], prompts: [] }),
  getSkills: () => ({ diagnostics: [], skills: [] }),
  getSystemPrompt: () => systemPrompt,
  getSystemPromptSource: () => undefined,
  getThemes: () => ({ diagnostics: [], themes: [] }),
  reload: async () => {},
});
