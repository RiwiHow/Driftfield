import { describe, expect, it } from 'vitest';

import {
  dirtyActionFor,
  mayCompleteDestructiveAction,
} from './dirty-action-policy';

describe.each(['tab close', 'project switch', 'application quit'])(
  '%s dirty-document policy',
  () => {
    it('proceeds without prompting when nothing is dirty', () => {
      expect(dirtyActionFor(false)).toBe('proceed');
    });

    it('honors cancel and discard', () => {
      expect(mayCompleteDestructiveAction(dirtyActionFor(true, 'cancel'), true)).toBe(false);
      expect(mayCompleteDestructiveAction(dirtyActionFor(true, 'discard'), false)).toBe(true);
    });

    it('only proceeds after a successful save', () => {
      const action = dirtyActionFor(true, 'save');
      expect(mayCompleteDestructiveAction(action, false)).toBe(false);
      expect(mayCompleteDestructiveAction(action, true)).toBe(true);
    });
  },
);
