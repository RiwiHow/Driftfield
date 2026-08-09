import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePanelRef } from 'react-resizable-panels';

export const useWorkspacePanelTransitions = () => {
  const libraryPanelRef = usePanelRef();
  const assistantPanelRef = usePanelRef();
  const libraryElementRef = useRef<HTMLDivElement | null>(null);
  const assistantElementRef = useRef<HTMLDivElement | null>(null);
  const librarySeparatorRef = useRef<HTMLDivElement | null>(null);
  const assistantSeparatorRef = useRef<HTMLDivElement | null>(null);
  const activeViewTransitionRef = useRef<ViewTransition | null>(null);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);
  const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);

  const clearViewTransitionStyles = useCallback((): void => {
    for (const panelElement of [
      libraryElementRef.current,
      assistantElementRef.current,
    ]) {
      panelElement?.style.removeProperty('view-transition-name');
    }
    for (const separatorElement of [
      librarySeparatorRef.current,
      assistantSeparatorRef.current,
    ]) {
      separatorElement?.style.removeProperty('visibility');
    }
    document.documentElement.removeAttribute('data-panel-transition');
  }, []);

  useEffect(
    () => () => {
      activeViewTransitionRef.current?.skipTransition();
      activeViewTransitionRef.current = null;
      clearViewTransitionStyles();
    },
    [clearViewTransitionStyles],
  );

  const animatePanelToggle = useCallback(
    (
      side: 'left' | 'right',
      panelElement: HTMLDivElement | null,
      separatorElement: HTMLDivElement | null,
      isCollapsed: boolean,
      toggle: () => void,
    ): void => {
      activeViewTransitionRef.current?.skipTransition();
      activeViewTransitionRef.current = null;
      clearViewTransitionStyles();

      if (
        panelElement === null ||
        !document.startViewTransition ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        toggle();
        return;
      }

      const transitionKind = `${side}-${isCollapsed ? 'open' : 'close'}`;
      document.documentElement.dataset.panelTransition = transitionKind;
      panelElement.style.viewTransitionName = isCollapsed
        ? 'none'
        : 'df-side-panel';
      if (separatorElement !== null) {
        separatorElement.style.visibility = 'hidden';
      }

      const transition = document.startViewTransition(() => {
        flushSync(toggle);
        panelElement.style.viewTransitionName = isCollapsed
          ? 'df-side-panel'
          : 'none';
      });
      activeViewTransitionRef.current = transition;

      const cleanUp = (): void => {
        if (activeViewTransitionRef.current !== transition) return;
        activeViewTransitionRef.current = null;
        clearViewTransitionStyles();
      };
      void transition.finished.then(cleanUp, cleanUp);
    },
    [clearViewTransitionStyles],
  );

  const toggleLibraryPanel = useCallback((): void => {
    animatePanelToggle(
      'left',
      libraryElementRef.current,
      librarySeparatorRef.current,
      libraryPanelRef.current?.isCollapsed() ?? false,
      () => {
        if (libraryPanelRef.current?.isCollapsed()) {
          libraryPanelRef.current.expand();
        } else {
          libraryPanelRef.current?.collapse();
        }
      },
    );
  }, [animatePanelToggle, libraryPanelRef]);

  const toggleAssistantPanel = useCallback((): void => {
    animatePanelToggle(
      'right',
      assistantElementRef.current,
      assistantSeparatorRef.current,
      assistantPanelRef.current?.isCollapsed() ?? false,
      () => {
        if (assistantPanelRef.current?.isCollapsed()) {
          assistantPanelRef.current.expand();
        } else {
          assistantPanelRef.current?.collapse();
        }
      },
    );
  }, [animatePanelToggle, assistantPanelRef]);

  return {
    assistantElementRef,
    assistantPanelRef,
    assistantSeparatorRef,
    isAssistantCollapsed,
    isLibraryCollapsed,
    libraryElementRef,
    libraryPanelRef,
    librarySeparatorRef,
    onAssistantResize: (size: { inPixels: number }) =>
      setIsAssistantCollapsed(size.inPixels === 0),
    onLibraryResize: (size: { inPixels: number }) =>
      setIsLibraryCollapsed(size.inPixels === 0),
    toggleAssistantPanel,
    toggleLibraryPanel,
  };
};
