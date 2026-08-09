import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentModelConfigService,
  parseAgentModelOverrideRequest,
} from "../../../src/main/services/agent-model-config-service";
import type { AgentModelOverride } from "../../../src/shared/contracts/agent-configuration";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

const createOverride = (): AgentModelOverride => ({
  compatibility: {
    maxTokensField: null,
    supportsDeveloperRole: null,
    supportsReasoningEffort: null,
    supportsUsageInStreaming: null,
    thinkingFormat: "openrouter",
  },
  headers: [{ name: "X-OpenRouter-Title", value: "Driftfield" }],
  modelId: "anthropic/claude-sonnet-4",
  openRouterRouting: {
    allowFallbacks: false,
    dataCollection: "deny",
    only: ["amazon-bedrock"],
    order: ["amazon-bedrock"],
    requireParameters: true,
    zdr: true,
  },
  providerId: "openrouter",
  thinkingLevelMap: { max: "high", xhigh: null },
});

describe("AgentModelConfigService", () => {
  it("persists bounded Pi model overrides and reads them back", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "driftfield-models-"),
    );
    temporaryDirectories.push(directory);
    const service = new AgentModelConfigService(directory);

    await service.update(createOverride());

    expect(await service.getOverrides()).toEqual([createOverride()]);
    const stored = JSON.parse(await readFile(service.modelsPath, "utf8"));
    expect(
      stored.providers.openrouter.modelOverrides["anthropic/claude-sonnet-4"]
        .compat.openRouterRouting,
    ).toMatchObject({
      allow_fallbacks: false,
      only: ["amazon-bedrock"],
      zdr: true,
    });
  });

  it("preserves unrelated Pi model override fields", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "driftfield-models-"),
    );
    temporaryDirectories.push(directory);
    const service = new AgentModelConfigService(directory);
    await mkdir(path.dirname(service.modelsPath), { recursive: true });
    await writeFile(
      service.modelsPath,
      JSON.stringify({
        providers: {
          openrouter: {
            baseUrl: "https://openrouter.ai/api/v1",
            modelOverrides: {
              "anthropic/claude-sonnet-4": {
                contextWindow: 200000,
                compat: { supportsStrictMode: true },
              },
            },
          },
        },
      }),
    );

    await service.update(createOverride());

    const stored = JSON.parse(await readFile(service.modelsPath, "utf8"));
    const provider = stored.providers.openrouter;
    const override = provider.modelOverrides["anthropic/claude-sonnet-4"];
    expect(provider.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(override.contextWindow).toBe(200000);
    expect(override.compat.supportsStrictMode).toBe(true);
  });

  it("rejects credential headers and Pi command or environment expansion", () => {
    const credential = createOverride();
    credential.headers = [{ name: "Authorization", value: "Bearer secret" }];
    expect(() =>
      parseAgentModelOverrideRequest({ override: credential }),
    ).toThrow("Invalid Agent model headers");

    const command = createOverride();
    command.headers = [{ name: "X-Title", value: "!security lookup" }];
    expect(() => parseAgentModelOverrideRequest({ override: command })).toThrow(
      "Invalid Agent model headers",
    );

    const environment = createOverride();
    environment.headers = [{ name: "X-Title", value: "$SECRET" }];
    expect(() =>
      parseAgentModelOverrideRequest({ override: environment }),
    ).toThrow("Invalid Agent model headers");
  });
});
