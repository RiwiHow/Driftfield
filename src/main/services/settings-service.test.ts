import { describe, expect, it } from 'vitest';

import {
  parseSettingsUpdate,
  parseStoredSettings,
} from './settings-service';

describe('settings parsing and migration', () => {
  it('migrates unversioned settings to version 2', () => {
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
      theme: 'tokyo-night',
      version: 2,
    });
  });

  it('uses defaults for invalid stored fields', () => {
    expect(parseStoredSettings({ editorFontSize: 100 })).toMatchObject({
      editorFontSize: 17,
      theme: 'github-light',
      version: 2,
    });
  });

  it('preserves valid version 2 Agent settings', () => {
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
