import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentEvent } from '../../shared/contracts/agent';
import type { AgentDraftSnapshot } from '../../shared/contracts/agent-tools';
import type { AgentModelOption } from '../../shared/contracts/agent-configuration';
import type {
  AgentModelSelection,
  AgentThinkingLevel,
} from '../../shared/contracts/settings';
import {
  isAgentWorkerMessage,
  type AgentWorkerMessage,
} from '../../shared/contracts/agent-worker';
import type { AgentToolDispatcher } from './agent-tool-dispatcher';

const WORKER_START_TIMEOUT_MS = 15_000;

interface ActiveAgentRequest {
  cancelled: boolean;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  sendEvent: (event: AgentEvent) => void;
}

interface StartAgentRequest {
  currentDocumentId?: string;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  prompt: string;
  model: AgentModelSelection;
  requestId: string;
  sendEvent: (event: AgentEvent) => void;
  thinkingLevel: AgentThinkingLevel;
}

interface PendingModelList {
  reject: (error: Error) => void;
  resolve: (models: AgentModelOption[]) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class AiAgentService {
  private readonly activeRequests = new Map<string, ActiveAgentRequest>();
  private readonly pendingModelLists = new Map<string, PendingModelList>();
  private worker: UtilityProcess | null = null;
  private workerReady: Promise<UtilityProcess> | null = null;

  constructor(
    private readonly userDataPath: string,
    private readonly isProjectSessionActive: (
      ownerId: number,
      projectSessionId: string,
    ) => boolean = () => true,
    private readonly toolDispatcher?: AgentToolDispatcher,
  ) {}

  async start(request: StartAgentRequest): Promise<string> {
    if (
      this.activeRequests.has(request.requestId) ||
      [...this.activeRequests.values()].some(
        (entry) => entry.ownerId === request.ownerId,
      )
    ) {
      throw new Error('An Agent request is already running');
    }

    const active: ActiveAgentRequest = {
      cancelled: false,
      draftSnapshot: request.draftSnapshot,
      ownerId: request.ownerId,
      projectSessionId: request.projectSessionId,
      sendEvent: request.sendEvent,
    };
    this.activeRequests.set(request.requestId, active);

    try {
      const directory = path.join(this.userDataPath, 'ai', 'pi');
      await mkdir(directory, { recursive: true });
      const worker = await this.getWorker();
      if (active.cancelled) throw new Error('Agent request was cancelled');
      active.sendEvent({ requestId: request.requestId, type: 'started' });
      worker.postMessage({
        authPath: path.join(directory, 'auth.json'),
        cwd: directory,
        modelsPath: path.join(directory, 'models.json'),
        modelId: request.model.modelId,
        prompt: request.prompt,
        providerId: request.model.providerId,
        requestId: request.requestId,
        role: 'coordinator',
        thinkingLevel: request.thinkingLevel,
        type: 'start',
      });
      return request.requestId;
    } catch (error) {
      if (this.activeRequests.get(request.requestId) === active) {
        this.activeRequests.delete(request.requestId);
        this.toolDispatcher?.release(request.requestId);
      }
      throw error;
    }
  }

  async listModels(): Promise<AgentModelOption[]> {
    const directory = path.join(this.userDataPath, 'ai', 'pi');
    await mkdir(directory, { recursive: true });
    const worker = await this.getWorker();
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingModelLists.delete(requestId);
        reject(new Error('Timed out while loading Agent models'));
      }, WORKER_START_TIMEOUT_MS);
      this.pendingModelLists.set(requestId, { reject, resolve, timeout });
      worker.postMessage({
        authPath: path.join(directory, 'auth.json'),
        modelsPath: path.join(directory, 'models.json'),
        requestId,
        type: 'list-models',
      });
    });
  }

  reloadConfiguration(): void {
    if (this.activeRequests.size > 0) {
      throw new Error('Cannot change credentials while an Agent is running');
    }
    this.stopWorker();
  }

  async cancel(ownerId: number, requestId: string): Promise<boolean> {
    const active = this.activeRequests.get(requestId);
    if (active === undefined || active.ownerId !== ownerId) return false;
    active.cancelled = true;
    this.worker?.postMessage({ requestId, type: 'cancel' });
    return true;
  }

  disposeOwner(ownerId: number): void {
    for (const [requestId, active] of this.activeRequests) {
      if (active.ownerId !== ownerId) continue;
      active.cancelled = true;
      this.worker?.postMessage({ requestId, type: 'cancel' });
      active.sendEvent({ requestId, type: 'cancelled' });
      this.activeRequests.delete(requestId);
      this.toolDispatcher?.release(requestId);
    }
  }

  dispose(): void {
    this.stopWorker();
    this.activeRequests.clear();
  }

  private getWorker(): Promise<UtilityProcess> {
    if (this.workerReady !== null) return this.workerReady;

    const worker = utilityProcess.fork(
      path.join(__dirname, 'agent-worker.mjs'),
      [],
      {
        serviceName: 'Driftfield Agent Runtime',
        stdio: 'ignore',
      },
    );
    this.worker = worker;
    this.workerReady = new Promise<UtilityProcess>((resolve, reject) => {
      let ready = false;
      const timeout = setTimeout(() => {
        if (ready) return;
        reject(new Error('Agent utility process did not become ready'));
        worker.kill();
      }, WORKER_START_TIMEOUT_MS);

      worker.on('message', (value: unknown) => {
        if (!isAgentWorkerMessage(value)) return;
        if (value.type === 'ready') {
          if (!ready) {
            ready = true;
            clearTimeout(timeout);
            resolve(worker);
          }
          return;
        }
        void this.handleWorkerMessage(value);
      });
      worker.once('exit', (code) => {
        clearTimeout(timeout);
        if (!ready) {
          reject(new Error(`Agent utility process exited during startup (${code})`));
        }
        this.handleWorkerExit(worker);
      });
      worker.once('error', () => {
        if (!ready) reject(new Error('Agent utility process failed to start'));
      });
    });
    return this.workerReady;
  }

  private async handleWorkerMessage(message: AgentWorkerMessage): Promise<void> {
    if (message.type === 'ready') return;
    if (message.type === 'models') {
      const pending = this.pendingModelLists.get(message.requestId);
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        this.pendingModelLists.delete(message.requestId);
        pending.resolve(message.models);
      }
      return;
    }
    if (message.type === 'models-error') {
      const pending = this.pendingModelLists.get(message.requestId);
      if (pending !== undefined) {
        clearTimeout(pending.timeout);
        this.pendingModelLists.delete(message.requestId);
        pending.reject(new Error(message.code));
      }
      return;
    }
    const active = this.activeRequests.get(message.requestId);
    if (active === undefined) return;
    if (!this.requestHasActiveProjectSession(active)) {
      active.cancelled = true;
      this.worker?.postMessage({ requestId: message.requestId, type: 'cancel' });
      active.sendEvent({ requestId: message.requestId, type: 'cancelled' });
      this.activeRequests.delete(message.requestId);
      this.toolDispatcher?.release(message.requestId);
      return;
    }
    if (active.cancelled) {
      if (
        message.type === 'completed' ||
        message.type === 'cancelled' ||
        message.type === 'error'
      ) {
        active.sendEvent({ requestId: message.requestId, type: 'cancelled' });
        this.activeRequests.delete(message.requestId);
        this.toolDispatcher?.release(message.requestId);
      }
      return;
    }

    if (message.type === 'tool-request') {
      const result = this.toolDispatcher === undefined
        ? {
            error: { code: 'internal-error' as const },
            ok: false as const,
            toolName: message.toolName,
          }
        : await this.toolDispatcher.execute(
            {
              ...(active.draftSnapshot === undefined
                ? {}
                : { draftSnapshot: active.draftSnapshot }),
              ownerId: active.ownerId,
              projectSessionId: active.projectSessionId,
              requestId: message.requestId,
            },
            message,
          );
      if (
        this.activeRequests.get(message.requestId) === active &&
        this.requestHasActiveProjectSession(active)
      ) {
        this.worker?.postMessage({
          result,
          requestId: message.requestId,
          toolCallId: message.toolCallId,
          type: 'tool-result',
        });
      } else if (this.activeRequests.get(message.requestId) === active) {
        active.cancelled = true;
        this.worker?.postMessage({ requestId: message.requestId, type: 'cancel' });
        active.sendEvent({ requestId: message.requestId, type: 'cancelled' });
        this.activeRequests.delete(message.requestId);
        this.toolDispatcher?.release(message.requestId);
      }
      return;
    }

    if (message.type === 'text-delta') {
      active.sendEvent(message);
      return;
    }

    active.sendEvent(message);
    this.activeRequests.delete(message.requestId);
    this.toolDispatcher?.release(message.requestId);
  }

  private handleWorkerExit(worker: UtilityProcess): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.workerReady = null;
    for (const pending of this.pendingModelLists.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent runtime exited while loading models'));
    }
    this.pendingModelLists.clear();
    for (const [requestId, active] of this.activeRequests) {
      active.sendEvent({
        code: 'runtime-exited',
        requestId,
        type: 'error',
      });
      this.toolDispatcher?.release(requestId);
    }
    this.activeRequests.clear();
  }

  private stopWorker(): void {
    this.worker?.postMessage({ type: 'shutdown' });
    this.worker?.kill();
    this.worker = null;
    this.workerReady = null;
    for (const pending of this.pendingModelLists.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Agent runtime configuration changed'));
    }
    this.pendingModelLists.clear();
    for (const requestId of this.activeRequests.keys()) {
      this.toolDispatcher?.release(requestId);
    }
  }

  private requestHasActiveProjectSession(request: ActiveAgentRequest): boolean {
    return (
      request.projectSessionId === undefined ||
      this.isProjectSessionActive(request.ownerId, request.projectSessionId)
    );
  }
}
