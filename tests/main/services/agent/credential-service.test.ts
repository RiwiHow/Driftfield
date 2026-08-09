import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AgentCredentialService } from '../../../../src/main/services/agent/credential-service';

describe('AgentCredentialService', () => {
  it('stores and removes API keys without returning their value', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-auth-'));
    const service = new AgentCredentialService(directory);

    await service.setApiKey('anthropic', 'secret-value');
    expect(await service.getProviderStatuses()).toContainEqual({
      configured: true,
      providerId: 'anthropic',
    });
    expect(await readFile(service.authPath, 'utf8')).toContain('secret-value');

    await service.remove('anthropic');
    expect(await service.getProviderStatuses()).toContainEqual({
      configured: false,
      providerId: 'anthropic',
    });

    await service.setApiKey('openrouter', 'another-secret');
    await service.reset();
    expect((await service.getProviderStatuses()).every(({ configured }) => !configured))
      .toBe(true);
  });

  it('treats malformed credential JSON as unconfigured', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-auth-'));
    const service = new AgentCredentialService(directory);
    await mkdir(path.dirname(service.authPath), { recursive: true });
    await writeFile(service.authPath, '{not valid json', 'utf8');

    expect(await service.getProviderStatuses()).toEqual(
      expect.arrayContaining([
        { configured: false, providerId: 'anthropic' },
        { configured: false, providerId: 'openai' },
      ]),
    );
  });

  it.runIf(process.platform !== 'win32')(
    'surfaces credential storage read failures without exposing file contents',
    async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-auth-'));
      const service = new AgentCredentialService(directory);
      await mkdir(service.authPath, { recursive: true });
      await chmod(service.authPath, 0o000);

      try {
        await expect(service.getProviderStatuses()).rejects.toMatchObject({
          code: expect.stringMatching(/EISDIR|EACCES|EPERM/),
        });
      } finally {
        await chmod(service.authPath, 0o700);
      }
    },
  );
});
