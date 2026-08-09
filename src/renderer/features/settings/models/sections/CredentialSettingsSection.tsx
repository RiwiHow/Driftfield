import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENT_API_KEY_PROVIDERS,
  type AgentApiKeyProviderId,
  type AgentProviderStatus,
} from "../../../../../shared/contracts/agent-configuration";

interface CredentialSettingsSectionProps {
  clearInputVersion: number;
  credentialProvider: AgentApiKeyProviderId;
  isSaving: boolean;
  onCredentialProviderChange: (providerId: AgentApiKeyProviderId) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  providers: AgentProviderStatus[];
}

export function CredentialSettingsSection({
  clearInputVersion,
  credentialProvider,
  isSaving,
  onCredentialProviderChange,
  onRemoveCredential,
  onSetApiKey,
  providers,
}: CredentialSettingsSectionProps) {
  const { t } = useTranslation("settings");
  const { t: tCommon } = useTranslation("common");
  const apiKeyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (apiKeyRef.current !== null) apiKeyRef.current.value = "";
  }, [clearInputVersion]);

  const saveApiKey = async (): Promise<void> => {
    const apiKey = apiKeyRef.current?.value.trim() ?? "";
    if (apiKey.length === 0) return;
    if (await onSetApiKey(credentialProvider, apiKey)) {
      if (apiKeyRef.current !== null) apiKeyRef.current.value = "";
    }
  };

  const configuredProviders = providers.filter(({ configured }) => configured);

  return (
    <section className="settings-field-row settings-field-row-stacked">
      <div className="settings-field-copy">
        <h3>{t("agent.providerTitle")}</h3>
        <p>{t("agent.credentialDescription")}</p>
      </div>
      <div className="agent-credential-form">
        <Label className="sr-only" htmlFor="credential-provider">
          {t("agent.providerTitle")}
        </Label>
        <Select
          disabled={isSaving}
          onValueChange={(provider) =>
            onCredentialProviderChange(provider as AgentApiKeyProviderId)
          }
          value={credentialProvider}
        >
          <SelectTrigger
            className="w-full"
            id="credential-provider"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="settings-select-content">
            {AGENT_API_KEY_PROVIDERS.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="sr-only" htmlFor="agent-api-key">
          {t("agent.keyPlaceholder")}
        </Label>
        <Input
          autoComplete="off"
          className="h-8 text-xs"
          disabled={isSaving}
          id="agent-api-key"
          placeholder={t("agent.keyPlaceholder")}
          ref={apiKeyRef}
          type="password"
        />
        <Button
          className="h-8 px-3 text-xs"
          disabled={isSaving}
          onClick={() => void saveApiKey()}
          size="sm"
          type="button"
          variant="outline"
        >
          {tCommon("actions.save")}
        </Button>
      </div>
      <div className="agent-provider-statuses">
        {configuredProviders.map(({ providerId }) => (
          <span key={providerId}>
            {AGENT_API_KEY_PROVIDERS.find(({ id }) => id === providerId)
              ?.label ?? providerId}
            <Button
              className="h-auto p-0 text-[9px] text-destructive hover:bg-transparent hover:text-destructive/80"
              disabled={isSaving}
              onClick={() => onRemoveCredential(providerId)}
              size="sm"
              variant="ghost"
            >
              {tCommon("actions.remove")}
            </Button>
          </span>
        ))}
        {configuredProviders.length === 0 && (
          <small>{t("agent.noProvider")}</small>
        )}
      </div>
    </section>
  );
}
