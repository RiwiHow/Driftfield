import type {
  AgentConversationPart,
  AgentToolActivity,
} from '../../../shared/contracts/agent-conversations';
import type { AgentToolAuditName } from '../../../shared/contracts/agent-tools';

const READ_ONLY_TOOL_NAMES = new Set<AgentToolAuditName>([
  'bash',
]);

export type AgentTimelinePart =
  | AgentConversationPart
  | {
      activities: AgentToolActivity[];
      type: 'tool-group';
    };

export const groupConsecutiveReadTools = (
  parts: AgentConversationPart[],
): AgentTimelinePart[] => {
  const grouped: AgentTimelinePart[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.type !== 'tool' || !READ_ONLY_TOOL_NAMES.has(part.activity.toolName)) {
      grouped.push(part);
      continue;
    }

    const activities = [part.activity];
    while (index + 1 < parts.length) {
      const next = parts[index + 1];
      if (
        next.type !== 'tool' ||
        !READ_ONLY_TOOL_NAMES.has(next.activity.toolName) ||
        next.activity.agentRole !== part.activity.agentRole
      ) break;
      activities.push(next.activity);
      index += 1;
    }

    grouped.push(
      activities.length > 1
        ? { activities, type: 'tool-group' }
        : part,
    );
  }
  return grouped;
};
