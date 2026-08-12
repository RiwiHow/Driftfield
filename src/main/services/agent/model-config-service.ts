import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SettingsDatabase } from '../../database/settings-database';
import type { ProjectSession } from '../project/session-service';

import {
  AGENT_THINKING_FORMATS,
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelCompatibilityOverride,
  type AgentModelHeaderOverride,
  type AgentModelOverride,
  type AgentOpenRouterRoutingOverride,
} from "../../../shared/contracts/agent-configuration";

const MAX_HEADERS = 16;
const MAX_HEADER_LENGTH = 256;
const MAX_MODEL_OVERRIDE_STORE_LENGTH = 1024 * 1024;
const MAX_ROUTING_PROVIDERS = 32;
const MAX_VALUE_LENGTH = 512;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 255;

const isLiteralValue = (
  value: unknown,
  maxLength = MAX_VALUE_LENGTH,
): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= maxLength &&
  !value.includes("$") &&
  !value.startsWith("!");

const hasOnlyKeys = (
  value: Record<string, unknown>,
  keys: string[],
): boolean => {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
};

const isNullableBoolean = (value: unknown): value is boolean | null =>
  value === null || typeof value === "boolean";

const parseNullableBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const parseStringList = (value: unknown): string[] =>
  Array.isArray(value) && value.length <= MAX_ROUTING_PROVIDERS
    ? value.filter((entry): entry is string => isIdentifier(entry))
    : [];

const emptyCompatibility = (): AgentModelCompatibilityOverride => ({
  maxTokensField: null,
  supportsDeveloperRole: null,
  supportsReasoningEffort: null,
  supportsUsageInStreaming: null,
  thinkingFormat: null,
});

const parseCompatibility = (
  value: unknown,
): AgentModelCompatibilityOverride => {
  if (!isRecord(value)) return emptyCompatibility();
  return {
    maxTokensField:
      value.maxTokensField === "max_tokens" ||
      value.maxTokensField === "max_completion_tokens"
        ? value.maxTokensField
        : null,
    supportsDeveloperRole: parseNullableBoolean(value.supportsDeveloperRole),
    supportsReasoningEffort: parseNullableBoolean(
      value.supportsReasoningEffort,
    ),
    supportsUsageInStreaming: parseNullableBoolean(
      value.supportsUsageInStreaming,
    ),
    thinkingFormat:
      typeof value.thinkingFormat === "string" &&
      AGENT_THINKING_FORMATS.includes(
        value.thinkingFormat as (typeof AGENT_THINKING_FORMATS)[number],
      )
        ? (value.thinkingFormat as AgentModelCompatibilityOverride["thinkingFormat"])
        : null,
  };
};

const parseThinkingLevelMap = (
  value: unknown,
): AgentModelOverride["thinkingLevelMap"] => {
  if (!isRecord(value)) return {};
  const result: AgentModelOverride["thinkingLevelMap"] = {};
  for (const level of AGENT_THINKING_LEVEL_KEYS) {
    const mapped = value[level];
    if (mapped === null || isLiteralValue(mapped, 64)) result[level] = mapped;
  }
  return result;
};

export const validateAgentModelOverride = (
  value: AgentModelOverride,
): AgentModelOverride => {
  if (!isIdentifier(value.providerId) || !isIdentifier(value.modelId)) {
    throw new Error("Invalid Agent model override target");
  }
  if (
    value.headers.length > MAX_HEADERS ||
    value.headers.some(
      ({ name, value: headerValue }) =>
        !isLiteralValue(name, MAX_HEADER_LENGTH) ||
        !isLiteralValue(headerValue) ||
        /^(authorization|cookie|proxy-authorization|x-api-key)$/i.test(name),
    )
  ) {
    throw new Error("Invalid Agent model headers");
  }
  const headerNames = value.headers.map(({ name }) => name.toLowerCase());
  if (new Set(headerNames).size !== headerNames.length) {
    throw new Error("Duplicate Agent model header");
  }
  for (const [level, mapped] of Object.entries(value.thinkingLevelMap)) {
    if (
      !AGENT_THINKING_LEVEL_KEYS.includes(
        level as (typeof AGENT_THINKING_LEVEL_KEYS)[number],
      ) ||
      (mapped !== null && !isLiteralValue(mapped, 64))
    ) {
      throw new Error("Invalid Agent thinking level map");
    }
  }
  if (
    value.openRouterRouting !== null &&
    (value.providerId !== "openrouter" ||
      value.openRouterRouting.only.some((item) => !isIdentifier(item)) ||
      value.openRouterRouting.order.some((item) => !isIdentifier(item)) ||
      value.openRouterRouting.only.length > MAX_ROUTING_PROVIDERS ||
      value.openRouterRouting.order.length > MAX_ROUTING_PROVIDERS)
  ) {
    throw new Error("Invalid OpenRouter routing override");
  }
  return value;
};

export const parseAgentModelOverrideRequest = (
  value: unknown,
): AgentModelOverride => {
  if (!isRecord(value) || !isRecord(value.override)) {
    throw new Error("Invalid Agent model override request");
  }
  const source = value.override;
  if (
    !hasOnlyKeys(source, [
      "compatibility",
      "headers",
      "modelId",
      "openRouterRouting",
      "providerId",
      "thinkingLevelMap",
    ]) ||
    !isIdentifier(source.providerId) ||
    !isIdentifier(source.modelId) ||
    !Array.isArray(source.headers) ||
    !isRecord(source.compatibility) ||
    !isRecord(source.thinkingLevelMap)
  ) {
    throw new Error("Invalid Agent model override request");
  }
  if (
    !hasOnlyKeys(source.compatibility, [
      "maxTokensField",
      "supportsDeveloperRole",
      "supportsReasoningEffort",
      "supportsUsageInStreaming",
      "thinkingFormat",
    ]) ||
    ![null, "max_tokens", "max_completion_tokens"].includes(
      source.compatibility.maxTokensField as string | null,
    ) ||
    !isNullableBoolean(source.compatibility.supportsDeveloperRole) ||
    !isNullableBoolean(source.compatibility.supportsReasoningEffort) ||
    !isNullableBoolean(source.compatibility.supportsUsageInStreaming) ||
    !(
      source.compatibility.thinkingFormat === null ||
      (typeof source.compatibility.thinkingFormat === "string" &&
        AGENT_THINKING_FORMATS.includes(
          source.compatibility
            .thinkingFormat as (typeof AGENT_THINKING_FORMATS)[number],
        ))
    )
  ) {
    throw new Error("Invalid Agent model compatibility override");
  }
  if (
    !hasOnlyKeys(source.thinkingLevelMap, [...AGENT_THINKING_LEVEL_KEYS]) ||
    Object.values(source.thinkingLevelMap).some(
      (mapped) => mapped !== null && !isLiteralValue(mapped, 64),
    )
  ) {
    throw new Error("Invalid Agent thinking level map");
  }
  const headers: AgentModelHeaderOverride[] = Array.isArray(source.headers)
    ? source.headers.map((header) => {
        if (!isRecord(header)) throw new Error("Invalid Agent model header");
        return { name: header.name as string, value: header.value as string };
      })
    : [];
  let openRouterRouting: AgentOpenRouterRoutingOverride | null = null;
  if (source.openRouterRouting !== null) {
    if (!isRecord(source.openRouterRouting)) {
      throw new Error("Invalid OpenRouter routing override");
    }
    const routing = source.openRouterRouting;
    if (
      !hasOnlyKeys(routing, [
        "allowFallbacks",
        "dataCollection",
        "only",
        "order",
        "requireParameters",
        "zdr",
      ]) ||
      !isNullableBoolean(routing.allowFallbacks) ||
      !isNullableBoolean(routing.requireParameters) ||
      !isNullableBoolean(routing.zdr) ||
      !(
        routing.dataCollection === null ||
        routing.dataCollection === "allow" ||
        routing.dataCollection === "deny"
      ) ||
      !Array.isArray(routing.only) ||
      routing.only.length > MAX_ROUTING_PROVIDERS ||
      routing.only.some((item) => !isIdentifier(item)) ||
      !Array.isArray(routing.order) ||
      routing.order.length > MAX_ROUTING_PROVIDERS ||
      routing.order.some((item) => !isIdentifier(item))
    ) {
      throw new Error("Invalid OpenRouter routing override");
    }
    openRouterRouting = {
      allowFallbacks: parseNullableBoolean(routing.allowFallbacks),
      dataCollection:
        routing.dataCollection === "allow" || routing.dataCollection === "deny"
          ? routing.dataCollection
          : null,
      only: parseStringList(routing.only),
      order: parseStringList(routing.order),
      requireParameters: parseNullableBoolean(routing.requireParameters),
      zdr: parseNullableBoolean(routing.zdr),
    };
  }
  return validateAgentModelOverride({
    compatibility: parseCompatibility(source.compatibility),
    headers,
    modelId: source.modelId as string,
    openRouterRouting,
    providerId: source.providerId as string,
    thinkingLevelMap: parseThinkingLevelMap(source.thinkingLevelMap),
  });
};

const toStoredOverride = (
  override: AgentModelOverride,
): Record<string, unknown> => {
  const compat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(override.compatibility)) {
    if (value !== null) compat[key] = value;
  }
  if (override.openRouterRouting !== null) {
    const routing = override.openRouterRouting;
    compat.openRouterRouting = {
      ...(routing.allowFallbacks === null
        ? {}
        : { allow_fallbacks: routing.allowFallbacks }),
      ...(routing.dataCollection === null
        ? {}
        : { data_collection: routing.dataCollection }),
      ...(routing.only.length === 0 ? {} : { only: routing.only }),
      ...(routing.order.length === 0 ? {} : { order: routing.order }),
      ...(routing.requireParameters === null
        ? {}
        : { require_parameters: routing.requireParameters }),
      ...(routing.zdr === null ? {} : { zdr: routing.zdr }),
    };
  }
  return {
    ...(Object.keys(compat).length === 0 ? {} : { compat }),
    ...(override.headers.length === 0
      ? {}
      : {
          headers: Object.fromEntries(
            override.headers.map(({ name, value }) => [name, value]),
          ),
        }),
    ...(Object.keys(override.thinkingLevelMap).length === 0
      ? {}
      : { thinkingLevelMap: override.thinkingLevelMap }),
  };
};

export class AgentModelConfigService {
  private updateQueue: Promise<void> = Promise.resolve();
  private readonly databases = new Map<string, SettingsDatabase>();
  private readonly runtimePath: string;
  private readonly storePath: string;

  constructor(userDataPath: string) {
    const runtimeDirectory = path.join(userDataPath, 'ai', 'pi');
    this.runtimePath = path.join(runtimeDirectory, 'models.json');
    this.storePath = path.join(runtimeDirectory, 'models-store.json');
  }

  async getOverrides(
    legacyProjectSession?: ProjectSession,
  ): Promise<AgentModelOverride[]> {
    return this.loadOverrides(legacyProjectSession);
  }

  async update(
    override: AgentModelOverride,
    legacyProjectSession?: ProjectSession,
  ): Promise<void> {
    validateAgentModelOverride(override);
    const operation = this.updateQueue.then(async () => {
      const stored = toStoredOverride(override);
      const overrides = (await this.loadOverrides(legacyProjectSession)).filter(
        ({ modelId, providerId }) =>
          modelId !== override.modelId || providerId !== override.providerId,
      );
      if (Object.keys(stored).length !== 0) overrides.push(override);
      overrides.sort((left, right) =>
        `${left.providerId}\u0000${left.modelId}`.localeCompare(
          `${right.providerId}\u0000${right.modelId}`,
        ),
      );
      await this.persist(this.storePath, { overrides, version: 1 });
      await this.persistRuntime(overrides);
    });
    this.updateQueue = operation.catch(() => undefined);
    return operation;
  }

  async prepareRuntime(legacyProjectSession?: ProjectSession): Promise<string> {
    const overrides = await this.loadOverrides(legacyProjectSession);
    await this.persistRuntime(overrides);
    return this.runtimePath;
  }

  async reset(projectSession?: ProjectSession): Promise<void> {
    const operation = this.updateQueue.then(async () => {
      if (projectSession !== undefined) {
        this.databases.get(projectSession.directoryPath)?.close();
        this.databases.delete(projectSession.directoryPath);
      }
      await rm(path.join(path.dirname(this.runtimePath), 'projects'), {
        force: true,
        recursive: true,
      });
      await this.persist(this.storePath, { overrides: [], version: 1 });
      await this.persistRuntime([]);
    });
    this.updateQueue = operation.catch(() => undefined);
    return operation;
  }

  dispose(): void {
    for (const database of this.databases.values()) database.close();
    this.databases.clear();
  }

  private async loadOverrides(
    legacyProjectSession?: ProjectSession,
  ): Promise<AgentModelOverride[]> {
    try {
      const serialized = await readFile(this.storePath, 'utf8');
      if (serialized.length > MAX_MODEL_OVERRIDE_STORE_LENGTH) {
        throw new Error('Agent model override store is too large');
      }
      const value = JSON.parse(serialized) as unknown;
      if (
        !isRecord(value) ||
        value.version !== 1 ||
        !Array.isArray(value.overrides) ||
        value.overrides.length > 512 ||
        !hasOnlyKeys(value, ['overrides', 'version'])
      ) {
        throw new Error('Invalid Agent model override store');
      }
      return value.overrides.map((override) =>
        parseAgentModelOverrideRequest({ override }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    if (legacyProjectSession === undefined) return [];
    const rows = this.getDatabase(legacyProjectSession).connection.prepare(`
      SELECT override_json FROM agent_model_overrides
      ORDER BY provider_id, model_id
    `).all() as unknown as Array<{ override_json: string }>;
    const overrides = rows.map(({ override_json }) =>
      parseAgentModelOverrideRequest({ override: JSON.parse(override_json) }),
    );
    await this.persist(this.storePath, { overrides, version: 1 });
    return overrides;
  }

  private async persistRuntime(overrides: AgentModelOverride[]): Promise<void> {
    const providers: Record<string, { modelOverrides: Record<string, unknown> }> = {};
    for (const override of overrides) {
      const provider = providers[override.providerId] ?? { modelOverrides: {} };
      provider.modelOverrides[override.modelId] = toStoredOverride(override);
      providers[override.providerId] = provider;
    }
    await this.persist(this.runtimePath, { providers });
  }

  private getDatabase(session: ProjectSession): SettingsDatabase {
    let database = this.databases.get(session.directoryPath);
    if (database === undefined) {
      database = new SettingsDatabase(session.directoryPath);
      this.databases.set(session.directoryPath, database);
    }
    return database;
  }

  private async persist(modelsPath: string, config: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(modelsPath), { recursive: true });
    const temporaryPath = `${modelsPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, modelsPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
