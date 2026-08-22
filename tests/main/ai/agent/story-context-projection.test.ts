import { describe, expect, it } from 'vitest';

import { ShardedStoryContextProjection } from '../../../../src/main/ai/agent/story-context-projection';
import type { ProjectStorySnapshot } from '../../../../src/shared/contracts/project-story';

describe('ShardedStoryContextProjection', () => {
  it('keeps the navigation index small and splits large collections', () => {
    const story = emptyStory();
    story.personae = Array.from({ length: 501 }, (_, index) => ({
      createdAt: '2026-08-22T00:00:00.000Z',
      id: `persona-${index}`,
      kind: 'character' as const,
      name: `Persona ${index}`,
      role: null,
      summary: `Summary ${index}`,
      updatedAt: '2026-08-22T00:00:00.000Z',
    }));

    const files = new ShardedStoryContextProjection().build(story, new Map());
    const index = JSON.parse(files['/context/story/index.json']) as {
      counts: { personae: number };
      shards: Record<string, string[]>;
    };

    expect(index.counts.personae).toBe(501);
    expect(index.shards['personae/records']).toEqual([
      '/context/story/personae/records/000001-000500.jsonl',
      '/context/story/personae/records/000501-000501.jsonl',
    ]);
    expect(files['/context/story/index.json']).not.toContain('Persona 0');
    expect(files[index.shards['personae/records'][0]].trim().split('\n')).toHaveLength(500);
    expect(files[index.shards['personae/records'][1]].trim().split('\n')).toHaveLength(1);
  });
});

const emptyStory = (): ProjectStorySnapshot => ({
  beats: [],
  eventLinks: [],
  eventParticipants: [],
  eventSources: [],
  events: [],
  moments: [],
  personae: [],
  questions: [],
  revision: 0,
  threads: [],
  timelines: [],
});
