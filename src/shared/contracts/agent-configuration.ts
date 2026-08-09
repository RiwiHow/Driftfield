export const AGENT_API_KEY_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "mistral", label: "Mistral" },
] as const;

export type AgentApiKeyProviderId =
  (typeof AGENT_API_KEY_PROVIDERS)[number]["id"];

export interface AgentProviderStatus {
  configured: boolean;
  providerId: AgentApiKeyProviderId;
}

export interface AgentModelOption {
  api: string;
  contextWindow: number;
  id: string;
  maxOutputTokens: number;
  name: string;
  providerId: string;
  reasoning: boolean;
  thinkingLevelMap: Partial<Record<AgentThinkingLevelKey, string | null>>;
}

export const AGENT_THINKING_LEVEL_KEYS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type AgentThinkingLevelKey = (typeof AGENT_THINKING_LEVEL_KEYS)[number];

export const AGENT_THINKING_FORMATS = [
  "openai",
  "openrouter",
  "together",
  "deepseek",
  "zai",
  "qwen",
  "chat-template",
  "qwen-chat-template",
  "string-thinking",
  "ant-ling",
] as const;

export type AgentThinkingFormat = (typeof AGENT_THINKING_FORMATS)[number];

export interface AgentOpenRouterRoutingOverride {
  allowFallbacks: boolean | null;
  dataCollection: "allow" | "deny" | null;
  only: string[];
  order: string[];
  requireParameters: boolean | null;
  zdr: boolean | null;
}

export interface AgentModelCompatibilityOverride {
  maxTokensField: "max_completion_tokens" | "max_tokens" | null;
  supportsDeveloperRole: boolean | null;
  supportsReasoningEffort: boolean | null;
  supportsUsageInStreaming: boolean | null;
  thinkingFormat: AgentThinkingFormat | null;
}

export interface AgentModelHeaderOverride {
  name: string;
  value: string;
}

export interface AgentModelOverride {
  compatibility: AgentModelCompatibilityOverride;
  headers: AgentModelHeaderOverride[];
  modelId: string;
  openRouterRouting: AgentOpenRouterRoutingOverride | null;
  providerId: string;
  thinkingLevelMap: Partial<Record<AgentThinkingLevelKey, string | null>>;
}

export interface UpdateAgentModelOverrideRequest {
  override: AgentModelOverride;
}

export interface AgentConfiguration {
  models: AgentModelOption[];
  modelOverrides: AgentModelOverride[];
  providers: AgentProviderStatus[];
}

export interface ResetAgentSettingsResult {
  configuration: AgentConfiguration;
  projectSettings: import('./settings').ProjectAgentSettings;
}

export interface SetAgentApiKeyRequest {
  apiKey: string;
  providerId: AgentApiKeyProviderId;
}

export interface RemoveAgentCredentialRequest {
  providerId: AgentApiKeyProviderId;
}
