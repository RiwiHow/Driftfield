import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { AgentEvent } from '../../shared/contracts/agent';
import {
  AGENT_TOOL_NAMES,
  isAgentToolArguments,
  type AgentDraftSnapshot,
  type AgentDocumentDomain,
  type AgentToolName,
} from '../../shared/contracts/agent-tools';
import type {
  AgentWritingAssignment,
  AgentWritingTaskResult,
} from './agent-writing';
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
import type {
  AgentPromptProposalOutcome,
  AgentProposalOutcome,
} from '../../shared/contracts/agent-proposals';
import type { AppLanguage } from '../../shared/i18n/languages';
import { ProjectDatabase } from '../database/project-database';
import {
  ProjectReconciliationRepository,
  type StoryReconciliationJob,
  type StoryReconciliationOutcome,
} from '../database/project-reconciliation-repository';
import {
  validateManuscriptMarkdown,
  type ManuscriptMarkdownValidationCode,
} from '../services/project/manuscript-markdown-validator';

const WORKER_START_TIMEOUT_MS = 15_000;
const WRITING_TASK_TIMEOUT_MS = 5 * 60_000;
const MAX_WRITING_ARTIFACT_BYTES = 512 * 1024;
export const CURATOR_TOOLS = AGENT_TOOL_NAMES.filter(
  (toolName) => toolName !== 'submit_writing_artifact',
);
const CURATOR_TOOL_SET = new Set<AgentToolName>(CURATOR_TOOLS);
export const SCRIBE_TOOLS = [
  'bash',
  'submit_writing_artifact',
] as const satisfies readonly AgentToolName[];

interface ActiveAgentRequest {
  cancelled: boolean;
  childTaskId?: string;
  customInstructions: string;
  draftSnapshot?: AgentDraftSnapshot;
  model: AgentModelSelection;
  modelsPath: string;
  ownerId: number;
  projectSessionId?: string;
  reconciliation: {
    acceptedDocumentRead: boolean;
    applied: boolean;
    documentId?: string;
    documentRevision?: string;
    jobId?: string;
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
    documentAction: 'create' | 'replace';
    documentDomain: AgentDocumentDomain;
    markdown: string;
    parentRequestId: string;
    proposedDocumentId?: string;
    targetDocumentId: string | null;
    targetLength: number | null;
  };
}

interface PendingWritingTask {
  artifactMarkdown?: string;
  artifactSubmitted: boolean;
  artifactValidationCode?: ManuscriptMarkdownValidationCode;
  documentAction: 'create' | 'replace';
  documentDomain: AgentDocumentDomain;
  parentRequestId: string;
  reject: (error: Error) => void;
  resolve: (result: AgentWritingTaskResult) => void;
  targetDocumentId: string | null;
  targetLength: number | null;
  timeout: ReturnType<typeof setTimeout>;
}

interface StartAgentRequest {
  currentDocumentId?: string;
  customInstructions: string;
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
    private readonly getProjectDirectory?: (
      ownerId: number,
      projectSessionId: string,
    ) => string | undefined,
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
      customInstructions: request.customInstructions,
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
      this.restorePendingReconciliation(active);
      await mkdir(directory, { recursive: true });
      const worker = await this.getWorker();
      if (active.cancelled) throw new Error('Agent request was cancelled');
      active.sendEvent({ requestId: request.requestId, type: 'started' });
      worker.postMessage({
        authPath: path.join(directory, 'auth.json'),
        cwd: directory,
        customInstructions: request.customInstructions,
        enabledTools: [...CURATOR_TOOLS],
        history: request.history,
        modelsPath: active.modelsPath,
        modelId: request.model.modelId,
        prompt: request.prompt,
        proposalOutcomes: request.proposalOutcomes.map(toPromptProposalOutcome),
        providerId: request.model.providerId,
        reconciliationPending: active.reconciliation.pending,
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
      const result = !CURATOR_TOOL_SET.has(message.toolName)
        ? {
            error: {
              code: 'invalid-arguments' as const,
              detail: 'This tool is not enabled for the Curator role.',
            },
            ok: false as const,
            toolName: message.toolName,
          }
        : this.toolDispatcher === undefined
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
              ...(active.reconciliation.documentRevision === undefined
                ? {}
                : {
                    acceptedDocumentRevision:
                      active.reconciliation.documentRevision,
                  }),
              ownerId: active.ownerId,
              projectSessionId: active.projectSessionId,
              requestId: message.requestId,
              claimWritingArtifact: (
                assignmentId,
                documentAction,
                targetDocumentId,
                documentDomain,
              ) => {
                const artifact = active.writingArtifact;
                if (
                  artifact === undefined ||
                  artifact.assignmentId !== assignmentId ||
                  artifact.documentAction !== documentAction ||
                  artifact.targetDocumentId !== targetDocumentId ||
                  artifact.documentDomain !== documentDomain ||
                  artifact.claimed
                ) return undefined;
                artifact.claimed = true;
                return artifact.markdown;
              },
              completeStoryReconciliation: (status) =>
                this.completeStoryReconciliation(active, status),
              completeFocusedStoryReconciliation: () =>
                this.completeReconciliationJob(active, 'applied'),
              delegateWriting: (assignment, resolvedTargetDocumentId) => {
                if (active.reconciliation.pending) {
                  throw new ProjectContextError(
                    'invalid-arguments',
                    'Complete the pending accepted-Manuscript reconciliation before starting another writing assignment.',
                  );
                }
                if (active.writingTasks >= 1 || active.childTaskId !== undefined) {
                  throw new ProjectContextError(
                    'tool-budget-exceeded',
                    'Only one Scribe delegation is available per user request; do not retry delegation.',
                  );
                }
                return this.runWritingTask(
                  message.requestId,
                  active,
                  assignment,
                  resolvedTargetDocumentId,
                );
              },
              sendProposal: (proposal) => {
                if (
                  active.writingArtifact?.claimed === true &&
                  'documentId' in proposal &&
                  (!('operation' in proposal) || proposal.operation === 'create')
                ) {
                  active.writingArtifact.proposedDocumentId = proposal.documentId;
                }
                if (active.writingArtifact?.claimed === true) {
                  this.persistWritingArtifact(
                    active,
                    'proposed',
                    proposal.proposalId,
                    'documentId' in proposal
                      ? proposal.documentId
                      : active.writingArtifact.targetDocumentId,
                  );
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
    if (
      active.writingArtifact?.claimed === true &&
      (message.toolName === 'propose_document_edit' ||
        message.toolName === 'propose_document_writing' ||
        message.toolName === 'propose_document_file_operation')
    ) {
      const status = result.ok &&
        typeof result.data === 'object' && result.data !== null &&
        'status' in result.data && typeof result.data.status === 'string'
        ? result.data.status
        : null;
      if (status === 'accepted') {
        const job = this.acceptWritingArtifact(active);
        if (job !== null) this.setReconciliationJob(active, job);
      } else if (status !== null) {
        this.persistWritingArtifact(active, 'rejected');
      }
    }
    if (!result.ok) return;
    if (!active.reconciliation.pending) return;
    if (
      message.toolName === 'bash'
    ) {
      const command = (message.arguments as { command: string }).command;
      if (/\bACCEPTED\.(?:md|json)\b/.test(command)) {
        active.reconciliation.acceptedDocumentRead = true;
      }
      if (/\bSTORY\.json\b/.test(command)) {
        active.reconciliation.storyStateRead = true;
      }
      return;
    }
    if (
      message.toolName === 'maintain_story_records' ||
      message.toolName === 'reconcile_accepted_document'
    ) {
      active.reconciliation.applied = true;
      if (message.toolName === 'reconcile_accepted_document') {
        active.reconciliation.pending = false;
      }
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
      if (reconciliation.jobId !== undefined) return { ok: true };
      return {
        detail: 'No accepted Scribe-backed manuscript proposal is awaiting reconciliation.',
        ok: false,
      };
    }
    if (!reconciliation.acceptedDocumentRead || !reconciliation.storyStateRead) {
      return {
        detail: 'Inspect both ACCEPTED.md (or ACCEPTED.json) and STORY.json after acceptance before completing reconciliation.',
        ok: false,
      };
    }
    if (status === 'applied' && !reconciliation.applied) {
      return {
        detail: 'The applied status requires a successful story-record mutation after acceptance.',
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
    if (!this.completeReconciliationJob(active, status)) {
      return {
        detail: 'The durable story reconciliation job could not be completed.',
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
    resolvedTargetDocumentId: string | null,
  ): Promise<AgentWritingTaskResult> {
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
        artifactSubmitted: false,
        documentAction: assignment.documentAction,
        documentDomain: assignment.documentDomain,
        parentRequestId,
        reject,
        resolve,
        targetDocumentId: resolvedTargetDocumentId,
        targetLength: assignment.targetLength,
        timeout,
      });
      this.worker!.postMessage({
        authPath: path.join(active.workingDirectory, 'auth.json'),
        cwd: active.workingDirectory,
        customInstructions: active.customInstructions,
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
        reconciliationPending: false,
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
        const duplicate = task.artifactSubmitted;
        if (!duplicate) {
          task.artifactSubmitted = true;
          task.artifactMarkdown = message.arguments.markdown;
          const validation = validateManuscriptMarkdown(
            message.arguments.markdown,
            {
              maxBytes: MAX_WRITING_ARTIFACT_BYTES,
              targetLength: task.targetLength,
            },
          );
          if (!validation.ok) task.artifactValidationCode = validation.code;
          this.persistPendingWritingArtifact(active, message.requestId, task);
        }
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
            : task.artifactValidationCode === undefined
              ? {
                data: { status: 'submitted' as const },
                ok: true as const,
                toolName: message.toolName,
                }
              : {
                  error: {
                    code: 'invalid-arguments' as const,
                    detail: `The Scribe artifact was rejected: ${task.artifactValidationCode}.`,
                  },
                  ok: false as const,
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
      if (
        task.artifactMarkdown === undefined ||
        task.artifactValidationCode !== undefined
      ) {
        this.finishWritingTask(message.requestId, active);
        task.reject(new ProjectContextError(
          'invalid-arguments',
          task.artifactValidationCode === undefined
            ? 'Scribe did not submit a writing artifact'
            : `Scribe submitted an invalid writing artifact: ${task.artifactValidationCode}`,
        ));
        return;
      }
      this.finishWritingTask(message.requestId, active);
      active.writingArtifact = {
        assignmentId: message.requestId,
        claimed: false,
        documentAction: task.documentAction,
        documentDomain: task.documentDomain,
        markdown: task.artifactMarkdown,
        parentRequestId: task.parentRequestId,
        targetDocumentId: task.targetDocumentId,
        targetLength: task.targetLength,
      };
      task.resolve({
        assignmentId: message.requestId,
        characterCount: task.artifactMarkdown.length,
        documentAction: task.documentAction,
        documentDomain: task.documentDomain,
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

  private persistPendingWritingArtifact(
    active: ActiveAgentRequest,
    assignmentId: string,
    task: PendingWritingTask,
  ): void {
    if (
      active.projectSessionId === undefined ||
      task.artifactMarkdown === undefined ||
      this.getProjectDirectory === undefined
    ) return;
    const projectDirectory = this.getProjectDirectory(
      active.ownerId,
      active.projectSessionId,
    );
    if (projectDirectory === undefined) return;
    const now = new Date().toISOString();
    const database = new ProjectDatabase(projectDirectory);
    try {
      database.connection.prepare(`
        INSERT INTO writing_artifacts(
          artifact_id, request_id, target_document_id, state, markdown,
          validation_code, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(artifact_id) DO UPDATE SET
          state = excluded.state,
          markdown = excluded.markdown,
          validation_code = excluded.validation_code,
          updated_at = excluded.updated_at
      `).run(
        assignmentId,
        task.parentRequestId,
        task.targetDocumentId,
        task.artifactValidationCode === undefined ? 'validated' : 'invalid',
        task.artifactMarkdown,
        task.artifactValidationCode ?? null,
        now,
        now,
      );
    } finally {
      database.close();
    }
  }

  private persistWritingArtifact(
    active: ActiveAgentRequest,
    state: 'accepted' | 'proposed' | 'rejected' | 'validated',
    proposalId: string | null = null,
    proposedDocumentId: string | null = active.writingArtifact?.proposedDocumentId ?? null,
  ): void {
    const artifact = active.writingArtifact;
    if (
      artifact === undefined ||
      active.projectSessionId === undefined ||
      this.getProjectDirectory === undefined
    ) return;
    const projectDirectory = this.getProjectDirectory(
      active.ownerId,
      active.projectSessionId,
    );
    if (projectDirectory === undefined) return;
    const database = new ProjectDatabase(projectDirectory);
    try {
      database.connection.prepare(`
        UPDATE writing_artifacts
        SET state = ?, markdown = ?, target_document_id = ?,
            proposal_id = COALESCE(?, proposal_id),
            proposed_document_id = COALESCE(?, proposed_document_id),
            validation_code = NULL, updated_at = ?
        WHERE artifact_id = ? AND request_id = ?
      `).run(
        state,
        artifact.markdown,
        state === 'accepted'
          ? artifact.proposedDocumentId ?? artifact.targetDocumentId
          : artifact.targetDocumentId,
        proposalId,
        proposedDocumentId,
        new Date().toISOString(),
        artifact.assignmentId,
        artifact.parentRequestId,
      );
    } finally {
      database.close();
    }
  }

  private acceptWritingArtifact(
    active: ActiveAgentRequest,
  ): StoryReconciliationJob | null {
    const artifact = active.writingArtifact;
    if (
      artifact === undefined ||
      active.projectSessionId === undefined ||
      this.getProjectDirectory === undefined
    ) return null;
    const projectDirectory = this.getProjectDirectory(
      active.ownerId,
      active.projectSessionId,
    );
    if (projectDirectory === undefined) return null;
    const database = new ProjectDatabase(projectDirectory);
    try {
      return database.transaction(() => {
        const result = database.connection.prepare(`
          UPDATE writing_artifacts
          SET state = 'accepted', markdown = ?, target_document_id = ?,
              validation_code = NULL, updated_at = ?
          WHERE artifact_id = ? AND request_id = ?
        `).run(
          artifact.markdown,
          artifact.proposedDocumentId ?? artifact.targetDocumentId,
          new Date().toISOString(),
          artifact.assignmentId,
          artifact.parentRequestId,
        );
        if (result.changes !== 1) {
          throw new Error('Accepted writing artifact is missing');
        }
        return new ProjectReconciliationRepository(database)
          .ensureAcceptedArtifact(artifact.assignmentId);
      });
    } finally {
      database.close();
    }
  }

  private restorePendingReconciliation(active: ActiveAgentRequest): void {
    if (
      active.projectSessionId === undefined ||
      this.getProjectDirectory === undefined
    ) return;
    const projectDirectory = this.getProjectDirectory(
      active.ownerId,
      active.projectSessionId,
    );
    if (projectDirectory === undefined) return;
    const database = new ProjectDatabase(projectDirectory);
    try {
      this.setReconciliationJob(
        active,
        new ProjectReconciliationRepository(database).recoverPending(),
      );
    } finally {
      database.close();
    }
  }

  private setReconciliationJob(
    active: ActiveAgentRequest,
    job: StoryReconciliationJob | null,
  ): void {
    active.reconciliation = job === null
      ? {
          acceptedDocumentRead: false,
          applied: false,
          pending: false,
          questionsRecorded: false,
          storyStateRead: false,
        }
      : {
          acceptedDocumentRead: false,
          applied: false,
          documentId: job.documentId,
          documentRevision: job.documentRevision,
          jobId: job.id,
          pending: true,
          questionsRecorded: false,
          storyStateRead: false,
        };
  }

  private completeReconciliationJob(
    active: ActiveAgentRequest,
    outcome: StoryReconciliationOutcome,
  ): boolean {
    if (active.reconciliation.jobId === undefined) return false;
    if (
      active.projectSessionId === undefined ||
      this.getProjectDirectory === undefined
    ) return false;
    const projectDirectory = this.getProjectDirectory(
      active.ownerId,
      active.projectSessionId,
    );
    if (projectDirectory === undefined) return false;
    const database = new ProjectDatabase(projectDirectory);
    try {
      return new ProjectReconciliationRepository(database).complete(
        active.reconciliation.jobId,
        outcome,
      );
    } finally {
      database.close();
    }
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

const toPromptProposalOutcome = ({
  operation,
  status,
  targetTitle,
}: AgentProposalOutcome): AgentPromptProposalOutcome => ({
  operation,
  status,
  targetTitle,
});
