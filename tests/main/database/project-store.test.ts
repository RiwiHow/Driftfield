import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProjectStoreRegistry } from '../../../src/main/database/project-store';

describe('ProjectStore', () => {
  it('shares one unit of work and rolls back cross-repository failures', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'driftfield-store-'));
    const stores = new ProjectStoreRegistry();
    try {
      const store = stores.get(directory);
      expect(stores.get(directory)).toBe(store);
      expect(() => store.write(({ settings, stories }) => {
        settings.update({
          defaultModel: { modelId: 'model-a', providerId: 'provider-a' },
          thinkingLevel: 'high',
          useGlobal: false,
        });
        stories.createPersona(0, { name: 'Mara', role: null, summary: '' });
        throw new Error('rollback');
      })).toThrow('rollback');

      expect(store.read(({ settings }) => settings.get())).toMatchObject({
        defaultModel: null,
        thinkingLevel: 'medium',
        useGlobal: true,
      });
      expect(store.read(({ stories }) => stories.getSnapshot())).toMatchObject({
        personae: [],
        revision: 0,
      });
    } finally {
      stores.dispose();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
