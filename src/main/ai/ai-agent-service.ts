import { utilityProcess, type UtilityProcess } from 'electron';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentEvent } from '../../shared/contracts/agent';
import {
  isAgentWorkerMessage,
  type AgentWorkerMessage,
} from '../../shared/contracts/agent-worker';
import { createProjectSnapshot } from '../services/project-service';

const MAX_AGENT_DOCUMENT_BYTES = 512 * 1024;
const WORKER_START_TIMEOUT_MS = 15_000;

interface ActiveAgentRequest {
  cancelled: boolean;
  currentDocumentId?: string;
  ownerId: number;
  projectDirectory?: string;
  sendEvent: (event: AgentEvent) => void;
}

interface StartAgentRequest {
  currentDocumentId?: string;
  ownerId: number;
  projectDirectory?: string;
  prompt: string;
  requestId: string;
  sendEvent: (event: AgentEvent) => void;
}

export class AiAgentService {
  private readonly activeRequests = new Map<string, ActiveAgentRequest>();
  private worker: UtilityProcess | null = null;
  private workerReady: Promise<UtilityProcess> | null = null;

  constructor(private readonly userDataPath: string) {}

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
      currentDocumentId: request.currentDocumentId,
      ownerId: request.ownerId,
      projectDirectory: request.projectDirectory,
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
        cwd: request.projectDirectory ?? this.userDataPath,
        modelsPath: path.join(directory, 'models.json'),
        prompt: request.prompt,
        requestId: request.requestId,
        type: 'start',
      });
      return request.requestId;
    } catch (error) {
      if (this.activeRequests.get(request.requestId) === active) {
        this.activeRequests.delete(request.requestId);
      }
      throw error;
    }
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
      if (active.ownerId === ownerId) void this.cancel(ownerId, requestId);
    }
  }

  dispose(): void {
    this.worker?.postMessage({ type: 'shutdown' });
    this.worker?.kill();
    this.worker = null;
    this.workerReady = null;
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
    const active = this.activeRequests.get(message.requestId);
    if (active === undefined) return;

    if (message.type === 'tool-request') {
      const content = await this.readCurrentDocument(active).catch(
        () => 'The selected manuscript document could not be read.',
      );
      if (this.activeRequests.get(message.requestId) === active) {
        this.worker?.postMessage({
          content,
          requestId: message.requestId,
          toolCallId: message.toolCallId,
          type: 'tool-result',
        });
      }
      return;
    }

    if (message.type === 'text-delta') {
      active.sendEvent(message);
      return;
    }

    active.sendEvent(message);
    this.activeRequests.delete(message.requestId);
  }

  private handleWorkerExit(worker: UtilityProcess): void {
    if (this.worker !== worker) return;
    this.worker = null;
    this.workerReady = null;
    for (const [requestId, active] of this.activeRequests) {
      active.sendEvent({
        message: 'Agent 运行进程意外退出，请重试。',
        requestId,
        type: 'error',
      });
    }
    this.activeRequests.clear();
  }

  private async readCurrentDocument(
    request: ActiveAgentRequest,
  ): Promise<string> {
    if (
      request.projectDirectory === undefined ||
      request.currentDocumentId === undefined
    ) {
      return 'No current manuscript document is available.';
    }
    const project = await createProjectSnapshot(request.projectDirectory);
    const document = project.documents.find(
      ({ id }) => id === request.currentDocumentId,
    );
    if (document === undefined) {
      return 'The selected manuscript document is no longer available.';
    }
    if (Buffer.byteLength(document.markdown, 'utf8') > MAX_AGENT_DOCUMENT_BYTES) {
      return 'The current document is too large to load into this request.';
    }
    return `Document: ${document.relativePath}\nRevision: ${document.revision}\n\n${document.markdown}`;
  }
}
