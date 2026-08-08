export const AGENT_API_KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'google', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'mistral', label: 'Mistral' },
] as const;

export type AgentApiKeyProviderId =
  (typeof AGENT_API_KEY_PROVIDERS)[number]['id'];

export interface AgentProviderStatus {
  configured: boolean;
  providerId: AgentApiKeyProviderId;
}

export interface AgentModelOption {
  contextWindow: number;
  id: string;
  maxOutputTokens: number;
  name: string;
  providerId: string;
  reasoning: boolean;
}

export interface AgentConfiguration {
  models: AgentModelOption[];
  providers: AgentProviderStatus[];
}

export interface SetAgentApiKeyRequest {
  apiKey: string;
  providerId: AgentApiKeyProviderId;
}

export interface RemoveAgentCredentialRequest {
  providerId: AgentApiKeyProviderId;
}
