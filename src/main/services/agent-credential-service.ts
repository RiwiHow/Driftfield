import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AGENT_API_KEY_PROVIDERS,
  type AgentApiKeyProviderId,
  type AgentProviderStatus,
} from '../../shared/contracts/agent-configuration';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isAgentApiKeyProviderId = (
  value: unknown,
): value is AgentApiKeyProviderId =>
  typeof value === 'string' &&
  AGENT_API_KEY_PROVIDERS.some(({ id }) => id === value);

export class AgentCredentialService {
  readonly authPath: string;
  readonly modelsPath: string;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    const directory = path.join(userDataPath, 'ai', 'pi');
    this.authPath = path.join(directory, 'auth.json');
    this.modelsPath = path.join(directory, 'models.json');
  }

  async getProviderStatuses(): Promise<AgentProviderStatus[]> {
    const credentials = await this.readCredentials();
    return AGENT_API_KEY_PROVIDERS.map(({ id }) => ({
      configured: isRecord(credentials[id]),
      providerId: id,
    }));
  }

  async setApiKey(
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ): Promise<void> {
    if (apiKey.length === 0 || apiKey.length > 16 * 1024) {
      throw new Error('API key must not be empty');
    }
    await this.enqueue(async () => {
      const credentials = await this.readCredentials();
      credentials[providerId] = { key: apiKey, type: 'api_key' };
      await this.persist(credentials);
    });
  }

  async remove(providerId: AgentApiKeyProviderId): Promise<void> {
    await this.enqueue(async () => {
      const credentials = await this.readCredentials();
      delete credentials[providerId];
      await this.persist(credentials);
    });
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.updateQueue.then(operation);
    this.updateQueue = queued.catch(() => undefined);
    return queued;
  }

  private async readCredentials(): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.authPath, 'utf8'));
      return isRecord(parsed) ? parsed : {};
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || error instanceof SyntaxError) return {};
      throw error;
    }
  }

  private async persist(credentials: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(this.authPath), { recursive: true });
    const temporaryPath = `${this.authPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(credentials, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await rename(temporaryPath, this.authPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
