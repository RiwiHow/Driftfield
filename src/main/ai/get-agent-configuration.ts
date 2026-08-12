import type { AgentConfiguration } from "../../shared/contracts/agent-configuration";
import type { AgentCredentialService } from "../services/agent/credential-service";
import type { AgentModelConfigService } from "../services/agent/model-config-service";
import type { AiAgentService } from "./ai-agent-service";
import type { ProjectSession } from '../services/project/session-service';

export const getAgentConfiguration = async (
  aiAgentService: AiAgentService,
  agentCredentialService: AgentCredentialService,
  agentModelConfigService: AgentModelConfigService,
  session?: ProjectSession,
): Promise<AgentConfiguration> => {
  const providers = await agentCredentialService.getProviderStatuses();
  const configuredProviders = new Set<string>(
    providers
      .filter(({ configured }) => configured)
      .map(({ providerId }) => providerId),
  );
  return {
    modelOverrides: await agentModelConfigService.getOverrides(session),
    models:
      configuredProviders.size === 0
        ? []
        : (await aiAgentService.listModels(
            session === undefined
              ? undefined
              : await agentModelConfigService.prepareRuntime(session),
          )).filter(({ providerId }) =>
            configuredProviders.has(providerId),
          ),
    providers,
  };
};
