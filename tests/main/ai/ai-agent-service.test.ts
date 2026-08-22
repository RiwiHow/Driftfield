import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  fork: vi.fn(),
}));

vi.mock('electron', () => ({
  utilityProcess: { fork: electronMock.fork },
}));

import { AiAgentService } from '../../../src/main/ai/ai-agent-service';
import { AgentToolDispatcher } from '../../../src/main/ai/tools/agent-tool-dispatcher';
import type { AgentProposalService } from '../../../src/main/ai/agent-proposal-service';
import type { ProjectContextService } from '../../../src/main/ai/project-context-service';
import { ProjectDatabase } from '../../../src/main/database/project-database';
import { ProjectReconciliationRepository } from '../../../src/main/database/project-reconciliation-repository';
import type { AgentEvent } from '../../../src/shared/contracts/agent';

class FakeUtilityProcess extends EventEmitter {
  readonly messages: unknown[] = [];
  readonly kill = vi.fn();

  postMessage(message: unknown): void {
    this.messages.push(message);
  }
}

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Condition was not reached');
};

const writingContext = (): ProjectContextService => ({
  executeProjectBash: vi.fn().mockResolvedValue({
    directories: new Map([['manuscript', {
      directoryId: 'manuscript-root',
      kind: 'manuscript',
    }]]),
    documents: new Map([['manuscript/chapter.md', {
      baseRevision: 'a'.repeat(64),
      contentRevision: 'a'.repeat(64),
      documentId: 'chapter-1',
      kind: 'chapter',
    }]]),
    projectRevision: 'a'.repeat(64),
    result: { exitCode: 0, stderr: '', stdout: 'manuscript/chapter.md\\n' },
    story: {
      beats: [], eventLinks: [], eventParticipants: [], eventSources: [],
      events: [], moments: [], personae: [], questions: [], revision: 0,
      threads: [], timelines: [],
    },
  }),
} as unknown as ProjectContextService);

const seedPendingReconciliation = (projectDirectory: string): void => {
  const database = new ProjectDatabase(projectDirectory);
  database.initializeProjectMetadata('project-1', 3, 'Novel');
  database.connection.prepare(`
    INSERT INTO project_nodes(
      node_id, parent_node_id, node_type, kind, metadata_title, icon,
      relative_path, sort_key, numbering_mode, numbering_format,
      content_revision, backing_status, created_at, updated_at
    ) VALUES (?, NULL, 'directory', 'manuscript', 'Manuscript', NULL,
              'manuscript', 0, 'continuous', NULL, NULL, 'present', 'now', 'now')
  `).run('manuscript-root');
  database.connection.prepare(`
    INSERT INTO project_nodes(
      node_id, parent_node_id, node_type, kind, metadata_title, icon,
      relative_path, sort_key, numbering_mode, numbering_format,
      content_revision, backing_status, created_at, updated_at
    ) VALUES (?, ?, 'document', 'chapter', 'Chapter', NULL,
              'manuscript/chapter.md', 0, NULL, NULL, ?, 'present', 'now', 'now')
  `).run('chapter-1', 'manuscript-root', 'a'.repeat(64));
  database.connection.prepare(`
    INSERT INTO writing_artifacts(
      artifact_id, request_id, target_document_id, state, markdown,
      validation_code, created_at, updated_at
    ) VALUES (?, ?, ?, 'accepted', ?, NULL, 'now', 'now')
  `).run('artifact-1', 'source-request', 'chapter-1', '# Chapter');
  expect(new ProjectReconciliationRepository(database)
    .ensureAcceptedArtifact('artifact-1')).not.toBeNull();
  database.close();
};

describe('AiAgentService', () => {
  let userDataPath: string;
  let workers: FakeUtilityProcess[];

  beforeEach(async () => {
    userDataPath = await mkdtemp(path.join(os.tmpdir(), 'driftfield-agent-'));
    workers = [];
    electronMock.fork.mockReset();
    electronMock.fork.mockImplementation(() => {
      const worker = new FakeUtilityProcess();
      workers.push(worker);
      return worker;
    });
  });

  const start = (
    service: AiAgentService,
    requestId: string,
    sendEvent: (event: AgentEvent) => void = vi.fn(),
    proposalOutcomes: Parameters<AiAgentService['start']>[0]['proposalOutcomes'] = [],
  ) =>
    service.start({
      currentDocumentId: 'chapter.md',
      customInstructions: 'Use restrained prose.',
      history: [],
      proposalOutcomes,
      model: { modelId: 'model', providerId: 'anthropic' },
      ownerId: 7,
      projectSessionId: 'session-1',
      prompt: 'Review this chapter',
      requestId,
      responseLanguage: 'zh-CN',
      sendEvent,
      thinkingLevel: 'medium',
    });

  it('removes proposal handles before crossing the worker boundary', async () => {
    const service = new AiAgentService(userDataPath);
    const started = start(service, 'request-1', vi.fn(), [{
      operation: 'create',
      proposalId: 'proposal-1',
      status: 'accepted',
      targetTitle: 'Chapter One',
    }]);
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    const curatorStart = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'curator') as {
        proposalOutcomes: unknown;
      };
    expect(curatorStart.proposalOutcomes).toEqual([{
      operation: 'create',
      status: 'accepted',
      targetTitle: 'Chapter One',
    }]);
  });

  it('handles cancellation while the worker is still starting', async () => {
    const service = new AiAgentService(userDataPath);
    const started = start(service, 'request-1');
    await waitFor(() => workers.length === 1);

    await expect(service.cancel(7, 'request-1')).resolves.toBe(true);
    workers[0].emit('message', { type: 'ready' });

    await expect(started).rejects.toThrow('cancelled');
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-1',
      type: 'cancel',
    });
    expect(workers[0].messages).not.toContainEqual(
      expect.objectContaining({ type: 'start' }),
    );
  });

  it('settles a completion racing with cancellation as cancelled', async () => {
    const events: AgentEvent[] = [];
    const service = new AiAgentService(userDataPath);
    const started = start(service, 'request-1', (event) => {
      events.push(event);
    });
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    await service.cancel(7, 'request-1');
    workers[0].emit('message', {
      delta: 'late output',
      requestId: 'request-1',
      type: 'text-delta',
    });
    workers[0].emit('message', {
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => events.some(({ type }) => type === 'cancelled'));

    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'text-delta' }),
    );
    expect(events.at(-1)).toEqual({
      requestId: 'request-1',
      type: 'cancelled',
    });
  });

  it('invalidates output and tool calls from an obsolete project session', async () => {
    let activeSession = true;
    const events: AgentEvent[] = [];
    const service = new AiAgentService(userDataPath, () => activeSession);
    const started = start(service, 'request-1', (event) => {
      events.push(event);
    });
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    activeSession = false;
    workers[0].emit('message', {
      delta: 'stale output',
      requestId: 'request-1',
      type: 'text-delta',
    });
    await waitFor(() => events.some(({ type }) => type === 'cancelled'));

    expect(events).not.toContainEqual(
      expect.objectContaining({ type: 'text-delta' }),
    );
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-1',
      type: 'cancel',
    });
  });

  it('starts a fresh worker after the runtime exits', async () => {
    const firstEvents: AgentEvent[] = [];
    const service = new AiAgentService(userDataPath);
    const firstStart = start(service, 'request-1', (event) => {
      firstEvents.push(event);
    });
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await firstStart;

    workers[0].emit('exit', 1);
    expect(firstEvents).toContainEqual({
      code: 'runtime-exited',
      requestId: 'request-1',
      type: 'error',
    });

    const secondStart = start(service, 'request-2');
    await waitFor(() => workers.length === 2);
    workers[1].emit('message', { type: 'ready' });
    await expect(secondStart).resolves.toBe('request-2');
    expect(electronMock.fork).toHaveBeenCalledTimes(2);
  });

  it('uses an application-owned working directory for Pi', async () => {
    const service = new AiAgentService(userDataPath);
    const started = start(service, 'request-1');
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    expect(workers[0].messages).toContainEqual(
      expect.objectContaining({
        cwd: path.join(userDataPath, 'ai', 'pi'),
        type: 'start',
      }),
    );
  });

  it('runs one Main-owned Scribe child task inside a pre-bound create proposal', async () => {
    const events: AgentEvent[] = [];
    const flawedMarkdown = '# Draft\n\n织母议会议会。塞拉认得那白袍。\n\n织母议会议会予你返回科瓦里斯的权与名。';
    const proposal = {
      documentId: 'chapter-created',
      documentKind: 'chapter' as const,
      markdown: flawedMarkdown,
      operation: 'create' as const,
      parentId: 'manuscript-root',
      parentTitle: 'Manuscript',
      projectRevision: 'a'.repeat(64),
      proposalId: 'proposal-create',
      requestId: 'request-1',
      title: 'Chapter One',
    };
    const proposals = {
      cancelRequest: vi.fn(),
      createFileOperation: vi.fn().mockResolvedValue(proposal),
      waitForDecision: vi.fn().mockResolvedValue({
        proposalId: proposal.proposalId,
        status: 'accepted',
      }),
    } as unknown as AgentProposalService;
    const dispatcher = new AgentToolDispatcher(writingContext(), undefined, proposals);
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;
    const curatorStart = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'curator') as {
      enabledTools: string[];
      responseLanguage: string;
      };
    expect(curatorStart.enabledTools).not.toContain('submit_writing_artifact');
    expect(curatorStart.enabledTools).not.toContain('delegate_writing');
    expect(curatorStart.enabledTools).toContain('propose_document_writing');
    expect(curatorStart.responseLanguage).toBe('zh-CN');

    workers[0].emit('message', {
      arguments: { command: 'cat /project/.index.json' },
      requestId: 'request-1',
      toolCallId: 'tool-read-structure',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read-structure'));
    workers[0].emit('message', {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentPath: null,
        kind: 'chapter',
        metadataTitle: 'Chapter One',
        objective: 'Write a new chapter.',
        parentPath: 'manuscript',
        requirements: ['Keep close third person.'],
        targetLength: null,
      },
      requestId: 'request-1',
      toolCallId: 'tool-propose-writing',
      toolName: 'propose_document_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe'));
    const child = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe') as {
        prompt: string;
        requestId: string;
      };
    expect(child.prompt).not.toContain(child.requestId);
    expect(child.prompt).not.toContain('assignmentId');
    expect(child.prompt).not.toContain('writingAssignmentId');
    expect(child.prompt).toContain('"targetDocumentPath":null');
    workers[0].emit('message', {
      input: '{}',
      requestId: child.requestId,
      toolCallId: 'tool-child-read',
      toolName: 'bash',
      type: 'tool-started',
    });
    workers[0].emit('message', {
      failed: false,
      output: '{"ok":true}',
      requestId: child.requestId,
      toolCallId: 'tool-child-read',
      toolName: 'bash',
      type: 'tool-completed',
    });
    workers[0].emit('message', {
      delta: 'I will now provide the finished chapter.',
      requestId: child.requestId,
      type: 'text-delta',
    });
    workers[0].emit('message', {
      arguments: { markdown: flawedMarkdown },
      requestId: child.requestId,
      toolCallId: 'tool-submit-artifact',
      toolName: 'submit_writing_artifact',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-submit-artifact'));
    workers[0].emit('message', {
      delta: 'The draft has been submitted.',
      requestId: child.requestId,
      type: 'text-delta',
    });
    workers[0].emit('message', {
      requestId: child.requestId,
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-propose-writing'));

    expect(workers[0].messages).toContainEqual(expect.objectContaining({
      customInstructions: 'Use restrained prose.',
      enabledTools: [
        'bash',
        'submit_writing_artifact',
      ],
      responseLanguage: 'zh-CN',
      role: 'scribe',
      type: 'start',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      agentRole: 'scribe',
      requestId: 'request-1',
      toolCallId: 'tool-child-read',
      type: 'tool-started',
    }));
    expect(workers[0].messages).toContainEqual({
      requestId: child.requestId,
      result: {
        data: { status: 'submitted' },
        ok: true,
        toolName: 'submit_writing_artifact',
      },
      toolCallId: 'tool-submit-artifact',
      type: 'tool-result',
    });
    expect(proposals.createFileOperation).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: 'chapter',
        markdown: proposal.markdown,
        operation: 'create',
        parentId: 'manuscript-root',
        projectRevision: 'a'.repeat(64),
        metadataTitle: 'Chapter One',
      },
    );
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-1',
      result: {
        data: { status: 'accepted' },
        ok: true,
        toolName: 'propose_document_writing',
      },
      toolCallId: 'tool-propose-writing',
      type: 'tool-result',
    });
  });

  it('terminates an invalid or severely truncated Scribe artifact without proposing it', async () => {
    const proposals = {
      createFileOperation: vi.fn(),
      waitForDecision: vi.fn(),
    } as unknown as AgentProposalService;
    const dispatcher = new AgentToolDispatcher(writingContext(), undefined, proposals);
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-invalid');
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;
    workers[0].emit('message', {
      arguments: { command: 'cat /project/.index.json' },
      requestId: 'request-invalid',
      toolCallId: 'tool-read-structure',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read-structure'));
    workers[0].emit('message', {
      arguments: { command: 'cat /project/.index.json' },
      requestId: 'request-invalid',
      toolCallId: 'tool-read-invalid',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read-invalid'));
    workers[0].emit('message', {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentPath: null,
        kind: 'chapter',
        metadataTitle: 'Second chapter',
        objective: 'Write a complete second chapter.',
        parentPath: 'manuscript',
        requirements: [],
        targetLength: 3_000,
      },
      requestId: 'request-invalid',
      toolCallId: 'tool-writing-invalid',
      toolName: 'propose_document_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe'));
    const child = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe') as { requestId: string };
    workers[0].emit('message', {
      arguments: { markdown: '短稿\n\n<prompt>unfinished</prompt>' },
      requestId: child.requestId,
      toolCallId: 'tool-submit-invalid',
      toolName: 'submit_writing_artifact',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-submit-invalid'));
    expect(workers[0].messages).toContainEqual({
      requestId: child.requestId,
      result: {
        error: {
          code: 'invalid-arguments',
          detail: 'The Scribe artifact was rejected: protocol-markup.',
        },
        ok: false,
        toolName: 'submit_writing_artifact',
      },
      toolCallId: 'tool-submit-invalid',
      type: 'tool-result',
    });
    workers[0].emit('message', {
      requestId: child.requestId,
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-writing-invalid'));
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-invalid',
      result: {
        error: {
          code: 'invalid-arguments',
          detail: 'Scribe submitted an invalid writing artifact: protocol-markup',
        },
        ok: false,
        toolName: 'propose_document_writing',
      },
      toolCallId: 'tool-writing-invalid',
      type: 'tool-result',
    });
    expect(proposals.createFileOperation).not.toHaveBeenCalled();
  });

  it('propagates parent cancellation to an active Scribe child task', async () => {
    const dispatcher = new AgentToolDispatcher(
      writingContext(),
      undefined,
      { cancelRequest: vi.fn() } as unknown as AgentProposalService,
    );
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-1');
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;
    workers[0].emit('message', {
      arguments: { command: 'cat /project/.index.json' },
      requestId: 'request-1',
      toolCallId: 'tool-read-structure',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read-structure'));
    workers[0].emit('message', {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentPath: null,
        kind: 'chapter',
        metadataTitle: 'Second chapter',
        objective: 'Write the next chapter.',
        parentPath: 'manuscript',
        requirements: [],
        targetLength: null,
      },
      requestId: 'request-1',
      toolCallId: 'tool-writing',
      toolName: 'propose_document_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe'));
    const child = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe') as { requestId: string };

    await expect(service.cancel(7, 'request-1')).resolves.toBe(true);

    expect(workers[0].messages).toContainEqual({
      requestId: child.requestId,
      type: 'cancel',
    });
  });

  it('forwards tool activity without ending the active request', async () => {
    const events: AgentEvent[] = [];
    const service = new AiAgentService(userDataPath);
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      input: '{}',
      requestId: 'request-1',
      toolCallId: 'tool-1',
      toolName: 'bash',
      type: 'tool-started',
    });
    workers[0].emit('message', {
      failed: false,
      output: '{"ok":true}',
      requestId: 'request-1',
      toolCallId: 'tool-1',
      toolName: 'bash',
      type: 'tool-completed',
    });
    workers[0].emit('message', {
      delta: 'after tool',
      requestId: 'request-1',
      type: 'text-delta',
    });
    await waitFor(() => events.some((event) => event.type === 'text-delta'));

    expect(events).toContainEqual(expect.objectContaining({
      agentRole: 'curator',
      toolCallId: 'tool-1',
      type: 'tool-started',
    }));
    expect(events).toContainEqual(expect.objectContaining({
      toolCallId: 'tool-1',
      type: 'tool-completed',
    }));
    expect(events.at(-1)).toEqual({
      delta: 'after tool',
      requestId: 'request-1',
      type: 'text-delta',
    });
  });

  it('notifies the renderer after direct story maintenance', async () => {
    const events: AgentEvent[] = [];
    const dispatcher = {
      execute: vi.fn(async (scope) => {
        scope.storyChanged?.(4);
        return {
          data: {
            appliedCount: 1,
            revision: 4,
            status: 'applied' as const,
          },
          ok: true as const,
          toolName: 'maintain_story_records' as const,
        };
      }),
      release: vi.fn(),
    } as unknown as AgentToolDispatcher;
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      arguments: {
        changes: [{
          name: 'Lin',
          operation: 'create_persona',
          role: 'Protagonist',
          summary: '',
        }],
      },
      requestId: 'request-1',
      toolCallId: 'tool-maintain',
      toolName: 'maintain_story_records',
      type: 'tool-request',
    });
    await waitFor(() => events.some((event) => event.type === 'story-changed'));

    expect(events).toContainEqual({
      requestId: 'request-1',
      revision: 4,
      type: 'story-changed',
    });
    expect(workers[0].messages).toContainEqual(expect.objectContaining({
      requestId: 'request-1',
      toolCallId: 'tool-maintain',
      type: 'tool-result',
    }));
  });

  it('refuses to complete while accepted writing still needs reconciliation', async () => {
    const events: AgentEvent[] = [];
    const projectDirectory = path.join(userDataPath, 'project');
    seedPendingReconciliation(projectDirectory);
    const service = new AiAgentService(
      userDataPath,
      () => true,
      new AgentToolDispatcher(
        writingContext(),
        undefined,
        { cancelRequest: vi.fn() } as unknown as AgentProposalService,
      ),
      () => projectDirectory,
    );
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      arguments: { command: 'cat /project/.index.json' },
      requestId: 'request-1',
      toolCallId: 'tool-read-structure',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read-structure'));

    workers[0].emit('message', {
      arguments: {
        documentAction: 'create',
        documentDomain: 'manuscript',
        documentPath: null,
        kind: 'chapter',
        metadataTitle: 'Second chapter',
        objective: 'Write another chapter.',
        parentPath: 'manuscript',
        requirements: [],
        targetLength: null,
      },
      requestId: 'request-1',
      toolCallId: 'tool-blocked-writing',
      toolName: 'propose_document_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-blocked-writing'));
    expect(workers[0].messages).toContainEqual(expect.objectContaining({
      result: {
        error: {
          code: 'invalid-arguments',
          detail: 'Complete the pending accepted-Manuscript reconciliation before starting another writing assignment.',
        },
        ok: false,
        toolName: 'propose_document_writing',
      },
      toolCallId: 'tool-blocked-writing',
      type: 'tool-result',
    }));

    workers[0].emit('message', {
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => events.some((event) => event.type === 'error'));

    expect(events.at(-1)).toEqual({
      code: 'workflow-incomplete',
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'error',
    });
  });

  it('allows completion after the reconciliation checkpoint is validated', async () => {
    const events: AgentEvent[] = [];
    const projectDirectory = path.join(userDataPath, 'project');
    seedPendingReconciliation(projectDirectory);
    const dispatcher = {
      execute: vi.fn(async (scope, request) => {
        if (request.toolName === 'bash') {
          return { data: { documents: [] }, ok: true as const, toolName: request.toolName };
        }
        const outcome = scope.completeStoryReconciliation?.('no_changes');
        return outcome?.ok
          ? { data: { status: 'complete' as const }, ok: true as const, toolName: request.toolName }
          : { error: { code: 'invalid-arguments' as const }, ok: false as const, toolName: request.toolName };
      }),
      release: vi.fn(),
    } as unknown as AgentToolDispatcher;
    const service = new AiAgentService(
      userDataPath,
      () => true,
      dispatcher,
      () => projectDirectory,
    );
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      arguments: { command: 'cat /context/story.json' },
      requestId: 'request-1',
      toolCallId: 'tool-story-only',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-story-only'));
    workers[0].emit('message', {
      arguments: { reason: 'Checked only story state.', status: 'no_changes' },
      requestId: 'request-1',
      toolCallId: 'tool-premature-complete',
      toolName: 'complete_story_reconciliation',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-premature-complete'));
    expect(workers[0].messages).toContainEqual(expect.objectContaining({
      result: expect.objectContaining({ ok: false }),
      toolCallId: 'tool-premature-complete',
      type: 'tool-result',
    }));
    workers[0].emit('message', {
      arguments: { command: 'cat /context/accepted.json /context/accepted.md /context/story.json' },
      requestId: 'request-1',
      toolCallId: 'tool-read',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read'));
    workers[0].emit('message', {
      arguments: { reason: 'No canonical changes found.', status: 'no_changes' },
      requestId: 'request-1',
      toolCallId: 'tool-complete',
      toolName: 'complete_story_reconciliation',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-complete'));

    workers[0].emit('message', {
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => events.some((event) => event.type === 'completed'));

    expect(events.at(-1)).toEqual({
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
  });

  it('automatically completes the checkpoint after focused reconciliation', async () => {
    const events: AgentEvent[] = [];
    const projectDirectory = path.join(userDataPath, 'project');
    seedPendingReconciliation(projectDirectory);
    const dispatcher = {
      execute: vi.fn(async (scope, request) => {
        if (request.toolName === 'bash') {
          return { data: { documents: [] }, ok: true as const, toolName: request.toolName };
        }
        if (request.toolName === 'complete_story_reconciliation') {
          const outcome = scope.completeStoryReconciliation?.('no_changes');
          return outcome?.ok
            ? {
                data: { status: 'complete' as const },
                ok: true as const,
                toolName: request.toolName,
              }
            : {
                error: { code: 'invalid-arguments' as const },
                ok: false as const,
                toolName: request.toolName,
              };
        }
        expect(scope.completeFocusedStoryReconciliation?.()).toBe(true);
        return {
          data: {
            appliedCount: 3,
            reconciliationStatus: 'complete' as const,
            revision: 1,
            status: 'applied' as const,
          },
          ok: true as const,
          toolName: request.toolName,
        };
      }),
      release: vi.fn(),
    } as unknown as AgentToolDispatcher;
    const service = new AiAgentService(
      userDataPath,
      () => true,
      dispatcher,
      () => projectDirectory,
    );
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      arguments: { command: 'cat /context/accepted.json /context/accepted.md /context/story.json' },
      requestId: 'request-1',
      toolCallId: 'tool-read',
      toolName: 'bash',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-read'));
    workers[0].emit('message', {
      arguments: {
        events: [{
          displayTime: 'Dawn',
          participants: [],
          precision: 'approximate',
          summary: 'The chapter event.',
          title: 'Arrival',
        }],
        newPersonae: [],
        newThreads: [],
        threadAdvances: [],
      },
      requestId: 'request-1',
      toolCallId: 'tool-reconcile',
      toolName: 'reconcile_accepted_document',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-reconcile'));

    workers[0].emit('message', {
      arguments: {
        reason: 'The focused reconciliation already completed the checkpoint.',
        status: 'no_changes',
      },
      requestId: 'request-1',
      toolCallId: 'tool-redundant-complete',
      toolName: 'complete_story_reconciliation',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-redundant-complete'));
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-1',
      result: {
        data: { status: 'complete' },
        ok: true,
        toolName: 'complete_story_reconciliation',
      },
      toolCallId: 'tool-redundant-complete',
      type: 'tool-result',
    });

    workers[0].emit('message', {
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
    await waitFor(() => events.some((event) => event.type === 'completed'));

    expect(events.at(-1)).toEqual({
      requestId: 'request-1',
      stopReason: 'stop',
      type: 'completed',
    });
  });
});
