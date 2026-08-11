import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentEvent } from '../../shared/contracts/agent';
import {
  AGENT_TOOL_NAMES,
  isAgentToolArguments,
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
import { ProjectContextError } from './project-context-service';
import type { AgentHistoryMessage } from '../services/agent/conversation-service';
import type { AgentProposalOutcome } from '../../shared/contracts/agent-proposals';
import type { AppLanguage } from '../../shared/i18n/languages';

const WORKER_START_TIMEOUT_MS = 15_000;
const WRITING_TASK_TIMEOUT_MS = 5 * 60_000;
const MAX_WRITING_ARTIFACT_BYTES = 512 * 1024;
const CURATOR_TOOLS = AGENT_TOOL_NAMES.filter(
  (toolName) => toolName !== 'submit_writing_artifact',
);
const SCRIBE_TOOLS = [
  'read_novel_context',
  'submit_writing_artifact',
] as const satisfies readonly AgentToolName[];

interface ActiveAgentRequest {
  cancelled: boolean;
  childTaskId?: string;
  draftSnapshot?: AgentDraftSnapshot;
  model: AgentModelSelection;
  modelsPath: string;
  ownerId: number;
  projectSessionId?: string;
  reconciliation: {
    acceptedDocumentRead: boolean;
    applied: boolean;
    documentId?: string;
    pending: boolean;
    questionsRecorded: boolean;
    storyStateRead: boolean;
  };
  responseLanguage: AppLanguage;
  sendEvent: (event: AgentEvent) => void;
  thinkingLevel: AgentThinkingLevel;
  workingDirectory: string;
  writingTasks: number;
  writingArtifact?: {
    assignmentId: string;
    claimed: boolean;
    markdown: string;
    revised: boolean;
    targetDocumentId: string | null;
  };
}

interface PendingWritingTask {
  artifactMarkdown?: string;
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
  responseLanguage: AppLanguage;
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
      reconciliation: {
        acceptedDocumentRead: false,
        applied: false,
        pending: false,
        questionsRecorded: false,
        storyStateRead: false,
      },
      responseLanguage: request.responseLanguage,
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
        enabledTools: [...CURATOR_TOOLS],
        history: request.history,
        modelsPath: active.modelsPath,
        modelId: request.model.modelId,
        prompt: request.prompt,
        proposalOutcomes: request.proposalOutcomes,
        providerId: request.model.providerId,
        requestId: request.requestId,
        responseLanguage: request.responseLanguage,
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
              ...(active.reconciliation.documentId === undefined
                ? {}
                : { acceptedDocumentId: active.reconciliation.documentId }),
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
              completeStoryReconciliation: (status) =>
                this.completeStoryReconciliation(active, status),
              delegateWriting: (assignment) => {
                if (active.writingTasks >= 1 || active.childTaskId !== undefined) {
                  throw new ProjectContextError(
                    'tool-budget-exceeded',
                    'Only one Scribe delegation is available per user request. Revise an unclaimed completed artifact with revise_writing_artifact; do not retry delegation.',
                  );
                }
                return this.runWritingTask(message.requestId, active, assignment);
              },
              sendProposal: (proposal) => {
                if (
                  active.writingArtifact?.claimed === true &&
                  'documentId' in proposal &&
                  (!('operation' in proposal) || proposal.operation === 'create')
                ) {
                  active.reconciliation.documentId = proposal.documentId;
                }
                active.sendEvent({
                  proposal,
                  requestId: message.requestId,
                  type: 'proposal',
                });
              },
              releaseWritingArtifactClaim: (assignmentId) => {
                const artifact = active.writingArtifact;
                if (artifact?.assignmentId === assignmentId) {
                  artifact.claimed = false;
                }
              },
              reviseWritingArtifact: (assignmentId, replacements) => {
                const artifact = active.writingArtifact;
                if (
                  artifact === undefined ||
                  artifact.assignmentId !== assignmentId ||
                  artifact.claimed ||
                  artifact.revised
                ) {
                  return {
                    detail:
                      'The writingAssignmentId is missing, belongs to another request, was already used, or was already revised.',
                    ok: false as const,
                  };
                }
                let markdown = artifact.markdown;
                let replacementsApplied = 0;
                for (const [index, replacement] of replacements.entries()) {
                  const occurrences = countExactOccurrences(markdown, replacement.find);
                  if (occurrences !== replacement.expectedOccurrences) {
                    return {
                      detail:
                        `Replacement ${index + 1} expected ${replacement.expectedOccurrences} occurrence(s) but found ${occurrences}; no changes were applied.`,
                      ok: false as const,
                    };
                  }
                  markdown = markdown.split(replacement.find).join(replacement.replace);
                  replacementsApplied += occurrences;
                }
                if (Buffer.byteLength(markdown, 'utf8') > MAX_WRITING_ARTIFACT_BYTES) {
                  return {
                    detail: 'The revised Scribe artifact exceeds the size limit; no changes were applied.',
                    ok: false as const,
                  };
                }
                artifact.markdown = markdown;
                artifact.revised = true;
                return {
                  ok: true as const,
                  result: {
                    assignmentId,
                    replacementsApplied,
                    status: 'revised' as const,
                  },
                };
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
      this.observeToolResult(active, message, result);
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

    if (message.type === 'completed' && active.reconciliation.pending) {
      active.sendEvent({
        code: 'workflow-incomplete',
        requestId: message.requestId,
        stopReason: message.stopReason,
        type: 'error',
      });
    } else {
      active.sendEvent(message);
    }
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

  private observeToolResult(
    active: ActiveAgentRequest,
    message: Extract<AgentWorkerMessage, { type: 'tool-request' }>,
    result: import('../../shared/contracts/agent-tools').AgentToolExecutionResult,
  ): void {
    if (!result.ok) return;
    if (
      (message.toolName === 'propose_document_edit' ||
        message.toolName === 'propose_document_file_operation') &&
      isAgentToolArguments(message.toolName, message.arguments) &&
      'writingAssignmentId' in message.arguments &&
      message.arguments.writingAssignmentId !== null &&
      isAcceptedProposalResult(result)
    ) {
      active.reconciliation = {
        acceptedDocumentRead: false,
        applied: false,
        ...(active.reconciliation.documentId === undefined
          ? {}
          : { documentId: active.reconciliation.documentId }),
        pending: true,
        questionsRecorded: false,
        storyStateRead: false,
      };
      return;
    }
    if (
      (message.toolName === 'propose_document_edit' ||
        message.toolName === 'propose_document_file_operation') &&
      isAgentToolArguments(message.toolName, message.arguments) &&
      'writingAssignmentId' in message.arguments &&
      message.arguments.writingAssignmentId !== null
    ) {
      active.reconciliation.documentId = undefined;
      return;
    }
    if (!active.reconciliation.pending) return;
    if (
      message.toolName === 'read_novel_context' &&
      isAgentToolArguments(message.toolName, message.arguments)
    ) {
      if (message.arguments.include.includes('accepted_reconciliation')) {
        active.reconciliation.acceptedDocumentRead = true;
        active.reconciliation.storyStateRead = true;
        return;
      }
      if (message.arguments.include.includes('story_state')) {
        active.reconciliation.storyStateRead = true;
      }
      if (
        active.reconciliation.documentId !== undefined &&
        message.arguments.documentIds.includes(active.reconciliation.documentId)
      ) {
        active.reconciliation.acceptedDocumentRead = true;
      }
      return;
    }
    if (
      message.toolName === 'maintain_story_records' ||
      message.toolName === 'reconcile_accepted_document'
    ) {
      active.reconciliation.applied = true;
      return;
    }
    if (message.toolName === 'record_story_question') {
      active.reconciliation.questionsRecorded = true;
    }
  }

  private completeStoryReconciliation(
    active: ActiveAgentRequest,
    status: 'applied' | 'no_changes' | 'questions_recorded',
  ): { detail?: string; ok: boolean } {
    const reconciliation = active.reconciliation;
    if (!reconciliation.pending) {
      return {
        detail: 'No accepted Scribe-backed manuscript proposal is awaiting reconciliation.',
        ok: false,
      };
    }
    if (!reconciliation.acceptedDocumentRead || !reconciliation.storyStateRead) {
      return {
        detail: 'Read both the accepted persisted document and current story_state after acceptance before completing reconciliation.',
        ok: false,
      };
    }
    if (status === 'applied' && !reconciliation.applied) {
      return {
        detail: 'The applied status requires a successful maintain_story_records call after acceptance.',
        ok: false,
      };
    }
    if (status === 'questions_recorded' && !reconciliation.questionsRecorded) {
      return {
        detail: 'The questions_recorded status requires a successful record_story_question call after acceptance.',
        ok: false,
      };
    }
    if (
      status === 'no_changes' &&
      (reconciliation.applied || reconciliation.questionsRecorded)
    ) {
      return {
        detail: 'Use applied or questions_recorded after changing story records.',
        ok: false,
      };
    }
    reconciliation.pending = false;
    return { ok: true };
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
        parentRequestId,
        reject,
        resolve,
        targetDocumentId: assignment.targetDocumentId,
        timeout,
      });
      this.worker!.postMessage({
        authPath: path.join(active.workingDirectory, 'auth.json'),
        cwd: active.workingDirectory,
        enabledTools: [...SCRIBE_TOOLS],
        history: [],
        modelId: active.model.modelId,
        modelsPath: active.modelsPath,
        prompt: [
          'Driftfield has assigned this bounded writing task:',
          JSON.stringify(assignment),
          'Submit the complete requested Markdown exactly once through submit_writing_artifact. Ordinary assistant text is not part of the draft.',
        ].join('\n'),
        proposalOutcomes: [],
        providerId: active.model.providerId,
        requestId: taskId,
        responseLanguage: active.responseLanguage,
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
    if (message.type === 'text-delta') return;
    if (message.type === 'tool-request') {
      if (message.toolName === 'submit_writing_artifact') {
        if (!isAgentToolArguments(message.toolName, message.arguments)) {
          this.worker?.postMessage({
            requestId: message.requestId,
            result: {
              error: { code: 'invalid-arguments' as const },
              ok: false as const,
              toolName: message.toolName,
            },
            toolCallId: message.toolCallId,
            type: 'tool-result',
          });
          return;
        }
        const duplicate = task.artifactMarkdown !== undefined;
        if (!duplicate) task.artifactMarkdown = message.arguments.markdown;
        this.worker?.postMessage({
          requestId: message.requestId,
          result: duplicate
            ? {
                error: {
                  code: 'invalid-arguments' as const,
                  detail: 'The Scribe artifact was already submitted.',
                },
                ok: false as const,
                toolName: message.toolName,
              }
            : {
                data: { status: 'submitted' as const },
                ok: true as const,
                toolName: message.toolName,
              },
          toolCallId: message.toolCallId,
          type: 'tool-result',
        });
        return;
      }
      const toolAllowed = (SCRIBE_TOOLS as readonly AgentToolName[])
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
      if (task.artifactMarkdown === undefined) {
        this.finishWritingTask(message.requestId, active);
        task.reject(new Error('Scribe did not submit a writing artifact'));
        return;
      }
      this.finishWritingTask(message.requestId, active);
      active.writingArtifact = {
        assignmentId: message.requestId,
        claimed: false,
        markdown: task.artifactMarkdown,
        revised: false,
        targetDocumentId: task.targetDocumentId,
      };
      task.resolve({
        assignmentId: message.requestId,
        markdown: task.artifactMarkdown,
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

const countExactOccurrences = (source: string, find: string): number => {
  let count = 0;
  let offset = 0;
  while (offset <= source.length - find.length) {
    const index = source.indexOf(find, offset);
    if (index === -1) break;
    count += 1;
    offset = index + find.length;
  }
  return count;
};

const isAcceptedProposalResult = (
  result: unknown,
): boolean => typeof result === 'object' && result !== null &&
  'ok' in result && result.ok === true && 'data' in result &&
  typeof result.data === 'object' && result.data !== null &&
  'status' in result.data && result.data.status === 'accepted';
