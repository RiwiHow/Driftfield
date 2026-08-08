import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

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

import type { AgentEvent } from '../../shared/contracts/agent';
import { createProjectSnapshot } from '../services/project-service';

const MAX_AGENT_DOCUMENT_BYTES = 512 * 1024;

interface ActiveAgentRequest {
  cancelled: boolean;
  ownerId: number;
  session: AgentSession;
}

interface StartAgentRequest {
  currentDocumentId?: string;
  ownerId: number;
  projectDirectory?: string;
  prompt: string;
  sendEvent: (event: AgentEvent) => void;
}

export class AiAgentService {
  private readonly activeRequests = new Map<string, ActiveAgentRequest>();
  private modelRuntime: ModelRuntime | null = null;

  constructor(private readonly userDataPath: string) {}

  async start(request: StartAgentRequest): Promise<string> {
    if ([...this.activeRequests.values()].some((entry) => entry.ownerId === request.ownerId)) {
      throw new Error('An Agent request is already running');
    }

    const modelRuntime = await this.getModelRuntime();
    const availableModels = await modelRuntime.getAvailable();
    const model = availableModels[0];
    if (model === undefined) {
      throw new Error('未找到可用模型。请先在应用设置中配置模型凭证。');
    }

    const requestId = randomUUID();
    const { session } = await createAgentSession({
      cwd: request.projectDirectory ?? this.userDataPath,
      customTools: [this.createCurrentDocumentTool(request)],
      model,
      modelRuntime,
      resourceLoader: createDriftfieldResourceLoader(),
      sessionManager: SessionManager.inMemory(request.projectDirectory),
      settingsManager: SettingsManager.inMemory(),
      tools: ['get_current_document'],
    });
    const active: ActiveAgentRequest = {
      cancelled: false,
      ownerId: request.ownerId,
      session,
    };
    this.activeRequests.set(requestId, active);
    request.sendEvent({ requestId, type: 'started' });

    const unsubscribe = session.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        request.sendEvent({
          delta: event.assistantMessageEvent.delta,
          requestId,
          type: 'text-delta',
        });
      }
    });

    void new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => (active.cancelled ? undefined : session.prompt(request.prompt)))
      .then(() => {
        request.sendEvent({
          requestId,
          type: active.cancelled ? 'cancelled' : 'completed',
        });
      })
      .catch((error: unknown) => {
        if (active.cancelled) {
          request.sendEvent({ requestId, type: 'cancelled' });
          return;
        }
        console.error('Agent request failed', error);
        request.sendEvent({
          message: 'Agent 请求未能完成，请检查模型配置后重试。',
          requestId,
          type: 'error',
        });
      })
      .finally(() => {
        unsubscribe();
        session.dispose();
        if (this.activeRequests.get(requestId) === active) {
          this.activeRequests.delete(requestId);
        }
      });

    return requestId;
  }

  async cancel(ownerId: number, requestId: string): Promise<boolean> {
    const active = this.activeRequests.get(requestId);
    if (active === undefined || active.ownerId !== ownerId) return false;
    active.cancelled = true;
    await active.session.abort();
    return true;
  }

  disposeOwner(ownerId: number): void {
    for (const [requestId, active] of this.activeRequests) {
      if (active.ownerId === ownerId) void this.cancel(ownerId, requestId);
    }
  }

  private createCurrentDocumentTool(request: StartAgentRequest) {
    return defineTool({
      description:
        'Read the current manuscript document selected by the user. Use it only when the request needs its exact text.',
      label: 'Read current document',
      name: 'get_current_document',
      parameters: Type.Object({}),
      execute: async () => {
        if (
          request.projectDirectory === undefined ||
          request.currentDocumentId === undefined
        ) {
          return textToolResult('No current manuscript document is available.');
        }
        const project = await createProjectSnapshot(request.projectDirectory);
        const document = project.documents.find(
          ({ id }) => id === request.currentDocumentId,
        );
        if (document === undefined) {
          return textToolResult('The selected manuscript document is no longer available.');
        }
        if (Buffer.byteLength(document.markdown, 'utf8') > MAX_AGENT_DOCUMENT_BYTES) {
          return textToolResult('The current document is too large to load into this request.');
        }
        return textToolResult(
          `Document: ${document.relativePath}\nRevision: ${document.revision}\n\n${document.markdown}`,
        );
      },
    });
  }

  private async getModelRuntime(): Promise<ModelRuntime> {
    if (this.modelRuntime !== null) return this.modelRuntime;
    const directory = path.join(this.userDataPath, 'ai', 'pi');
    await mkdir(directory, { recursive: true });
    this.modelRuntime = await PiModelRuntime.create({
      authPath: path.join(directory, 'auth.json'),
      modelsPath: path.join(directory, 'models.json'),
    });
    return this.modelRuntime;
  }
}

const textToolResult = (text: string) => ({
  content: [{ text, type: 'text' as const }],
  details: {},
});

const createDriftfieldResourceLoader = (): ResourceLoader => ({
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
  getSystemPrompt: () =>
    'You are Driftfield, a careful novel-writing assistant. You may discuss, plan, and draft Markdown, but never claim that text has been saved. You have no shell, filesystem, or database access. When exact selected manuscript text is needed, use get_current_document. Generated text is always a proposal for the user to review.',
  getSystemPromptSource: () => undefined,
  getThemes: () => ({ diagnostics: [], themes: [] }),
  reload: async () => {},
});
