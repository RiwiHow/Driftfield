import type {
  AgentAcceptedDocumentReconciliationArguments,
  AgentAcceptedReconciliationContext,
  AgentDocumentToolResult,
  AgentDraftSnapshot,
  AgentNovelStructureToolResult,
  AgentProjectStructureOperationArguments,
  AgentStructureNode,
  AgentWritingAssignment,
  AgentWritingAssignmentToolResult,
  AgentWritingArtifactReplacement,
  AgentWritingArtifactRevisionToolResult,
  AgentToolExecutionResult,
  AgentToolFailureResult,
  AgentToolContractMap,
  AgentToolName,
  AgentToolRequest,
  AgentToolSuccessResult,
  AgentStoryMaintenanceChange,
  AgentCanonicalStoryQuestionArguments,
} from '../../shared/contracts/agent-tools';
import {
  isAgentToolRequest,
  isLongRunningAgentTool,
} from '../../shared/contracts/agent-tools';
import {
  ProjectContextError,
  type ProjectContextService,
} from './project-context-service';
import type {
  AgentProposalService,
  ResolvedDocumentFileOperationArguments,
} from './agent-proposal-service';
import type { AgentProposal } from '../../shared/contracts/agent-proposals';
import {
  isProjectStoryOperation,
  type ProjectStorySnapshot,
} from '../../shared/contracts/project-story';
import { AgentReferenceRegistry } from './agent-reference-registry';

export interface AgentToolScope {
  acceptedDocumentId?: string;
  claimWritingArtifact?: (
    assignmentId: string,
    targetDocumentId: string | null,
  ) => string | undefined;
  completeStoryReconciliation?: (
    status: 'applied' | 'no_changes' | 'questions_recorded',
  ) => { detail?: string; ok: boolean };
  delegateWriting?: (
    assignment: AgentWritingAssignment,
    resolvedTargetDocumentId: string | null,
  ) => Promise<AgentWritingAssignmentToolResult>;
  draftSnapshot?: AgentDraftSnapshot;
  ownerId: number;
  projectSessionId?: string;
  requestId: string;
  releaseWritingArtifactClaim?: (assignmentId: string) => void;
  reviseWritingArtifact?: (
    assignmentId: string,
    replacements: AgentWritingArtifactReplacement[],
  ) =>
    | { ok: true; result: AgentWritingArtifactRevisionToolResult }
    | { detail: string; ok: false };
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

interface RequestBudget {
  calls: number;
  referenceRecoveries: number;
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
  private readonly referenceRegistries = new Map<string, AgentReferenceRegistry>();
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
      referenceRecoveries: 0,
      resultBytes: 0,
    };
    if (budget.calls >= this.policy.maxCalls) {
      return this.error(request.toolName, 'tool-budget-exceeded');
    }
    budget.calls += 1;
    this.budgets.set(scope.requestId, budget);

    if (!isAgentToolRequest(request)) {
      return this.error(
        request.toolName,
        'invalid-arguments',
        toolArgumentShapeHint(request.toolName, request.arguments),
      );
    }

    try {
      const operation = this.executeValidated(scope, request);
      const result = isLongRunningAgentTool(request.toolName)
        ? await operation
        : await this.withTimeout(operation);
      const bytes = Buffer.byteLength(JSON.stringify(result), 'utf8');
      if (
        bytes > this.policy.maxResultBytes ||
        budget.resultBytes + bytes > this.policy.maxTotalResultBytes
      ) {
        return this.error(request.toolName, 'tool-budget-exceeded');
      }
      budget.resultBytes += bytes;
      return result;
    } catch (error) {
      if (error instanceof ProjectContextError) {
        if (
          error.code === 'expired-request-reference' &&
          budget.referenceRecoveries === 0
        ) {
          budget.calls -= 1;
          budget.referenceRecoveries += 1;
        }
        return this.error(request.toolName, error.code, error.detail);
      }
      if (error instanceof ToolTimeoutError) return this.error(request.toolName, 'tool-timeout');
      return this.error(request.toolName, 'internal-error');
    }
  }

  release(requestId: string): void {
    this.budgets.delete(requestId);
    this.referenceRegistries.delete(requestId);
    this.reconciliationRegistries.delete(requestId);
    this.proposals?.cancelRequest(requestId);
  }

  private async executeValidated(
    scope: AgentToolScope,
    request: AgentToolRequest,
  ): Promise<AgentToolSuccessResult> {
    const refs = this.referenceRegistries.get(scope.requestId) ??
      new AgentReferenceRegistry();
    this.referenceRegistries.set(scope.requestId, refs);
    const contextScope = {
      ...(scope.draftSnapshot === undefined ? {} : { draftSnapshot: scope.draftSnapshot }),
      ownerId: scope.ownerId,
      projectSessionId: scope.projectSessionId,
    };
    if (request.toolName === 'delegate_writing') {
      if (scope.delegateWriting === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const targetDocumentId = request.arguments.targetDocumentId === null
        ? null
        : refs.resolve(request.arguments.targetDocumentId, 'document');
      if (targetDocumentId !== null) {
        const structure = await this.context.getNovelStructure(contextScope);
        const node = indexStructureNodes(structure).get(targetDocumentId);
        if (node === undefined) {
          throw nodeNotFound(request.arguments.targetDocumentId!);
        }
        if (node.type !== 'document') {
          throw nodeKindMismatch(
            request.arguments.targetDocumentId!,
            'document',
            node,
          );
        }
      }
      const result = await scope.delegateWriting(
        request.arguments,
        targetDocumentId,
      );
      return {
        data: {
          ...result,
          assignmentId: refs.expose('assignment', result.assignmentId),
        },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'revise_writing_artifact') {
      if (scope.reviseWritingArtifact === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const outcome = scope.reviseWritingArtifact(
        refs.resolve(request.arguments.writingAssignmentId, 'assignment'),
        request.arguments.replacements,
      );
      if (!outcome.ok) {
        throw new ProjectContextError('invalid-arguments', outcome.detail);
      }
      return {
        data: {
          ...outcome.result,
          assignmentId: refs.expose('assignment', outcome.result.assignmentId),
        },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'read_novel_context') {
      const { directoryIds, documentIds, include } = request.arguments;
      const includeSet = new Set(include);
      const needsStructure = includeSet.has('structure') ||
        documentIds.length > 0 || directoryIds.length > 0;
      const needsAcceptedReconciliation = includeSet.has('accepted_reconciliation');
      if (needsAcceptedReconciliation && scope.acceptedDocumentId === undefined) {
        throw new ProjectContextError(
          'invalid-arguments',
          'No accepted Scribe-backed document is awaiting reconciliation.',
        );
      }
      const [resolvedStructure, currentDocument, storyState, acceptedDocument] =
        await Promise.all([
          needsStructure
            ? this.context.getNovelStructure(contextScope)
            : undefined,
          includeSet.has('current_document')
            ? this.context.getCurrentDocument(contextScope)
            : undefined,
          includeSet.has('story_state') || needsAcceptedReconciliation
            ? this.context.getStoryState(contextScope)
            : undefined,
          needsAcceptedReconciliation
            ? this.context.getDocument(contextScope, scope.acceptedDocumentId!)
            : undefined,
        ]);
      const nodes = resolvedStructure === undefined
        ? new Map<string, AgentStructureNode>()
        : indexStructureNodes(resolvedStructure);
      const resolvedDocumentIds: string[] = [];
      const seenDocumentIds = new Set<string>();
      const addDocumentId = (documentId: string): void => {
        if (seenDocumentIds.has(documentId)) return;
        seenDocumentIds.add(documentId);
        resolvedDocumentIds.push(documentId);
      };
      for (const documentRef of documentIds) {
        const documentId = refs.resolve(documentRef, 'document');
        const node = nodes.get(documentId);
        if (node === undefined) throw nodeNotFound(documentRef);
        if (node.type !== 'document') {
          throw nodeKindMismatch(documentRef, 'document', node);
        }
        addDocumentId(documentId);
      }
      for (const directoryRef of directoryIds) {
        const directoryId = refs.resolve(directoryRef, 'directory');
        const node = nodes.get(directoryId);
        if (node === undefined) throw nodeNotFound(directoryRef);
        if (node.type !== 'directory') {
          throw nodeKindMismatch(directoryRef, 'directory', node);
        }
        for (const child of node.children) {
          if (child.type === 'document') addDocumentId(child.id);
        }
      }
      if (resolvedDocumentIds.length > 4) {
        throw new ProjectContextError(
          'selection-too-large',
          JSON.stringify({
            limit: 4,
            resolvedDocumentCount: resolvedDocumentIds.length,
          }),
        );
      }
      const documents = await Promise.all(resolvedDocumentIds.map(
        (documentId) => this.context.getDocument(contextScope, documentId),
      ));
      const reconciliation = acceptedDocument === undefined || storyState === undefined
        ? undefined
        : this.buildReconciliationContext(
            scope.requestId,
            acceptedDocument,
            storyState,
          );
      const exposedStructure = includeSet.has('structure') &&
        resolvedStructure !== undefined
          ? refs.exposeStructure(resolvedStructure)
          : undefined;
      const exposedCurrentDocument = currentDocument === undefined
        ? undefined
        : refs.exposeDocument(currentDocument);
      const exposedDocuments = documents.map((document) =>
        refs.exposeDocument(document));
      const exposedStoryState = !includeSet.has('story_state') || storyState === undefined
        ? undefined
        : refs.exposeStory(storyState);
      return {
        data: {
          ...(exposedCurrentDocument === undefined
            ? {}
            : { currentDocument: exposedCurrentDocument }),
          documents: exposedDocuments,
          ...(reconciliation === undefined ? {} : { reconciliation }),
          ...(exposedStoryState === undefined
            ? {}
            : { storyState: exposedStoryState }),
          ...(exposedStructure === undefined
            ? {}
            : { structure: exposedStructure }),
        },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'maintain_story_records') {
      const changes = request.arguments.changes.map((change) => {
        const clientRef = 'clientRef' in change ? change.clientRef : undefined;
        const operation = { ...change } as AgentStoryMaintenanceChange & {
          clientRef?: string;
        };
        delete operation.clientRef;
        const resolved = refs.resolveStoryOperation(operation);
        return clientRef === undefined ? resolved : { ...resolved, clientRef };
      }) as AgentStoryMaintenanceChange[];
      const data = await this.context.maintainStoryRecords(
        contextScope,
        scope.requestId,
        request.arguments.storyRevision,
        changes,
      );
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
          'Read accepted_reconciliation context after the manuscript proposal is accepted.',
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
      const argumentsWithResolvedEvidence =
        request.arguments.evidence !== null &&
        'documentId' in request.arguments.evidence
          ? {
              ...request.arguments,
              evidence: {
                ...request.arguments.evidence,
                documentId: refs.resolve(
                  request.arguments.evidence.documentId,
                  'document',
                ),
                documentRevision: refs.resolve(
                  request.arguments.evidence.documentRevision,
                  'revision',
                ),
              },
            }
          : request.arguments;
      const input = resolveStoryQuestionArguments(
        scope,
        this.reconciliationRegistries.get(scope.requestId),
        argumentsWithResolvedEvidence,
      );
      const data = this.context.recordStoryQuestion(
        contextScope,
        scope.requestId,
        input,
      );
      scope.storyChanged?.(data.revision);
      return {
        data: { ...data, questionId: refs.expose('question', data.questionId) },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'resolve_story_question') {
      const data = this.context.resolveStoryQuestion(
        contextScope,
        refs.resolve(request.arguments.questionId, 'question'),
        request.arguments.answer,
      );
      scope.storyChanged?.(data.revision);
      return {
        data: { ...data, questionId: refs.expose('question', data.questionId) },
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_edit') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const documentId = refs.resolve(request.arguments.documentId, 'document');
      const content = claimDocumentContent(
        scope,
        resolveDocumentContentReference(refs, request.arguments),
        documentId,
      );
      let proposal: ReturnType<AgentProposalService['create']>;
      try {
        proposal = this.proposals.create(scope, {
          baseContentRevision: refs.resolve(
            request.arguments.baseContentRevision,
            'revision',
          ),
          baseRevision: refs.resolve(request.arguments.baseRevision, 'revision'),
          documentId,
          markdown: content.markdown,
        });
      } catch (error) {
        content.release();
        throw error;
      }
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: exposeProposalResult(refs, await decision),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_document_file_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const content = request.arguments.operation === 'create'
        ? claimDocumentContent(
            scope,
            resolveDocumentContentReference(refs, request.arguments),
            null,
          )
        : null;
      let proposal: Awaited<ReturnType<AgentProposalService['createFileOperation']>>;
      try {
        const resolvedRequest = request.arguments.operation === 'create'
          ? {
              kind: request.arguments.kind,
              markdown: content!.markdown,
              operation: request.arguments.operation,
              parentId: refs.resolve(request.arguments.parentId, 'directory'),
              projectRevision: refs.resolve(
                request.arguments.projectRevision,
                'revision',
              ),
              metadataTitle: request.arguments.metadataTitle,
            } satisfies ResolvedDocumentFileOperationArguments
          : {
              ...request.arguments,
              baseRevision: refs.resolve(request.arguments.baseRevision, 'revision'),
              documentId: refs.resolve(request.arguments.documentId, 'document'),
              projectRevision: refs.resolve(
                request.arguments.projectRevision,
                'revision',
              ),
            };
        proposal = await this.withTimeout(
          this.proposals.createFileOperation(scope, resolvedRequest),
        );
      } catch (error) {
        content?.release();
        throw error;
      }
      if (scope.sendProposal === undefined) {
        this.proposals.cancelRequest(scope.requestId);
        throw new ProjectContextError('internal-error');
      }
      const decision = this.proposals.waitForDecision(
        scope.requestId,
        proposal.proposalId,
      );
      scope.sendProposal(proposal);
      return {
        data: exposeProposalResult(refs, await decision),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_project_structure_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const operation = resolveStructureOperation(refs, request.arguments);
      const proposal = await this.withTimeout(
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
      return {
        data: exposeProposalResult(refs, await decision),
        ok: true,
        toolName: request.toolName,
      };
    }
    if (request.toolName === 'propose_story_operation') {
      if (this.proposals === undefined) {
        throw new ProjectContextError('internal-error');
      }
      const proposal = this.proposals.createStoryOperation(
        scope,
        {
          ...request.arguments,
          change: refs.resolveStoryOperation(request.arguments.change),
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
      return {
        data: exposeProposalResult(refs, await decision),
        ok: true,
        toolName: request.toolName,
      };
    }
    throw new ProjectContextError('internal-error');
  }

  private buildReconciliationContext(
    requestId: string,
    acceptedDocument: AgentDocumentToolResult,
    story: ProjectStorySnapshot,
  ): AgentAcceptedReconciliationContext {
    const primaryTimeline = story.timelines.find(({ isPrimary }) => isPrimary) ?? null;
    const personaIds = new Map<string, string>();
    const personae = story.personae.map((persona, index) => {
      const ref = `persona:${index + 1}`;
      personaIds.set(ref, persona.id);
      return {
        name: persona.name,
        ref,
        role: persona.role,
        summary: persona.summary,
      };
    });
    const threadIds = new Map<string, string>();
    const threadStatuses = new Map<
      string,
      import('../../shared/contracts/project-story').ThreadStatus
    >();
    const beatOrderKeys = new Map<string, number>();
    const threads = story.threads.map((thread, index) => {
      const ref = `thread:${index + 1}`;
      threadIds.set(ref, thread.id);
      threadStatuses.set(thread.id, thread.status);
      const beats = story.beats
        .filter(({ threadId }) => threadId === thread.id)
        .sort((left, right) => left.orderKey - right.orderKey);
      beatOrderKeys.set(
        thread.id,
        beats.reduce((maximum, beat) => Math.max(maximum, beat.orderKey), -1),
      );
      return {
        beats: beats.map((beat) => ({
          description: beat.description,
          kind: beat.kind,
          status: beat.status,
          title: beat.title,
        })),
        ref,
        status: thread.status,
        summary: thread.summary,
        title: thread.title,
      };
    });
    const momentById = new Map(story.moments.map((moment) => [moment.id, moment]));
    const personaById = new Map(story.personae.map((persona) => [persona.id, persona]));
    const participantsByEvent = new Map<string, string[]>();
    for (const participant of story.eventParticipants) {
      const name = personaById.get(participant.personaId)?.name;
      if (name === undefined) continue;
      const participants = participantsByEvent.get(participant.eventId) ?? [];
      participants.push(name);
      participantsByEvent.set(participant.eventId, participants);
    }
    const registry: ReconciliationRegistry = {
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
    };
    this.reconciliationRegistries.set(requestId, registry);
    return {
      acceptedDocument: {
        displayTitle: acceptedDocument.displayTitle,
        markdown: acceptedDocument.markdown,
        metadataTitle: acceptedDocument.metadataTitle,
        ref: 'document:accepted',
      },
      chronicle: story.events.map((event) => ({
        displayTime: momentById.get(event.startMomentId)?.displayTime ?? '',
        participants: participantsByEvent.get(event.id) ?? [],
        status: event.status,
        summary: event.summary,
        title: event.title,
      })),
      personae,
      primaryTimeline: primaryTimeline === null
        ? null
        : {
            ref: 'timeline:primary',
            summary: primaryTimeline.summary,
            title: primaryTimeline.title,
          },
      questions: story.questions
        .filter(({ status }) => status === 'open')
        .map((question) => ({
          context: question.context,
          kind: question.kind,
          options: question.options,
          question: question.question,
        })),
      storyRef: 'story:accepted',
      threads,
    };
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
      'primaryTimeline is valid only when accepted_reconciliation has no primary timeline.',
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
    const personaId = participant.personaRef.startsWith('@')
      ? newPersonaRefs.get(participant.personaRef.slice(1))
      : registry.personaIds.get(participant.personaRef);
    if (personaId === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Unknown reconciliation persona ref: ${participant.personaRef}`,
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
    const threadId = registry.threadIds.get(advance.threadRef);
    if (threadId === undefined) {
      throw new ProjectContextError(
        'invalid-arguments',
        `Unknown reconciliation thread ref: ${advance.threadRef}`,
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
  scope: AgentToolScope,
  registry: ReconciliationRegistry | undefined,
  input: AgentToolContractMap['record_story_question']['arguments'],
): AgentCanonicalStoryQuestionArguments => {
  if (input.evidence === null) return { ...input, evidence: null };
  if ('documentId' in input.evidence) {
    return { ...input, evidence: input.evidence };
  }
  if (
    registry === undefined ||
    scope.acceptedDocumentId === undefined ||
    registry.acceptedDocumentId !== scope.acceptedDocumentId
  ) {
    throw new ProjectContextError(
      'invalid-arguments',
      'Read accepted_reconciliation before using document:accepted evidence.',
    );
  }
  return {
    ...input,
    evidence: {
      anchor: input.evidence.anchor,
      documentId: registry.acceptedDocumentId,
      documentRevision: registry.acceptedDocumentRevision,
      sourceKind: 'manuscript',
    },
  };
};

const resolveStructureOperation = (
  refs: AgentReferenceRegistry,
  operation: AgentProjectStructureOperationArguments,
): AgentProjectStructureOperationArguments => {
  const projectRevision = refs.resolve(operation.projectRevision, 'revision');
  switch (operation.operation) {
    case 'create_volume':
    case 'create_lore_category':
      return { ...operation, projectRevision };
    case 'delete_lore_category':
      return {
        ...operation,
        directoryId: refs.resolve(operation.directoryId, 'directory'),
        projectRevision,
      };
    case 'move_document':
      return {
        ...operation,
        baseRevision: refs.resolve(operation.baseRevision, 'revision'),
        documentId: refs.resolve(operation.documentId, 'document'),
        projectRevision,
        targetParentId: refs.resolve(operation.targetParentId, 'directory'),
      };
    case 'rename_document':
      return {
        ...operation,
        documentId: refs.resolve(operation.documentId, 'document'),
        projectRevision,
      };
  }
};

class ToolTimeoutError extends Error {}

const resolveDocumentContentReference = <T extends {
  markdown: string | null;
  writingAssignmentId: string | null;
}>(refs: AgentReferenceRegistry, source: T): T => source.writingAssignmentId === null
  ? source
  : {
      ...source,
      writingAssignmentId: refs.resolve(source.writingAssignmentId, 'assignment'),
    };

const exposeProposalResult = (
  refs: AgentReferenceRegistry,
  result: AgentToolContractMap['propose_document_edit']['result'],
): AgentToolContractMap['propose_document_edit']['result'] => ({
  ...result,
  proposalId: refs.expose('proposal', result.proposalId),
});

const claimDocumentContent = (
  scope: AgentToolScope,
  source: { markdown: string | null; writingAssignmentId: string | null },
  targetDocumentId: string | null,
): { markdown: string; release: () => void } => {
  if (source.markdown !== null) {
    return { markdown: source.markdown, release: () => {} };
  }
  const assignmentId = source.writingAssignmentId;
  if (assignmentId === null || scope.claimWritingArtifact === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'A Scribe-backed proposal requires the current request’s writingAssignmentId.',
    );
  }
  const markdown = scope.claimWritingArtifact(assignmentId, targetDocumentId);
  if (markdown === undefined) {
    throw new ProjectContextError(
      'invalid-arguments',
      'The writingAssignmentId is missing, belongs to another request or target, or was already used.',
    );
  }
  return {
    markdown,
    release: () => scope.releaseWritingArtifactClaim?.(assignmentId),
  };
};

const indexStructureNodes = (
  structure: AgentNovelStructureToolResult,
): Map<string, AgentStructureNode> => {
  const nodes = new Map<string, AgentStructureNode>();
  const visit = (node: AgentStructureNode): void => {
    nodes.set(node.id, node);
    if (node.type === 'directory') node.children.forEach(visit);
  };
  visit(structure.manuscript);
  if (structure.lore !== undefined) visit(structure.lore);
  return nodes;
};

const nodeNotFound = (nodeId: string): ProjectContextError =>
  new ProjectContextError('node-not-found', JSON.stringify({ nodeId }));

const nodeKindMismatch = (
  nodeId: string,
  expectedKind: 'directory' | 'document',
  node: AgentStructureNode,
): ProjectContextError =>
  new ProjectContextError(
    'node-kind-mismatch',
    JSON.stringify({
      actualKind: node.type,
      expectedKind,
      nodeId,
      title: node.type === 'document' ? node.displayTitle : node.title,
    }),
  );

const toolArgumentShapeHint = (
  toolName: AgentToolName,
  args: unknown,
): string | undefined => {
  if (toolName === 'delegate_writing') {
    return 'delegate_writing requires exactly objective, requirements, targetDocumentId, and targetLength. It is available at most once per user request and must not be retried for draft corrections. For a new document, set targetDocumentId to null; for an existing document, use its request-scoped document ref, never a directory ref or placeholder. Set targetLength to an integer from 1 to 200000, or null when unspecified.';
  }
  if (toolName === 'revise_writing_artifact') {
    return 'revise_writing_artifact requires exactly writingAssignmentId and 1 to 12 ordered replacements. Each replacement requires exactly find, replace, and expectedOccurrences; find must be non-empty and differ from replace.';
  }
  if (toolName === 'reconcile_accepted_document') {
    return 'reconcile_accepted_document requires events, newPersonae, newThreads, and threadAdvances, plus optional primaryTimeline only when accepted_reconciliation has none. events contains exactly one event. Existing participants use personaRef from accepted_reconciliation; new Personae declare clientRef and are referenced as @clientRef in the same call. Existing Thread advances use threadRef; newThreads embeds its first linked beat. Main owns timeline fallback, moments, sources, ordering, IDs, and checkpoint completion.';
  }
  if (toolName === 'complete_story_reconciliation') {
    return 'complete_story_reconciliation requires exactly status and reason. Read accepted_reconciliation after acceptance first. Use applied only after a successful reconciliation mutation, questions_recorded only after recording a question, or no_changes only when neither occurred.';
  }
  if (toolName === 'propose_document_edit') {
    return 'propose_document_edit requires exactly baseContentRevision, baseRevision, documentId, markdown, and writingAssignmentId. Supply direct markdown with writingAssignmentId null, or set markdown null and use the assignmentId returned by delegate_writing.';
  }
  if (
    toolName === 'propose_document_file_operation' &&
    typeof args === 'object' && args !== null &&
    (args as { operation?: unknown }).operation === 'create'
  ) {
    return 'Document creation requires exactly operation, parentId, projectRevision, metadataTitle, kind, markdown, and writingAssignmentId. metadataTitle is the raw title without generated numbering. Supply direct markdown with writingAssignmentId null, or set markdown null and use the assignmentId returned by delegate_writing.';
  }
  if (
    toolName === 'propose_project_structure_operation' &&
    typeof args === 'object' && args !== null &&
    (args as { operation?: unknown }).operation === 'rename_document'
  ) {
    return 'rename_document requires exactly operation, projectRevision, documentId, and metadataTitle. metadataTitle is the raw title without generated numbering; the physical filename is preserved.';
  }
  if (
    (toolName !== 'maintain_story_records' && toolName !== 'propose_story_operation') ||
    typeof args !== 'object' || args === null
  ) return undefined;
  if (toolName === 'maintain_story_records') {
    const changes = (args as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) return 'changes must be an array of 1 to 24 operations.';
    for (const [index, change] of changes.entries()) {
      const error = storyOperationArgumentError(change, `changes[${index}]`, true);
      if (error !== undefined) return error;
    }
    return undefined;
  }
  return storyOperationArgumentError(
    (args as { change?: unknown }).change,
    'change',
    false,
  );
};

const STORY_OPERATION_FIELDS: Record<string, {
  optional?: string[];
  required: string[];
}> = {
  create_beat: {
    optional: ['dramaticPurpose', 'desiredOutcome'],
    required: [
      'operation',
      'threadId',
      'parentId',
      'kind',
      'title',
      'description',
      'status',
      'orderKey',
    ],
  },
  create_event: {
    optional: ['causes', 'consequences', 'sources'],
    required: [
      'operation',
      'timelineId',
      'startMomentId',
      'endMomentId',
      'title',
      'summary',
      'status',
      'participants',
    ],
  },
  create_moment: {
    required: ['operation', 'timelineId', 'displayTime', 'precision', 'orderKey', 'note'],
  },
  create_persona: { required: ['operation', 'name', 'role', 'summary'] },
  create_thread: {
    required: ['operation', 'parentId', 'title', 'summary', 'status', 'orderKey'],
  },
  create_timeline: { required: ['operation', 'title', 'summary', 'isPrimary'] },
  link_beat_event: { required: ['operation', 'beatId', 'eventId', 'relation'] },
};

const storyOperationArgumentError = (
  value: unknown,
  path: string,
  allowClientRef: boolean,
): string | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return `${path} must be an object.`;
  }
  const change = value as Record<string, unknown>;
  const operation = change.operation;
  if (typeof operation !== 'string' || STORY_OPERATION_FIELDS[operation] === undefined) {
    return `${path}.operation must be a supported story operation.`;
  }
  const clientRef = change.clientRef;
  if (clientRef !== undefined) {
    if (!allowClientRef || operation === 'link_beat_event') {
      return `${path}.clientRef is valid only on Maintain create operations.`;
    }
    if (typeof clientRef !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(clientRef)) {
      return `${path}.clientRef must start with a letter and contain at most 64 letters, digits, underscores, or hyphens.`;
    }
  }
  const { optional = [], required } = STORY_OPERATION_FIELDS[operation];
  const allowed = new Set([
    ...required,
    ...optional,
    ...(allowClientRef ? ['clientRef'] : []),
  ]);
  const unexpected = Object.keys(change).find((key) => !allowed.has(key));
  if (unexpected !== undefined) return `${path}.${unexpected} is not valid for ${operation}.`;
  const missing = required.find((key) => change[key] === undefined);
  if (missing !== undefined) {
    return `${storyWirePath(path, operation, missing)} is required for ${operation}.`;
  }
  const { clientRef: _clientRef, ...canonical } = change;
  if (isProjectStoryOperation(canonical)) return undefined;
  return storyOperationValueError(canonical, path, operation);
};

const storyOperationValueError = (
  change: Record<string, unknown>,
  path: string,
  operation: string,
): string => {
  const text = (field: string, max: number, allowEmpty: boolean): string | undefined =>
    isBoundedStoryText(change[field], max, allowEmpty)
      ? undefined
      : `${path}.${field} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${max} characters.`;
  const id = (field: string, nullable = false): string | undefined =>
    (nullable && change[field] === null) || isStoryId(change[field])
      ? undefined
      : `${path}.${field} must be ${nullable ? 'null or ' : ''}a request-scoped ref or compatible earlier @clientRef.`;
  const integer = (field: string): string | undefined =>
    Number.isSafeInteger(change[field]) ? undefined : `${path}.${field} must be an integer.`;
  let checks: Array<string | undefined>;
  switch (operation) {
    case 'create_persona':
      checks = [
        text('name', 500, false),
        change.role === null ? undefined : text('role', 500, true),
        text('summary', 20_000, true),
      ];
      break;
    case 'create_timeline':
      checks = [
        text('title', 500, false),
        text('summary', 20_000, true),
        typeof change.isPrimary === 'boolean'
          ? undefined
          : `${path}.isPrimary must be a boolean.`,
      ];
      break;
    case 'create_moment':
      checks = [
        id('timelineId'),
        text('displayTime', 500, false),
        ['exact', 'day', 'month', 'season', 'approximate', 'unknown']
          .includes(change.precision as string)
          ? undefined
          : `${path}.precision is invalid.`,
        integer('orderKey'),
        text('note', 10_000, true),
      ];
      break;
    case 'create_event':
      checks = [
        id('timelineId'),
        id('startMomentId'),
        id('endMomentId', true),
        text('title', 500, false),
        text('summary', 30_000, true),
        change.status === 'planned' || change.status === 'established'
          ? undefined
          : `${path}.eventStatus must be planned or established.`,
        text('causes', 20_000, true),
        text('consequences', 20_000, true),
        storyParticipantsError(change.participants, `${path}.participants`),
        change.sources === undefined
          ? undefined
          : storySourcesError(change.sources, `${path}.sources`),
      ];
      break;
    case 'create_thread':
      checks = [
        id('parentId', true),
        text('title', 500, false),
        text('summary', 20_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
      ];
      break;
    case 'create_beat':
      checks = [
        id('threadId'),
        id('parentId', true),
        ['beat', 'setup', 'turning_point', 'climax', 'resolution']
          .includes(change.kind as string)
          ? undefined
          : `${path}.kind is invalid.`,
        text('title', 500, false),
        text('description', 30_000, true),
        isStoryThreadStatus(change.status)
          ? undefined
          : `${path}.threadStatus must be planned, active, resolved, or abandoned.`,
        integer('orderKey'),
        text('dramaticPurpose', 10_000, true),
        text('desiredOutcome', 10_000, true),
      ];
      break;
    default:
      checks = [
        id('beatId'),
        id('eventId'),
        ['plans', 'realizes', 'reveals', 'foreshadows', 'resolves']
          .includes(change.relation as string)
          ? undefined
          : `${path}.relation is invalid.`,
      ];
  }
  return checks.find((error) => error !== undefined) ?? `${path} contains invalid nested values for ${operation}.`;
};

const storyWirePath = (path: string, operation: string, field: string): string =>
  field !== 'status'
    ? `${path}.${field}`
    : operation === 'create_event'
      ? `${path}.eventStatus`
      : `${path}.threadStatus`;

const isStoryId = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

const isStoryThreadStatus = (value: unknown): boolean =>
  typeof value === 'string' && ['planned', 'active', 'resolved', 'abandoned'].includes(value);

const isBoundedStoryText = (
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): boolean => typeof value === 'string' && value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0) &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);

const storyParticipantsError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 participants.`;
  }
  for (const [index, participant] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof participant !== 'object' || participant === null || Array.isArray(participant)) {
      return `${itemPath} must be an object.`;
    }
    const item = participant as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 3 || keys.some((key) =>
      !['description', 'personaId', 'role'].includes(key))) {
      return `${itemPath} requires exactly description, personaId, and role.`;
    }
    if (!isStoryId(item.personaId)) {
      return `${itemPath}.personaId must be a request-scoped ref or compatible earlier @clientRef.`;
    }
    if (!['actor', 'target', 'witness', 'affected'].includes(item.role as string)) {
      return `${itemPath}.role is invalid.`;
    }
    if (!isBoundedStoryText(item.description, 10_000, true)) {
      return `${itemPath}.description must be a string of at most 10000 characters.`;
    }
  }
  return undefined;
};

const storySourcesError = (
  value: unknown,
  path: string,
): string | undefined => {
  if (!Array.isArray(value) || value.length > 100) {
    return `${path} must be an array of at most 100 manuscript sources.`;
  }
  for (const [index, source] of value.entries()) {
    const itemPath = `${path}[${index}]`;
    if (typeof source !== 'object' || source === null || Array.isArray(source)) {
      return `${itemPath} must be an object.`;
    }
    const item = source as Record<string, unknown>;
    const keys = Object.keys(item);
    if (keys.length !== 5 || keys.some((key) =>
      !['anchor', 'documentId', 'documentRevision', 'relation', 'sourceKind']
        .includes(key))) {
      return `${itemPath} requires exactly anchor, documentId, documentRevision, relation, and sourceKind.`;
    }
    if (item.anchor !== null && !isBoundedStoryText(item.anchor, 10_000, true)) {
      return `${itemPath}.anchor must be null or a string of at most 10000 characters.`;
    }
    if (!isStoryId(item.documentId)) return `${itemPath}.documentId is invalid.`;
    if (typeof item.documentRevision !== 'string' ||
      !(/^revision:[1-9][0-9]*$/u.test(item.documentRevision) ||
        /^[a-f0-9]{64}$/u.test(item.documentRevision))) {
      return `${itemPath}.documentRevision must be a request-scoped revision ref.`;
    }
    if (!['depicted', 'mentioned', 'inferred'].includes(item.relation as string)) {
      return `${itemPath}.relation is invalid.`;
    }
    if (item.sourceKind !== 'manuscript') return `${itemPath}.sourceKind must be manuscript.`;
  }
  return undefined;
};
