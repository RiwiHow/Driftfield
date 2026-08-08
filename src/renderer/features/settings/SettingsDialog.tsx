import {
  Check,
  Minimize2,
  MonitorCog,
  Power,
  SquareMousePointer,
  Type,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type {
  AppSettings,
  AppTheme,
  UpdateAppSettingsRequest,
} from '../../../shared/contracts/settings';

interface SettingsDialogProps {
  error: string | null;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
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
  error,
  isSaving,
  onOpenChange,
  onUpdate,
  open,
  settings,
}: SettingsDialogProps) {
  const canChooseCloseBehavior = window.driftfield.platform !== 'darwin';

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
