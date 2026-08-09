import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  AgentModelOverride,
  AgentOpenRouterRoutingOverride,
} from "../../../../../shared/contracts/agent-configuration";
import { TriStateField } from "../fields/TriStateField";
import {
  changeRoutingMode,
  fromTriState,
  splitProviderList,
  toTriState,
  type RoutingMode,
} from "../model-override-form";

interface OpenRouterRoutingSectionProps {
  draft: AgentModelOverride;
  isSaving: boolean;
  onChange: (draft: AgentModelOverride) => void;
  onRoutingModeChange: (mode: RoutingMode) => void;
  routingMode: RoutingMode;
}

export function OpenRouterRoutingSection({
  draft,
  isSaving,
  onChange,
  onRoutingModeChange,
  routingMode,
}: OpenRouterRoutingSectionProps) {
  const { t } = useTranslation("settings");
  const routing = draft.openRouterRouting;

  const updateRouting = (
    update: Partial<AgentOpenRouterRoutingOverride>,
  ): void => {
    if (routing === null) return;
    onChange({
      ...draft,
      openRouterRouting: { ...routing, ...update },
    });
  };

  return (
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
          onValueChange={(value) => {
            const mode = value as RoutingMode;
            onRoutingModeChange(mode);
            onChange(changeRoutingMode(draft, mode));
          }}
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

        {routingMode !== "automatic" && routing !== null && (
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
                updateRouting(
                  routingMode === "exact"
                    ? {
                        only: providers.slice(0, 1),
                        order: providers.slice(0, 1),
                      }
                    : { order: providers },
                );
              }}
              placeholder={t("modelConfig.routing.providerPlaceholder")}
              value={(routingMode === "exact" ? routing.only : routing.order).join(
                ", ",
              )}
            />
            <TriStateField
              disabled={isSaving || routingMode === "exact"}
              label={t("modelConfig.routing.fallbacks")}
              onChange={(value) =>
                updateRouting({ allowFallbacks: fromTriState(value) })
              }
              value={toTriState(routing.allowFallbacks)}
            />
            <TriStateField
              disabled={isSaving}
              label={t("modelConfig.routing.requireParameters")}
              onChange={(value) =>
                updateRouting({ requireParameters: fromTriState(value) })
              }
              value={toTriState(routing.requireParameters)}
            />
            <TriStateField
              disabled={isSaving}
              label={t("modelConfig.routing.zdr")}
              onChange={(value) =>
                updateRouting({ zdr: fromTriState(value) })
              }
              value={toTriState(routing.zdr)}
            />
            <Label>{t("modelConfig.routing.dataCollection")}</Label>
            <Select
              disabled={isSaving}
              onValueChange={(value) =>
                updateRouting({
                  dataCollection:
                    value === "default"
                      ? null
                      : (value as "allow" | "deny"),
                })
              }
              value={routing.dataCollection ?? "default"}
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
  );
}
