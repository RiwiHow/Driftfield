import { ClipboardPaste, Copy, Scissors, TextSelect } from 'lucide-react';
import {
  type MouseEvent,
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

interface EditorContextMenuProps {
  children: ReactElement;
  readOnly: boolean;
}

export function EditorContextMenu({
  children,
  readOnly,
}: EditorContextMenuProps) {
  const { t } = useTranslation('editor');
  const focusTargetRef = useRef<HTMLElement | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  const modifier = window.driftfield.platform === 'darwin' ? '⌘' : 'Ctrl+';

  const captureEditableTarget = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editable =
      target.closest<HTMLElement>('[contenteditable="true"], .cm-content') ??
      target
        .closest<HTMLElement>('.cm-editor')
        ?.querySelector<HTMLElement>('.cm-content');
    if (editable === null || editable === undefined) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    focusTargetRef.current = editable;
    setHasSelection(document.getSelection()?.isCollapsed === false);
  };

  const runAfterMenuCloses = useCallback((command: () => Promise<void>) => {
    window.setTimeout(() => {
      focusTargetRef.current?.focus({ preventScroll: true });
      void command();
    }, 0);
  }, []);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenuCapture={captureEditableTarget}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44">
        <ContextMenuItem
          className="text-xs"
          disabled={readOnly || !hasSelection}
          onSelect={() =>
            runAfterMenuCloses(window.driftfield.cutEditorSelection)
          }
        >
          <Scissors aria-hidden="true" />
          {t('actions.cut')}
          <ContextMenuShortcut>{modifier}X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={!hasSelection}
          onSelect={() =>
            runAfterMenuCloses(window.driftfield.copyEditorSelection)
          }
        >
          <Copy aria-hidden="true" />
          {t('actions.copy')}
          <ContextMenuShortcut>{modifier}C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={readOnly}
          onSelect={() => runAfterMenuCloses(window.driftfield.pasteIntoEditor)}
        >
          <ClipboardPaste aria-hidden="true" />
          {t('actions.paste')}
          <ContextMenuShortcut>{modifier}V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          onSelect={() =>
            runAfterMenuCloses(window.driftfield.selectAllEditorText)
          }
        >
          <TextSelect aria-hidden="true" />
          {t('actions.selectAll')}
          <ContextMenuShortcut>{modifier}A</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
