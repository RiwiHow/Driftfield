import type { ProjectStorySnapshot } from '../../../shared/contracts/project-story';
import {
  AGENT_STORY_CONTEXT_PATH,
  AGENT_STORY_CONTEXT_ROOT,
} from '../../../shared/contracts/agent-tool-schema';

const STORY_SHARD_SIZE = 500;

export interface StoryProjectionDocumentAnchor {
  documentId: string;
}

export interface StoryContextProjection {
  build(
    story: ProjectStorySnapshot,
    documents: Map<string, StoryProjectionDocumentAnchor>,
  ): Record<string, string>;
}

export class ShardedStoryContextProjection implements StoryContextProjection {
  build(
    story: ProjectStorySnapshot,
    documents: Map<string, StoryProjectionDocumentAnchor>,
  ): Record<string, string> {
    const files: Record<string, string> = {};
    const pathsByDocumentId = new Map(
      [...documents.entries()].map(([relativePath, anchor]) => [
        anchor.documentId,
        relativePath,
      ]),
    );
    const eventSources = story.eventSources.flatMap(
      ({ documentId, documentRevision: _documentRevision, ...source }) => {
        const documentPath = pathsByDocumentId.get(documentId);
        return documentPath === undefined ? [] : [{ ...source, documentPath }];
      },
    );
    const questions = story.questions.map(
      ({ originRequestId: _originRequestId, ...question }) => ({
        ...question,
        evidence: question.evidence === null
          ? null
          : {
              anchor: question.evidence.anchor,
              documentPath: pathsByDocumentId.get(question.evidence.documentId) ?? null,
              sourceKind: question.evidence.sourceKind,
            },
      }),
    );

    const collections = {
      'chronicle/event-participants': story.eventParticipants,
      'chronicle/event-sources': eventSources,
      'chronicle/events': story.events,
      'chronicle/moments': story.moments,
      'chronicle/timelines': story.timelines,
      'personae/records': story.personae,
      'questions/open': questions.filter(({ status }) => status === 'open'),
      'questions/resolved': questions.filter(({ status }) => status === 'resolved'),
      'threads/beats': story.beats,
      'threads/event-links': story.eventLinks,
      'threads/records': story.threads,
    } as const;
    const shards = Object.fromEntries(
      Object.entries(collections).map(([name, records]) => [
        name,
        writeShards(files, name, records),
      ]),
    );
    files[AGENT_STORY_CONTEXT_PATH] = `${JSON.stringify({
      counts: {
        beats: story.beats.length,
        eventLinks: story.eventLinks.length,
        eventParticipants: story.eventParticipants.length,
        eventSources: eventSources.length,
        events: story.events.length,
        moments: story.moments.length,
        openQuestions: collections['questions/open'].length,
        personae: story.personae.length,
        resolvedQuestions: collections['questions/resolved'].length,
        threads: story.threads.length,
        timelines: story.timelines.length,
      },
      format: 'driftfield-story-context-v1',
      shards,
    }, null, 2)}\n`;
    return files;
  }
}

const writeShards = (
  files: Record<string, string>,
  collection: string,
  records: readonly unknown[],
): string[] => {
  const paths: string[] = [];
  for (let offset = 0; offset < records.length; offset += STORY_SHARD_SIZE) {
    const start = String(offset + 1).padStart(6, '0');
    const end = String(Math.min(offset + STORY_SHARD_SIZE, records.length))
      .padStart(6, '0');
    const filePath = `${AGENT_STORY_CONTEXT_ROOT}/${collection}/${start}-${end}.jsonl`;
    files[filePath] = `${records.slice(offset, offset + STORY_SHARD_SIZE)
      .map((record) => JSON.stringify(record))
      .join('\n')}\n`;
    paths.push(filePath);
  }
  return paths;
};
