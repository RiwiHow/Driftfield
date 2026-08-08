import type { CloseUnsavedDocumentDecision } from '../../../shared/contracts/project';

export const dirtyActionFor = (
  hasDirtyDocuments: boolean,
  decision?: CloseUnsavedDocumentDecision,
): CloseUnsavedDocumentDecision | 'proceed' => {
  if (!hasDirtyDocuments) return 'proceed';
  return decision ?? 'cancel';
};

export const mayCompleteDestructiveAction = (
  action: CloseUnsavedDocumentDecision | 'proceed',
  saveSucceeded: boolean,
): boolean =>
  action === 'proceed' || action === 'discard' || (action === 'save' && saveSucceeded);
