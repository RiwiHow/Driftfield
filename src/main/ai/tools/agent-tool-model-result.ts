import type {
  AgentToolExecutionResult,
  AgentToolName,
} from '../../../shared/contracts/agent-tools';

/** Converts only successful Main results into Pi tool content. */
export const serializeSuccessfulToolResult = <Name extends AgentToolName>(
  result: AgentToolExecutionResult<Name>,
): string => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return JSON.stringify(result);
};
