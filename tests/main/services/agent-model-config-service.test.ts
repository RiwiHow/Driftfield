import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  AgentModelConfigService,
  parseAgentModelOverrideRequest,
} from "../../../src/main/services/agent-model-config-service";
import type { AgentModelOverride } from "../../../src/shared/contracts/agent-configuration";
import type { ProjectSession } from '../../../src/main/services/project-session-service';

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
    const projectDirectory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-project-'));
    temporaryDirectories.push(projectDirectory);
    const session = { directoryPath: projectDirectory } as ProjectSession;

    await service.update(session, createOverride());

    expect(await service.getOverrides(session)).toEqual([createOverride()]);
    const stored = JSON.parse(
      await readFile(await service.prepareRuntime(session), "utf8"),
    );
    expect(
      stored.providers.openrouter.modelOverrides["anthropic/claude-sonnet-4"]
        .compat.openRouterRouting,
    ).toMatchObject({
      allow_fallbacks: false,
      only: ["amazon-bedrock"],
      zdr: true,
    });
    await service.reset(session);
    expect(await service.getOverrides(session)).toEqual([]);
    expect(
      JSON.parse(await readFile(await service.prepareRuntime(session), 'utf8')),
    ).toEqual({ providers: {} });
  });

  it("isolates model overrides by project", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "driftfield-models-"),
    );
    temporaryDirectories.push(directory);
    const service = new AgentModelConfigService(directory);
    const firstDirectory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-project-'));
    const secondDirectory = await mkdtemp(path.join(os.tmpdir(), 'driftfield-project-'));
    temporaryDirectories.push(firstDirectory, secondDirectory);
    const first = { directoryPath: firstDirectory } as ProjectSession;
    const second = { directoryPath: secondDirectory } as ProjectSession;

    await service.update(first, createOverride());

    expect(await service.getOverrides(first)).toHaveLength(1);
    expect(await service.getOverrides(second)).toEqual([]);
    expect(await service.prepareRuntime(first)).not.toBe(
      await service.prepareRuntime(second),
    );
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
