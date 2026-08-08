import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
} from '../../../shared/contracts/agent-configuration';

const EMPTY_CONFIGURATION: AgentConfiguration = { models: [], providers: [] };
type AgentConfigurationErrorCode = 'load' | 'remove' | 'save';

export const useAgentConfiguration = () => {
  const { t } = useTranslation('errors');
  const [configuration, setConfiguration] =
    useState<AgentConfiguration>(EMPTY_CONFIGURATION);
  const [errorCode, setErrorCode] =
    useState<AgentConfigurationErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setErrorCode(null);
    try {
      setConfiguration(await window.driftfield.getAgentConfiguration());
    } catch {
      setErrorCode('load');
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
      setErrorCode(null);
      try {
        setConfiguration(
          await window.driftfield.setAgentApiKey({ apiKey, providerId }),
        );
        return true;
      } catch {
        setErrorCode('save');
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
      setErrorCode(null);
      try {
        setConfiguration(
          await window.driftfield.removeAgentCredential({ providerId }),
        );
        return true;
      } catch {
        setErrorCode('remove');
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating],
  );

  return {
    configuration,
    error:
      errorCode === null
        ? null
        : t(
            errorCode === 'load'
              ? 'agent.configurationLoad'
              : errorCode === 'save'
                ? 'agent.credentialSave'
                : 'agent.credentialRemove',
          ),
    isUpdating,
    isLoading,
    removeCredential,
    setApiKey,
  };
};
