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
import { isAgentApiKeyProviderId } from '../../services/agent-credential-service';

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
    typeof value.prompt === 'string' &&
    value.prompt.trim().length > 0 &&
    Buffer.byteLength(value.prompt, 'utf8') <= 32 * 1024 &&
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    value.requestId.length <= 128 &&
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
