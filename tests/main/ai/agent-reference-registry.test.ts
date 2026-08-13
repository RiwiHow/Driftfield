import { describe, expect, it } from 'vitest';

import { AgentReferenceRegistry } from '../../../src/main/ai/agent-reference-registry';

const uuid = '2a256007-92f2-423c-b1fb-9c194577713f';
const hash = '0c71edf716b9204ec064e7b1082f725ba8c8e0fe77ea2cef0a2a070a792775bd';

describe('AgentReferenceRegistry', () => {
  it('replaces persistent structure, document, story, and revision identities', () => {
    const refs = new AgentReferenceRegistry();
    const structure = refs.exposeStructure({
      availableIcons: [],
      format: 'driftfield',
      lore: {
        children: [],
        id: uuid,
        kind: 'category',
        title: 'World',
        type: 'directory',
      },
      manuscript: {
        children: [],
        id: 'manuscript-uuid',
        kind: 'manuscript',
        title: 'Manuscript',
        type: 'directory',
      },
      project: { id: 'project-uuid', revision: hash, title: 'Novel' },
    });
    const document = refs.exposeDocument({
      baseRevision: hash,
      contentRevision: hash,
      displayTitle: 'World',
      documentId: 'document-uuid',
      markdown: '# World',
      metadataTitle: 'World',
      source: 'disk',
    });
    const story = refs.exposeStory({
      beats: [],
      eventLinks: [],
      eventParticipants: [],
      eventSources: [],
      events: [],
      moments: [],
      personae: [{
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'persona-uuid',
        kind: 'character',
        name: 'Lin',
        role: null,
        summary: '',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      questions: [],
      revision: 1,
      threads: [],
      timelines: [],
    });

    const serialized = JSON.stringify({ document, story, structure });
    for (const persistent of [
      uuid,
      hash,
      'manuscript-uuid',
      'project-uuid',
      'document-uuid',
      'persona-uuid',
    ]) {
      expect(serialized).not.toContain(persistent);
    }
    expect(structure.lore?.id).toBe('directory:2');
    expect(structure.project.revision).toBe('revision:1');
    expect(document.documentId).toBe('document:1');
    expect(document.baseRevision).toBe('revision:1');
    expect(story.personae[0].id).toBe('persona:1');
  });

  it('resolves only refs from the active registry and enforces their kind', () => {
    const refs = new AgentReferenceRegistry();
    const documentRef = refs.expose('document', uuid);
    expect(refs.resolve(documentRef, 'document')).toBe(uuid);
    expect(() => refs.resolve(documentRef, 'directory')).toThrow(
      expect.objectContaining({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Wrong-kind request reference'),
      }),
    );
    expect(() => new AgentReferenceRegistry().resolve(documentRef, 'document'))
      .toThrow(expect.objectContaining({
        code: 'expired-request-reference',
        detail: expect.stringContaining('not issued in this request or has expired'),
      }));

    for (const unissued of [uuid, hash, 'chapter-one', 'document:999']) {
      expect(() => refs.resolve(unissued, 'document')).toThrow(
        expect.objectContaining({
          code: 'expired-request-reference',
          detail: expect.stringContaining('not issued in this request or has expired'),
        }),
      );
    }
  });
});
