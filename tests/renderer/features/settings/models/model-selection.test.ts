import { describe, expect, it } from "vitest";

import { supportedThinkingLevel } from "../../../../../src/renderer/features/settings/models/model-selection";
import type { AgentModelOption } from "../../../../../src/shared/contracts/agent-configuration";

const model: AgentModelOption = {
  api: "openai-responses",
  contextWindow: 128_000,
  id: "model-1",
  maxOutputTokens: 16_000,
  name: "Model 1",
  providerId: "openai",
  reasoning: true,
  thinkingLevelMap: {},
};

describe("supportedThinkingLevel", () => {
  it("turns reasoning off for a non-reasoning model", () => {
    expect(supportedThinkingLevel({ ...model, reasoning: false }, "high")).toBe(
      "off",
    );
  });

  it("keeps a supported current level", () => {
    expect(supportedThinkingLevel(model, "high")).toBe("high");
  });

  it("falls back to the first supported level", () => {
    expect(
      supportedThinkingLevel(
        {
          ...model,
          thinkingLevelMap: {
            high: null,
            low: "low",
            medium: null,
            minimal: null,
            off: null,
          },
        },
        "high",
      ),
    ).toBe("low");
  });
});
