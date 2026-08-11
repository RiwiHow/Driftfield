import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentEvent } from '../../shared/contracts/agent';
import {
  AGENT_TOOL_NAMES,
  type AgentDraftSnapshot,
  type AgentToolName,
  type AgentWritingAssignment,
  type AgentWritingAssignmentToolResult,
} from '../../shared/contracts/agent-tools';
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
import type { AgentHistoryMessage } from '../services/agent/conversation-service';
import type { AgentProposalOutcome } from '../../shared/contracts/agent-proposals';

const WORKER_START_TIMEOUT_MS = 15_000;
const WRITING_TASK_TIMEOUT_MS = 5 * 60_000;
const MAX_WRITING_ARTIFACT_BYTES = 512 * 1024;
const SCRIBE_READ_TOOLS = [
  'read_novel_context',
] as const satisfies readonly AgentToolName[];

interface ActiveAgentRequest {
  cancelled: boolean;
  childTaskId?: string;
  draftSnapshot?: AgentDraftSnapshot;
  model: AgentModelSelection;
  modelsPath: string;
  ownerId: number;
  projectSessionId?: string;
  sendEvent: (event: AgentEvent) => void;
  thinkingLevel: AgentThinkingLevel;
  workingDirectory: string;
  writingTasks: number;
  writingArtifact?: {
    assignmentId: string;
    claimed: boolean;
    markdown: string;
    targetDocumentId: string | null;
  };
}

interface PendingWritingTask {
  bytes: number;
  markdown: string;
  parentRequestId: string;
  reject: (error: Error) => void;
  resolve: (result: AgentWritingAssignmentToolResult) => void;
  targetDocumentId: string | null;
  timeout: ReturnType<typeof setTimeout>;
}

interface StartAgentRequest {
  currentDocumentId?: string;
  draftSnapshot?: AgentDraftSnapshot;
  history: AgentHistoryMessage[];
  ownerId: number;
  projectSessionId?: string;
  prompt: string;
  model: AgentModelSelection;
  modelsPath?: string;
  proposalOutcomes: AgentProposalOutcome[];
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
  private readonly writingTasks = new Map<string, PendingWritingTask>();
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

    const directory = path.join(this.userDataPath, 'ai', 'pi');
    const active: ActiveAgentRequest = {
      cancelled: false,
      draftSnapshot: request.draftSnapshot,
      model: request.model,
      modelsPath: request.modelsPath ?? path.join(directory, 'models.json'),
      ownerId: request.ownerId,
      projectSessionId: request.projectSessionId,
      sendEvent: request.sendEvent,
      thinkingLevel: request.thinkingLevel,
      workingDirectory: directory,
      writingTasks: 0,
    };
    this.activeRequests.set(request.requestId, active);

    try {
      await mkdir(directory, { recursive: true });
      const worker = await this.getWorker();
      if (active.cancelled) throw new Error('Agent request was cancelled');
      active.sendEvent({ requestId: request.requestId, type: 'started' });
      worker.postMessage({
        authPath: path.join(directory, 'auth.json'),
        cwd: directory,
        enabledTools: [...AGENT_TOOL_NAMES],
        history: request.history,
        modelsPath: active.modelsPath,
        modelId: request.model.modelId,
        prompt: request.prompt,
        proposalOutcomes: request.proposalOutcomes,
        providerId: request.model.providerId,
        requestId: request.requestId,
        role: 'curator',
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

  async listModels(modelsPath?: string): Promise<AgentModelOption[]> {
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
        modelsPath: modelsPath ?? path.join(directory, 'models.json'),
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
    this.cancelWritingTask(active);
    return true;
  }

  disposeOwner(ownerId: number): void {
    for (const [requestId, active] of this.activeRequests) {
      if (active.ownerId !== ownerId) continue;
      active.cancelled = true;
      this.worker?.postMessage({ requestId, type: 'cancel' });
      this.cancelWritingTask(active);
      active.sendEvent({ requestId, type: 'cancelled' });
      this.activeRequests.delete(requestId);
      this.toolDispatcher?.release(requestId);
    }
    this.toolDispatcher?.disposeOwner(ownerId);
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
    const writingTask = this.writingTasks.get(message.requestId);
    if (writingTask !== undefined) {
      await this.handleWritingTaskMessage(message, writingTask);
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
              claimWritingArtifact: (assignmentId, targetDocumentId) => {
                const artifact = active.writingArtifact;
                if (
                  artifact === undefined ||
                  artifact.assignmentId !== assignmentId ||
                  artifact.targetDocumentId !== targetDocumentId ||
                  artifact.claimed
                ) return undefined;
                artifact.claimed = true;
                return artifact.markdown;
              },
              delegateWriting: (assignment) =>
                this.runWritingTask(message.requestId, active, assignment),
              sendProposal: (proposal) =>
                active.sendEvent({
                  proposal,
                  requestId: message.requestId,
                  type: 'proposal',
                }),
              releaseWritingArtifactClaim: (assignmentId) => {
                const artifact = active.writingArtifact;
                if (artifact?.assignmentId === assignmentId) {
                  artifact.claimed = false;
                }
              },
              storyChanged: (revision) =>
                active.sendEvent({
                  requestId: message.requestId,
                  revision,
                  type: 'story-changed',
                }),
            },
            message,
          );
      if (
        this.activeRequests.get(message.requestId) === active &&
        !active.cancelled &&
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

    if (message.type === 'tool-started' || message.type === 'tool-completed') {
      active.sendEvent({ ...message, agentRole: 'curator' });
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
    this.rejectWritingTasks('Agent runtime exited during Scribe task');
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
    this.rejectWritingTasks('Agent runtime configuration changed');
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

  private runWritingTask(
    parentRequestId: string,
    active: ActiveAgentRequest,
    assignment: AgentWritingAssignment,
  ): Promise<AgentWritingAssignmentToolResult> {
    if (
      active.cancelled ||
      active.writingTasks >= 1 ||
      active.childTaskId !== undefined ||
      this.worker === null
    ) {
      return Promise.reject(new Error('Scribe task is unavailable'));
    }
    active.writingTasks += 1;
    const taskId = `scribe-${randomUUID()}`;
    active.childTaskId = taskId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.worker?.postMessage({ requestId: taskId, type: 'cancel' });
        this.finishWritingTask(taskId, active);
        reject(new Error('Scribe task timed out'));
      }, WRITING_TASK_TIMEOUT_MS);
      this.writingTasks.set(taskId, {
        bytes: 0,
        markdown: '',
        parentRequestId,
        reject,
        resolve,
        targetDocumentId: assignment.targetDocumentId,
        timeout,
      });
      this.worker!.postMessage({
        authPath: path.join(active.workingDirectory, 'auth.json'),
        cwd: active.workingDirectory,
        enabledTools: [...SCRIBE_READ_TOOLS],
        history: [],
        modelId: active.model.modelId,
        modelsPath: active.modelsPath,
        prompt: [
          'Driftfield has assigned this bounded writing task:',
          JSON.stringify(assignment),
          'Produce only the requested Markdown draft.',
        ].join('\n'),
        proposalOutcomes: [],
        providerId: active.model.providerId,
        requestId: taskId,
        role: 'scribe',
        thinkingLevel: active.thinkingLevel,
        type: 'start',
      });
    });
  }

  private async handleWritingTaskMessage(
    message: Exclude<AgentWorkerMessage, { type: 'ready' }>,
    task: PendingWritingTask,
  ): Promise<void> {
    const active = this.activeRequests.get(task.parentRequestId);
    if (
      active === undefined ||
      active.cancelled ||
      !this.requestHasActiveProjectSession(active)
    ) {
      this.worker?.postMessage({ requestId: message.requestId, type: 'cancel' });
      this.finishWritingTask(message.requestId, active);
      task.reject(new Error('Scribe task became obsolete'));
      return;
    }
    if (message.type === 'text-delta') {
      const bytes = Buffer.byteLength(message.delta, 'utf8');
      if (task.bytes + bytes > MAX_WRITING_ARTIFACT_BYTES) {
        this.worker?.postMessage({ requestId: message.requestId, type: 'cancel' });
        this.finishWritingTask(message.requestId, active);
        task.reject(new Error('Scribe artifact exceeded its size limit'));
        return;
      }
      task.bytes += bytes;
      task.markdown += message.delta;
      return;
    }
    if (message.type === 'tool-request') {
      const toolAllowed = (SCRIBE_READ_TOOLS as readonly AgentToolName[])
        .includes(message.toolName);
      const result = !toolAllowed || this.toolDispatcher === undefined
        ? {
            error: {
              code: toolAllowed
                ? 'internal-error' as const
                : 'invalid-arguments' as const,
            },
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
              requestId: task.parentRequestId,
            },
            message,
          );
      if (this.writingTasks.has(message.requestId)) {
        this.worker?.postMessage({
          result,
          requestId: message.requestId,
          toolCallId: message.toolCallId,
          type: 'tool-result',
        });
      }
      return;
    }
    if (message.type === 'tool-started' || message.type === 'tool-completed') {
      active.sendEvent({
        ...message,
        agentRole: 'scribe',
        requestId: task.parentRequestId,
      });
      return;
    }
    if (message.type === 'completed') {
      if (task.markdown.trim().length === 0) {
        this.finishWritingTask(message.requestId, active);
        task.reject(new Error('Scribe returned an empty artifact'));
        return;
      }
      this.finishWritingTask(message.requestId, active);
      active.writingArtifact = {
        assignmentId: message.requestId,
        claimed: false,
        markdown: task.markdown,
        targetDocumentId: task.targetDocumentId,
      };
      task.resolve({
        assignmentId: message.requestId,
        markdown: task.markdown,
        status: 'completed',
      });
      return;
    }
    if (message.type === 'cancelled' || message.type === 'error') {
      this.finishWritingTask(message.requestId, active);
      task.reject(new Error('Scribe task did not complete'));
    }
  }

  private cancelWritingTask(active: ActiveAgentRequest): void {
    if (active.childTaskId === undefined) return;
    const taskId = active.childTaskId;
    const task = this.writingTasks.get(taskId);
    this.worker?.postMessage({ requestId: taskId, type: 'cancel' });
    this.finishWritingTask(taskId, active);
    task?.reject(new Error('Scribe task was cancelled'));
  }

  private finishWritingTask(
    taskId: string,
    active?: ActiveAgentRequest,
  ): void {
    const task = this.writingTasks.get(taskId);
    if (task !== undefined) clearTimeout(task.timeout);
    this.writingTasks.delete(taskId);
    if (active?.childTaskId === taskId) active.childTaskId = undefined;
  }

  private rejectWritingTasks(message: string): void {
    for (const [taskId, task] of this.writingTasks) {
      clearTimeout(task.timeout);
      task.reject(new Error(message));
      const active = this.activeRequests.get(task.parentRequestId);
      if (active?.childTaskId === taskId) active.childTaskId = undefined;
    }
    this.writingTasks.clear();
  }
}
