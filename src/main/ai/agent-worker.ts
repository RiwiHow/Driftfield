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
import { AgentToolResultBridge } from './agent-tool-result-bridge';
import {
  isAgentToolName,
  type AgentToolContractMap,
  type AgentToolName,
} from '../../shared/contracts/agent-tools';

const TOOL_RESULT_TIMEOUT_MS = 30_000;

interface ActiveRequest {
  cancelled: boolean;
  session: AgentSession | null;
}

const activeRequests = new Map<string, ActiveRequest>();
let modelRuntime: ModelRuntime | null = null;
let modelRuntimePaths: { authPath: string; modelsPath: string } | null = null;

const send = (message: AgentWorkerMessage): void => {
  process.parentPort.postMessage(message);
};

const toolResults = new AgentToolResultBridge(
  (request) => send({ ...request, type: 'tool-request' }),
  TOOL_RESULT_TIMEOUT_MS,
);

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
        code: 'model-list-failed',
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
    toolResults.resolve(
      command.requestId,
      command.toolCallId,
      command.result,
    );
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
    const customTools = createNovelTools(command.requestId);
    const enabledToolNames = customTools.map(({ name }) => {
      if (!isAgentToolName(name)) {
        throw new Error(`Unregistered Driftfield tool: ${name}`);
      }
      return name;
    });
    const systemPrompt = buildAgentSystemPrompt({
      availableTools: enabledToolNames,
      role: command.role,
    });
    ({ session } = await createAgentSession({
      cwd: command.cwd,
      customTools,
      model,
      modelRuntime: runtime,
      resourceLoader: createDriftfieldResourceLoader(systemPrompt.prompt),
      sessionManager: SessionManager.inMemory(command.cwd),
      settingsManager: SettingsManager.inMemory(),
      thinkingLevel: command.thinkingLevel,
      tools: enabledToolNames,
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
            code: 'request-failed',
            requestId: command.requestId,
            type: 'error' as const,
          }),
    });
  } finally {
    toolResults.rejectRequest(command.requestId);
    activeRequests.delete(command.requestId);
    session?.dispose();
  }
}

function createNovelTools(requestId: string) {
  return [
    defineTool({
      description: 'Read the ordered novel, volume, chapter, and lorebook structure without loading document text.',
      label: 'Read novel structure',
      name: 'get_novel_structure',
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(await requestTool(
          requestId,
          toolCallId,
          'get_novel_structure',
          params as AgentToolContractMap['get_novel_structure']['arguments'],
        )),
    }),
    defineTool({
      description: 'Read the current manuscript draft selected by the user, including unsaved edits.',
      label: 'Read current document',
      name: 'get_current_document',
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(await requestTool(
          requestId,
          toolCallId,
          'get_current_document',
          params as AgentToolContractMap['get_current_document']['arguments'],
        )),
    }),
    defineTool({
      description: 'Read one persisted manuscript or lorebook document by the stable ID returned by get_novel_structure.',
      label: 'Read document',
      name: 'get_document',
      parameters: Type.Object({ documentId: Type.String({ maxLength: 128, minLength: 1 }) }, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(await requestTool(requestId, toolCallId, 'get_document', params)),
    }),
    defineTool({
      description: 'Submit a complete replacement for the current document as a reviewable proposal. This never writes the file; the user must explicitly accept it in Driftfield.',
      label: 'Propose document edit',
      name: 'propose_document_edit',
      parameters: Type.Object({
        baseContentRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
        baseRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
        documentId: Type.String({ maxLength: 128, minLength: 1 }),
        markdown: Type.String({ maxLength: 512 * 1024 }),
      }, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(await requestTool(
          requestId,
          toolCallId,
          'propose_document_edit',
          params,
        )),
    }),
  ];
}

async function requestTool<Name extends AgentToolName>(
  requestId: string,
  toolCallId: string,
  toolName: Name,
  args: AgentToolContractMap[Name]['arguments'],
): Promise<string> {
  send({
    input: serializeToolPayload(args),
    requestId,
    toolCallId,
    toolName,
    type: 'tool-started',
  });
  try {
    const result = await toolResults.request(
      requestId,
      toolCallId,
      toolName,
      args,
    );
    send({
      failed: !result.ok,
      output: serializeToolPayload(result),
      requestId,
      toolCallId,
      toolName,
      type: 'tool-completed',
    });
    return JSON.stringify(result);
  } catch (error) {
    send({
      failed: true,
      output: serializeToolPayload({ error: 'tool-result-unavailable' }),
      requestId,
      toolCallId,
      toolName,
      type: 'tool-completed',
    });
    throw error;
  }
}

const serializeToolPayload = (value: unknown): string => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (key, entry: unknown) =>
      key === 'markdown' && typeof entry === 'string'
        ? `[Markdown omitted: ${new TextEncoder().encode(entry).byteLength} bytes]`
        : entry,
    );
  } catch {
    serialized = JSON.stringify({ error: 'unserializable-tool-payload' });
  }
  return serialized.length <= 8_192
    ? serialized
    : `${serialized.slice(0, 8_191)}…`;
};

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
