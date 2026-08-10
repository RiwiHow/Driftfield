import {
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  CircleStop,
  Cpu,
  LoaderCircle,
  Pencil,
  Settings2,
  Sparkles,
  SquarePen,
  TriangleAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Chapter } from '@/app/types';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { AgentConfiguration } from '../../../shared/contracts/agent-configuration';
import type { AgentSettings } from '../../../shared/contracts/settings';
import type {
  AgentDocumentProposal,
  SuccessfulApplyAgentProposalResult,
} from '../../../shared/contracts/agent-proposals';
import type { AgentConversationPhase } from './agent-conversation-state';
import { SafeMarkdown } from './SafeMarkdown';
import {
  type AgentConversationPart,
  type AgentToolActivity,
  type ConversationMessage,
  useAgentConversation,
} from './use-agent-conversation';

interface AssistantPanelProps {
  activeChapter: Chapter | null;
  chapters: Chapter[];
  configuration: AgentConfiguration;
  configurationError: string | null;
  configurationLoading: boolean;
  onOpenSettings: () => void;
  onProposalApplied: (
    result: SuccessfulApplyAgentProposalResult,
  ) => void;
  settings: AgentSettings;
  projectId: string | null;
}

export function AssistantPanel({
  activeChapter,
  chapters,
  configuration,
  configurationError,
  configurationLoading,
  onOpenSettings,
  onProposalApplied,
  projectId,
  settings,
}: AssistantPanelProps) {
  const { t } = useTranslation('assistant');
  const { t: tCommon } = useTranslation('common');
  const [deleteError, setDeleteError] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Pick<
    ConversationMessage,
    'content' | 'id' | 'role'
  > | null>(null);
  const {
    activeConversationId,
    applyProposal,
    cancel,
    clear,
    conversations,
    deleteConversation,
    editAssistantMessage,
    error,
    historyLoading,
    isActive,
    messages,
    phase,
    rejectProposal,
    renameConversation,
    resend,
    send,
    selectConversation,
  } = useAgentConversation(activeChapter, chapters, onProposalApplied, projectId);
  const selectedModel = configuration.models.find(
    ({ id, providerId }) =>
      id === settings.defaultModel?.modelId &&
      providerId === settings.defaultModel?.providerId,
  );
  const isConfigured = selectedModel !== undefined;
  const canSend =
    isConfigured && activeConversationId !== null && !historyLoading;
  const activePhaseLabel = (
    currentPhase: AgentConversationPhase,
  ): string | undefined => {
    if (currentPhase === 'cancelling') return t('status.cancelling');
    if (currentPhase === 'starting') return t('status.starting');
    if (currentPhase === 'streaming') return t('status.streaming');
    return undefined;
  };

  const submit = async (): Promise<void> => {
    if (!canSend || isActive) return;
    if (await send(prompt)) setPrompt('');
  };

  const saveMessageEdit = async (): Promise<void> => {
    if (editingMessage === null) return;
    const saved =
      editingMessage.role === 'user'
        ? isConfigured &&
          (await resend(editingMessage.id, editingMessage.content))
        : await editAssistantMessage(editingMessage.id, editingMessage.content);
    if (saved) setEditingMessage(null);
  };

  const activeConversation = conversations.find(
    ({ id }) => id === activeConversationId,
  );

  const openRenameConversation = (): void => {
    if (activeConversation === undefined) return;
    setRenameDraft(activeConversation.title || t('history.untitled'));
    setRenameError(false);
    setRenameTargetId(activeConversation.id);
  };

  const submitConversationRename = async (): Promise<void> => {
    const title = renameDraft.trim();
    if (renameTargetId === null || title.length === 0 || isRenaming) return;
    setIsRenaming(true);
    setRenameError(false);
    const renamed = await renameConversation(renameTargetId, title);
    setIsRenaming(false);
    if (renamed) {
      setRenameTargetId(null);
    } else {
      setRenameError(true);
    }
  };

  const openDeleteConversation = (): void => {
    if (activeConversation === undefined) return;
    setDeleteError(false);
    setDeleteTarget({
      id: activeConversation.id,
      title: activeConversation.title || t('history.untitled'),
    });
  };

  const deleteSelectedConversation = async (): Promise<void> => {
    if (deleteTarget === null || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(false);
    setEditingMessage(null);
    const deleted = await deleteConversation(deleteTarget.id);
    setIsDeleting(false);
    if (deleted) {
      setDeleteTarget(null);
    } else {
      setDeleteError(true);
    }
  };

  const modelStatus = configurationLoading
    ? t('status.loadingConfiguration')
    : configurationError !== null
      ? t('status.configurationFailed')
    : isConfigured
      ? `${selectedModel.providerId} · ${t(`thinking.${settings.thinkingLevel}`)}`
      : settings.defaultModel === null
        ? t('status.notConfigured')
        : t('status.modelUnavailable');

  return (
    <aside className="assistant-pane">
      <div className="pane-heading assistant-heading">
        <Select
          disabled={
            isActive || historyLoading || activeConversationId === null
          }
          onValueChange={(conversationId) => {
            if (conversationId !== activeConversationId) {
              setEditingMessage(null);
              void selectConversation(conversationId);
            }
          }}
          value={activeConversationId ?? ''}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <SelectTrigger
                aria-label={t('history.select')}
                className="conversation-select"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
            </TooltipTrigger>
            <TooltipContent>{t('history.select')}</TooltipContent>
          </Tooltip>
          <SelectContent
            align="start"
            className="conversation-select-content"
            position="popper"
            sideOffset={4}
          >
            {conversations.map((conversation) => (
              <SelectItem key={conversation.id} value={conversation.id}>
                {conversation.title || t('history.untitled')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="conversation-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('history.rename')}
                disabled={isActive || activeConversationId === null}
                onClick={openRenameConversation}
                size="icon"
                variant="ghost"
              >
                <Pencil aria-hidden="true" size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('history.rename')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('history.delete')}
                disabled={isActive || activeConversationId === null}
                onClick={openDeleteConversation}
                size="icon"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" size={13} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('history.delete')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t('actions.newConversation')}
                disabled={isActive || historyLoading || projectId === null}
                onClick={() => {
                  setEditingMessage(null);
                  clear();
                }}
                size="icon"
                variant="ghost"
              >
                <SquarePen aria-hidden="true" size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('actions.newConversation')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !isRenaming) {
            setRenameError(false);
            setRenameTargetId(null);
          }
        }}
        open={renameTargetId !== null}
      >
        <DialogContent className="max-w-[340px]">
          <DialogTitle>{t('history.rename')}</DialogTitle>
          <DialogDescription>
            {t('history.renameDescription')}
          </DialogDescription>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitConversationRename();
            }}
          >
            <div className="grid gap-1.5">
              <Label
                className="text-[11px]"
                htmlFor="conversation-rename-title"
              >
                {t('history.renamePrompt')}
              </Label>
              <Input
                autoFocus
                className="h-8 text-[11px] focus-visible:ring-2 md:text-[11px]"
                disabled={isRenaming}
                id="conversation-rename-title"
                maxLength={200}
                onChange={(event) => setRenameDraft(event.target.value)}
                value={renameDraft}
              />
            </div>
            {renameError && (
              <p className="text-[10px] text-destructive" role="alert">
                {t('history.renameError')}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={isRenaming}
                onClick={() => setRenameTargetId(null)}
                size="sm"
                variant="ghost"
              >
                {tCommon('actions.cancel')}
              </Button>
              <Button
                disabled={isRenaming || renameDraft.trim().length === 0}
                size="sm"
                type="submit"
              >
                {isRenaming
                  ? t('history.renaming')
                  : tCommon('actions.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteError(false);
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <AlertDialogContent className="max-w-[360px]">
          <AlertDialogTitle>{t('history.delete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('history.deleteConfirm', {
              title: deleteTarget?.title ?? '',
            })}
          </AlertDialogDescription>
          {deleteError && (
            <p className="text-[10px] text-destructive" role="alert">
              {t('history.deleteError')}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <AlertDialogCancel asChild>
              <Button disabled={isDeleting} size="sm" variant="ghost">
                {tCommon('actions.cancel')}
              </Button>
            </AlertDialogCancel>
            <Button
              disabled={isDeleting}
              onClick={() => void deleteSelectedConversation()}
              size="sm"
              variant="destructive"
            >
              {isDeleting ? t('history.deleting') : t('history.delete')}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <div aria-label={t('title')} className="conversation">
        {messages.length === 0 ? (
          isConfigured ? (
            <div className="message-row assistant-message">
              <span className="message-avatar">
                <Bot aria-hidden="true" size={14} />
              </span>
              <div className="message-content">
                <div className="message-author">{t('author.assistant')}</div>
                <p>{t('empty.welcome')}</p>
              </div>
            </div>
          ) : (
            <div className="agent-setup-empty">
              <Cpu aria-hidden="true" size={18} />
              <strong>
                {configurationLoading
                  ? t('empty.loading')
                  : configurationError ?? t('empty.setup')}
              </strong>
              <p>
                {configurationLoading
                  ? t('empty.loadingBody')
                  : t('empty.body')}
              </p>
              {!configurationLoading && (
                <Button onClick={onOpenSettings} size="sm" variant="outline">
                  {t('empty.setupAction')}
                </Button>
              )}
            </div>
          )
        ) : (
          messages.map((message) => (
            <div
              className={`message-row ${message.role}-message`}
              key={message.id}
            >
              <span className="message-avatar">
                {message.role === 'assistant' ? (
                  <Bot aria-hidden="true" size={14} />
                ) : (
                  <UserRound aria-hidden="true" size={14} />
                )}
              </span>
              <div className="message-content">
                <div className="message-meta">
                  <div className="message-author">
                    {message.role === 'assistant'
                      ? t('author.assistant')
                      : t('author.user')}
                  </div>
                  {!isActive &&
                  message.terminal === undefined &&
                  message.content.trim().length > 0 ? (
                    <button
                      aria-label={t('actions.editMessage')}
                      className="message-edit-button"
                      onClick={() =>
                        setEditingMessage({
                          content: message.content,
                          id: message.id,
                          role: message.role,
                        })
                      }
                      title={t('actions.editMessage')}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={11} />
                    </button>
                  ) : null}
                </div>
                {editingMessage?.id === message.id ? (
                  <MessageEditor
                    disabled={
                      !editingMessage.content.trim() ||
                      (editingMessage.role === 'user' && !isConfigured)
                    }
                    onCancel={() => setEditingMessage(null)}
                    onChange={(content) =>
                      setEditingMessage((current) =>
                        current === null ? null : { ...current, content },
                      )
                    }
                    onSave={() => void saveMessageEdit()}
                    role={editingMessage.role}
                    value={editingMessage.content}
                  />
                ) : message.role === 'assistant' ? (
                  <>
                    {(message.parts?.length ?? 0) > 0 ? (
                      <AgentResponseTimeline
                        onApplyProposal={applyProposal}
                        onRejectProposal={rejectProposal}
                        parts={message.parts!}
                      />
                    ) : (
                      <div className="agent-markdown">
                        <SafeMarkdown>
                          {isActive ? activePhaseLabel(phase) ?? '' : ''}
                        </SafeMarkdown>
                      </div>
                    )}
                    {message.terminal !== undefined ? (
                      <small className="agent-terminal">
                        {t(`terminal.${message.terminal}`)}
                      </small>
                    ) : null}
                  </>
                ) : (
                  <p>
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          ))
        )}

        {error !== null ? (
          <div className="agent-placeholder agent-error">
            <span>{error}</span>
            <button onClick={onOpenSettings} type="button">
              {t('actions.checkSettings')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="composer" data-disabled={!isConfigured || undefined}>
        <textarea
          aria-label={t('actions.send')}
          disabled={!isConfigured}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              !isActive &&
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            isConfigured
              ? t('composer.placeholder')
              : configurationLoading
                ? t('status.loadingConfiguration')
                : t('composer.setupPlaceholder')
          }
          rows={3}
          value={prompt}
        />
        <div className="composer-footer">
          <span className="composer-document" title={activeChapter?.title}>
            {activeChapter?.title ?? t('composer.noChapter')}
          </span>
          <Button
            aria-label={isActive ? t('actions.stop') : t('actions.send')}
            className="composer-send"
            disabled={
              isActive
                ? phase === 'cancelling'
                : !canSend || !prompt.trim()
            }
            onClick={() => void (isActive ? cancel() : submit())}
            size="icon"
          >
            {isActive ? (
              <CircleStop size={15} />
            ) : (
              <ArrowUp size={16} strokeWidth={2.2} />
            )}
          </Button>
        </div>
      </div>

      <footer className="assistant-statusbar">
        <button
          aria-label={t('actions.openSettings')}
          className="assistant-model"
          disabled={configurationLoading}
          onClick={onOpenSettings}
          title={`${selectedModel?.name ?? modelStatus} · ${modelStatus}`}
          type="button"
        >
          <Sparkles aria-hidden="true" size={12} />
          <span>{selectedModel?.name ?? modelStatus}</span>
          <Settings2 aria-hidden="true" size={11} />
        </button>
        <span className="assistant-model-status">
          {activePhaseLabel(phase) ?? modelStatus}
        </span>
      </footer>
    </aside>
  );
}

function MessageEditor({
  disabled,
  onCancel,
  onChange,
  onSave,
  role,
  value,
}: {
  disabled: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  role: ConversationMessage['role'];
  value: string;
}) {
  const { t } = useTranslation('assistant');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const minimumHeight = role === 'user' ? 110 : 180;
    const maximumHeight = Math.max(
      minimumHeight,
      Math.min(window.innerHeight * 0.5, 360),
    );
    textarea.style.height = '0px';
    const nextHeight = Math.min(
      Math.max(textarea.scrollHeight, minimumHeight),
      maximumHeight,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maximumHeight ? 'auto' : 'hidden';
  }, [role, value]);

  return (
    <div className="message-editor" data-role={role}>
      <textarea
        aria-label={t('actions.editMessage')}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey) &&
            !event.nativeEvent.isComposing &&
            !disabled
          ) {
            event.preventDefault();
            onSave();
          }
        }}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      <div className="message-editor-actions">
        <Button onClick={onCancel} size="sm" variant="ghost">
          {t('actions.cancelEdit')}
        </Button>
        <Button disabled={disabled} onClick={onSave} size="sm" variant="outline">
          {t(
            role === 'user' ? 'actions.resendEditedMessage' : 'actions.saveEdit',
          )}
        </Button>
      </div>
    </div>
  );
}

function AgentResponseTimeline({
  onApplyProposal,
  onRejectProposal,
  parts,
}: {
  onApplyProposal: (proposal: AgentDocumentProposal) => Promise<void>;
  onRejectProposal: (proposalId: string) => Promise<void>;
  parts: AgentConversationPart[];
}) {
  return (
    <div className="agent-response-timeline">
      {parts.map((part, index) =>
        part.type === 'text' ? (
          <div className="agent-markdown" key={`text-${index}`}>
            <SafeMarkdown>{part.content}</SafeMarkdown>
          </div>
        ) : part.type === 'tool' ? (
          <ToolActivityRow
            activity={part.activity}
            key={part.activity.toolCallId}
          />
        ) : (
          <ProposalCard
            key={part.proposal.proposalId}
            onApply={() => void onApplyProposal(part.proposal)}
            onReject={() => void onRejectProposal(part.proposal.proposalId)}
            proposal={part.proposal}
            status={part.status}
          />
        ),
      )}
    </div>
  );
}

function ToolActivityRow({ activity }: { activity: AgentToolActivity }) {
  const { t } = useTranslation('assistant');
  return (
    <details className="agent-tool-activity">
      <summary>
        <ChevronRight
          aria-hidden="true"
          className="agent-tool-disclosure"
          size={11}
        />
        {activity.status === 'running' ? (
          <LoaderCircle
            aria-hidden="true"
            className="agent-tool-spinner"
            size={12}
          />
        ) : activity.status === 'cancelled' ? (
          <CircleStop aria-hidden="true" size={12} />
        ) : activity.failed ? (
          <TriangleAlert aria-hidden="true" size={12} />
        ) : (
          <Check aria-hidden="true" size={12} />
        )}
        <span>{t(`tools.names.${activity.toolName}`)}</span>
        <small>
          <span>
            {t(
              activity.status === 'running'
                ? 'tools.status.running'
                : activity.status === 'cancelled'
                  ? 'tools.status.cancelled'
                  : activity.failed
                    ? 'tools.status.failed'
                    : 'tools.status.completed',
            )}
          </span>
          <span aria-hidden="true"> · </span>
          <span className="agent-tool-show-details">
            {t('tools.showDetails')}
          </span>
          <span className="agent-tool-hide-details">
            {t('tools.hideDetails')}
          </span>
        </small>
      </summary>
      <div className="agent-tool-details">
        <span>{t('tools.input')}</span>
        <pre>{formatToolPayload(activity.input)}</pre>
        {activity.output !== undefined ? (
          <>
            <span>{t('tools.output')}</span>
            <pre>{formatToolPayload(activity.output)}</pre>
          </>
        ) : null}
      </div>
    </details>
  );
}

const formatToolPayload = (payload: string): string => {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
};

function ProposalCard({
  onApply,
  onReject,
  proposal,
  status,
}: {
  onApply: () => void;
  onReject: () => void;
  proposal: AgentDocumentProposal;
  status: 'pending' | 'applying' | 'saved' | 'rejected' | 'conflict' | 'missing' | 'stale' | 'failed';
}) {
  const { t } = useTranslation('assistant');
  const pending = status === 'pending';
  const operation = 'operation' in proposal ? proposal.operation : 'edit';
  const statusKey = status === 'pending'
    ? 'failed'
    : status === 'saved' && operation !== 'edit'
      ? operation === 'create'
        ? 'created'
        : operation === 'delete'
          ? 'deleted'
          : operation === 'move_document'
            ? 'moved'
            : operation === 'create_volume'
              ? 'createdVolume'
              : 'createdLoreCategory'
      : status;
  return (
    <div className="agent-proposal">
      <strong>{t(`proposal.title.${operation}`, { title: proposal.title })}</strong>
      <details>
        <summary>{t('proposal.preview')}</summary>
        <div className="agent-proposal-comparison">
          {!('operation' in proposal) || proposal.operation === 'delete' ? (
            <section>
              <span>{t('proposal.original')}</span>
              <pre>{proposal.baseMarkdown}</pre>
            </section>
          ) : null}
          {!('operation' in proposal) || proposal.operation === 'create' ? (
            <section>
              <span>{t('proposal.proposed')}</span>
              <pre>{proposal.markdown}</pre>
            </section>
          ) : null}
          {'operation' in proposal && proposal.operation === 'move_document' ? (
            <section>
              <span>{t('proposal.destination')}</span>
              <pre>{t('proposal.moveSummary', {
                source: proposal.sourceParentTitle,
                target: proposal.targetParentTitle,
              })}</pre>
            </section>
          ) : null}
          {'operation' in proposal && (proposal.operation === 'create_volume' ||
          proposal.operation === 'create_lore_category') ? (
            <section>
              <span>{t('proposal.destination')}</span>
              <pre>{proposal.parentTitle}</pre>
            </section>
          ) : null}
        </div>
      </details>
      {pending ? (
        <div className="agent-proposal-actions">
          <Button onClick={onReject} size="sm" variant="outline">
            {t('proposal.reject')}
          </Button>
          <Button onClick={onApply} size="sm">
            {t(`proposal.accept.${operation}`)}
          </Button>
        </div>
      ) : (
        <small>{t(`proposal.status.${statusKey}`)}</small>
      )}
    </div>
  );
}
