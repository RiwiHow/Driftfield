import { describe, expect, it } from 'vitest';

import {
  parseSettingsUpdate,
  parseStoredSettings,
} from '../../../src/main/services/settings-service';

describe('settings parsing and migration', () => {
  it('migrates unversioned settings to version 3 with English as default', () => {
    expect(
      parseStoredSettings({
        closeWindowBehavior: 'minimize',
        editorFontSize: 20,
        theme: 'tokyo-night',
      }),
    ).toEqual({
      agent: {
        defaultModel: null,
        thinkingLevel: 'medium',
      },
      closeWindowBehavior: 'minimize',
      editorFontSize: 20,
      language: 'en',
      theme: 'tokyo-night',
      version: 3,
    });
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      language: 'en',
      theme: 'github-light',
      version: 3,
    });
  });

  it('preserves a supported stored language and rejects unknown languages', () => {
    expect(parseStoredSettings({ language: 'zh-CN' }).language).toBe('zh-CN');
    expect(parseStoredSettings({ language: 'fr' }).language).toBe('en');
    expect(() => parseSettingsUpdate({ language: 'fr' })).toThrow(
      'Unknown application language',
    );
  });

  it('migrates valid version 2 Agent settings to version 3', () => {
    expect(
      parseStoredSettings({
        agent: {
          defaultModel: { providerId: 'anthropic', modelId: 'claude' },
          thinkingLevel: 'high',
        },
      }).agent,
    ).toEqual({
      defaultModel: { providerId: 'anthropic', modelId: 'claude' },
      thinkingLevel: 'high',
    });
  });

  it('rejects unknown update fields, including the schema version', () => {
    expect(() => parseSettingsUpdate({ version: 2 })).toThrow(
      'Unknown application setting',
    );
  });
});
