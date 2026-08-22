import { describe, expect, it } from 'vitest';

import { AgentReferenceRegistry } from '../../../src/main/ai/agent-reference-registry';

const uuid = '2a256007-92f2-423c-b1fb-9c194577713f';
const hash = '0c71edf716b9204ec064e7b1082f725ba8c8e0fe77ea2cef0a2a070a792775bd';

describe('AgentReferenceRegistry', () => {
  it('requires Lore category icons to come from a current-request search', () => {
    const refs = new AgentReferenceRegistry();

    try {
      refs.requireIconSuggestion('wand-sparkles');
      throw new Error('Expected the unissued icon to be rejected');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Search the Lucide icon catalog'),
      });
    }
    refs.anchorIconSuggestions(['wand', 'wand-sparkles']);
    expect(() => refs.requireIconSuggestion('wand-sparkles')).not.toThrow();
  });

  it('replaces persistent identities and withholds every revision', () => {
    const refs = new AgentReferenceRegistry();
    const structure = refs.exposeStructure({
      format: 'driftfield',
      lore: {
        children: [{
          displayTitle: 'World',
          id: 'lore-entry-uuid',
          kind: 'entry',
          metadataTitle: 'World',
          revision: hash,
          type: 'document',
        }],
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
      'lore-entry-uuid',
      'persona-uuid',
    ]) {
      expect(serialized).not.toContain(persistent);
    }
    expect(serialized).not.toContain('revision:');
    expect(serialized).not.toContain('baseRevision');
    expect(serialized).not.toContain('contentRevision');
    expect(structure.lore?.id).toBe('directory:2');
    expect(document.documentId).toBe('document:2');
    expect(story.personae[0].id).toBe('persona:1');
  });

  it('anchors the revisions it served so mutations need no model echo', () => {
    const refs = new AgentReferenceRegistry();
    const listedRevision = 'b'.repeat(64);
    refs.exposeStructure({
      format: 'driftfield',
      manuscript: {
        children: [{
          displayTitle: 'One',
          id: 'document-uuid',
          kind: 'chapter',
          metadataTitle: 'One',
          revision: listedRevision,
          type: 'document',
        }],
        id: 'manuscript-uuid',
        kind: 'manuscript',
        title: 'Manuscript',
        type: 'directory',
      },
      project: { id: 'project-uuid', revision: hash, title: 'Novel' },
    });

    expect(refs.requireProjectRevision()).toBe(hash);
    expect(refs.documentAnchor('document-uuid')).toEqual({
      baseRevision: listedRevision,
    });
    expect(() => refs.requireDocumentContentAnchor('document-uuid', 'document:1'))
      .toThrow(expect.objectContaining({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Read the contents of document:1'),
      }));

    refs.exposeDocument({
      baseRevision: listedRevision,
      contentRevision: hash,
      displayTitle: 'One',
      documentId: 'document-uuid',
      markdown: '# One',
      metadataTitle: 'One',
      source: 'draft',
    });
    expect(refs.requireDocumentContentAnchor('document-uuid', 'document:1'))
      .toEqual({ baseRevision: listedRevision, contentRevision: hash });
  });

  it('refuses revision anchors the model was never served', () => {
    const refs = new AgentReferenceRegistry();
    expect(() => refs.requireProjectRevision()).toThrow(
      expect.objectContaining({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Read the novel structure'),
      }),
    );
    expect(() => refs.requireStoryRevision()).toThrow(
      expect.objectContaining({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Read story_state'),
      }),
    );
    expect(() => refs.requireDocumentAnchor(uuid, 'document:1')).toThrow(
      expect.objectContaining({
        code: 'invalid-arguments',
        detail: expect.stringContaining('Read document:1 in this request'),
      }),
    );
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
