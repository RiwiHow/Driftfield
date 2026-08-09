import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ProjectSettingsService } from '../../../src/main/services/project-settings-service';
import type { ProjectSession } from '../../../src/main/services/project-session-service';

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
  it('persists settings per project without leaking between projects', async () => {
    const first = await createSession();
    const second = await createSession();
    const service = new ProjectSettingsService();

    service.update(first, {
      defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
      thinkingLevel: 'high',
    });

    expect(service.get(first)).toEqual({
      defaultModel: { modelId: 'model-a', providerId: 'anthropic' },
      thinkingLevel: 'high',
    });
    expect(service.get(second)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
    });
    expect(service.reset(first)).toEqual({
      defaultModel: null,
      thinkingLevel: 'medium',
    });
    service.dispose();
  });
});
