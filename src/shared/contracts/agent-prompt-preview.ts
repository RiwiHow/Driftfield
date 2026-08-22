import type { AgentRole } from './agent';
import type { AgentToolName } from './agent-tools';

export interface AgentPromptPreviewRequest {
  prompt: string;
}

export interface AgentPromptPreviewProfile {
  enabledTools: AgentToolName[];
  profileId: AgentRole;
  systemPrompt: string;
  version: number;
}

export interface AgentPromptPreview {
  curator: AgentPromptPreviewProfile;
  messages: Array<{ content: string; role: 'assistant' | 'user' }>;
  scribe: AgentPromptPreviewProfile;
}
