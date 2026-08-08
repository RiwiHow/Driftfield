export const IPC_CHANNELS = {
  selectProjectDirectory: 'project:select-directory',
  refreshProject: 'project:refresh',
  projectChanged: 'project:changed',
  showEditorContextMenu: 'editor:show-context-menu',
  saveProjectDocument: 'project:save-document',
  confirmCloseUnsavedDocument: 'editor:confirm-close-unsaved',
  getAppSettings: 'settings:get',
  updateAppSettings: 'settings:update',
} as const;
