import { describe, expect, it } from 'vitest';

import { APP_LANGUAGES } from '../../../src/shared/i18n/languages';
import { I18N_RESOURCES } from '../../../src/shared/i18n/resources';

const flattenCatalog = (
  value: Record<string, unknown>,
  prefix = '',
): Map<string, string> => {
  const result = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof child === 'string') {
      result.set(path, child);
    } else {
      for (const [nestedKey, message] of flattenCatalog(
        child as Record<string, unknown>,
        path,
      )) {
        result.set(nestedKey, message);
      }
    }
  }
  return result;
};

const interpolationNames = (message: string): string[] =>
  [...message.matchAll(/{{\s*([\w.-]+)(?:\s*,[^}]*)?\s*}}/g)]
    .map((match) => match[1])
    .sort();

describe('i18n resources', () => {
  it('defines a bundled catalog for every supported language', () => {
    expect(Object.keys(I18N_RESOURCES).sort()).toEqual(
      [...APP_LANGUAGES].sort(),
    );
  });

  it('keeps locale keys and interpolation variables aligned with English', () => {
    const english = flattenCatalog(I18N_RESOURCES.en);

    for (const language of APP_LANGUAGES) {
      const catalog = flattenCatalog(I18N_RESOURCES[language]);
      expect([...catalog.keys()].sort()).toEqual([...english.keys()].sort());
      for (const [key, message] of english) {
        expect(interpolationNames(catalog.get(key) ?? ''), key).toEqual(
          interpolationNames(message),
        );
      }
    }
  });
});
