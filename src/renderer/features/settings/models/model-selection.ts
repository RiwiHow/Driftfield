import {
  AGENT_THINKING_LEVEL_KEYS,
  type AgentModelOption,
  type AgentThinkingLevelKey,
} from "../../../../shared/contracts/agent-configuration";

export function supportedThinkingLevel(
  model: AgentModelOption,
  current: AgentThinkingLevelKey,
): AgentThinkingLevelKey {
  if (!model.reasoning) return "off";
  if (model.thinkingLevelMap[current] !== null) return current;
  return (
    AGENT_THINKING_LEVEL_KEYS.find(
      (level) => model.thinkingLevelMap[level] !== null,
    ) ?? "off"
  );
}
