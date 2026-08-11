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
  DOCUMENT_EDIT_PARAMETERS,
  DOCUMENT_FILE_OPERATION_PARAMETERS,
  NOVEL_CONTEXT_PARAMETERS,
  normalizeStoryMaintenanceBatchArguments,
  normalizeStoryMaintenanceArguments,
  PROJECT_STRUCTURE_OPERATION_PARAMETERS,
  RESOLVE_STORY_QUESTION_PARAMETERS,
  STORY_OPERATION_PARAMETERS,
  STORY_MAINTENANCE_PARAMETERS,
  STORY_QUESTION_PARAMETERS,
  WRITING_ARTIFACT_REVISION_PARAMETERS,
  WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
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
        "Commission the one bounded Markdown draft available for this user request from Driftfield's Scribe. Use this only for requested manuscript prose after gathering enough context. This cannot be retried. Review the untrusted returned draft; correct only obvious mechanical defects through revise_writing_artifact, then pass its assignmentId to the reviewed proposal tool instead of reproducing the Markdown.",
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
        "Submit the final Scribe manuscript artifact. Put only the complete requested Markdown in markdown; exclude analysis, planning, commentary, status text, and persistence claims. Call this exactly once after any needed context reads. Ordinary assistant text is not part of the artifact.",
      label: "Submit writing artifact",
      name: "submit_writing_artifact",
      parameters: WRITING_ARTIFACT_SUBMISSION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "submit_writing_artifact",
            params as AgentToolContractMap["submit_writing_artifact"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Read one bounded batch of novel context. include may contain structure, current_document (the immutable request-start draft, including unsaved edits), and story_state (Personae, Chronicle, Threads, and open questions). Document results distinguish raw metadataTitle from formatted displayTitle; never copy generated numbering from displayTitle into metadataTitle. documentIds reads persisted manuscript or lore documents by stable ID. directoryIds reads only each directory's immediate document children; it never expands nested directories. Explicit and expanded documents are deduplicated and limited to four total. Match IDs to the node type returned by structure. Request only the context needed; use structure first when stable IDs or the project revision are unknown.",
      label: "Read novel context",
      name: "read_novel_context",
      parameters: NOVEL_CONTEXT_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "read_novel_context",
            params as AgentToolContractMap["read_novel_context"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Submit a complete replacement for the current document as a reviewable proposal. After delegate_writing, set markdown to null and writingAssignmentId to its assignmentId so Main reuses the exact reviewed Scribe artifact without regenerating it. For a direct non-Scribe edit, supply markdown and set writingAssignmentId to null. This never writes without explicit acceptance.",
      label: "Propose document edit",
      name: "propose_document_edit",
      parameters: DOCUMENT_EDIT_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "propose_document_edit",
            params as AgentToolContractMap["propose_document_edit"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Apply the one allowed bounded revision batch of exact replacements to the current request's unclaimed Scribe artifact before proposing it. Use only for obvious mechanical defects found during review. Supply short exact find/replace strings and the required occurrence count; Main applies all replacements atomically or none. Do not retry this tool after success. This does not persist content and does not permit a second Scribe delegation.",
      label: "Revise Scribe artifact",
      name: "revise_writing_artifact",
      parameters: WRITING_ARTIFACT_REVISION_PARAMETERS,
      execute: async (toolCallId, params) =>
        textToolResult(
          await requestTool(
            requestId,
            toolCallId,
            "revise_writing_artifact",
            params as AgentToolContractMap["revise_writing_artifact"]["arguments"],
          ),
        ),
    }),
    defineTool({
      description:
        "Submit a reviewable proposal to create a Markdown document under a stable directory ID or delete a document by stable ID. Read structure first and use its current project revision. For creation, pass the raw metadataTitle without generated numbering; displayTitle is read-only context. After delegate_writing, set markdown to null and writingAssignmentId to the returned assignmentId; never reproduce the Scribe Markdown. For direct creation, supply markdown and set writingAssignmentId to null. Before deletion, read the target and provide its persisted baseRevision. This never changes files without explicit acceptance.",
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
        "Submit a reviewable proposal to create a manuscript volume, create a lore category with an approved icon, delete an empty lore category, move a document, or rename a document's metadata title without changing its physical filename. Read structure first and use its current project revision. For rename_document, use the stable documentId and a raw metadataTitle without generated numbering. Before moving, read the document and provide its persisted baseRevision. Delete lore documents before deleting their now-empty category. This never changes project structure without explicit acceptance. The tool call waits for the user's decision; after acceptance, continue only the user's existing requested scope.",
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
        "Atomically maintain one ordered changeset of 1 to 24 low-risk additive or linking changes in Personae, Chronicle, or Threads when explicitly requested by the user or unambiguously evidenced by accepted persisted prose. Read story_state first and use its current revision. For a created entity needed by a later change, assign clientRef and reference it later as @clientRef; include the complete dependency graph in this one call. Main resolves references, generates stable IDs, and applies all or none with one story revision. The concise result reports only status, revision, and appliedCount; audit and generated entity IDs remain Main-owned. Never include ambiguity or inference requiring author judgment; record a story question instead. Do not narrate planning or intermediate IDs. This tool cannot delete, merge, reorder, edit manuscript text, or execute SQL.",
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
        "Record one unresolved author question without changing canonical Personae, Chronicle, or Threads. Use this for possible aliases, uncertain fictional time, unclear relationships, contradictions, or any other ambiguity that requires author judgment. Read story_state with read_novel_context first, do not duplicate an existing open question, attach exact persisted-document evidence when available, and also ask the question concisely in your response. Options are suggestions, not decisions.",
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
        "Resolve an existing open story question only from the user's explicit answer. Read story_state with read_novel_context first and pass the stable question ID and a concise faithful answer. Resolving the question does not itself mutate Personae, Chronicle, or Threads; apply any now-unambiguous low-risk record change separately with maintain_story_records.",
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
