import {
  BrainCircuit,
  Check,
  Cpu,
  KeyRound,
  Minimize2,
  MonitorCog,
  Power,
  SquareMousePointer,
  Type,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  AGENT_API_KEY_PROVIDERS,
  type AgentApiKeyProviderId,
  type AgentConfiguration,
} from '../../../shared/contracts/agent-configuration';
import type {
  AppSettings,
  AppTheme,
  UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';

interface SettingsDialogProps {
  agentConfiguration: AgentConfiguration;
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoveCredential: (providerId: AgentApiKeyProviderId) => void;
  onSetApiKey: (
    providerId: AgentApiKeyProviderId,
    apiKey: string,
  ) => Promise<boolean>;
  onUpdate: (update: UpdateAppSettingsRequest) => void;
  open: boolean;
  settings: AppSettings;
}

const themeOptions: Array<{
  description: string;
  label: string;
  theme: AppTheme;
}> = [
  {
    description: '明亮、清晰的编辑环境',
    label: 'GitHub Light',
    theme: 'github-light',
  },
  {
    description: '低对比度的深蓝夜间主题',
    label: 'Tokyo Night',
    theme: 'tokyo-night',
  },
  {
    description: '经典的深灰代码编辑主题',
    label: 'One Dark',
    theme: 'one-dark',
  },
];

const editorFontSizes = [14, 15, 16, 17, 18, 20, 22, 24];

export function SettingsDialog({
  agentConfiguration,
  error,
  isSaving,
  onOpenChange,
  onRemoveCredential,
  onSetApiKey,
  onUpdate,
  open,
  settings,
}: SettingsDialogProps) {
  const canChooseCloseBehavior = window.driftfield.platform !== 'darwin';
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [credentialProvider, setCredentialProvider] =
    useState<AgentApiKeyProviderId>('anthropic');
  const selectedModelKey = settings.agent.defaultModel === null
    ? ''
    : `${settings.agent.defaultModel.providerId}\u0000${settings.agent.defaultModel.modelId}`;

  const saveApiKey = async (): Promise<void> => {
    const apiKey = apiKeyRef.current?.value.trim() ?? '';
    if (apiKey.length === 0) return;
    if (await onSetApiKey(credentialProvider, apiKey)) {
      if (apiKeyRef.current !== null) apiKeyRef.current.value = '';
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="settings-dialog">
        <header className="settings-header">
          <DialogTitle>应用设置</DialogTitle>
          <DialogDescription>
            调整 Driftfield 的外观和写作体验。更改会自动保存。
          </DialogDescription>
        </header>

        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-heading">
              <KeyRound aria-hidden="true" size={17} />
              <div>
                <h3>模型服务</h3>
                <p>凭据仅保存在本机主进程中，应用不会显示已保存的 Key。</p>
              </div>
            </div>

            <div className="agent-credential-form">
              <select
                disabled={isSaving}
                onChange={(event) =>
                  setCredentialProvider(
                    event.target.value as AgentApiKeyProviderId,
                  )
                }
                value={credentialProvider}
              >
                {AGENT_API_KEY_PROVIDERS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <input
                autoComplete="off"
                disabled={isSaving}
                placeholder="输入 API Key"
                ref={apiKeyRef}
                type="password"
              />
              <Button
                disabled={isSaving}
                onClick={() => void saveApiKey()}
                size="sm"
                type="button"
                variant="outline"
              >
                保存
              </Button>
            </div>

            <div className="agent-provider-statuses">
              {agentConfiguration.providers
                .filter(({ configured }) => configured)
                .map(({ providerId }) => (
                  <span key={providerId}>
                    {AGENT_API_KEY_PROVIDERS.find(({ id }) => id === providerId)
                      ?.label ?? providerId}
                    <button
                      disabled={isSaving}
                      onClick={() => onRemoveCredential(providerId)}
                      type="button"
                    >
                      移除
                    </button>
                  </span>
                ))}
              {!agentConfiguration.providers.some(({ configured }) => configured) && (
                <small>尚未连接模型服务</small>
              )}
            </div>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <Cpu aria-hidden="true" size={17} />
              <div>
                <h3>默认模型</h3>
                <p>Agent 请求始终使用这里明确选择的模型。</p>
              </div>
            </div>
            <label className="agent-setting-field">
              <span className="sr-only">默认 Agent 模型</span>
              <select
                disabled={isSaving || agentConfiguration.models.length === 0}
                onChange={(event) => {
                  const model = agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      `${providerId}\u0000${id}` === event.target.value,
                  );
                  onUpdate({
                    agent: {
                      ...settings.agent,
                      defaultModel: model === undefined
                        ? null
                        : { modelId: model.id, providerId: model.providerId },
                      thinkingLevel: model?.reasoning === false
                        ? 'off'
                        : settings.agent.thinkingLevel,
                    },
                  });
                }}
                value={selectedModelKey}
              >
                <option value="">请选择模型</option>
                {agentConfiguration.models.map((model) => (
                  <option
                    key={`${model.providerId}/${model.id}`}
                    value={`${model.providerId}\u0000${model.id}`}
                  >
                    {model.name} · {model.providerId}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <BrainCircuit aria-hidden="true" size={17} />
              <div>
                <h3>思考深度</h3>
                <p>更高等级通常更慢，并可能产生更多费用。</p>
              </div>
            </div>
            <label className="agent-setting-field">
              <span className="sr-only">Agent 思考深度</span>
              <select
                disabled={
                  isSaving ||
                  settings.agent.defaultModel === null ||
                  agentConfiguration.models.find(
                    ({ id, providerId }) =>
                      id === settings.agent.defaultModel?.modelId &&
                      providerId === settings.agent.defaultModel?.providerId,
                  )?.reasoning === false
                }
                onChange={(event) =>
                  onUpdate({
                    agent: {
                      ...settings.agent,
                      thinkingLevel: event.target.value as AppSettings['agent']['thinkingLevel'],
                    },
                  })
                }
                value={settings.agent.thinkingLevel}
              >
                <option value="off">关闭</option>
                <option value="minimal">最低</option>
                <option value="low">快速</option>
                <option value="medium">均衡</option>
                <option value="high">深度</option>
                <option value="xhigh">极高（高级）</option>
                <option value="max">最大（高级）</option>
              </select>
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading">
              <MonitorCog aria-hidden="true" size={17} />
              <div>
                <h3>外观主题</h3>
                <p>应用到窗口、目录、编辑器和 Agent 面板。</p>
              </div>
            </div>

            <div className="theme-options">
              {themeOptions.map((option) => {
                const isSelected = settings.theme === option.theme;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      'theme-option',
                      isSelected && 'is-selected',
                    )}
                    disabled={isSaving}
                    key={option.theme}
                    onClick={() => onUpdate({ theme: option.theme })}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="theme-swatch"
                      data-preview-theme={option.theme}
                    >
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="theme-option-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                    </span>
                    {isSelected && <Check aria-hidden="true" size={15} />}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="settings-section settings-row-section">
            <div className="settings-section-heading">
              <Type aria-hidden="true" size={17} />
              <div>
                <h3>正文大小</h3>
                <p>调整 Markdown 富文本编辑器中的正文字号。</p>
              </div>
            </div>

            <label className="font-size-field">
              <span className="sr-only">编辑器正文字号</span>
              <select
                disabled={isSaving}
                onChange={(event) =>
                  onUpdate({ editorFontSize: Number(event.target.value) })
                }
                value={settings.editorFontSize}
              >
                {editorFontSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} px
                  </option>
                ))}
              </select>
            </label>
          </section>

          {canChooseCloseBehavior && (
            <section className="settings-section settings-row-section">
              <div className="settings-section-heading">
                <SquareMousePointer aria-hidden="true" size={16} />
                <div>
                  <h3>关闭主窗口时</h3>
                  <p>明确退出操作始终会完全退出 Driftfield。</p>
                </div>
              </div>

              <div
                aria-label="关闭主窗口时的行为"
                className="close-behavior-options"
                role="group"
              >
                <button
                  aria-pressed={settings.closeWindowBehavior === 'quit'}
                  className={cn(
                    settings.closeWindowBehavior === 'quit' && 'is-selected',
                  )}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'quit' })}
                  type="button"
                >
                  <Power aria-hidden="true" size={13} />
                  退出应用
                </button>
                <button
                  aria-pressed={settings.closeWindowBehavior === 'minimize'}
                  className={cn(
                    settings.closeWindowBehavior === 'minimize' &&
                      'is-selected',
                  )}
                  disabled={isSaving}
                  onClick={() => onUpdate({ closeWindowBehavior: 'minimize' })}
                  type="button"
                >
                  <Minimize2 aria-hidden="true" size={13} />
                  最小化
                </button>
              </div>
            </section>
          )}
        </div>

        <footer className="settings-footer">
          <span aria-live="polite" className={cn(error && 'is-error')}>
            {error ?? (isSaving ? '正在保存…' : '设置已自动保存')}
          </span>
          <Button
            onClick={() => onOpenChange(false)}
            size="sm"
            variant="secondary"
          >
            完成
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
