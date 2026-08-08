import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  changeRendererLanguage,
  initializeRendererI18n,
  rendererI18n,
} from './index';

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const documentElement = { dir: '', lang: '' };

describe('renderer i18n', () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement },
    });
    await initializeRendererI18n('en');
  });

  afterAll(() => {
    if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
    else Object.defineProperty(globalThis, 'document', originalDocument);
  });

  it('initializes with the persisted language before rendering', () => {
    expect(rendererI18n.language).toBe('en');
    expect(documentElement).toEqual({ dir: 'ltr', lang: 'en' });
  });

  it('updates i18next and document language metadata together', async () => {
    await changeRendererLanguage('zh-CN');
    expect(rendererI18n.language).toBe('zh-CN');
    expect(documentElement).toEqual({ dir: 'ltr', lang: 'zh-CN' });
  });
});
