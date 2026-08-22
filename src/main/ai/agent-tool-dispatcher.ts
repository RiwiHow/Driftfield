import type {
  AgentAcceptedDocumentReconciliationArguments,
  AgentDraftSnapshot,
  AgentDocumentDomain,
  AgentProjectStructureOperationArguments,
  AgentToolExecutionResult,
  AgentToolFailureResult,
  AgentToolContractMap,
  AgentToolName,
  AgentToolRequest,
  AgentToolSuccessResult,
  AgentStoryMaintenanceChange,
  AgentStoryOperationInput,
  AgentCanonicalStoryQuestionArguments,
} from '../../shared/contracts/agent-tools';
import type {
  AgentWritingAssignment,
  AgentWritingTaskResult,
} from './agent-writing';
import {
  ACCEPTED_DOCUMENT_PATH,
  AGENT_STORY_CONTEXT_PATH,
  agentToolArgumentHint,
  isAgentToolRequest,
  isLongRunningAgentTool,
} from '../../shared/contracts/agent-tools';
import {
  ProjectContextError,
  type AgentBashAcceptedDocument,
  type AgentProjectBashExecution,
  type ProjectContextService,
} from './project-context-service';
import type {
  AgentProposalDecision,
  AgentProposalService,
  ResolvedDocumentFileOperationArguments,
  ResolvedProjectStructureOperationArguments,
} from './agent-proposal-service';
import type {
  AgentCreateDocumentProposal,
  AgentEditProposal,
  AgentProposal,
} from '../../shared/contracts/agent-proposals';
import type { ProjectStorySnapshot } from '../../shared/contracts/project-story';
import { contentRevision } from '../services/project/document-utils';

export interface AgentToolScope {
  acceptedDocumentId?: string;
  acceptedDocumentRevision?: string;
  claimWritingArtifact?: (
    assignmentId: string,
    documentAction: 'create' | 'replace',
    targetDocumentId: string | null,
    documentDomain: AgentDocumentDomain,
  ) => string | undefined;
  completeStoryReconciliation?: (
    status: 'applied' | 'no_changes' | 'questions_recorded',
  ) => { detail?: string; ok: boolean };
  completeFocusedStoryReconciliation?: () => boolean;
  delegateWriting?: (
    assignment: AgentWritingAssignment,
    resolvedTargetDocumentId: string | null,
  ) => Promise<AgentWritingTaskResult>;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
  releaseWritingArtifactClaim?: (assignmentId: string) => void;
  sendProposal?: (proposal: AgentProposal) => void;
  storyChanged?: (revision: number) => void;
}

export interface AgentToolPolicy {
  maxCalls: number;
  maxResultBytes: number;
  maxTotalResultBytes: number;
  timeoutMs: number;
}

export const DEFAULT_AGENT_TOOL_POLICY: AgentToolPolicy = {
  maxCalls: 24,
  maxResultBytes: 640 * 1024,
  maxTotalResultBytes: 4 * 1024 * 1024,
  timeoutMs: 15_000,
};

const MUTATING_TOOL_RESULT_RESERVATION_BYTES = 2 * 1024;

/** Gives an exhausted request a terminating instruction instead of a retry loop. */
const BUDGET_EXHAUSTED_EXIT_DETAIL =
  'This request has no tool budget left. Stop calling tools and answer the user with what you already have, stating plainly what remains undone.';

interface RequestBudget {
  calls: number;
  resultBytes: number;
}

interface ReconciliationRegistry {
  acceptedDocumentId: string;
  acceptedDocumentRevision: string;
  acceptedDocumentTitle: string;
  beatOrderKeys: Map<string, number>;
  momentOrderKey: number;
  personaIds: Map<string, string>;
  primaryTimelineId: string | null;
  storyRevision: number;
  threadOrderKey: number;
  threadIds: Map<string, string>;
  threadStatuses: Map<string, import('../../shared/contracts/project-story').ThreadStatus>;
}

export class AgentToolDispatcher {
  private readonly budgets = new Map<string, RequestBudget>();
  private readonly bashSnapshots = new Map<string, AgentProjectBashExecution>();
  private readonly reconciliationRegistries = new Map<string, ReconciliationRegistry>();

  constructor(
    private readonly context: ProjectContextService,
    private readonly policy: AgentToolPolicy = DEFAULT_AGENT_TOOL_POLICY,
    private readonly proposals?: AgentProposalService,
  ) {}

  async execute(
    scope: AgentToolScope,
    request: { arguments: unknown; toolName: AgentToolName },
  ): Promise<AgentToolExecutionResult> {
    const budget = this.budgets.get(scope.requestId) ?? {
      calls: 0,
      resultBytes: 0,
    };
    if (budget.calls >= this.policy.maxCalls) {
      return this.error(
        request.toolName,
        'tool-budget-exceeded',
        BUDGET_EXHAUSTED_EXIT_DETAIL,
      );
    }
    budget.calls += 1;
    this.budgets.set(scope.requestId, budget);

    if (!isAgentToolRequest(request)) {
      return this.error(
        request.toolName,
        'invalid-arguments',
        agentToolArgumentHint(request.toolName, request.arguments),
      );
    }

    const mutating = request.toolName !== 'bash';
    if (
      mutating &&
      (MUTATING_TOOL_RESULT_RESERVATION_BYTES > this.policy.maxResultBytes ||
        budget.resultBytes + MUTATING_TOOL_RESULT_RESERVATION_BYTES >
          this.policy.maxTotalResultBytes)
    ) {
      return this.error(
        request.toolName,
        'tool-budget-exceeded',
        BUDGET_EXHAUSTED_EXIT_DETAIL,
      );
    }

    try {
      const operation = this.executeValidated(scope, request);
      const result = isLongRunningAgentTool(request.toolName)
        ? await operation
        : await this.withTimeout(operation);
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
      if (
        !mutating &&
        (bytes > this.policy.maxResultBytes ||
          budget.resultBytes + bytes > this.policy.maxTotalResultBytes)
      ) {
        return this.error(
          request.toolName,
          'tool-budget-exceeded',
          BUDGET_EXHAUSTED_EXIT_DETAIL,
        );
      }
      budget.resultBytes += bytes;
      return result;
    } catch (error) {
      if (error instanceof ProjectContextError) {
        return this.error(request.toolName, error.code, error.detail);
      }
      if (error instanceof ToolTimeoutError) return this.error(request.toolName, 'tool-timeout');
      return this.error(request.toolName, 'internal-error');
    }
  }

  release(requestId: string): void {
    this.budgets.delete(requestId);
    this.bashSnapshots.delete(requestId);
    this.reconciliationRegistries.delete(requestId);
    this.proposals?.cancelRequest(requestId);
  }

  private async executeValidated(
    scope: AgentToolScope,
    request: AgentToolRequest,
  ): Promise<AgentToolSuccessResult> {
    const contextScope = {
      ...(scope.draftSnapshot === undefined ? {} : { draftSnapshot: scope.draftSnapshot }),
      ownerId: scope.ownerId,
      projectSessionId: scope.projectSessionId,
    };
    if (request.toolName === 'bash') {
      const execution = await this.context.executeProjectBash(
        contextScope,
        request.arguments.command,
        scope.acceptedDocumentId,
      );
      if (
        execution.acceptedDocument !== undefined &&
        scope.acceptedDocumentRevision !== undefined &&
        execution.acceptedDocument.contentRevision !== scope.acceptedDocumentRevision
      ) {
        throw new ProjectContextError(
          'proposal-base-changed',
          'The accepted manuscript changed before reconciliation.',
        );
      }
      this.bashSnapshots.set(scope.requestId, execution);
      if (execution.acceptedDocument !== undefined && execution.story !== null) {
        this.buildReconciliationContext(
          scope.requestId,
          execution.acceptedDocument,
          execution.story,
        );
      }
      return { data: execution.result, ok: true, toolName: request.toolName };
    }
    if (request.toolName === 'maintain_story_records') {
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const changes = request.arguments.changes.map((change) => {
        const clientRef = 'clientRef' in change ? change.clientRef : undefined;
        const operation = { ...change } as AgentStoryOperationInput & {
          clientRef?: string;
        };
        delete operation.clientRef;
        const resolved = resolveStoryOperation(snapshot, operation);
        return clientRef === undefined ? resolved : { ...resolved, clientRef };
      }) as AgentStoryMaintenanceChange[];
      const data = await this.context.maintainStoryRecords(
        contextScope,
        scope.requestId,
        requireStoryRevision(snapshot),
        changes,
      );
      this.bashSnapshots.delete(scope.requestId);
      scope.storyChanged?.(data.revision);
      return {
        data,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'reconcile_accepted_document') {
      const registry = this.reconciliationRegistries.get(scope.requestId);
      if (
        registry === undefined ||
        scope.acceptedDocumentId === undefined ||
        registry.acceptedDocumentId !== scope.acceptedDocumentId
      ) {
        throw new ProjectContextError(
          'invalid-arguments',
          `Inspect ${ACCEPTED_DOCUMENT_PATH} and ${AGENT_STORY_CONTEXT_PATH} with Bash after the manuscript proposal is accepted.`,
        );
      }
      const changes = buildAcceptedDocumentChanges(
        registry,
        request.arguments,
      );
      const data = await this.context.maintainStoryRecords(
        contextScope,
        scope.requestId,
        registry.storyRevision,
        changes,
      );
      this.bashSnapshots.delete(scope.requestId);
      if (scope.completeFocusedStoryReconciliation?.() !== true) {
        throw new ProjectContextError(
          'internal-error',
          'The durable story reconciliation job could not be completed.',
        );
      }
      scope.storyChanged?.(data.revision);
      return {
        data: { ...data, reconciliationStatus: 'complete' },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'complete_story_reconciliation') {
      if (scope.completeStoryReconciliation === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const outcome = scope.completeStoryReconciliation(request.arguments.status);
      if (!outcome.ok) {
        throw new ProjectContextError(
          'invalid-arguments',
          outcome.detail ?? 'Story reconciliation cannot be completed yet.',
        );
      }
      return {
        data: { status: 'complete' },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'record_story_question') {
      const input = resolveStoryQuestionArguments(
        requireBashSnapshot(this.bashSnapshots, scope.requestId),
        scope,
        this.reconciliationRegistries.get(scope.requestId),
        request.arguments,
      );
      const data = this.context.recordStoryQuestion(
        contextScope,
        scope.requestId,
        input,
      );
      this.bashSnapshots.delete(scope.requestId);
      scope.storyChanged?.(data.revision);
      return {
        data,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'resolve_story_question') {
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      if (
        snapshot.story === null ||
        !snapshot.story.questions.some(({ id, status }) =>
          id === request.arguments.questionId && status === 'open')
      ) {
        throw new ProjectContextError(
          'invalid-arguments',
          `Unknown open story question ID: ${request.arguments.questionId}`,
        );
      }
      const data = this.context.resolveStoryQuestion(
        contextScope,
        request.arguments.questionId,
        request.arguments.answer,
      );
      this.bashSnapshots.delete(scope.requestId);
      scope.storyChanged?.(data.revision);
      return {
        data,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_writing') {
      if (
        this.proposals === undefined ||
        scope.delegateWriting === undefined ||
        scope.sendProposal === undefined
      ) {
        throw new ProjectContextError('internal-error');
      }
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const isCreate = request.arguments.documentAction === 'create';
      const target = isCreate
        ? null
        : requireDocumentPath(snapshot, request.arguments.documentPath!);
      const parent = isCreate
        ? requireDirectoryPath(snapshot, request.arguments.parentPath!)
        : null;
      if (isCreate) {
        if (
          documentDomainForDirectoryKind(parent!.kind) !==
            request.arguments.documentDomain ||
          documentDomainForKind(request.arguments.kind!) !==
            request.arguments.documentDomain
        ) {
          throw new ProjectContextError(
            'invalid-arguments',
            'The create target directory, document kind, and writing domain must match.',
          );
        }
      } else {
        if (documentDomainForKind(target!.kind) !== request.arguments.documentDomain) {
          throw new ProjectContextError(
            'invalid-arguments',
            'The replacement target and writing domain must match.',
          );
        }
        if (
          scope.draftSnapshot === undefined ||
          scope.draftSnapshot.documentId !== target!.documentId ||
          scope.draftSnapshot.baseRevision !== target!.baseRevision ||
          contentRevision(scope.draftSnapshot.markdown) !== target!.contentRevision
        ) {
          throw new ProjectContextError(
            'proposal-base-changed',
            'The replacement target is not the unchanged request-start document.',
          );
        }
      }
      const assignment: AgentWritingAssignment = {
        documentAction: request.arguments.documentAction,
        documentDomain: request.arguments.documentDomain,
        objective: request.arguments.objective,
        requirements: request.arguments.requirements,
        targetDocumentPath: request.arguments.documentPath,
        targetLength: request.arguments.targetLength,
      };
      const targetDocumentId = target?.documentId ?? null;
      const artifact = await scope.delegateWriting(assignment, targetDocumentId);
      const content = claimWritingArtifact(
        scope,
        artifact.assignmentId,
        request.arguments.documentAction,
        targetDocumentId,
        request.arguments.documentDomain,
      );
      let proposal: AgentCreateDocumentProposal | AgentEditProposal;
      try {
        if (isCreate) {
          const createdProposal = await this.buildProposal(
            scope,
            this.proposals.createFileOperation(scope, {
              kind: request.arguments.kind!,
              markdown: content.markdown,
              metadataTitle: request.arguments.metadataTitle!,
              operation: 'create',
              parentId: parent!.directoryId,
              projectRevision: snapshot.projectRevision,
            }),
          );
          if (createdProposal.operation !== 'create') {
            throw new ProjectContextError('internal-error');
          }
          proposal = createdProposal;
        } else {
          proposal = this.proposals.create(scope, {
            baseContentRevision: target!.contentRevision,
            baseRevision: target!.baseRevision,
            documentId: target!.documentId,
            markdown: content.markdown,
          });
        }
      } catch (error) {
        content.release();
        throw error;
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      const result = exposeProposalResult(await decision);
      this.bashSnapshots.delete(scope.requestId);
      return { data: result, ok: true, toolName: request.toolName };
    }
    if (request.toolName === 'propose_document_edit') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const target = requireDocumentPath(snapshot, request.arguments.documentPath);
      const proposal = this.proposals.create(scope, {
        baseContentRevision: target.contentRevision,
        baseRevision: target.baseRevision,
        documentId: target.documentId,
        markdown: request.arguments.markdown,
      });
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      const result = exposeProposalResult(await decision);
      this.bashSnapshots.delete(scope.requestId);
      return { data: result, ok: true, toolName: request.toolName };
    }
    if (request.toolName === 'propose_document_file_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const resolvedRequest = ((): ResolvedDocumentFileOperationArguments => {
        if (request.arguments.operation === 'create') {
          const parent = requireDirectoryPath(snapshot, request.arguments.parentPath);
          return {
            kind: request.arguments.kind,
            markdown: request.arguments.markdown,
            operation: request.arguments.operation,
            parentId: parent.directoryId,
            projectRevision: snapshot.projectRevision,
            metadataTitle: request.arguments.metadataTitle,
          };
        }
        const document = requireDocumentPath(snapshot, request.arguments.documentPath);
        return {
          baseRevision: document.baseRevision,
          documentId: document.documentId,
          operation: 'delete',
          projectRevision: snapshot.projectRevision,
        };
      })();
      const proposal = await this.buildProposal(
        scope,
        this.proposals.createFileOperation(scope, resolvedRequest),
      );
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      const result = exposeProposalResult(await decision);
      this.bashSnapshots.delete(scope.requestId);
      return {
        data: result,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_project_structure_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const operation = resolveStructureOperation(snapshot, request.arguments);
      const proposal = await this.buildProposal(
        scope,
        this.proposals.createStructureOperation(scope, operation),
      );
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      const result = exposeProposalResult(await decision);
      this.bashSnapshots.delete(scope.requestId);
      return {
        data: result,
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_story_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const snapshot = requireBashSnapshot(this.bashSnapshots, scope.requestId);
      const proposal = this.proposals.createStoryOperation(
        scope,
        {
          change: resolveStoryOperation(snapshot, request.arguments.change),
          storyRevision: requireStoryRevision(snapshot),
        },
      );
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      const result = exposeProposalResult(await decision);
      this.bashSnapshots.delete(scope.requestId);
      return {
        data: result,
        ok: true,
        toolName: request.toolName,
      };
    }
    throw new ProjectContextError('internal-error');
  }

  private buildReconciliationContext(
    requestId: string,
    acceptedDocument: AgentBashAcceptedDocument,
    story: ProjectStorySnapshot,
  ): void {
    const primaryTimeline = story.timelines.find(({ isPrimary }) => isPrimary) ?? null;
    const personaIds = new Map(story.personae.map(({ id }) => [id, id]));
    const threadIds = new Map(story.threads.map(({ id }) => [id, id]));
    const threadStatuses = new Map(
      story.threads.map(({ id, status }) => [id, status]),
    );
    const beatOrderKeys = new Map<string, number>();
    for (const thread of story.threads) {
      beatOrderKeys.set(
        thread.id,
        story.beats
          .filter(({ threadId }) => threadId === thread.id)
          .reduce((maximum, beat) => Math.max(maximum, beat.orderKey), -1),
      );
    }
    this.reconciliationRegistries.set(requestId, {
      acceptedDocumentId: acceptedDocument.documentId,
      acceptedDocumentRevision: acceptedDocument.contentRevision,
      acceptedDocumentTitle: acceptedDocument.displayTitle,
      beatOrderKeys,
      momentOrderKey: primaryTimeline === null
        ? -1
        : story.moments
            .filter(({ timelineId }) => timelineId === primaryTimeline.id)
            .reduce((maximum, moment) => Math.max(maximum, moment.orderKey), -1),
      personaIds,
      primaryTimelineId: primaryTimeline?.id ?? null,
      storyRevision: story.revision,
      threadOrderKey: story.threads.reduce(
        (maximum, thread) => Math.max(maximum, thread.orderKey),
        -1,
      ),
      threadIds,
      threadStatuses,
    });
  }
  disposeOwner(ownerId: number): void {
    this.proposals?.disposeOwner(ownerId);
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new ToolTimeoutError()), this.policy.timeoutMs);
      operation.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  /**
   * A timed-out build keeps running, so a proposal can still appear after the
   * model was told the call failed. Abandon that orphan instead of leaving it
   * pending with nobody waiting on its decision.
   */
  private async buildProposal<T extends { proposalId: string }>(
    scope: AgentToolScope,
    operation: Promise<T>,
  ): Promise<T> {
    try {
      return await this.withTimeout(operation);
    } catch (error) {
      if (error instanceof ToolTimeoutError) {
        void operation.then(
          (proposal) => this.proposals?.abandon(scope.requestId, proposal.proposalId),
          () => {},
        );
      }
      throw error;
    }
  }

  private error<Name extends AgentToolName>(
    toolName: Name,
    code: Extract<AgentToolExecutionResult, { ok: false }>['error']['code'],
    detail?: string,
  ): AgentToolFailureResult<Name> {
    return {
      error: { code, ...(detail === undefined ? {} : { detail }) },
      ok: false,
      toolName,
    } as AgentToolFailureResult<Name>;
  }
}

const buildAcceptedDocumentChanges = (
  registry: ReconciliationRegistry,
  input: AgentAcceptedDocumentReconciliationArguments,
): AgentStoryMaintenanceChange[] => {
  if (
    registry.primaryTimelineId !== null &&
    input.primaryTimeline !== undefined
  ) {
    throw new ProjectContextError(
      'invalid-arguments',
      `primaryTimeline is valid only when ${AGENT_STORY_CONTEXT_PATH} has no primary timeline.`,
    );
  }
  const newPersonaRefs = new Map<string, string>();
  const changes: AgentStoryMaintenanceChange[] = input.newPersonae.map(
    (persona, index) => {
      const internalRef = `accepted_persona_${index + 1}`;
      newPersonaRefs.set(persona.clientRef, `@${internalRef}`);
      return {
        clientRef: internalRef,
        name: persona.name,
        operation: 'create_persona',
        role: persona.role,
        summary: persona.summary,
      };
    },
  );
  let timelineId = registry.primaryTimelineId;
  if (timelineId === null) {
    const timeline = input.primaryTimeline ?? {
      summary: '',
      title: 'Main timeline',
    };
    changes.push({
      clientRef: 'accepted_timeline',
      isPrimary: true,
      operation: 'create_timeline',
      summary: timeline.summary,
      title: timeline.title,
    });
    timelineId = '@accepted_timeline';
  }
  const event = input.events[0];
  const participants = event.participants.map((participant) => {
    const personaId = participant.personaId.startsWith('@')
      ? newPersonaRefs.get(participant.personaId.slice(1))
      : registry.personaIds.get(participant.personaId);
    if (personaId === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Unknown reconciliation Persona ID: ${participant.personaId}`,
      );
    }
    return {
      description: participant.description,
      personaId,
      role: participant.role,
    };
  });
  changes.push(
    {
      clientRef: 'accepted_moment',
      displayTime: event.displayTime,
      note: event.summary,
      operation: 'create_moment',
      orderKey: registry.momentOrderKey + 1,
      precision: event.precision,
      timelineId,
    },
    {
      causes: '',
      clientRef: 'accepted_event',
      consequences: '',
      endMomentId: null,
      operation: 'create_event',
      participants,
      sources: [{
        anchor: registry.acceptedDocumentTitle,
        documentId: registry.acceptedDocumentId,
        documentRevision: registry.acceptedDocumentRevision,
        relation: 'depicted',
        sourceKind: 'manuscript',
      }],
      startMomentId: '@accepted_moment',
      status: 'established',
      summary: event.summary,
      timelineId,
      title: event.title,
    },
  );
  input.newThreads.forEach((thread, index) => {
    const threadRef = `accepted_thread_${index + 1}`;
    const beatRef = `accepted_new_beat_${index + 1}`;
    changes.push({
      clientRef: threadRef,
      operation: 'create_thread',
      orderKey: registry.threadOrderKey + index + 1,
      parentId: null,
      status: thread.threadStatus,
      summary: thread.summary,
      title: thread.title,
    });
    changes.push({
      clientRef: beatRef,
      description: thread.beat.description,
      desiredOutcome: thread.beat.desiredOutcome ?? '',
      dramaticPurpose: thread.beat.dramaticPurpose ?? '',
      kind: thread.beat.kind,
      operation: 'create_beat',
      orderKey: 0,
      parentId: null,
      status: thread.threadStatus,
      threadId: `@${threadRef}`,
      title: thread.beat.title,
    });
    changes.push({
      beatId: `@${beatRef}`,
      eventId: '@accepted_event',
      operation: 'link_beat_event',
      relation: thread.beat.relation,
    });
  });
  const beatOrderKeys = new Map(registry.beatOrderKeys);
  input.threadAdvances.forEach((advance, index) => {
    const threadId = registry.threadIds.get(advance.threadId);
    if (threadId === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Unknown reconciliation Thread ID: ${advance.threadId}`,
      );
    }
    const beatRef = `accepted_beat_${index + 1}`;
    const orderKey = (beatOrderKeys.get(threadId) ?? -1) + 1;
    beatOrderKeys.set(threadId, orderKey);
    changes.push({
      clientRef: beatRef,
      description: advance.description,
      desiredOutcome: advance.desiredOutcome ?? '',
      dramaticPurpose: advance.dramaticPurpose ?? '',
      kind: advance.kind,
      operation: 'create_beat',
      orderKey,
      parentId: null,
      status: registry.threadStatuses.get(threadId) ?? 'active',
      threadId,
      title: advance.title,
    });
    changes.push({
      beatId: `@${beatRef}`,
      eventId: '@accepted_event',
      operation: 'link_beat_event',
      relation: advance.relation,
    });
  });
  return changes;
};

const resolveStoryQuestionArguments = (
  snapshot: AgentProjectBashExecution,
  scope: AgentToolScope,
  registry: ReconciliationRegistry | undefined,
  input: AgentToolContractMap['record_story_question']['arguments'],
): AgentCanonicalStoryQuestionArguments => {
  if (input.evidence === null) return { ...input, evidence: null };
  const { anchor, documentPath } = input.evidence;
  if (documentPath !== ACCEPTED_DOCUMENT_PATH) {
    const document = requireDocumentPath(snapshot, documentPath);
    return {
      ...input,
      evidence: {
        anchor,
        documentId: document.documentId,
        documentRevision: document.baseRevision,
        sourceKind: 'manuscript',
      },
    };
  }
  if (
    registry === undefined ||
    scope.acceptedDocumentId === undefined ||
    registry.acceptedDocumentId !== scope.acceptedDocumentId
  ) {
    throw new ProjectContextError(
      'invalid-arguments',
      `Run Bash after accepting the manuscript before citing ${ACCEPTED_DOCUMENT_PATH}.`,
    );
  }
  return {
    ...input,
    evidence: {
      anchor,
      documentId: registry.acceptedDocumentId,
      documentRevision: registry.acceptedDocumentRevision,
      sourceKind: 'manuscript',
    },
  };
};

const resolveStructureOperation = (
  snapshot: AgentProjectBashExecution,
  operation: AgentProjectStructureOperationArguments,
): ResolvedProjectStructureOperationArguments => {
  const projectRevision = snapshot.projectRevision;
  switch (operation.operation) {
    case 'create_volume':
    case 'create_lore_category':
      return { ...operation, projectRevision };
    case 'delete_lore_category':
      return {
        operation: operation.operation,
        directoryId: requireDirectoryPath(snapshot, operation.directoryPath).directoryId,
        projectRevision,
      };
    case 'set_lore_category_icon':
      return {
        icon: operation.icon,
        operation: operation.operation,
        directoryId: requireDirectoryPath(snapshot, operation.directoryPath).directoryId,
        projectRevision,
      };
    case 'move_document': {
      const document = requireDocumentPath(snapshot, operation.documentPath);
      return {
        baseRevision: document.baseRevision,
        documentId: document.documentId,
        operation: operation.operation,
        projectRevision,
        targetParentId: requireDirectoryPath(
          snapshot,
          operation.targetParentPath,
        ).directoryId,
      };
    }
    case 'rename_document':
      return {
        documentId: requireDocumentPath(snapshot, operation.documentPath).documentId,
        metadataTitle: operation.metadataTitle,
        operation: operation.operation,
        projectRevision,
      };
  }
};

const requireBashSnapshot = (
  snapshots: Map<string, AgentProjectBashExecution>,
  requestId: string,
): AgentProjectBashExecution => {
  const snapshot = snapshots.get(requestId);
  if (snapshot === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'Run Bash in this request before proposing or applying a project change.',
    );
  }
  return snapshot;
};

const requireDocumentPath = (
  snapshot: AgentProjectBashExecution,
  documentPath: string,
) => {
  const document = snapshot.documents.get(documentPath);
  if (document === undefined) {
    throw new ProjectContextError(
      'node-not-found',
      JSON.stringify({ documentPath }),
    );
  }
  return document;
};

const requireDirectoryPath = (
  snapshot: AgentProjectBashExecution,
  directoryPath: string,
) => {
  const directory = snapshot.directories.get(directoryPath);
  if (directory === undefined) {
    throw new ProjectContextError(
      'node-not-found',
      JSON.stringify({ directoryPath }),
    );
  }
  return directory;
};

const requireStoryRevision = (snapshot: AgentProjectBashExecution): number => {
  if (snapshot.story === null) {
    throw new ProjectContextError('internal-error');
  }
  return snapshot.story.revision;
};

const resolveStoryOperation = (
  snapshot: AgentProjectBashExecution,
  operation: AgentStoryOperationInput,
): import('../../shared/contracts/project-story').ProjectStoryOperation => {
  validateStoryOperationReferences(snapshot, operation);
  if (operation.operation !== 'create_event' || operation.sources === undefined) {
    return operation as import('../../shared/contracts/project-story').ProjectStoryOperation;
  }
  return {
    ...operation,
    sources: operation.sources.map(({ documentPath, ...source }) => {
      const document = requireDocumentPath(snapshot, documentPath);
      return {
        ...source,
        documentId: document.documentId,
        documentRevision: document.baseRevision,
      };
    }),
  };
};

const validateStoryOperationReferences = (
  snapshot: AgentProjectBashExecution,
  operation: AgentStoryOperationInput,
): void => {
  const story = snapshot.story;
  if (story === null) throw new ProjectContextError('internal-error');
  const timelines = new Set(story.timelines.map(({ id }) => id));
  const moments = new Set(story.moments.map(({ id }) => id));
  const personae = new Set(story.personae.map(({ id }) => id));
  const threads = new Set(story.threads.map(({ id }) => id));
  const beats = new Set(story.beats.map(({ id }) => id));
  const events = new Set(story.events.map(({ id }) => id));
  switch (operation.operation) {
    case 'create_persona':
    case 'create_timeline':
      return;
    case 'create_moment':
      requireStoryId(timelines, operation.timelineId, 'timeline');
      return;
    case 'create_event':
      requireStoryId(timelines, operation.timelineId, 'timeline');
      requireStoryId(moments, operation.startMomentId, 'moment');
      if (operation.endMomentId !== null) {
        requireStoryId(moments, operation.endMomentId, 'moment');
      }
      for (const participant of operation.participants) {
        requireStoryId(personae, participant.personaId, 'persona');
      }
      return;
    case 'create_thread':
      if (operation.parentId !== null) {
        requireStoryId(threads, operation.parentId, 'thread');
      }
      return;
    case 'create_beat':
      requireStoryId(threads, operation.threadId, 'thread');
      if (operation.parentId !== null) {
        requireStoryId(beats, operation.parentId, 'beat');
      }
      return;
    case 'link_beat_event':
      requireStoryId(beats, operation.beatId, 'beat');
      requireStoryId(events, operation.eventId, 'event');
  }
};

const requireStoryId = (
  knownIds: Set<string>,
  id: string,
  kind: string,
): void => {
  if (id.startsWith('@') || knownIds.has(id)) return;
  throw new ProjectContextError(
    'invalid-arguments',
    `Unknown ${kind} ID in the latest Bash snapshot: ${id}`,
  );
};
class ToolTimeoutError extends Error {}

const exposeProposalResult = (
  decision: AgentProposalDecision,
): AgentToolContractMap['propose_document_edit']['result'] => ({
  status: decision.status,
});

const claimWritingArtifact = (
  scope: AgentToolScope,
  assignmentId: string,
  documentAction: 'create' | 'replace',
  targetDocumentId: string | null,
  documentDomain: AgentDocumentDomain,
): { markdown: string; release: () => void } => {
  if (scope.claimWritingArtifact === undefined) {
    throw new ProjectContextError(
      'internal-error',
    );
  }
  const markdown = scope.claimWritingArtifact(
    assignmentId,
    documentAction,
    targetDocumentId,
    documentDomain,
  );
  if (markdown === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'The generated writing artifact is missing, belongs to another request or target, or was already used.',
    );
  }
  return {
    markdown,
    release: () => scope.releaseWritingArtifactClaim?.(assignmentId),
  };
};


const documentDomainForKind = (
  kind: import('../../shared/contracts/project-layout').ManuscriptDocumentKind | 'entry',
): AgentDocumentDomain => kind === 'entry' ? 'lore' : 'manuscript';

const documentDomainForDirectoryKind = (
  kind: 'category' | 'lore' | 'manuscript' | 'volume',
): AgentDocumentDomain => kind === 'lore' || kind === 'category'
  ? 'lore'
  : 'manuscript';
