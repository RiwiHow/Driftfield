import { describe, expect, it } from "vitest";

import type { AgentModelOption } from "../../../../../src/shared/contracts/agent-configuration";
import {
  changeRoutingMode,
  changeThinkingMapMode,
  createModelOverride,
  fromTriState,
  inferRoutingMode,
  splitProviderList,
  toTriState,
} from "../../../../../src/renderer/features/settings/model-overrides/model-override-form";

const model: AgentModelOption = {
  api: "openai-completions",
  contextWindow: 128_000,
  id: "model-1",
  maxOutputTokens: 16_000,
  name: "Model 1",
  providerId: "openrouter",
  reasoning: true,
  thinkingLevelMap: {},
};

describe("model override form transitions", () => {
  it("creates a path-free empty override for the selected model", () => {
    expect(createModelOverride(model)).toEqual({
      compatibility: {
        maxTokensField: null,
        supportsDeveloperRole: null,
        supportsReasoningEffort: null,
        supportsUsageInStreaming: null,
        thinkingFormat: null,
      },
      headers: [],
      modelId: "model-1",
      openRouterRouting: null,
      providerId: "openrouter",
      thinkingLevelMap: {},
    });
  });

  it("normalizes comma-separated provider lists", () => {
    expect(splitProviderList(" first, second, first, , third ")).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("round-trips tri-state values", () => {
    expect(toTriState(null)).toBe("default");
    expect(toTriState(true)).toBe("enabled");
    expect(toTriState(false)).toBe("disabled");
    expect(fromTriState("default")).toBeNull();
    expect(fromTriState("enabled")).toBe(true);
    expect(fromTriState("disabled")).toBe(false);
  });

  it("moves routing between automatic, exact, and ordered modes", () => {
    const empty = createModelOverride(model);
    const exact = changeRoutingMode(empty, "exact");
    expect(exact.openRouterRouting).toMatchObject({
      allowFallbacks: false,
      only: [],
      order: [],
    });

    const withProvider = {
      ...exact,
      openRouterRouting: {
        ...exact.openRouterRouting!,
        only: ["provider-a"],
        order: ["provider-a"],
      },
    };
    expect(inferRoutingMode(withProvider.openRouterRouting)).toBe("exact");
    const ordered = changeRoutingMode(withProvider, "ordered");
    expect(inferRoutingMode(ordered.openRouterRouting)).toBe("ordered");
    expect(ordered.openRouterRouting).toMatchObject({
      only: [],
      order: ["provider-a"],
    });
    expect(changeRoutingMode(ordered, "automatic").openRouterRouting).toBeNull();
  });

  it("updates thinking-map modes without mutating the input", () => {
    const empty = createModelOverride(model);
    const unsupported = changeThinkingMapMode(empty, "high", "unsupported");
    const custom = changeThinkingMapMode(unsupported, "high", "custom");
    const restored = changeThinkingMapMode(custom, "high", "default");

    expect(empty.thinkingLevelMap).toEqual({});
    expect(unsupported.thinkingLevelMap.high).toBeNull();
    expect(custom.thinkingLevelMap.high).toBe("high");
    expect(restored.thinkingLevelMap).toEqual({});
  });
});
