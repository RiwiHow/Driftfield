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
});
