import type { CloseUnsavedDocumentDecision } from '../../../shared/contracts/project';

export type DirtyAction = 'cancel' | 'discard' | 'save';

export const dirtyActionFor = (
  hasDirtyDocuments: boolean,
  decision?: CloseUnsavedDocumentDecision,
): DirtyAction | 'proceed' => {
  if (!hasDirtyDocuments) return 'proceed';
  return decision ?? 'cancel';
};

export const mayCompleteDestructiveAction = (
  action: DirtyAction | 'proceed',
  saveSucceeded: boolean,
): boolean =>
  action === 'proceed' || action === 'discard' || (action === 'save' && saveSucceeded);
