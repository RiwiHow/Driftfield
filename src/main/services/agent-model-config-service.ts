import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  AGENT_THINKING_FORMATS,
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelCompatibilityOverride,
  type AgentModelHeaderOverride,
  type AgentModelOverride,
  type AgentOpenRouterRoutingOverride,
} from "../../shared/contracts/agent-configuration";

const MAX_HEADERS = 16;
const MAX_HEADER_LENGTH = 256;
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

const parseRouting = (
  value: unknown,
): AgentOpenRouterRoutingOverride | null => {
  if (!isRecord(value)) return null;
  return {
    allowFallbacks: parseNullableBoolean(value.allow_fallbacks),
    dataCollection:
      value.data_collection === "allow" || value.data_collection === "deny"
        ? value.data_collection
        : null,
    only: parseStringList(value.only),
    order: parseStringList(value.order),
    requireParameters: parseNullableBoolean(value.require_parameters),
    zdr: parseNullableBoolean(value.zdr),
  };
};

const parseHeaders = (value: unknown): AgentModelHeaderOverride[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .slice(0, MAX_HEADERS)
    .filter(
      (entry): entry is [string, string] =>
        isLiteralValue(entry[0], MAX_HEADER_LENGTH) && isLiteralValue(entry[1]),
    )
    .map(([name, headerValue]) => ({ name, value: headerValue }));
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

const readOverride = (
  providerId: string,
  modelId: string,
  value: unknown,
): AgentModelOverride => {
  const record = isRecord(value) ? value : {};
  const compatibility = parseCompatibility(record.compat);
  const openRouterRouting = isRecord(record.compat)
    ? parseRouting(record.compat.openRouterRouting)
    : null;
  return {
    compatibility,
    headers: parseHeaders(record.headers),
    modelId,
    openRouterRouting,
    providerId,
    thinkingLevelMap: parseThinkingLevelMap(record.thinkingLevelMap),
  };
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
  readonly modelsPath: string;
  private updateQueue: Promise<void> = Promise.resolve();

  constructor(userDataPath: string) {
    this.modelsPath = path.join(userDataPath, "ai", "pi", "models.json");
  }

  async getOverrides(): Promise<AgentModelOverride[]> {
    const config = await this.readConfig();
    const providers = isRecord(config.providers) ? config.providers : {};
    const result: AgentModelOverride[] = [];
    for (const [providerId, providerValue] of Object.entries(providers)) {
      if (!isRecord(providerValue) || !isRecord(providerValue.modelOverrides))
        continue;
      for (const [modelId, override] of Object.entries(
        providerValue.modelOverrides,
      )) {
        result.push(readOverride(providerId, modelId, override));
      }
    }
    return result;
  }

  async update(override: AgentModelOverride): Promise<void> {
    validateAgentModelOverride(override);
    const operation = this.updateQueue.then(async () => {
      const config = await this.readConfig();
      const providers = isRecord(config.providers) ? config.providers : {};
      const existingProvider = providers[override.providerId];
      const provider: Record<string, unknown> = isRecord(existingProvider)
        ? existingProvider
        : {};
      const modelOverrides = isRecord(provider.modelOverrides)
        ? provider.modelOverrides
        : {};
      const stored = toStoredOverride(override);
      if (Object.keys(stored).length === 0)
        delete modelOverrides[override.modelId];
      else {
        const storedExistingOverride = modelOverrides[override.modelId];
        const existingOverride: Record<string, unknown> = isRecord(
          storedExistingOverride,
        )
          ? storedExistingOverride
          : {};
        const existingCompat = isRecord(existingOverride.compat)
          ? { ...existingOverride.compat }
          : {};
        for (const key of [
          "maxTokensField",
          "supportsDeveloperRole",
          "supportsReasoningEffort",
          "supportsUsageInStreaming",
          "thinkingFormat",
          "openRouterRouting",
        ]) {
          delete existingCompat[key];
        }
        const storedCompat = isRecord(stored.compat) ? stored.compat : {};
        const mergedOverride = { ...existingOverride, ...stored };
        const mergedCompat = { ...existingCompat, ...storedCompat };
        if (Object.keys(mergedCompat).length === 0)
          delete mergedOverride.compat;
        else mergedOverride.compat = mergedCompat;
        if (!("headers" in stored)) delete mergedOverride.headers;
        if (!("thinkingLevelMap" in stored))
          delete mergedOverride.thinkingLevelMap;
        modelOverrides[override.modelId] = mergedOverride;
      }
      provider.modelOverrides = modelOverrides;
      providers[override.providerId] = provider;
      config.providers = providers;
      await this.persist(config);
    });
    this.updateQueue = operation.catch(() => undefined);
    return operation;
  }

  private async readConfig(): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.modelsPath, "utf8"),
      );
      if (!isRecord(parsed)) throw new Error("Invalid Pi model configuration");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { providers: {} };
      throw error;
    }
  }

  private async persist(config: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(this.modelsPath), { recursive: true });
    const temporaryPath = `${this.modelsPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.modelsPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
