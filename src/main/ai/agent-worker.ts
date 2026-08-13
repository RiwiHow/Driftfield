import type {
  AgentSession,
  ModelRuntime,
  ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import {
  createAgentSession,
  createExtensionRuntime,
  defineTool,
  ModelRuntime as PiModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import {
  isAgentWorkerCommand,
  type AgentWorkerCommand,
  type AgentWorkerMessage,
  type AgentWorkerStartCommand,
} from "../../shared/contracts/agent-worker";
import { buildAgentSystemPrompt } from "./prompts/prompt-builder";
import { AgentToolResultBridge } from "./agent-tool-result-bridge";
import {
  closesStoryReconciliation,
  normalizeStopReason,
  protocolCorrection,
  responseProtocolIssue,
} from './agent-run-protocol';
import {
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
} from "./agent-tool-parameters";
import { AGENT_TOOL_DEFINITIONS } from './agent-tool-definitions';
import { serializeSuccessfulToolResult } from './agent-tool-model-result';
import {
  AGENT_TOOL_NAMES,
  isAgentToolName,
  type AgentToolContractMap,
  type AgentToolExecutionResult,
  type AgentToolName,
} from "../../shared/contracts/agent-tools";
import type { AgentStopReason } from '../../shared/contracts/agent';

const TOOL_RESULT_TIMEOUT_MS = 30_000;

interface ActiveRequest {
  cancelled: boolean;
  reconciliationPending: boolean;
  session: AgentSession | null;
}

const activeRequests = new Map<string, ActiveRequest>();
let modelRuntime: ModelRuntime | null = null;
let modelRuntimePaths: { authPath: string; modelsPath: string } | null = null;

const send = (message: AgentWorkerMessage): void => {
  process.parentPort.postMessage(message);
};

const toolResults = new AgentToolResultBridge(
  (request) => send({ ...request, type: "tool-request" }),
  TOOL_RESULT_TIMEOUT_MS,
);

process.parentPort.on("message", (event) => {
  const command: unknown = event.data;
  if (!isAgentWorkerCommand(command)) return;
  void handleCommand(command);
});

send({ type: "ready" });

async function handleCommand(command: AgentWorkerCommand): Promise<void> {
  if (command.type === "list-models") {
    try {
      const runtime = await getModelRuntime(
        command.authPath,
        command.modelsPath,
      );
      const models = await runtime.getAvailable();
      send({
        models: models.map((model) => ({
          api: model.api,
          contextWindow: model.contextWindow,
          id: model.id,
          maxOutputTokens: model.maxTokens,
          name: model.name,
          providerId: model.provider,
          reasoning: model.reasoning,
          thinkingLevelMap: model.thinkingLevelMap ?? {},
        })),
        requestId: command.requestId,
        type: "models",
      });
    } catch {
      send({
        code: "model-list-failed",
        requestId: command.requestId,
        type: "models-error",
      });
    }
    return;
  }
  if (command.type === "start") {
    await startRequest(command);
    return;
  }
  if (command.type === "cancel") {
    const active = activeRequests.get(command.requestId);
    if (active !== undefined) {
      active.cancelled = true;
      await active.session?.abort();
    }
    return;
  }
  if (command.type === "tool-result") {
    toolResults.resolve(command.requestId, command.toolCallId, command.result);
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
  const active: ActiveRequest = {
    cancelled: false,
    reconciliationPending: command.reconciliationPending,
    session: null,
  };
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
      throw new Error("The configured model is not available");
    }
    const customTools = createNovelTools(command.requestId).filter(({ name }) =>
      command.enabledTools.includes(name as AgentToolName),
    );
    const enabledToolNames = customTools.map(({ name }) => {
      if (!isAgentToolName(name)) {
        throw new Error(`Unregistered Driftfield tool: ${name}`);
      }
      return name;
    });
    const systemPrompt = buildAgentSystemPrompt({
      availableTools: enabledToolNames,
      proposalOutcomes: command.proposalOutcomes,
      responseLanguage: command.responseLanguage,
      role: command.role,
    });
    const sessionManager = SessionManager.inMemory(command.cwd);
    const history = selectModelHistory(
      command.history,
      model.contextWindow,
      model.maxTokens,
    );
    const timestamp = Date.now() - history.length;
    history.forEach((message, index) => {
      if (message.role === 'user') {
        sessionManager.appendMessage({
          content: message.content,
          role: 'user',
          timestamp: timestamp + index,
        });
      } else {
        sessionManager.appendMessage({
          api: model.api,
          content: [{ text: message.content, type: 'text' }],
          model: model.id,
          provider: model.provider,
          role: 'assistant',
          stopReason: 'stop',
          timestamp: timestamp + index,
          usage: {
            cacheRead: 0,
            cacheWrite: 0,
            cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
            input: 0,
            output: 0,
            totalTokens: 0,
          },
        });
      }
    });
    ({ session } = await createAgentSession({
      cwd: command.cwd,
      customTools,
      model,
      modelRuntime: runtime,
      resourceLoader: createDriftfieldResourceLoader(systemPrompt.prompt),
      sessionManager,
      settingsManager: SettingsManager.inMemory(),
      thinkingLevel: command.thinkingLevel,
      tools: enabledToolNames,
    }));
    active.session = session;
    if (active.cancelled) {
      await session.abort();
      send({ requestId: command.requestId, type: "cancelled" });
      return;
    }
    const responseState: {
      assistantText: string;
      stopReason: AgentStopReason;
    } = { assistantText: '', stopReason: 'unknown' };
    const unsubscribe = session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        send({
          delta: event.assistantMessageEvent.delta,
          requestId: command.requestId,
          type: "text-delta",
        });
      }
      if (event.type === 'message_end' && event.message.role === 'assistant') {
        responseState.stopReason = normalizeStopReason(event.message.stopReason);
        responseState.assistantText = event.message.content
          .filter((entry) => entry.type === 'text')
          .map((entry) => entry.text)
          .join('');
      }
    });
    try {
      await session.prompt(command.prompt);
      let protocolIssue = responseProtocolIssue(
        responseState.assistantText,
        responseState.stopReason,
        active.reconciliationPending,
        enabledToolNames,
      );
      if (!active.cancelled && protocolIssue !== null) {
        responseState.assistantText = '';
        responseState.stopReason = 'unknown';
        await session.prompt(protocolCorrection(protocolIssue));
        protocolIssue = responseProtocolIssue(
          responseState.assistantText,
          responseState.stopReason,
          active.reconciliationPending,
          enabledToolNames,
        );
      }
      if (active.cancelled) {
        send({ requestId: command.requestId, type: 'cancelled' });
      } else if (
        responseState.stopReason === 'error' ||
        responseState.stopReason === 'aborted'
      ) {
        send({
          code: 'request-failed',
          requestId: command.requestId,
          stopReason: responseState.stopReason,
          type: 'error',
        });
      } else if (responseState.stopReason === 'length') {
        send({
          code: 'response-truncated',
          requestId: command.requestId,
          stopReason: responseState.stopReason,
          type: 'error',
        });
      } else if (protocolIssue !== null) {
        send({
          code: 'workflow-incomplete',
          requestId: command.requestId,
          stopReason: responseState.stopReason,
          type: 'error',
        });
      } else {
        send({
          requestId: command.requestId,
          stopReason: responseState.stopReason,
          type: 'completed',
        });
      }
    } finally {
      unsubscribe();
    }
  } catch {
    send({
      ...(active.cancelled
        ? { requestId: command.requestId, type: "cancelled" as const }
        : {
            code: "request-failed",
            requestId: command.requestId,
            type: "error" as const,
          }),
    });
  } finally {
    toolResults.rejectRequest(command.requestId);
    activeRequests.delete(command.requestId);
    session?.dispose();
  }
}

function selectModelHistory(
  history: AgentWorkerStartCommand['history'],
  contextWindow: number,
  maxOutputTokens: number,
): AgentWorkerStartCommand['history'] {
  const reservedTokens = Math.min(maxOutputTokens, 16_000) + 12_000;
  const characterBudget = Math.max(0, contextWindow - reservedTokens) * 3;
  const selected: AgentWorkerStartCommand['history'] = [];
  let characters = 0;
  for (const message of [...history].reverse()) {
    if (characters + message.content.length > characterBudget) break;
    selected.push(message);
    characters += message.content.length;
  }
  return selected.reverse();
}

function normalizeToolArguments<Name extends AgentToolName>(
  toolName: Name,
  params: unknown,
): AgentToolContractMap[Name]['arguments'] {
  if (toolName === 'maintain_story_records') {
    return normalizeStoryMaintenanceBatchArguments(
      params as Parameters<typeof normalizeStoryMaintenanceBatchArguments>[0],
    ) as AgentToolContractMap[Name]['arguments'];
  }
  if (toolName === 'propose_story_operation') {
    return normalizeStoryMaintenanceArguments(
      params as Parameters<typeof normalizeStoryMaintenanceArguments>[0],
    ) as AgentToolContractMap[Name]['arguments'];
  }
  return params as AgentToolContractMap[Name]['arguments'];
}

function createNovelTools(requestId: string) {
  // defineTool is not generic over a union of parameter schemas.
  return AGENT_TOOL_NAMES.map((toolName) =>
    defineTool({
      ...AGENT_TOOL_DEFINITIONS[toolName],
      execute: async (toolCallId, params, signal) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            toolName,
            normalizeToolArguments(toolName, params),
            signal,
          ),
        ),
    } as Parameters<typeof defineTool>[0]),
  );
}

async function requestTool<Name extends AgentToolName>(
  requestId: string,
  toolCallId: string,
  toolName: Name,
  args: AgentToolContractMap[Name]["arguments"],
  signal?: AbortSignal,
): Promise<string> {
  send({
    input: serializeToolPayload(args),
    requestId,
    toolCallId,
    toolName,
    type: "tool-started",
  });
  let completionReported = false;
  try {
    const result = await toolResults.request(
      requestId,
      toolCallId,
      toolName,
      args,
      signal,
    );
    observeToolProtocol(requestId, toolName, args, result);
    send({
      failed: !result.ok,
      output: serializeToolPayload(result),
      requestId,
      toolCallId,
      toolName,
      type: "tool-completed",
    });
    completionReported = true;
    return serializeSuccessfulToolResult(result);
  } catch (error) {
    if (!completionReported) {
      send({
        failed: true,
        output: serializeToolPayload({ error: "tool-result-unavailable" }),
        requestId,
        toolCallId,
        toolName,
        type: "tool-completed",
      });
    }
    throw error;
  }
}

const observeToolProtocol = <Name extends AgentToolName>(
  requestId: string,
  toolName: Name,
  args: AgentToolContractMap[Name]['arguments'],
  result: AgentToolExecutionResult<Name>,
): void => {
  if (!result.ok) return;
  const active = activeRequests.get(requestId);
  if (active === undefined) return;
  if (toolName === 'propose_document_writing') {
    if (isAcceptedProposalResult(result)) {
      active.reconciliationPending = (
        args as AgentToolContractMap['propose_document_writing']['arguments']
      ).documentDomain === 'manuscript';
    }
    return;
  }
  if (closesStoryReconciliation(toolName, result)) {
    active.reconciliationPending = false;
  }
};

const isAcceptedProposalResult = (
  result: unknown,
): boolean => typeof result === 'object' && result !== null &&
  'ok' in result && result.ok === true && 'data' in result &&
  typeof result.data === 'object' && result.data !== null &&
  'status' in result.data && result.data.status === 'accepted';

const serializeToolPayload = (value: unknown): string => {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (key, entry: unknown) =>
      key === "markdown" && typeof entry === "string"
        ? `[Markdown omitted: ${new TextEncoder().encode(entry).byteLength} bytes]`
        : entry,
    );
  } catch {
    serialized = JSON.stringify({ error: "unserializable-tool-payload" });
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
  content: [{ text, type: "text" as const }],
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
