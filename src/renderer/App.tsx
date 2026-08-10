import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceShell } from "@/app/WorkspaceShell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectWorkspace } from "@/features/projects/use-project-workspace";
import { SettingsDialog } from "@/features/settings/dialog/SettingsDialog";
import { useAppSettings } from "@/features/settings/use-app-settings";
import { useAgentConfiguration } from "@/features/settings/use-agent-configuration";
import { useProjectAgentSettings } from '@/features/settings/use-project-agent-settings';
import {
  StoryDialog,
  type StorySection,
} from '@/features/story/StoryDialog';
import { useProjectStory } from '@/features/story/use-project-story';
import type { AppSettings } from "../shared/contracts/settings";
import type { ProjectSnapshot } from "../shared/contracts/project";

interface AppProps {
  initialProject: ProjectSnapshot | null;
  initialSettings: AppSettings;
  settingsLoadFailed: boolean;
}

export function App({
  initialProject,
  initialSettings,
  settingsLoadFailed,
}: AppProps) {
  const { t } = useTranslation("projects");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [storySection, setStorySection] = useState<StorySection | null>(null);
  const {
    isSavingSettings,
    resolvedTheme,
    settings,
    settingsError,
    updateSettings,
  } =
    useAppSettings(initialSettings, settingsLoadFailed);
  const project = useProjectWorkspace(initialProject);
  const agentConfiguration = useAgentConfiguration(project.projectId);
  const projectAgentSettings = useProjectAgentSettings(project.projectId);
  const projectStory = useProjectStory(project.projectId);

  useEffect(() => {
    const openSettingsFromKeyboard = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setIsSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", openSettingsFromKeyboard);
    return () =>
      window.removeEventListener("keydown", openSettingsFromKeyboard);
  }, []);

  return (
    <>
      <WorkspaceShell
        activeChapter={project.activeChapter}
        chapters={project.chapters}
        agentConfiguration={agentConfiguration.configuration}
        agentConfigurationError={agentConfiguration.error}
        agentConfigurationLoading={agentConfiguration.isLoading}
        agentSettings={projectAgentSettings.effectiveSettings}
        documentSaveError={project.documentSaveError}
        editorFontSize={settings.editorFontSize}
        isCreatingProject={project.isCreatingProject}
        isSelectingProject={project.isSelectingProject}
        isRefreshingProject={project.isRefreshingProject}
        isSavingDocument={project.isSavingDocument}
        onChapterChange={project.selectChapter}
        onAgentProposalApplied={(result) => {
          if (result.status === 'story-updated') {
            projectStory.replace(result.story);
          } else {
            project.commitAgentProposal(result);
          }
        }}
        onAgentStoryChanged={projectStory.refresh}
        onContentChange={project.updateActiveChapter}
        onCreateProject={() => void project.createProjectDirectory()}
        onCloseChapter={() => void project.closeActiveDocument()}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenStory={setStorySection}
        onRefreshProject={() => void project.refreshProject()}
        onSaveDocument={() => void project.saveActiveDocument()}
        onSelectProject={() => void project.selectProjectDirectory()}
        projectDirectory={project.projectDirectory}
        projectId={project.projectId}
        projectIcon={project.projectIcon}
        projectRootTitles={project.projectRootTitles}
        projectSelectionError={project.projectSelectionError}
        projectTree={project.projectTree}
        projectWatcherError={project.projectWatcherError}
        recoveredChapters={project.chapters.filter(
          (chapter) => chapter.backingFileStatus === "missing",
        )}
        theme={resolvedTheme}
      />
      <StoryDialog
        error={projectStory.error}
        isLoading={projectStory.isLoading}
        onOpenChange={(open) => !open && setStorySection(null)}
        onRefresh={() => void projectStory.refresh()}
        onSectionChange={setStorySection}
        open={storySection !== null}
        section={storySection ?? 'chronicle'}
        story={projectStory.story}
      />
      <SettingsDialog
        agentConfiguration={agentConfiguration.configuration}
        error={settingsError ?? projectAgentSettings.error ?? agentConfiguration.error}
        isSaving={isSavingSettings || agentConfiguration.isUpdating || projectAgentSettings.isSaving}
        onOpenChange={setIsSettingsOpen}
        onRemoveCredential={(providerId) => {
          void (async () => {
            const removed =
              await agentConfiguration.removeCredential(providerId);
            if (
              removed &&
              projectAgentSettings.settings?.defaultModel?.providerId === providerId
            ) {
              await projectAgentSettings.update({
                ...projectAgentSettings.settings,
                defaultModel: null,
              });
            }
          })();
        }}
        onResetModelSettings={async () => {
          const result = await agentConfiguration.resetSettings();
          if (result === null) return false;
          projectAgentSettings.replaceSettings(result.projectSettings);
          return true;
        }}
        onSetApiKey={agentConfiguration.setApiKey}
        onUpdateModelOverride={agentConfiguration.updateModelOverride}
        onUpdate={(update) => void updateSettings(update)}
        onUpdateProjectAgent={(update) => void projectAgentSettings.update(update)}
        open={isSettingsOpen}
        projectAgentSettings={projectAgentSettings.settings}
        resolvedTheme={resolvedTheme}
        settings={settings}
      />
      <Dialog
        onOpenChange={(open) => !open && project.dismissSaveConflict()}
        open={project.saveConflict !== null}
      >
        <DialogContent>
          <DialogTitle>{t("conflict.title")}</DialogTitle>
          <DialogDescription>{t("conflict.body")}</DialogDescription>
          <div className="save-conflict-actions">
            <Button
              onClick={project.reloadConflictedDocument}
              size="sm"
              variant="outline"
            >
              {t("conflict.reload")}
            </Button>
            <Button
              onClick={project.compareConflictedDocument}
              size="sm"
              variant="outline"
            >
              {t("conflict.compare")}
            </Button>
            <Button
              onClick={() => void project.saveActiveDocument(true)}
              size="sm"
            >
              {t("conflict.overwrite")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
