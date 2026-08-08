import { useCallback, useEffect, useState } from 'react';

import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
} from '../../../shared/contracts/agent-configuration';

const EMPTY_CONFIGURATION: AgentConfiguration = { models: [], providers: [] };

export const useAgentConfiguration = () => {
  const [configuration, setConfiguration] =
    useState<AgentConfiguration>(EMPTY_CONFIGURATION);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setConfiguration(await window.driftfield.getAgentConfiguration());
    } catch {
      setError('无法读取 Agent 模型配置。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setApiKey = useCallback(
    async (providerId: AgentApiKeyProviderId, apiKey: string) => {
      if (isUpdating) return false;
      setIsUpdating(true);
      setError(null);
      try {
        setConfiguration(
          await window.driftfield.setAgentApiKey({ apiKey, providerId }),
        );
        return true;
      } catch {
        setError('无法保存凭据或读取模型，请检查 API Key。');
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating],
  );

  const removeCredential = useCallback(
    async (providerId: AgentApiKeyProviderId) => {
      if (isUpdating) return false;
      setIsUpdating(true);
      setError(null);
      try {
        setConfiguration(
          await window.driftfield.removeAgentCredential({ providerId }),
        );
        return true;
      } catch {
        setError('无法移除 Agent 凭据。');
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating],
  );

  return {
    configuration,
    error,
    isUpdating,
    isLoading,
    removeCredential,
    setApiKey,
  };
};
