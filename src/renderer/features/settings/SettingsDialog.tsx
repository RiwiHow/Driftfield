import { Check, Cpu, Minimize2, MonitorCog, Power, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AGENT_API_KEY_PROVIDERS,
  type AgentApiKeyProviderId,
  type AgentConfiguration,
} from "../../../shared/contracts/agent-configuration";
import type {
  AgentSettings,
  AppSettings,
  AppTheme,
  UpdateProjectAgentSettingsRequest,
  UpdateAppSettingsRequest,
} from "../../../shared/contracts/settings";
import { APP_THEMES } from "../../../shared/contracts/settings";
import { APP_LANGUAGE_OPTIONS } from "../../../shared/i18n/languages";
import { AgentModelAdvancedSettings } from "./AgentModelAdvancedSettings";

interface SettingsDialogProps {
  agentConfiguration: AgentConfiguration;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onResetModelSettings: () => Promise<boolean>;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  onUpdateProjectAgent: (update: UpdateProjectAgentSettingsRequest) => void;
  onUpdateModelOverride: (
    override: import("../../../shared/contracts/agent-configuration").AgentModelOverride,
  ) => Promise<boolean>;
  open: boolean;
  projectAgentSettings: AgentSettings | null;
  settings: AppSettings;
}

const themeOptionMetadata = {
  "github-dark": {
    descriptionKey: "githubDark",
    label: "GitHub Dark",
  },
  "github-light": {
    descriptionKey: "githubLight",
    label: "GitHub Light",
  },
} as const satisfies Record<
  AppTheme,
  {
    descriptionKey: "githubDark" | "githubLight";
    label: string;
  }
>;

const themeOptions = APP_THEMES.map((theme) => ({
  ...themeOptionMetadata[theme],
  theme,
}));

const editorFontSizes = [14, 15, 16, 17, 18, 20, 22, 24];

export function SettingsDialog({
  agentConfiguration,
  error,
  isSaving,
  onOpenChange,
  onRemoveCredential,
  onResetModelSettings,
  onSetApiKey,
  onUpdate,
  onUpdateProjectAgent,
  onUpdateModelOverride,
  open,
  projectAgentSettings,
  settings,
}: SettingsDialogProps) {
  const { t } = useTranslation("settings");
  const { t: tAssistant } = useTranslation("assistant");
  const { t: tCommon } = useTranslation("common");
  const canChooseCloseBehavior = window.driftfield.platform !== "darwin";
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [credentialProvider, setCredentialProvider] =
    useState<AgentApiKeyProviderId>("anthropic");
  const [modelProviderId, setModelProviderId] = useState('');
  const [category, setCategory] = useState<"interface" | "models">("interface");
  const agentSettings = projectAgentSettings ?? {
    defaultModel: null,
    thinkingLevel: 'medium' as const,
  };
  const configuredModelProviders = agentConfiguration.providers.filter(
    ({ configured }) => configured,
  );
  const configuredProviderKey = configuredModelProviders
    .map(({ providerId }) => providerId)
    .join('\u0000');
  const providerModels = agentConfiguration.models.filter(
    ({ providerId }) => providerId === modelProviderId,
  );
  const selectedModelId =
    agentSettings.defaultModel?.providerId === modelProviderId
      ? agentSettings.defaultModel.modelId
      : '';
  const selectedModel =
    agentConfiguration.models.find(
      ({ id, providerId }) =>
        id === agentSettings.defaultModel?.modelId &&
        providerId === agentSettings.defaultModel?.providerId,
    ) ?? null;

  useEffect(() => {
    setModelProviderId((current) => {
      const storedProvider = projectAgentSettings?.defaultModel?.providerId;
      if (storedProvider !== undefined) return storedProvider;
      if (
        configuredModelProviders.some(
          ({ providerId }) => providerId === current,
        )
      ) {
        return current;
      }
      return configuredModelProviders[0]?.providerId ?? '';
    });
  }, [configuredProviderKey, projectAgentSettings?.defaultModel?.providerId]);

  const saveApiKey = async (): Promise<void> => {
    const apiKey = apiKeyRef.current?.value.trim() ?? "";
    if (apiKey.length === 0) return;
    if (await onSetApiKey(credentialProvider, apiKey)) {
      if (apiKeyRef.current !== null) apiKeyRef.current.value = "";
    }
  };

  const resetModelSettings = async (): Promise<void> => {
    if (!window.confirm(t('agent.resetConfirm'))) return;
    if (await onResetModelSettings()) {
      if (apiKeyRef.current !== null) apiKeyRef.current.value = '';
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="settings-dialog gap-0 p-0">
        <header className="settings-header">
          <DialogTitle className="settings-dialog-title">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="settings-dialog-description">
            {t("description")}
          </DialogDescription>
        </header>

        <div className="settings-body">
          <nav
            aria-label={t("categories.label")}
            className="settings-category-nav"
            role="tablist"
          >
            <button
              aria-controls="settings-interface-panel"
              aria-selected={category === "interface"}
              className={cn(
                "settings-category-button",
                category === "interface" && "is-active",
              )}
              id="settings-interface-tab"
              onClick={() => setCategory("interface")}
              role="tab"
              type="button"
            >
              <MonitorCog aria-hidden="true" size={17} />
              <span>
                <strong>{t("categories.interfaceTitle")}</strong>
                <small>{t("categories.interfaceDescription")}</small>
              </span>
            </button>
            <button
              aria-controls="settings-models-panel"
              aria-selected={category === "models"}
              className={cn(
                "settings-category-button",
                category === "models" && "is-active",
              )}
              id="settings-models-tab"
              onClick={() => setCategory("models")}
              role="tab"
              type="button"
            >
              <Cpu aria-hidden="true" size={17} />
              <span>
                <strong>{t("categories.modelsTitle")}</strong>
                <small>{t("categories.modelsDescription")}</small>
              </span>
            </button>
          </nav>

          {category === "interface" ? (
            <div
              aria-labelledby="settings-interface-tab"
              className="settings-panel"
              id="settings-interface-panel"
              role="tabpanel"
            >
              <header className="settings-panel-header">
                <h2>{t("categories.interfaceTitle")}</h2>
                <p>{t("categories.interfaceDescription")}</p>
              </header>

              <section className="settings-field-row">
                <div className="settings-field-copy">
                  <h3>{t("language.title")}</h3>
                  <p>{t("language.description")}</p>
                </div>
                <div className="settings-field-control">
                  <Label className="sr-only" htmlFor="application-language">
                    {t("language.label")}
                  </Label>
                  <Select
                    disabled={isSaving}
                    onValueChange={(language) =>
                      onUpdate({
                        language: language as AppSettings["language"],
                      })
                    }
                    value={settings.language}
                  >
                    <SelectTrigger
                      className="w-full"
                      id="application-language"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {APP_LANGUAGE_OPTIONS.map((language) => (
                        <SelectItem key={language.id} value={language.id}>
                          {language.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="settings-field-row settings-field-row-stacked">
                <div className="settings-field-copy">
                  <h3>{t("appearance.title")}</h3>
                  <p>{t("appearance.description")}</p>
                </div>

                <div className="theme-options">
                  {themeOptions.map((option) => {
                    const isSelected = settings.theme === option.theme;

                    return (
                      <Label
                        className={cn(
                          "theme-option relative block min-w-0 cursor-pointer",
                          isSaving && "pointer-events-none opacity-50",
                        )}
                        key={option.theme}
                      >
                        <input
                          checked={isSelected}
                          className="peer sr-only"
                          disabled={isSaving}
                          name="application-theme"
                          onChange={() => onUpdate({ theme: option.theme })}
                          type="radio"
                          value={option.theme}
                        />
                        <span className="theme-option-content">
                          <span
                            aria-hidden="true"
                            className="theme-swatch"
                            data-theme={option.theme}
                          >
                            <i />
                            <i />
                            <i />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5 pr-5">
                            <strong>{option.label}</strong>
                            <small>
                              {t(`appearance.themes.${option.descriptionKey}`)}
                            </small>
                          </span>
                          {isSelected && (
                            <Check
                              aria-hidden="true"
                              className="theme-option-check"
                              size={15}
                            />
                          )}
                        </span>
                      </Label>
                    );
                  })}
                </div>
              </section>

              <section className="settings-field-row">
                <div className="settings-field-copy">
                  <h3>{t("fontSize.title")}</h3>
                  <p>{t("fontSize.description")}</p>
                </div>

                <div className="settings-field-control settings-field-control-narrow">
                  <Label className="sr-only" htmlFor="editor-font-size">
                    {t("fontSize.label")}
                  </Label>
                  <Select
                    disabled={isSaving}
                    onValueChange={(fontSize) =>
                      onUpdate({ editorFontSize: Number(fontSize) })
                    }
                    value={String(settings.editorFontSize)}
                  >
                    <SelectTrigger
                      className="w-24"
                      id="editor-font-size"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {editorFontSizes.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} px
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {canChooseCloseBehavior && (
                <section className="settings-field-row">
                  <div className="settings-field-copy">
                    <h3>{t("closeBehavior.title")}</h3>
                    <p>{t("closeBehavior.description")}</p>
                  </div>

                  <div
                    aria-label={t("closeBehavior.label")}
                    className="close-behavior-options inline-flex shrink-0 rounded-lg border bg-secondary p-0.5"
                    role="group"
                  >
                    <Button
                      aria-pressed={settings.closeWindowBehavior === "quit"}
                      disabled={isSaving}
                      onClick={() => onUpdate({ closeWindowBehavior: "quit" })}
                      size="sm"
                      variant={
                        settings.closeWindowBehavior === "quit"
                          ? "secondary"
                          : "ghost"
                      }
                    >
                      <Power aria-hidden="true" size={13} />
                      {t("closeBehavior.quit")}
                    </Button>
                    <Button
                      aria-pressed={settings.closeWindowBehavior === "minimize"}
                      disabled={isSaving}
                      onClick={() =>
                        onUpdate({ closeWindowBehavior: "minimize" })
                      }
                      size="sm"
                      variant={
                        settings.closeWindowBehavior === "minimize"
                          ? "secondary"
                          : "ghost"
                      }
                    >
                      <Minimize2 aria-hidden="true" size={13} />
                      {t("closeBehavior.minimize")}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div
              aria-labelledby="settings-models-tab"
              className="settings-panel"
              id="settings-models-panel"
              role="tabpanel"
            >
              <header className="settings-panel-header">
                <h2>{t("categories.modelsTitle")}</h2>
                <p>{t("categories.modelsDescription")}</p>
              </header>

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
                      setCredentialProvider(provider as AgentApiKeyProviderId)
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
                  {agentConfiguration.providers
                    .filter(({ configured }) => configured)
                    .map(({ providerId }) => (
                      <span key={providerId}>
                        {AGENT_API_KEY_PROVIDERS.find(
                          ({ id }) => id === providerId,
                        )?.label ?? providerId}
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
                  {!agentConfiguration.providers.some(
                    ({ configured }) => configured,
                  ) && <small>{t("agent.noProvider")}</small>}
                </div>
              </section>

              <section className="settings-field-row settings-field-row-stacked">
                <div className="settings-field-copy">
                  <h3>{t("agent.modelTitle")}</h3>
                  <p>{t("agent.modelDescription")}</p>
                </div>
                <div className="settings-field-control model-selection-controls">
                  <Label className="sr-only" htmlFor="project-model-provider">
                    {t('agent.providerLabel')}
                  </Label>
                  <Select
                    disabled={
                      isSaving ||
                      projectAgentSettings === null ||
                      configuredModelProviders.length === 0
                    }
                    onValueChange={(providerId) => {
                      setModelProviderId(providerId);
                      if (agentSettings.defaultModel?.providerId !== providerId) {
                        onUpdateProjectAgent({
                          ...agentSettings,
                          defaultModel: null,
                        });
                      }
                    }}
                    value={modelProviderId}
                  >
                    <SelectTrigger
                      className="w-full"
                      id="project-model-provider"
                      size="sm"
                    >
                      <SelectValue placeholder={t('agent.selectProvider')} />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {configuredModelProviders.map(({ providerId }) => (
                        <SelectItem key={providerId} value={providerId}>
                          {AGENT_API_KEY_PROVIDERS.find(
                            ({ id }) => id === providerId,
                          )?.label ?? providerId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="sr-only" htmlFor="default-agent-model">
                    {t("agent.modelLabel")}
                  </Label>
                  <Select
                    disabled={
                      isSaving ||
                      projectAgentSettings === null ||
                      modelProviderId.length === 0 ||
                      providerModels.length === 0
                    }
                    onValueChange={(modelId) => {
                      const model = providerModels.find(
                        ({ id }) => id === modelId,
                      );
                      onUpdateProjectAgent({
                          ...agentSettings,
                          defaultModel:
                            model === undefined
                              ? null
                              : {
                                  modelId: model.id,
                                  providerId: model.providerId,
                                },
                          thinkingLevel:
                            model?.reasoning === false
                              ? "off"
                              : model?.thinkingLevelMap[
                                    agentSettings.thinkingLevel
                                  ] === null
                                ? ((
                                    [
                                      "off",
                                      "minimal",
                                      "low",
                                      "medium",
                                      "high",
                                      "xhigh",
                                      "max",
                                    ] as const
                                  ).find(
                                    (level) =>
                                      model.thinkingLevelMap[level] !== null,
                                  ) ?? "off")
                                : agentSettings.thinkingLevel,
                      });
                    }}
                    value={selectedModelId}
                  >
                    <SelectTrigger
                      className="w-full"
                      id="default-agent-model"
                      size="sm"
                    >
                      <SelectValue
                        placeholder={
                          providerModels.length === 0
                            ? t('agent.noModels')
                            : t("agent.selectModel")
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {providerModels.map((model) => (
                        <SelectItem
                          key={model.id}
                          value={model.id}
                        >
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              <section className="settings-field-row">
                <div className="settings-field-copy">
                  <h3>{t("agent.thinkingTitle")}</h3>
                  <p>{t("agent.thinkingDescription")}</p>
                </div>
                <div className="settings-field-control">
                  <Label className="sr-only" htmlFor="agent-thinking-level">
                    {t("agent.thinkingLabel")}
                  </Label>
                  <Select
                    disabled={
                      isSaving ||
                      projectAgentSettings === null ||
                      agentSettings.defaultModel === null ||
                      agentConfiguration.models.find(
                        ({ id, providerId }) =>
                          id === agentSettings.defaultModel?.modelId &&
                          providerId ===
                            agentSettings.defaultModel?.providerId,
                      )?.reasoning === false
                    }
                    onValueChange={(thinkingLevel) =>
                      onUpdateProjectAgent({
                          ...agentSettings,
                          thinkingLevel:
                            thinkingLevel as AgentSettings["thinkingLevel"],
                      })
                    }
                    value={agentSettings.thinkingLevel}
                  >
                    <SelectTrigger
                      className="w-full"
                      id="agent-thinking-level"
                      size="sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {(
                        [
                          "off",
                          "minimal",
                          "low",
                          "medium",
                          "high",
                          "xhigh",
                          "max",
                        ] as const
                      )
                        .filter(
                          (level) =>
                            selectedModel?.thinkingLevelMap[level] !== null,
                        )
                        .map((level) => (
                          <SelectItem key={level} value={level}>
                            {tAssistant(`thinking.${level}`)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </section>

              {agentSettings.defaultModel !== null && (
                <AgentModelAdvancedSettings
                  isSaving={isSaving}
                  model={selectedModel}
                  onSave={onUpdateModelOverride}
                  override={
                    agentConfiguration.modelOverrides.find(
                      ({ modelId, providerId }) =>
                        modelId === agentSettings.defaultModel?.modelId &&
                        providerId === agentSettings.defaultModel?.providerId,
                    ) ?? null
                  }
                />
              )}

              <section className="settings-field-row">
                <div className="settings-field-copy">
                  <h3>{t('agent.resetTitle')}</h3>
                  <p>{t('agent.resetDescription')}</p>
                </div>
                <div className="settings-field-control">
                  <Button
                    className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                    disabled={isSaving || projectAgentSettings === null}
                    onClick={() => void resetModelSettings()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RotateCcw aria-hidden="true" size={13} />
                    {t('agent.resetAction')}
                  </Button>
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="settings-footer">
          <span aria-live="polite" className={cn(error && "is-error")}>
            {error ??
              (isSaving ? t("saveStatus.saving") : t("saveStatus.saved"))}
          </span>
          <Button
            className="h-8 px-3 text-xs"
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="secondary"
          >
            {tCommon("actions.done")}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
