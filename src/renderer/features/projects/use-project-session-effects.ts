import { useEffect, useRef, type Dispatch } from 'react';

import type { ProjectSnapshot } from '../../../shared/contracts/project';
import type { ProjectWorkspaceAction } from './project-workspace-reducer';

interface ProjectSessionEffectsOptions {
  applyProjectSnapshot: (
    project: ProjectSnapshot,
    preserveDirtyDocuments: boolean,
  ) => void;
  dispatch: Dispatch<ProjectWorkspaceAction>;
  initialProject: ProjectSnapshot | null;
}

export const useProjectSessionEffects = ({
  applyProjectSnapshot,
  dispatch,
  initialProject,
}: ProjectSessionEffectsOptions): void => {
  const didApplyInitialProject = useRef(false);

  useEffect(() => {
    if (initialProject === null || didApplyInitialProject.current) return;
    didApplyInitialProject.current = true;
    applyProjectSnapshot(initialProject, false);
  }, [applyProjectSnapshot, initialProject]);

  useEffect(
    () =>
      window.driftfield.onProjectChanged((project) => {
        dispatch({ type: 'set-selection-message', value: null });
        applyProjectSnapshot(project, true);
      }),
    [applyProjectSnapshot, dispatch],
  );

  useEffect(
    () =>
      window.driftfield.onProjectWatcherStatusChanged((status) => {
        dispatch({
          type: 'set-watcher-code',
          value: status.status === 'error' ? status.code : null,
        });
      }),
    [dispatch],
  );
};
