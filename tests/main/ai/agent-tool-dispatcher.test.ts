import { describe, expect, it, vi } from 'vitest';

import { AgentToolDispatcher } from '../../../src/main/ai/agent-tool-dispatcher';
import type { AgentProjectBashExecution, ProjectContextService } from '../../../src/main/ai/project-context-service';

const scope = { ownerId: 7, projectSessionId: 'session-1', requestId: 'request-1' };

const bashExecution = (): AgentProjectBashExecution => ({
  directories: new Map([
    ['manuscript', { directoryId: 'manuscript-root', kind: 'manuscript' }],
    ['lore/World', { directoryId: 'world-directory', kind: 'category' }],
  ]),
  documents: new Map([['manuscript/chapter.md', {
    baseRevision: 'base-revision',
    contentRevision: 'content-revision',
    documentId: 'chapter-id',
    kind: 'chapter',
  }]]),
  projectRevision: 'project-revision',
  result: { exitCode: 0, stderr: '', stdout: '/context/project.json\n' },
  story: {
    beats: [], eventLinks: [], eventParticipants: [], eventSources: [], events: [],
    moments: [{
      displayTime: 'Now', id: 'moment-id', note: '', orderKey: 0,
      precision: 'unknown', timelineId: 'timeline-id',
    }],
    personae: [], questions: [], revision: 3, threads: [],
    timelines: [{
      createdAt: '', id: 'timeline-id', isPrimary: true, summary: '',
      title: 'Main', updatedAt: '',
    }],
  },
});

describe('AgentToolDispatcher Bash snapshots', () => {
  it('returns only the Bash result while retaining Main-owned anchors', async () => {
    const context = { executeProjectBash: vi.fn().mockResolvedValue(bashExecution()) } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);
    await expect(dispatcher.execute(scope, {
      arguments: { command: 'find . -type f' }, toolName: 'bash',
    })).resolves.toEqual({
      data: { exitCode: 0, stderr: '', stdout: '/context/project.json\n' }, ok: true, toolName: 'bash',
    });
  });

  it('requires a Bash snapshot before a mutation', async () => {
    const dispatcher = new AgentToolDispatcher({} as ProjectContextService);
    await expect(dispatcher.execute(scope, {
      arguments: { changes: [{ isPrimary: true, operation: 'create_timeline', summary: '', title: 'Main' }] },
      toolName: 'maintain_story_records',
    })).resolves.toMatchObject({ error: { code: 'invalid-arguments' }, ok: false });
  });

  it('resolves manuscript citations from Bash paths and uses the anchored story revision', async () => {
    const context = {
      executeProjectBash: vi.fn().mockResolvedValue(bashExecution()),
      maintainStoryRecords: vi.fn().mockReturnValue({ appliedCount: 1, revision: 4, status: 'applied' }),
    } as unknown as ProjectContextService;
    const dispatcher = new AgentToolDispatcher(context);
    await dispatcher.execute(scope, { arguments: { command: 'cat /context/story.json' }, toolName: 'bash' });
    const result = await dispatcher.execute(scope, {
      arguments: { changes: [{
        causes: '', consequences: '', endMomentId: null, status: 'established',
        operation: 'create_event', participants: [],
        sources: [{ anchor: 'Opening', documentPath: 'manuscript/chapter.md', relation: 'depicted', sourceKind: 'manuscript' }],
        startMomentId: 'moment-id', summary: 'Arrival.', timelineId: 'timeline-id', title: 'Arrival',
      }] },
      toolName: 'maintain_story_records',
    });
    expect(result).toMatchObject({ ok: true, toolName: 'maintain_story_records' });
    expect(context.maintainStoryRecords).toHaveBeenCalledWith(
      { ownerId: 7, projectSessionId: 'session-1' }, 'request-1', 3,
      [expect.objectContaining({ sources: [{
        anchor: 'Opening', documentId: 'chapter-id', documentRevision: 'base-revision',
        relation: 'depicted', sourceKind: 'manuscript',
      }] })],
    );
  });
});
