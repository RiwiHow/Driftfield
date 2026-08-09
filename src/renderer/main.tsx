import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DEFAULT_APP_SETTINGS } from '../shared/contracts/settings';
import type { ProjectSnapshot } from '../shared/contracts/project';
import { applyDocumentTheme } from './app/apply-document-theme';
import { initializeRendererI18n } from './i18n';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element was not found.');
}

const bootstrap = async (): Promise<void> => {
  let initialSettings = DEFAULT_APP_SETTINGS;
  let initialProject: ProjectSnapshot | null = null;
  let settingsLoadFailed = false;
  try {
    initialSettings = await window.driftfield.getAppSettings();
  } catch {
    settingsLoadFailed = true;
  }
  applyDocumentTheme(initialSettings.theme);
  await initializeRendererI18n(initialSettings.language);
  try {
    initialProject = await window.driftfield.restoreLastProject();
  } catch {
    initialProject = null;
  }
  createRoot(root).render(
    <StrictMode>
      <App
        initialSettings={initialSettings}
        initialProject={initialProject}
        settingsLoadFailed={settingsLoadFailed}
      />
    </StrictMode>,
  );
};

void bootstrap();
