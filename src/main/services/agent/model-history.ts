const REQUEST_SCOPED_REFERENCE_PATTERN =
  /\b(assignment|beat|directory|document|event|moment|persona|project|proposal|question|request|revision|story|thread|timeline):(?:[1-9][0-9]*|accepted|primary)\b/gu;

/**
 * Removes capabilities that belonged to earlier Agent requests from the model
 * history projection. Persisted conversation text and UI audit parts remain
 * unchanged.
 */
export const expireRequestScopedReferences = (content: string): string =>
  content.replace(
    REQUEST_SCOPED_REFERENCE_PATTERN,
    (_reference, kind: string) => `[expired request-scoped ${kind} ref]`,
  );
