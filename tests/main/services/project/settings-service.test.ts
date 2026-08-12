import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import {
  parseProjectAgentSettingsUpdate,
  ProjectSettingsService,
} from '../../../../src/main/services/project/settings-service';
import type { ProjectSession } from '../../../../src/main/services/project/session-service';

const directories: string[] = [];

const createSession = async (): Promise<ProjectSession> => {
  const directoryPath = await mkdtemp(path.join(tmpdir(), 'driftfield-project-settings-'));
  directories.push(directoryPath);
  return { directoryPath } as ProjectSession;
};

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe('project Agent settings', () => {
  it('requires an explicit inheritance choice', () => {
    expect(parseProjectAgentSettingsUpdate({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    })).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    });
    expect(() => parseProjectAgentSettingsUpdate({
      defaultModel: null,
      thinkingLevel: 'medium',
    })).toThrow('Invalid project Agent settings');
  });

  it('persists settings per project without leaking between projects', async () => {
    const first = await createSession();
    const second = await createSession();
    const service = new ProjectSettingsService();

    service.update(first, {
      defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
      thinkingLevel: 'high',
      useGlobal: false,
    });

    expect(service.get(first)).toEqual({
      defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
      thinkingLevel: 'high',
      useGlobal: false,
    });
    expect(service.get(second)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    });
    expect(service.reset(first)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    });
    service.dispose();
  });

  it('ignores an incompatible retired settings sidecar during an explicit reset', async () => {
    const session = await createSession();
    const dataDirectory = path.join(session.directoryPath, '.driftfield');
    await mkdir(dataDirectory, { recursive: true });
    const database = new DatabaseSync(path.join(dataDirectory, 'settings.sqlite'));
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (999, datetime('now'));
    `);
    database.close();
    const service = new ProjectSettingsService();

    expect(service.get(session)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    });
    expect(service.reset(session)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
      useGlobal: true,
    });
    service.dispose();
  });
});
