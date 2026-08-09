import type { AgentConfiguration } from "../../shared/contracts/agent-configuration";
import type { AgentCredentialService } from "../services/agent-credential-service";
import type { AgentModelConfigService } from "../services/agent-model-config-service";
import type { AiAgentService } from "./ai-agent-service";

export const getAgentConfiguration = async (
  aiAgentService: AiAgentService,
  agentCredentialService: AgentCredentialService,
  agentModelConfigService: AgentModelConfigService,
): Promise<AgentConfiguration> => {
  const providers = await agentCredentialService.getProviderStatuses();
  const configuredProviders = new Set<string>(
    providers
      .filter(({ configured }) => configured)
      .map(({ providerId }) => providerId),
  );
  return {
    modelOverrides: await agentModelConfigService.getOverrides(),
    models:
      configuredProviders.size === 0
        ? []
        : (await aiAgentService.listModels()).filter(({ providerId }) =>
            configuredProviders.has(providerId),
          ),
    providers,
  };
};
