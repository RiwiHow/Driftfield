import { describe, expect, it } from 'vitest';

import { getAgentStartConfigurationError } from '../../../src/main/ai/agent-start-policy';
import type { AgentProviderStatus } from '../../../src/shared/contracts/agent-configuration';
import type { AgentSettings } from '../../../src/shared/contracts/settings';

const providers: AgentProviderStatus[] = [
  { configured: false, providerId: 'anthropic' },
  { configured: true, providerId: 'openai' },
];

const settings = (providerId: 'anthropic' | 'openai' | null): AgentSettings => ({
  defaultModel:
    providerId === null ? null : { modelId: 'model', providerId },
  thinkingLevel: 'medium',
});

describe('Agent start configuration policy', () => {
  it('requires an explicitly selected model', () => {
    expect(getAgentStartConfigurationError(settings(null), providers)).toBe(
      'model-not-configured',
    );
  });

  it('returns a typed error when the selected provider credential is absent', () => {
    expect(
      getAgentStartConfigurationError(settings('anthropic'), providers),
    ).toBe('credential-missing');
  });

  it('allows a configured provider', () => {
    expect(getAgentStartConfigurationError(settings('openai'), providers)).toBeNull();
  });
});
