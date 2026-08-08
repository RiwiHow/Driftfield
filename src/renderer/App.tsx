import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { WorkspaceShell } from '@/app/WorkspaceShell';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProjectWorkspace } from '@/features/projects/use-project-workspace';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { useAppSettings } from '@/features/settings/use-app-settings';
import { useAgentConfiguration } from '@/features/settings/use-agent-configuration';
import type { AppSettings } from '../shared/contracts/settings';

interface AppProps {
  initialSettings: AppSettings;
  settingsLoadFailed: boolean;
}

export function App({ initialSettings, settingsLoadFailed }: AppProps) {
  const { t } = useTranslation('projects');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isSavingSettings, settings, settingsError, updateSettings } =
    useAppSettings(initialSettings, settingsLoadFailed);
  const agentConfiguration = useAgentConfiguration();
  const project = useProjectWorkspace();

  useEffect(() => {
    const openSettingsFromKeyboard = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', openSettingsFromKeyboard);
    return () => window.removeEventListener('keydown', openSettingsFromKeyboard);
  }, []);

  return (
    <>
      <WorkspaceShell
        activeChapter={project.activeChapter}
        agentConfiguration={agentConfiguration.configuration}
        agentConfigurationError={agentConfiguration.error}
        agentConfigurationLoading={agentConfiguration.isLoading}
        agentSettings={settings.agent}
        documentSaveError={project.documentSaveError}
        editorFontSize={settings.editorFontSize}
        isSelectingProject={project.isSelectingProject}
        isRefreshingProject={project.isRefreshingProject}
        isSavingDocument={project.isSavingDocument}
        onChapterChange={project.selectChapter}
        onContentChange={project.updateActiveChapter}
        onCloseChapter={() => void project.closeActiveDocument()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRefreshProject={() => void project.refreshProject()}
        onSaveDocument={() => void project.saveActiveDocument()}
        onSelectProject={() => void project.selectProjectDirectory()}
        projectDirectory={project.projectDirectory}
        projectSelectionError={project.projectSelectionError}
        projectTree={project.projectTree}
        projectWatcherError={project.projectWatcherError}
        recoveredChapters={project.chapters.filter(
          (chapter) => chapter.backingFileStatus === 'missing',
        )}
        theme={settings.theme}
      />
      <SettingsDialog
        agentConfiguration={agentConfiguration.configuration}
        error={settingsError ?? agentConfiguration.error}
        isSaving={isSavingSettings || agentConfiguration.isUpdating}
        onOpenChange={setIsSettingsOpen}
        onRemoveCredential={(providerId) => {
          void (async () => {
            const removed =
              await agentConfiguration.removeCredential(providerId);
            if (
              removed &&
              settings.agent.defaultModel?.providerId === providerId
            ) {
              await updateSettings({
                agent: { ...settings.agent, defaultModel: null },
              });
            }
          })();
        }}
        onSetApiKey={agentConfiguration.setApiKey}
        onUpdate={(update) => void updateSettings(update)}
        open={isSettingsOpen}
        settings={settings}
      />
      <Dialog
        onOpenChange={(open) => !open && project.dismissSaveConflict()}
        open={project.saveConflict !== null}
      >
        <DialogContent>
          <DialogTitle>{t('conflict.title')}</DialogTitle>
          <DialogDescription>{t('conflict.body')}</DialogDescription>
          <div className="save-conflict-actions">
            <Button
              onClick={project.reloadConflictedDocument}
              variant="outline"
            >
              {t('conflict.reload')}
            </Button>
            <Button
              onClick={project.compareConflictedDocument}
              variant="outline"
            >
              {t('conflict.compare')}
            </Button>
            <Button onClick={() => void project.saveActiveDocument(true)}>
              {t('conflict.overwrite')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
