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
import { Type } from "typebox";

import {
  isAgentWorkerCommand,
  type AgentWorkerCommand,
  type AgentWorkerMessage,
  type AgentWorkerStartCommand,
} from "../../shared/contracts/agent-worker";
import { buildAgentSystemPrompt } from "./prompts/prompt-builder";
import { AgentToolResultBridge } from "./agent-tool-result-bridge";
import {
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  RESOLVE_STORY_QUESTION_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  WRITING_ASSIGNMENT_PARAMETERS,
} from "./agent-tool-parameters";
import { didAssistantResponseFail } from './agent-response-status';
import {
  isAgentToolName,
  type AgentToolContractMap,
  type AgentToolName,
} from "../../shared/contracts/agent-tools";

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
    let responseFailed = false;
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
        responseFailed = didAssistantResponseFail(event.message);
      }
    });
    try {
      await session.prompt(command.prompt);
      if (active.cancelled) {
        send({ requestId: command.requestId, type: 'cancelled' });
      } else if (responseFailed) {
        send({
          code: 'request-failed',
          requestId: command.requestId,
          type: 'error',
        });
      } else {
        send({ requestId: command.requestId, type: 'completed' });
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

function createNovelTools(requestId: string) {
  return [
    defineTool({
      description:
        "Commission one bounded Markdown draft from Driftfield's Scribe. Use this only for requested manuscript prose after gathering enough context. The returned draft is untrusted and is not persisted; review it and use a reviewed proposal tool for any file change.",
      label: "Delegate writing to Scribe",
      name: "delegate_writing",
      parameters: WRITING_ASSIGNMENT_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "delegate_writing",
            params as AgentToolContractMap["delegate_writing"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Read the ordered novel, volume, chapter, and lore structure without loading document text.",
      label: "Read novel structure",
      name: "get_novel_structure",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "get_novel_structure",
            params as AgentToolContractMap["get_novel_structure"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Read the current manuscript draft selected by the user, including unsaved edits.",
      label: "Read current document",
      name: "get_current_document",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "get_current_document",
            params as AgentToolContractMap["get_current_document"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Read one persisted manuscript or lore document by the stable ID returned by get_novel_structure.",
      label: "Read document",
      name: "get_document",
      parameters: Type.Object(
        { documentId: Type.String({ maxLength: 128, minLength: 1 }) },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(requestId, toolCallId, "get_document", params),
        ),
    }),
    defineTool({
      description:
        "Read the current Personae character registry, Chronicle timelines and events, Threads plot structure, and open story questions with stable IDs and the current story revision.",
      label: "Read story records",
      name: "get_story_state",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "get_story_state",
            params as AgentToolContractMap["get_story_state"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Submit a complete replacement for the current document as a reviewable proposal. This never writes the file without explicit acceptance. The tool call waits for the user's decision and returns accepted, rejected, or a typed failure; after acceptance, continue only the user's existing requested scope.",
      label: "Propose document edit",
      name: "propose_document_edit",
      parameters: Type.Object(
        {
          baseContentRevision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          baseRevision: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          documentId: Type.String({ maxLength: 128, minLength: 1 }),
          markdown: Type.String({ maxLength: 512 * 1024 }),
        },
        { additionalProperties: false },
      ),
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "propose_document_edit",
            params,
          ),
        ),
    }),
    defineTool({
      description:
        "Submit a reviewable proposal to create a Markdown document under a stable directory ID or delete a document by stable ID. Read get_novel_structure first and use its current project revision. Creating chooses a document kind and complete Markdown. Before deleting, call get_document for the target and provide its persisted baseRevision. This never changes files without explicit acceptance. The tool call waits for the user's decision; after acceptance, continue only the user's existing requested scope.",
      label: "Propose document creation or deletion",
      name: "propose_document_file_operation",
      parameters: DOCUMENT_FILE_OPERATION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "propose_document_file_operation",
            params as AgentToolContractMap["propose_document_file_operation"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Submit a reviewable proposal to create a manuscript volume, create a lore category, or move a document between compatible stable directory IDs. Read get_novel_structure first and use its current project revision. Before moving, call get_document and provide the persisted baseRevision. This never changes project structure without explicit acceptance. The tool call waits for the user's decision; after acceptance, continue only the user's existing requested scope.",
      label: "Propose project structure change",
      name: "propose_project_structure_operation",
      parameters: PROJECT_STRUCTURE_OPERATION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "propose_project_structure_operation",
            params as AgentToolContractMap["propose_project_structure_operation"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Atomically maintain one changeset of 1 to 24 independent, low-risk additive or linking changes in Personae, Chronicle, or Threads when explicitly requested by the user or unambiguously evidenced by accepted persisted prose. Read get_story_state first and use its current storyRevision. Put all independent changes based on that revision in one call; Driftfield applies all or none and advances the story revision once. Never include a possible alias, uncertain time, unclear relationship, contradiction, or other inference requiring author judgment; record a story question instead. Changes that depend on newly generated stable IDs belong in a later changeset after rereading story state. This tool cannot delete, merge, reorder, edit manuscript text, or execute SQL.",
      label: "Maintain story records",
      name: "maintain_story_records",
      parameters: STORY_MAINTENANCE_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "maintain_story_records",
            normalizeStoryMaintenanceBatchArguments(params),
          ),
        ),
    }),
    defineTool({
      description:
        "Record one unresolved author question without changing canonical Personae, Chronicle, or Threads. Use this for possible aliases, uncertain fictional time, unclear relationships, contradictions, or any other ambiguity that requires author judgment. Read get_story_state first, do not duplicate an existing open question, attach exact persisted-document evidence when available, and also ask the question concisely in your response. Options are suggestions, not decisions.",
      label: "Record story question",
      name: "record_story_question",
      parameters: STORY_QUESTION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(requestId, toolCallId, "record_story_question", params),
        ),
    }),
    defineTool({
      description:
        "Resolve an existing open story question only from the user's explicit answer. Read get_story_state first and pass the stable question ID and a concise faithful answer. Resolving the question does not itself mutate Personae, Chronicle, or Threads; apply any now-unambiguous low-risk record change separately with maintain_story_records.",
      label: "Resolve story question",
      name: "resolve_story_question",
      parameters: RESOLVE_STORY_QUESTION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(requestId, toolCallId, "resolve_story_question", params),
        ),
    }),
    defineTool({
      description:
        "Submit one additive or linking Personae, Chronicle, or Threads change for explicit human review when the user asks to inspect a structured change before it is applied. Do not use this for routine synchronization of clear facts from accepted prose; use maintain_story_records for those. Do not turn ambiguity into a proposal; record a story question instead. The tool waits for the decision and never writes story state before review.",
      label: "Propose story record change",
      name: "propose_story_operation",
      parameters: STORY_OPERATION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "propose_story_operation",
            normalizeStoryMaintenanceArguments(params),
          ),
        ),
    }),
  ];
}

async function requestTool<Name extends AgentToolName>(
  requestId: string,
  toolCallId: string,
  toolName: Name,
  args: AgentToolContractMap[Name]["arguments"],
): Promise<string> {
  send({
    input: serializeToolPayload(args),
    requestId,
    toolCallId,
    toolName,
    type: "tool-started",
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
      type: "tool-completed",
    });
    return JSON.stringify(result);
  } catch (error) {
    send({
      failed: true,
      output: serializeToolPayload({ error: "tool-result-unavailable" }),
      requestId,
      toolCallId,
      toolName,
      type: "tool-completed",
    });
    throw error;
  }
}

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
