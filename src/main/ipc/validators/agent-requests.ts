import type {
  RemoveAgentCredentialRequest,
  SetAgentApiKeyRequest,
} from '../../../shared/contracts/agent-configuration';
import type {
  CancelAgentRequest,
  StartAgentPromptRequest,
} from '../../../shared/contracts/agent';
import type {
  ApplyAgentProposalRequest,
  RejectAgentProposalRequest,
} from '../../../shared/contracts/agent-proposals';
import { isAgentApiKeyProviderId } from '../../services/agent/credential-service';
import type {
  CreateAgentConversationRequest,
  DeleteAgentConversationRequest,
  RenameAgentConversationRequest,
  SelectAgentConversationRequest,
  UpdateAgentConversationMessageRequest,
} from '../../../shared/contracts/agent-conversations';

const isConversationId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

export const isCreateAgentConversationRequest = (
  value: unknown,
): value is CreateAgentConversationRequest =>
  isRecord(value) &&
  Object.keys(value).every((key) => key === 'title') &&
  (value.title === undefined ||
    (typeof value.title === 'string' && value.title.trim().length > 0 && value.title.length <= 200));

export const isSelectAgentConversationRequest = (
  value: unknown,
): value is SelectAgentConversationRequest =>
  isRecord(value) && Object.keys(value).length === 1 && isConversationId(value.conversationId);

export const isDeleteAgentConversationRequest = (
  value: unknown,
): value is DeleteAgentConversationRequest => isSelectAgentConversationRequest(value);

export const isRenameAgentConversationRequest = (
  value: unknown,
): value is RenameAgentConversationRequest =>
  isRecord(value) &&
  Object.keys(value).length === 2 &&
  isConversationId(value.conversationId) &&
  typeof value.title === 'string' &&
  value.title.trim().length > 0 &&
  value.title.length <= 200;

export const isUpdateAgentConversationMessageRequest = (
  value: unknown,
): value is UpdateAgentConversationMessageRequest =>
  isRecord(value) &&
  Object.keys(value).length === 3 &&
  isConversationId(value.conversationId) &&
  isConversationId(value.messageId) &&
  typeof value.content === 'string' &&
  value.content.trim().length > 0 &&
  Buffer.byteLength(value.content, 'utf8') <= 512 * 1024;

export const isSetAgentApiKeyRequest = (
  value: unknown,
): value is SetAgentApiKeyRequest =>
  isRecord(value) &&
  isAgentApiKeyProviderId(value.providerId) &&
  typeof value.apiKey === 'string';

export const isRemoveAgentCredentialRequest = (
  value: unknown,
): value is RemoveAgentCredentialRequest =>
  isRecord(value) && isAgentApiKeyProviderId(value.providerId);

export const isStartAgentPromptRequest = (
  value: unknown,
): value is StartAgentPromptRequest => {
  if (!isRecord(value)) return false;
  const currentDocumentIsValid =
    value.currentDocumentId === undefined ||
    (typeof value.currentDocumentId === 'string' &&
      value.currentDocumentId.length > 0 &&
      value.currentDocumentId.length <= 1_024);
  const draftIsValid =
    value.draftSnapshot === undefined ||
    (isRecord(value.draftSnapshot) &&
      typeof value.draftSnapshot.documentId === 'string' &&
      value.draftSnapshot.documentId.length > 0 &&
      value.draftSnapshot.documentId.length <= 1_024 &&
      typeof value.draftSnapshot.baseRevision === 'string' &&
      /^[a-f0-9]{64}$/u.test(value.draftSnapshot.baseRevision) &&
      typeof value.draftSnapshot.markdown === 'string' &&
      Buffer.byteLength(value.draftSnapshot.markdown, 'utf8') <= 512 * 1024);
  return (
    isConversationId(value.conversationId) &&
    typeof value.prompt === 'string' &&
    value.prompt.trim().length > 0 &&
    Buffer.byteLength(value.prompt, 'utf8') <= 32 * 1024 &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    value.requestId.length <= 128 &&
    isConversationId(value.userMessageId) &&
    (value.editMessageId === undefined || isConversationId(value.editMessageId)) &&
    currentDocumentIsValid &&
    draftIsValid &&
    ((value.currentDocumentId === undefined && value.draftSnapshot === undefined) ||
      (value.currentDocumentId !== undefined && value.draftSnapshot !== undefined))
  );
};

export const isCancelAgentRequest = (
  value: unknown,
): value is CancelAgentRequest =>
  isRecord(value) &&
  typeof value.requestId === 'string' &&
  value.requestId.length > 0 &&
  value.requestId.length <= 128;

export const isApplyAgentProposalRequest = (
  value: unknown,
): value is ApplyAgentProposalRequest => isProposalRequest(value);

export const isRejectAgentProposalRequest = (
  value: unknown,
): value is RejectAgentProposalRequest => isProposalRequest(value);

const isProposalRequest = (value: unknown): value is { proposalId: string } =>
  isRecord(value) &&
  Object.keys(value).length === 1 &&
  typeof value.proposalId === 'string' &&
  value.proposalId.length > 0 &&
  value.proposalId.length <= 128;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
