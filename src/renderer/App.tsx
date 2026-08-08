import { useEffect, useState } from 'react';

import { WorkspaceShell } from '@/app/WorkspaceShell';
import type { ThemeName } from '@/app/types';
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

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { isSavingSettings, settings, settingsError, updateSettings } =
    useAppSettings();
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
        onThemeChange={(theme: ThemeName) => void updateSettings({ theme })}
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
        error={settingsError}
        isSaving={isSavingSettings}
        onOpenChange={setIsSettingsOpen}
        onUpdate={(update) => void updateSettings(update)}
        open={isSettingsOpen}
        settings={settings}
      />
      <Dialog
        onOpenChange={(open) => !open && project.dismissSaveConflict()}
        open={project.saveConflict !== null}
      >
        <DialogContent>
          <DialogTitle>文件在磁盘上已更改</DialogTitle>
          <DialogDescription>
            请选择重新载入磁盘版本、进入对比合并，或确认用当前编辑内容覆盖磁盘版本。
          </DialogDescription>
          <div className="save-conflict-actions">
            <Button
              onClick={project.reloadConflictedDocument}
              variant="outline"
            >
              重新载入
            </Button>
            <Button
              onClick={project.compareConflictedDocument}
              variant="outline"
            >
              对比并合并
            </Button>
            <Button onClick={() => void project.saveActiveDocument(true)}>
              确认覆盖
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
