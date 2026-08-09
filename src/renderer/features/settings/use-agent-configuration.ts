import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  AgentApiKeyProviderId,
  AgentConfiguration,
  AgentModelOverride,
} from "../../../shared/contracts/agent-configuration";

const EMPTY_CONFIGURATION: AgentConfiguration = {
  models: [],
  modelOverrides: [],
  providers: [],
};
type AgentConfigurationErrorCode =
  | "credentialSave"
  | "load"
  | "modelSave"
  | "remove"
  | "reset";

export const useAgentConfiguration = (projectId: string | null) => {
  const { t } = useTranslation("errors");
  const [configuration, setConfiguration] =
    useState<AgentConfiguration>(EMPTY_CONFIGURATION);
  const [errorCode, setErrorCode] =
    useState<AgentConfigurationErrorCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const operationId = useRef(0);

  const refresh = useCallback(async () => {
    const currentOperation = ++operationId.current;
    setIsLoading(true);
    setErrorCode(null);
    try {
      const loaded = await window.driftfield.getAgentConfiguration();
      if (operationId.current === currentOperation) setConfiguration(loaded);
    } catch {
      if (operationId.current === currentOperation) setErrorCode("load");
    } finally {
      if (operationId.current === currentOperation) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [projectId, refresh]);

  const setApiKey = useCallback(
    async (providerId: AgentApiKeyProviderId, apiKey: string) => {
      if (isUpdating) return false;
      const currentOperation = ++operationId.current;
      setIsLoading(false);
      setIsUpdating(true);
      setErrorCode(null);
      try {
        const updated = await window.driftfield.setAgentApiKey({ apiKey, providerId });
        if (operationId.current === currentOperation) setConfiguration(updated);
        else await refresh();
        return true;
      } catch {
        if (operationId.current === currentOperation)
          setErrorCode("credentialSave");
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, refresh],
  );

  const removeCredential = useCallback(
    async (providerId: AgentApiKeyProviderId) => {
      if (isUpdating) return false;
      const currentOperation = ++operationId.current;
      setIsLoading(false);
      setIsUpdating(true);
      setErrorCode(null);
      try {
        const updated = await window.driftfield.removeAgentCredential({ providerId });
        if (operationId.current === currentOperation) setConfiguration(updated);
        else await refresh();
        return true;
      } catch {
        if (operationId.current === currentOperation) setErrorCode("remove");
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, refresh],
  );

  const updateModelOverride = useCallback(
    async (override: AgentModelOverride) => {
      if (isUpdating) return false;
      const currentOperation = ++operationId.current;
      setIsLoading(false);
      setIsUpdating(true);
      setErrorCode(null);
      try {
        const result = await window.driftfield.updateAgentModelOverride({ override });
        if (operationId.current === currentOperation) {
          setConfiguration((current) => ({
            ...current,
            modelOverrides: [
              ...current.modelOverrides.filter(
                ({ modelId, providerId }) =>
                  modelId !== override.modelId ||
                  providerId !== override.providerId,
              ),
              ...(result.override === null ? [] : [result.override]),
            ],
          }));
        }
        else await refresh();
        return true;
      } catch {
        if (operationId.current === currentOperation) setErrorCode("modelSave");
        return false;
      } finally {
        setIsUpdating(false);
      }
    },
    [isUpdating, refresh],
  );

  const resetSettings = useCallback(async () => {
    if (isUpdating) return null;
    const currentOperation = ++operationId.current;
    setIsLoading(false);
    setIsUpdating(true);
    setErrorCode(null);
    try {
      const result = await window.driftfield.resetAgentSettings();
      if (operationId.current === currentOperation) {
        setConfiguration(result.configuration);
      } else await refresh();
      return result;
    } catch {
      if (operationId.current === currentOperation) setErrorCode('reset');
      return null;
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, refresh]);

  return {
    configuration,
    error:
      errorCode === null
        ? null
        : t(
            errorCode === "load"
              ? "agent.configurationLoad"
              : errorCode === "credentialSave"
                ? "agent.credentialSave"
                : errorCode === "modelSave"
                  ? "agent.modelConfigSave"
                : errorCode === 'reset'
                  ? 'agent.resetFailed'
                  : "agent.credentialRemove",
          ),
    isUpdating,
    isLoading,
    removeCredential,
    resetSettings,
    setApiKey,
    updateModelOverride,
  };
};
