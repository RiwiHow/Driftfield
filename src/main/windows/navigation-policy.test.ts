import { describe, expect, it } from 'vitest';

import { createRendererNavigationPolicy } from './navigation-policy';

describe('renderer navigation policy', () => {
  it('allows only the exact renderer document and hash changes', () => {
    const policy = createRendererNavigationPolicy('http://localhost:5173/');

    expect(policy.allows('http://localhost:5173/')).toBe(true);
    expect(policy.allows('http://localhost:5173/#chapter-1')).toBe(true);
    expect(policy.allows('http://localhost:5173/other')).toBe(false);
    expect(policy.allows('https://example.com/')).toBe(false);
    expect(policy.allows('not a url')).toBe(false);
  });

  it('does not trust another local file', () => {
    const policy = createRendererNavigationPolicy(
      'file:///Applications/Driftfield/renderer/index.html',
    );

    expect(policy.allows('file:///Applications/Driftfield/renderer/index.html')).toBe(true);
    expect(policy.allows('file:///Applications/Driftfield/renderer/other.html')).toBe(false);
  });
});
