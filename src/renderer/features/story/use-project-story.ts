import { useCallback, useEffect, useRef, useState } from 'react';

import type { ProjectStorySnapshot } from '../../../shared/contracts/project-story';

export const useProjectStory = (projectId: string | null) => {
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [story, setStory] = useState<ProjectStorySnapshot | null>(null);
  const loadSequence = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (projectId === null) {
      setStory(null);
      setError(false);
      return;
    }
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    setError(false);
    try {
      const next = await window.driftfield.getProjectStory();
      if (sequence === loadSequence.current) setStory(next);
    } catch {
      if (sequence === loadSequence.current) setError(true);
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    return () => {
      loadSequence.current += 1;
    };
  }, [refresh]);

  return { error, isLoading, refresh, replace: setStory, story };
};
