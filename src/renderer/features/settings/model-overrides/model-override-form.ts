import type {
  AgentModelOption,
  AgentModelOverride,
  AgentOpenRouterRoutingOverride,
  AgentThinkingLevelKey,
} from "../../../../shared/contracts/agent-configuration";

export type RoutingMode = "automatic" | "exact" | "ordered";
export type ThinkingMapMode = "default" | "unsupported" | "custom";
export type TriState = "default" | "enabled" | "disabled";

export function createModelOverride(
  model: AgentModelOption,
): AgentModelOverride {
  return {
    compatibility: {
      maxTokensField: null,
      supportsDeveloperRole: null,
      supportsReasoningEffort: null,
      supportsUsageInStreaming: null,
      thinkingFormat: null,
    },
    headers: [],
    modelId: model.id,
    openRouterRouting: null,
    providerId: model.providerId,
    thinkingLevelMap: {},
  };
}

export function createOpenRouterRouting(): AgentOpenRouterRoutingOverride {
  return {
    allowFallbacks: null,
    dataCollection: null,
    only: [],
    order: [],
    requireParameters: null,
    zdr: null,
  };
}

export function splitProviderList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function toTriState(value: boolean | null): TriState {
  return value === null ? "default" : value ? "enabled" : "disabled";
}

export function fromTriState(value: string): boolean | null {
  return value === "default" ? null : value === "enabled";
}

export function inferRoutingMode(
  routing: AgentOpenRouterRoutingOverride | null,
): RoutingMode {
  if (routing === null) return "automatic";
  return routing.only.length === 1 && routing.order.length <= 1
    ? "exact"
    : "ordered";
}

export function changeRoutingMode(
  draft: AgentModelOverride,
  mode: RoutingMode,
): AgentModelOverride {
  if (mode === "automatic") return { ...draft, openRouterRouting: null };
  const routing = draft.openRouterRouting ?? createOpenRouterRouting();
  const first = routing.only[0] ?? routing.order[0] ?? "";
  return {
    ...draft,
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
}

export function changeThinkingMapMode(
  draft: AgentModelOverride,
  level: AgentThinkingLevelKey,
  mode: ThinkingMapMode,
): AgentModelOverride {
  const thinkingLevelMap = { ...draft.thinkingLevelMap };
  if (mode === "default") delete thinkingLevelMap[level];
  else {
    thinkingLevelMap[level] =
      mode === "unsupported" ? null : (thinkingLevelMap[level] ?? level);
  }
  return { ...draft, thinkingLevelMap };
}
