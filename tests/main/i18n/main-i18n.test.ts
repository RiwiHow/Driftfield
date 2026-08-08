import { beforeAll, describe, expect, it } from 'vitest';

import {
  initializeMainI18n,
  translateMain,
} from '../../../src/main/i18n/main-i18n';

describe('main-process translations', () => {
  beforeAll(async () => initializeMainI18n());

  it('translates native dialog copy at display time', () => {
    expect(translateMain('en', 'openProject.title')).toBe('Open local project');
    expect(translateMain('zh-CN', 'openProject.title')).toBe('打开本地项目');
  });

  it('interpolates native dialog values', () => {
    expect(
      translateMain('en', 'closeUnsaved.message', { title: 'Chapter 1' }),
    ).toContain('Chapter 1');
    expect(
      translateMain('zh-CN', 'closeUnsaved.message', { title: '第一章' }),
    ).toContain('第一章');
  });
});
