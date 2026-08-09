export const AGENT_TOOL_NAMES = [
  'get_novel_structure',
  'get_current_document',
  'get_document',
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export interface AgentDraftSnapshot {
  baseRevision: string;
  documentId: string;
  markdown: string;
}

export type AgentToolArguments =
  | { toolName: 'get_novel_structure'; arguments: Record<string, never> }
  | { toolName: 'get_current_document'; arguments: Record<string, never> }
  | { toolName: 'get_document'; arguments: { documentId: string } };

export interface AgentDocumentToolResult {
  baseRevision: string;
  contentRevision: string;
  documentId: string;
  markdown: string;
  source: 'disk' | 'draft';
  title: string;
}

export interface AgentStructureDocument {
  id: string;
  kind: 'chapter' | 'prologue' | 'interlude' | 'epilogue' | 'appendix' | 'entry' | 'document';
  revision?: string;
  title: string;
  type: 'document';
}

export interface AgentStructureDirectory {
  children: AgentStructureNode[];
  id?: string;
  kind: 'manuscript' | 'volume' | 'lorebook' | 'category' | 'directory';
  title: string;
  type: 'directory';
}

export type AgentStructureNode = AgentStructureDirectory | AgentStructureDocument;

export interface AgentNovelStructureToolResult {
  format: 'driftfield' | 'legacy';
  manuscript: AgentStructureDirectory;
  project: {
    id?: string;
    revision: string;
    title: string;
  };
  lorebook?: AgentStructureDirectory;
}

export type AgentToolErrorCode =
  | 'invalid-arguments'
  | 'project-session-changed'
  | 'document-not-found'
  | 'document-too-large'
  | 'tool-timeout'
  | 'tool-budget-exceeded'
  | 'internal-error';

export const AGENT_TOOL_ERROR_CODES = [
  'invalid-arguments',
  'project-session-changed',
  'document-not-found',
  'document-too-large',
  'tool-timeout',
  'tool-budget-exceeded',
  'internal-error',
] as const satisfies readonly AgentToolErrorCode[];

export type AgentToolExecutionResult =
  | {
      data: AgentDocumentToolResult | AgentNovelStructureToolResult;
      ok: true;
      toolName: AgentToolName;
    }
  | {
      error: { code: AgentToolErrorCode };
      ok: false;
      toolName: AgentToolName;
    };

export const isAgentToolName = (value: unknown): value is AgentToolName =>
  typeof value === 'string' && AGENT_TOOL_NAMES.includes(value as AgentToolName);

export const isAgentToolExecutionResult = (
  value: unknown,
): value is AgentToolExecutionResult => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!isAgentToolName(result.toolName) || typeof result.ok !== 'boolean') return false;
  if (result.ok) return isToolData(result.toolName, result.data);
  if (typeof result.error !== 'object' || result.error === null) return false;
  const code = (result.error as Record<string, unknown>).code;
  return typeof code === 'string' &&
    AGENT_TOOL_ERROR_CODES.includes(code as AgentToolErrorCode);
};

const isToolData = (toolName: AgentToolName, value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (toolName === 'get_novel_structure') {
    return (data.format === 'driftfield' || data.format === 'legacy') &&
      typeof data.project === 'object' && data.project !== null &&
      typeof data.manuscript === 'object' && data.manuscript !== null;
  }
  return typeof data.baseRevision === 'string' &&
    typeof data.contentRevision === 'string' &&
    typeof data.documentId === 'string' &&
    typeof data.markdown === 'string' &&
    (data.source === 'disk' || data.source === 'draft') &&
    typeof data.title === 'string';
};
