import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AgentCredentialService } from './agent-credential-service';

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
  });
});
