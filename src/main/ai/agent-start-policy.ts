import type { AgentProviderStatus } from '../../shared/contracts/agent-configuration';
import type { StartAgentErrorCode } from '../../shared/contracts/agent';
import type { AgentSettings } from '../../shared/contracts/settings';

export const getAgentStartConfigurationError = (
  settings: AgentSettings,
  providers: AgentProviderStatus[],
): StartAgentErrorCode | null => {
  if (settings.defaultModel === null) return 'model-not-configured';
  const provider = providers.find(
    ({ providerId }) => providerId === settings.defaultModel?.providerId,
  );
  return provider?.configured === true ? null : 'credential-missing';
};
