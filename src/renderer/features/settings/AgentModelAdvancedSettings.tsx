import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  AGENT_THINKING_FORMATS,
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelOption,
  type AgentModelOverride,
  type AgentOpenRouterRoutingOverride,
  type AgentThinkingLevelKey,
} from "../../../shared/contracts/agent-configuration";

interface AgentModelAdvancedSettingsProps {
  isSaving: boolean;
  model: AgentModelOption | null;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (override: AgentModelOverride) => Promise<boolean>;
  override: AgentModelOverride | null;
}

type RoutingMode = "automatic" | "exact" | "ordered";
type TriState = "default" | "enabled" | "disabled";

const emptyCompatibility = (): AgentModelOverride["compatibility"] => ({
  maxTokensField: null,
  supportsDeveloperRole: null,
  supportsReasoningEffort: null,
  supportsUsageInStreaming: null,
  thinkingFormat: null,
});

const emptyOverride = (model: AgentModelOption): AgentModelOverride => ({
  compatibility: emptyCompatibility(),
  headers: [],
  modelId: model.id,
  openRouterRouting: null,
  providerId: model.providerId,
  thinkingLevelMap: {},
});

const emptyRouting = (): AgentOpenRouterRoutingOverride => ({
  allowFallbacks: null,
  dataCollection: null,
  only: [],
  order: [],
  requireParameters: null,
  zdr: null,
});

const splitProviderList = (value: string): string[] => [
  ...new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];

const toTriState = (value: boolean | null): TriState =>
  value === null ? "default" : value ? "enabled" : "disabled";

const fromTriState = (value: string): boolean | null =>
  value === "default" ? null : value === "enabled";

const inferRoutingMode = (
  routing: AgentOpenRouterRoutingOverride | null,
): RoutingMode => {
  if (routing === null) return "automatic";
  return routing.only.length === 1 && routing.order.length <= 1
    ? "exact"
    : "ordered";
};

export function AgentModelAdvancedSettings({
  isSaving,
  model,
  onDirtyChange,
  onSave,
  override,
}: AgentModelAdvancedSettingsProps) {
  const { t } = useTranslation("settings");
  const { t: tAssistant } = useTranslation("assistant");
  const { t: tCommon } = useTranslation("common");
  const [draft, setDraft] = useState<AgentModelOverride | null>(null);
  const [routingMode, setRoutingMode] =
    useState<RoutingMode>("automatic");
  const persisted = useMemo(
    () =>
      model === null
        ? null
        : structuredClone(override ?? emptyOverride(model)),
    [model, override],
  );

  useEffect(() => {
    setDraft(persisted);
    setRoutingMode(inferRoutingMode(persisted?.openRouterRouting ?? null));
  }, [persisted]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(persisted),
    [draft, persisted],
  );

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  if (model === null || draft === null) return null;

  const canSave =
    isDirty &&
    (routingMode !== "exact" ||
      draft.openRouterRouting?.only.length === 1);

  const updateRoutingMode = (mode: RoutingMode): void => {
    setRoutingMode(mode);
    setDraft((current) => {
      if (current === null) return current;
      if (mode === "automatic") return { ...current, openRouterRouting: null };
      const routing = current.openRouterRouting ?? emptyRouting();
      const first = routing.only[0] ?? routing.order[0] ?? "";
      return {
        ...current,
        openRouterRouting:
          mode === "exact"
            ? {
                ...routing,
                allowFallbacks: false,
                only: first ? [first] : [],
                order: first ? [first] : [],
              }
            : {
                ...routing,
                only: [],
                order: routing.order.length > 0 ? routing.order : routing.only,
              },
      };
    });
  };

  const updateThinkingMap = (
    level: AgentThinkingLevelKey,
    mode: "default" | "unsupported" | "custom",
  ): void => {
    setDraft((current) => {
      if (current === null) return current;
      const map = { ...current.thinkingLevelMap };
      if (mode === "default") delete map[level];
      else map[level] = mode === "unsupported" ? null : (map[level] ?? level);
      return { ...current, thinkingLevelMap: map };
    });
  };

  return (
    <section className="model-advanced-settings">
      <header className="model-advanced-header">
        <div>
          <h3>{t("modelConfig.title")}</h3>
          <p>{t("modelConfig.description", { model: model.name })}</p>
        </div>
        <Button
          className="h-8 px-3 text-xs"
          disabled={isSaving || !canSave}
          onClick={() => void onSave(draft)}
          size="sm"
          type="button"
          variant="outline"
        >
          {tCommon("actions.save")}
        </Button>
      </header>

      {model.providerId === "openrouter" && (
        <div className="model-config-group">
          <div className="settings-field-copy">
            <h3>{t("modelConfig.routing.title")}</h3>
            <p>{t("modelConfig.routing.description")}</p>
          </div>
          <div className="model-config-grid">
            <Label htmlFor="openrouter-routing-mode">
              {t("modelConfig.routing.mode")}
            </Label>
            <Select
              disabled={isSaving}
              onValueChange={(value) => updateRoutingMode(value as RoutingMode)}
              value={routingMode}
            >
              <SelectTrigger
                className="w-full"
                id="openrouter-routing-mode"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="settings-select-content">
                {(["automatic", "exact", "ordered"] as const).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`modelConfig.routing.modes.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {routingMode !== "automatic" &&
              draft.openRouterRouting !== null && (
                <>
                  <Label htmlFor="openrouter-provider-list">
                    {t("modelConfig.routing.providers")}
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    disabled={isSaving}
                    id="openrouter-provider-list"
                    onChange={(event) => {
                      const providers = splitProviderList(event.target.value);
                      setDraft((current) =>
                        current?.openRouterRouting === null || current === null
                          ? current
                          : {
                              ...current,
                              openRouterRouting:
                                routingMode === "exact"
                                  ? {
                                      ...current.openRouterRouting,
                                      only: providers.slice(0, 1),
                                      order: providers.slice(0, 1),
                                    }
                                  : {
                                      ...current.openRouterRouting,
                                      order: providers,
                                    },
                            },
                      );
                    }}
                    placeholder={t("modelConfig.routing.providerPlaceholder")}
                    value={(routingMode === "exact"
                      ? draft.openRouterRouting.only
                      : draft.openRouterRouting.order
                    ).join(", ")}
                  />
                  <Label>{t("modelConfig.routing.fallbacks")}</Label>
                  <Select
                    disabled={isSaving || routingMode === "exact"}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current?.openRouterRouting === null || current === null
                          ? current
                          : {
                              ...current,
                              openRouterRouting: {
                                ...current.openRouterRouting,
                                allowFallbacks: fromTriState(value),
                              },
                            },
                      )
                    }
                    value={toTriState(draft.openRouterRouting.allowFallbacks)}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {(["default", "enabled", "disabled"] as const).map(
                        (state) => (
                          <SelectItem key={state} value={state}>
                            {t(`modelConfig.states.${state}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Label>{t("modelConfig.routing.requireParameters")}</Label>
                  <Select
                    disabled={isSaving}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current?.openRouterRouting === null || current === null
                          ? current
                          : {
                              ...current,
                              openRouterRouting: {
                                ...current.openRouterRouting,
                                requireParameters: fromTriState(value),
                              },
                            },
                      )
                    }
                    value={toTriState(
                      draft.openRouterRouting.requireParameters,
                    )}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {(["default", "enabled", "disabled"] as const).map(
                        (state) => (
                          <SelectItem key={state} value={state}>
                            {t(`modelConfig.states.${state}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Label>{t("modelConfig.routing.zdr")}</Label>
                  <Select
                    disabled={isSaving}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current?.openRouterRouting === null || current === null
                          ? current
                          : {
                              ...current,
                              openRouterRouting: {
                                ...current.openRouterRouting,
                                zdr: fromTriState(value),
                              },
                            },
                      )
                    }
                    value={toTriState(draft.openRouterRouting.zdr)}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {(["default", "enabled", "disabled"] as const).map(
                        (state) => (
                          <SelectItem key={state} value={state}>
                            {t(`modelConfig.states.${state}`)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Label>{t("modelConfig.routing.dataCollection")}</Label>
                  <Select
                    disabled={isSaving}
                    onValueChange={(value) =>
                      setDraft((current) =>
                        current?.openRouterRouting === null || current === null
                          ? current
                          : {
                              ...current,
                              openRouterRouting: {
                                ...current.openRouterRouting,
                                dataCollection:
                                  value === "default"
                                    ? null
                                    : (value as "allow" | "deny"),
                              },
                            },
                      )
                    }
                    value={draft.openRouterRouting.dataCollection ?? "default"}
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="settings-select-content">
                      {(["default", "allow", "deny"] as const).map((state) => (
                        <SelectItem key={state} value={state}>
                          {t(`modelConfig.routing.dataStates.${state}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
          </div>
        </div>
      )}

      <details className="model-config-disclosure" open>
        <summary>{t("modelConfig.thinkingMap.title")}</summary>
        <p>{t("modelConfig.thinkingMap.description")}</p>
        <div className="thinking-map-grid">
          {AGENT_THINKING_LEVEL_KEYS.map((level) => {
            const mapped = draft.thinkingLevelMap[level];
            const mode =
              mapped === undefined
                ? "default"
                : mapped === null
                  ? "unsupported"
                  : "custom";
            return (
              <div className="thinking-map-row" key={level}>
                <Label>{tAssistant(`thinking.${level}`)}</Label>
                <Select
                  disabled={isSaving}
                  onValueChange={(value) =>
                    updateThinkingMap(level, value as typeof mode)
                  }
                  value={mode}
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="settings-select-content">
                    {(["default", "unsupported", "custom"] as const).map(
                      (option) => (
                        <SelectItem key={option} value={option}>
                          {t(`modelConfig.thinkingMap.${option}`)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 text-xs"
                  disabled={isSaving || mode !== "custom"}
                  onChange={(event) =>
                    setDraft((current) =>
                      current === null
                        ? current
                        : {
                            ...current,
                            thinkingLevelMap: {
                              ...current.thinkingLevelMap,
                              [level]: event.target.value,
                            },
                          },
                    )
                  }
                  placeholder={level}
                  value={typeof mapped === "string" ? mapped : ""}
                />
              </div>
            );
          })}
        </div>
      </details>

      <details className="model-config-disclosure">
        <summary>{t("modelConfig.compatibility.title")}</summary>
        <p>{t("modelConfig.compatibility.description")}</p>
        <div className="model-config-grid">
          {(
            [
              "supportsDeveloperRole",
              "supportsReasoningEffort",
              "supportsUsageInStreaming",
            ] as const
          ).map((key) => (
            <FragmentField
              disabled={isSaving}
              key={key}
              label={t(`modelConfig.compatibility.${key}`)}
              onChange={(value) =>
                setDraft((current) =>
                  current === null
                    ? current
                    : {
                        ...current,
                        compatibility: {
                          ...current.compatibility,
                          [key]: fromTriState(value),
                        },
                      },
                )
              }
              value={toTriState(draft.compatibility[key])}
            />
          ))}
          <Label>{t("modelConfig.compatibility.thinkingFormat")}</Label>
          <Select
            disabled={isSaving}
            onValueChange={(value) =>
              setDraft((current) =>
                current === null
                  ? current
                  : {
                      ...current,
                      compatibility: {
                        ...current.compatibility,
                        thinkingFormat:
                          value === "default"
                            ? null
                            : (value as AgentModelOverride["compatibility"]["thinkingFormat"]),
                      },
                    },
              )
            }
            value={draft.compatibility.thinkingFormat ?? "default"}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              <SelectItem value="default">
                {t("modelConfig.states.default")}
              </SelectItem>
              {AGENT_THINKING_FORMATS.map((format) => (
                <SelectItem key={format} value={format}>
                  {format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label>{t("modelConfig.compatibility.maxTokensField")}</Label>
          <Select
            disabled={isSaving}
            onValueChange={(value) =>
              setDraft((current) =>
                current === null
                  ? current
                  : {
                      ...current,
                      compatibility: {
                        ...current.compatibility,
                        maxTokensField:
                          value === "default"
                            ? null
                            : (value as "max_tokens" | "max_completion_tokens"),
                      },
                    },
              )
            }
            value={draft.compatibility.maxTokensField ?? "default"}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="settings-select-content">
              <SelectItem value="default">
                {t("modelConfig.states.default")}
              </SelectItem>
              <SelectItem value="max_tokens">max_tokens</SelectItem>
              <SelectItem value="max_completion_tokens">
                max_completion_tokens
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </details>

      <details className="model-config-disclosure">
        <summary>{t("modelConfig.headers.title")}</summary>
        <p>{t("modelConfig.headers.description")}</p>
        <div className="model-header-list">
          {draft.headers.map((header, index) => (
            <div className="model-header-row" key={index}>
              <Input
                className="h-8 text-xs"
                onChange={(event) =>
                  setDraft((current) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          headers: current.headers.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        },
                  )
                }
                placeholder={t("modelConfig.headers.name")}
                value={header.name}
              />
              <Input
                className="h-8 text-xs"
                onChange={(event) =>
                  setDraft((current) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          headers: current.headers.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        },
                  )
                }
                placeholder={t("modelConfig.headers.value")}
                value={header.value}
              />
              <Button
                aria-label={tCommon("actions.remove")}
                onClick={() =>
                  setDraft((current) =>
                    current === null
                      ? current
                      : {
                          ...current,
                          headers: current.headers.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        },
                  )
                }
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" size={14} />
              </Button>
            </div>
          ))}
          <Button
            className="w-fit text-xs"
            disabled={draft.headers.length >= 16}
            onClick={() =>
              setDraft((current) =>
                current === null
                  ? current
                  : {
                      ...current,
                      headers: [...current.headers, { name: "", value: "" }],
                    },
              )
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" size={13} />
            {t("modelConfig.headers.add")}
          </Button>
        </div>
      </details>
    </section>
  );
}

function FragmentField({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: TriState;
}) {
  const { t } = useTranslation("settings");
  return (
    <>
      <Label>{label}</Label>
      <Select disabled={disabled} onValueChange={onChange} value={value}>
        <SelectTrigger className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="settings-select-content">
          {(["default", "enabled", "disabled"] as const).map((state) => (
            <SelectItem key={state} value={state}>
              {t(`modelConfig.states.${state}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
