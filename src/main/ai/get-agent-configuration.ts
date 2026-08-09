import type { AgentConfiguration } from '../../shared/contracts/agent-configuration';
import type { AgentCredentialService } from '../services/agent-credential-service';
import type { AiAgentService } from './ai-agent-service';

export const getAgentConfiguration = async (
  aiAgentService: AiAgentService,
  agentCredentialService: AgentCredentialService,
): Promise<AgentConfiguration> => {
  const providers = await agentCredentialService.getProviderStatuses();
  const configuredProviders = new Set<string>(
    providers
      .filter(({ configured }) => configured)
      .map(({ providerId }) => providerId),
  );
  return {
    models:
      configuredProviders.size === 0
        ? []
        : (await aiAgentService.listModels()).filter(({ providerId }) =>
            configuredProviders.has(providerId),
          ),
    providers,
  };
};
