export interface RendererNavigationPolicy {
  allows: (candidateUrl: string) => boolean;
  expectedUrl: string;
}

const normalizeRendererUrl = (value: string): string => {
  const url = new URL(value);

  // Hash changes are renderer-local navigation and do not change the document
  // that owns the preload bridge.
  url.hash = '';
  return url.href;
};

export const createRendererNavigationPolicy = (
  expectedUrl: string,
): RendererNavigationPolicy => {
  const normalizedExpectedUrl = normalizeRendererUrl(expectedUrl);

  return {
    allows: (candidateUrl) => {
      try {
        return normalizeRendererUrl(candidateUrl) === normalizedExpectedUrl;
      } catch {
        return false;
      }
    },
    expectedUrl: normalizedExpectedUrl,
  };
};
