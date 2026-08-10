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
import { AgentToolDispatcher } from '../../../src/main/ai/agent-tool-dispatcher';
import type { ProjectContextService } from '../../../src/main/ai/project-context-service';
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
  ) =>
    service.start({
      currentDocumentId: 'chapter.md',
      history: [],
      proposalOutcomes: [],
      model: { modelId: 'model', providerId: 'anthropic' },
      ownerId: 7,
      projectSessionId: 'session-1',
      prompt: 'Review this chapter',
      requestId,
      sendEvent,
      thinkingLevel: 'medium',
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

  it('runs one Main-owned Scribe child task and returns its draft to Curator', async () => {
    const events: AgentEvent[] = [];
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-1', (event) => events.push(event));
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;

    workers[0].emit('message', {
      arguments: {
        objective: 'Continue the chapter.',
        requirements: ['Keep close third person.'],
        targetDocumentId: 'chapter-1',
        targetLength: 800,
      },
      requestId: 'request-1',
      toolCallId: 'tool-delegate',
      toolName: 'delegate_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe'));
    const child = workers[0].messages.find((message) =>
      typeof message === 'object' && message !== null &&
      (message as { role?: unknown }).role === 'scribe') as { requestId: string };
    workers[0].emit('message', {
      arguments: {
        objective: 'Attempt a nested task.',
        requirements: [],
        targetDocumentId: null,
        targetLength: null,
      },
      requestId: child.requestId,
      toolCallId: 'tool-nested-delegate',
      toolName: 'delegate_writing',
      type: 'tool-request',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-nested-delegate'));
    workers[0].emit('message', {
      input: '{}',
      requestId: child.requestId,
      toolCallId: 'tool-child-read',
      toolName: 'get_novel_structure',
      type: 'tool-started',
    });
    workers[0].emit('message', {
      failed: false,
      output: '{"ok":true}',
      requestId: child.requestId,
      toolCallId: 'tool-child-read',
      toolName: 'get_novel_structure',
      type: 'tool-completed',
    });
    workers[0].emit('message', {
      delta: '# Draft\n\nMara opened the door.',
      requestId: child.requestId,
      type: 'text-delta',
    });
    workers[0].emit('message', {
      requestId: child.requestId,
      type: 'completed',
    });
    await waitFor(() => workers[0].messages.some((message) =>
      typeof message === 'object' && message !== null &&
      (message as { toolCallId?: unknown }).toolCallId === 'tool-delegate'));

    expect(workers[0].messages).toContainEqual(expect.objectContaining({
      enabledTools: [
        'get_novel_structure',
        'get_current_document',
        'get_document',
        'get_story_state',
      ],
      role: 'scribe',
      type: 'start',
    }));
    expect(workers[0].messages).toContainEqual({
      requestId: child.requestId,
      result: {
        error: { code: 'invalid-arguments' },
        ok: false,
        toolName: 'delegate_writing',
      },
      toolCallId: 'tool-nested-delegate',
      type: 'tool-result',
    });
    expect(events).toContainEqual(expect.objectContaining({
      agentRole: 'scribe',
      requestId: 'request-1',
      toolCallId: 'tool-child-read',
      type: 'tool-started',
    }));
    expect(workers[0].messages).toContainEqual({
      requestId: 'request-1',
      result: {
        data: {
          assignmentId: child.requestId,
          markdown: '# Draft\n\nMara opened the door.',
          status: 'completed',
        },
        ok: true,
        toolName: 'delegate_writing',
      },
      toolCallId: 'tool-delegate',
      type: 'tool-result',
    });
  });

  it('propagates parent cancellation to an active Scribe child task', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    const service = new AiAgentService(userDataPath, () => true, dispatcher);
    const started = start(service, 'request-1');
    await waitFor(() => workers.length === 1);
    workers[0].emit('message', { type: 'ready' });
    await started;
    workers[0].emit('message', {
      arguments: {
        objective: 'Continue the chapter.',
        requirements: [],
        targetDocumentId: 'chapter-1',
        targetLength: null,
      },
      requestId: 'request-1',
      toolCallId: 'tool-delegate',
      toolName: 'delegate_writing',
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
      toolName: 'get_current_document',
      type: 'tool-started',
    });
    workers[0].emit('message', {
      failed: false,
      output: '{"ok":true}',
      requestId: 'request-1',
      toolCallId: 'tool-1',
      toolName: 'get_current_document',
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
          data: { operationIds: ['operation-1'], revision: 4, status: 'applied' as const },
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
        storyRevision: 3,
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
});
